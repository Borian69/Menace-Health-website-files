// Aufnahme im Browser. Grundsatz: Was einmal aufgenommen ist, liegt auf dem
// Gerät, bevor irgendetwas anderes passiert.
//
// - MediaRecorder liefert alle 4 s einen Block; jeder Block geht sofort in
//   IndexedDB. Ein Absturz kostet höchstens die letzten 4 Sekunden.
// - Beendet das System das Mikrofon (iOS bei Sperre, Anruf, App-Wechsel),
//   wird das als Unterbrechung erkannt und angezeigt. „Weiter aufnehmen“
//   beginnt ein neues Teilstück derselben Aufnahme; der Server setzt die
//   Teilstücke zu einer Datei zusammen.
// - Nichts wird als „läuft“ angezeigt, was nicht nachweislich läuft.

import { idb, type Session } from './idb';
import { neueId } from './format';
import { bestesFormat, hatWakeLock, plattform } from './platform';

export const BLOCK_MS = 4000;
/** Nach so viel Aufnahmezeit beginnt ein neues Teilstück. Jedes Teilstück ist
 *  eine eigenständige Datei – klein genug, dass auch ein Handy sie später
 *  dekodieren kann. Der Wechsel überlappt, es entsteht keine Lücke. */
export const TEIL_MS = 15 * 60 * 1000;
function teilMs(): number {
  // Nur für automatische Tests: kürzere Teilstücke über localStorage.
  try { return Number(localStorage.getItem('mitschrift.test.teilMs')) || TEIL_MS; } catch { return TEIL_MS; }
}

export type RecState = 'leer' | 'startet' | 'aufnahme' | 'pausiert' | 'unterbrochen' | 'beendet';

export interface RecSnapshot {
  state: RecState;
  session: Session | null;
  elapsedMs: number;
  level: number;        // 0…1, Eingangspegel
  wakeLock: boolean;    // Bildschirm wird wach gehalten
  meldung: string | null;
}

type Listener = (s: RecSnapshot) => void;

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void };

export class Recorder {
  private state: RecState = 'leer';
  private session: Session | null = null;
  private stream: MediaStream | null = null;
  private mr: MediaRecorder | null = null;
  private baseMs = 0;
  private resumedAt = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private listeners = new Set<Listener>();
  private gewollt = new WeakSet<MediaRecorder>();  // Recorder, die wir selbst beenden
  private segStart = 0;   // elapsedMs beim Beginn des aktuellen Teilstücks
  private wechselt = false;
  private stoppt = false;  // Uhr eingefroren: Beenden läuft
  private wake: WakeLockSentinelLike | null = null;
  private hiddenAt: number | null = null;
  private mutedAt: number | null = null;
  private meldung: string | null = null;
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;
  private levelBuf: Uint8Array<ArrayBuffer> | null = null;
  keepAwake = true;

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): RecSnapshot {
    return {
      state: this.state,
      session: this.session,
      elapsedMs: this.elapsedMs(),
      level: this.level(),
      wakeLock: !!this.wake,
      meldung: this.meldung,
    };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((f) => f(s));
  }

  elapsedMs(): number {
    return this.baseMs + (this.state === 'aufnahme' && !this.stoppt ? performance.now() - this.resumedAt : 0);
  }

  private level(): number {
    if (!this.analyser || !this.levelBuf || this.state !== 'aufnahme') return 0;
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let peak = 0;
    for (const v of this.levelBuf) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 96);
  }

  // ── Ablauf ──────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state !== 'leer' && this.state !== 'beendet') return;
    this.state = 'startet';
    this.meldung = null;
    this.emit();
    const mime = bestesFormat();
    const now = Date.now();
    this.session = {
      id: neueId(), createdAt: now, updatedAt: now, state: 'aufnahme', mime: mime || 'audio/webm',
      durationMs: 0, segments: 0, bytes: 0, gaps: [],
    };
    this.baseMs = 0;
    try {
      await this.beginSegment(0);
    } catch (e) {
      this.session = null;
      this.state = 'leer';
      this.meldung = mikrofonFehler(e);
      this.emit();
      throw e;
    }
  }

  private async beginSegment(segment: number) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.stream = stream;
    this.stoppt = false;
    this.segStart = this.baseMs;
    this.mr = this.starteRecorder(stream, segment);

    for (const track of stream.getAudioTracks()) {
      track.onended = () => this.interrupted('Das Mikrofon wurde vom System getrennt (Sperre, Anruf oder App-Wechsel).');
      track.onmute = () => { this.mutedAt = performance.now(); };
      track.onunmute = () => {
        if (this.mutedAt != null) {
          const ms = performance.now() - this.mutedAt;
          if (ms > 1500) this.addGap(ms, `Das Mikrofon war ${Math.round(ms / 1000)} s stumm geschaltet (vom System).`);
          this.mutedAt = null;
        }
      };
    }

    this.setupLevel(stream);
    this.resumedAt = performance.now();
    this.state = 'aufnahme';
    await idb.putSession(this.session!);
    await this.acquireWake();
    this.emit();
  }

  /** Ein MediaRecorder für ein Teilstück; jeder Block geht sofort in IndexedDB. */
  private starteRecorder(stream: MediaStream, segment: number): MediaRecorder {
    const s = this.session!;
    const opts: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
    if (s.mime && MediaRecorder.isTypeSupported?.(s.mime)) opts.mimeType = s.mime;
    const mr = new MediaRecorder(stream, opts);
    if (mr.mimeType) s.mime = mr.mimeType;
    s.segments = segment + 1;
    s.state = 'aufnahme';
    let seq = 0;

    mr.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const blob = e.data;
      const nr = seq++;
      s.bytes += blob.size;
      s.durationMs = this.elapsedMs();
      // Reihenfolge sichern: Blöcke strikt nacheinander schreiben.
      this.writes = this.writes
        .then(() => idb.addChunk({ sessionId: s.id, segment, seq: nr, blob }))
        .then(() => idb.putSession(s))
        .catch((err) => {
          this.meldung = 'Speichern auf dem Gerät fehlgeschlagen: ' + (err?.message ?? err) + '. Ist der Speicher voll?';
          this.emit();
        });
      if (mr === this.mr && this.state === 'aufnahme' && this.elapsedMs() - this.segStart >= teilMs()) this.wechsle();
    };
    mr.onerror = () => { if (mr === this.mr) this.interrupted('Der Browser hat die Aufnahme mit einem Fehler beendet.'); };
    mr.onstop = () => { if (!this.gewollt.has(mr) && mr === this.mr) this.interrupted('Das System hat die Aufnahme beendet.'); };
    mr.start(BLOCK_MS);
    return mr;
  }

  /** Neues Teilstück: neuer Recorder auf demselben Mikrofon, dann den alten beenden. */
  private wechsle() {
    if (this.wechselt || !this.stream || !this.session || !this.mr) return;
    this.wechselt = true;
    const alt = this.mr;
    try {
      this.schliesseTeil();
      this.mr = this.starteRecorder(this.stream, this.session.segments);
      this.segStart = this.elapsedMs();
      this.gewollt.add(alt);
      alt.stop();
    } catch {
      this.mr = alt;  // Wechsel misslungen: im alten Teilstück weiter
    } finally {
      this.wechselt = false;
    }
  }

  /** Dauer des laufenden Teilstücks festhalten. */
  private schliesseTeil() {
    const s = this.session;
    if (!s) return;
    s.segDur = s.segDur ?? [];
    s.segDur[s.segments - 1] = Math.max(0, this.elapsedMs() - this.segStart);
  }

  pause() {
    if (this.state !== 'aufnahme' || !this.mr) return;
    try { this.mr.pause(); } catch { return; }
    this.baseMs = this.elapsedMs();
    this.state = 'pausiert';
    this.session!.state = 'pausiert';
    this.session!.durationMs = this.baseMs;
    this.mr.requestData?.();  // was bis hier aufgenommen ist, sofort sichern
    void idb.putSession(this.session!);
    this.emit();
  }

  resume() {
    if (this.state !== 'pausiert' || !this.mr) return;
    if (this.mr.state === 'inactive') { this.interrupted('Das System hat die pausierte Aufnahme beendet.'); return; }
    this.mr.resume();
    this.resumedAt = performance.now();
    this.state = 'aufnahme';
    this.session!.state = 'aufnahme';
    void idb.putSession(this.session!);
    void this.acquireWake();
    this.emit();
  }

  /** Nach einer Unterbrechung: neues Teilstück derselben Aufnahme. */
  async continueRecording() {
    if (this.state !== 'unterbrochen' || !this.session) return;
    this.meldung = null;
    this.state = 'startet';
    this.emit();
    try {
      await this.beginSegment(this.session.segments);
    } catch (e) {
      this.state = 'unterbrochen';
      this.meldung = mikrofonFehler(e);
      this.emit();
    }
  }

  async stop(): Promise<Session | null> {
    if (!this.session) return null;
    if (this.state === 'aufnahme' || this.state === 'pausiert') {
      this.schliesseTeil();
      this.baseMs = this.elapsedMs();
      this.stoppt = true;  // ab hier zählt die Uhr nicht weiter
      await this.stopRecorder();
    }
    this.releaseStream();
    await this.writes;
    const s = this.session;
    s.durationMs = this.baseMs;
    s.state = 'beendet';
    await idb.putSession(s);
    this.state = 'beendet';
    await this.releaseWake();
    this.emit();
    return s;
  }

  /** Nach dem Speichern oder Verwerfen: bereit für die nächste Aufnahme. */
  reset() {
    this.releaseStream();
    void this.releaseWake();
    this.session = null;
    this.baseMs = 0;
    this.stoppt = false;
    this.meldung = null;
    this.state = 'leer';
    this.emit();
  }

  /** Eine wiederhergestellte Sitzung zum Speichern übernehmen. */
  adopt(s: Session) {
    if (this.state !== 'leer' && this.state !== 'beendet') return false;
    this.session = s;
    this.baseMs = s.durationMs;
    this.state = 'beendet';
    this.emit();
    return true;
  }

  // ── Unterbrechungen ─────────────────────────────────────

  private interrupted(grund: string) {
    if (this.state !== 'aufnahme' && this.state !== 'pausiert') return;
    this.baseMs = this.elapsedMs();
    this.state = 'unterbrochen';
    this.meldung = grund;
    if (this.session) {
      this.session.state = 'unterbrochen';
      this.session.durationMs = this.baseMs;
      void idb.putSession(this.session);
    }
    // Restliche Daten noch einsammeln, falls der Recorder noch lebt.
    this.schliesseTeil();
    if (this.mr && this.mr.state !== 'inactive') {
      this.gewollt.add(this.mr);
      try { this.mr.stop(); } catch { /* schon beendet */ }
    }
    this.releaseStream();
    void this.releaseWake();
    this.emit();
  }

  private addGap(ms: number, text: string) {
    if (!this.session) return;
    this.session.gaps.push({ at: Math.round(this.elapsedMs()), ms: Math.round(ms) });
    this.meldung = text;
    void idb.putSession(this.session);
    this.emit();
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = performance.now();
      this.mr?.requestData?.();  // vor dem Wegwechseln sichern
      return;
    }
    const weg = this.hiddenAt != null ? performance.now() - this.hiddenAt : 0;
    this.hiddenAt = null;
    if (this.state === 'aufnahme' || this.state === 'pausiert') {
      const track = this.stream?.getAudioTracks()[0];
      if (!track || track.readyState === 'ended' || this.mr?.state === 'inactive') {
        this.interrupted('Während die App im Hintergrund war, hat das System das Mikrofon beendet.');
        return;
      }
      if (plattform() === 'ios' && weg > 2000 && this.state === 'aufnahme') {
        this.addGap(weg, `Die App war ${Math.round(weg / 1000)} s im Hintergrund. iOS nimmt dabei oft nicht auf – diese Stelle prüfen.`);
      }
      void this.acquireWake();
    }
    this.emit();
  };

  private onPageHide = () => {
    // Letzte Chance vor dem Schließen: den laufenden Block anfordern.
    try { this.mr?.requestData?.(); } catch { /* egal */ }
  };

  // ── Hilfen ──────────────────────────────────────────────

  private stopRecorder(): Promise<void> {
    const mr = this.mr;
    if (!mr || mr.state === 'inactive') return Promise.resolve();
    this.gewollt.add(mr);
    return new Promise((resolve) => {
      const fertig = () => resolve();
      mr.addEventListener('stop', fertig, { once: true });
      try { mr.stop(); } catch { resolve(); }
      setTimeout(fertig, 3000);
    });
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    this.stream = null;
    this.analyser = null;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
  }

  private setupLevel(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.levelBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      src.connect(this.analyser);
    } catch { this.analyser = null; }
  }

  private async acquireWake() {
    if (!this.keepAwake || !hatWakeLock() || this.wake || document.visibilityState !== 'visible') return;
    try {
      const w = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<WakeLockSentinelLike> } })
        .wakeLock.request('screen');
      this.wake = w;
      w.addEventListener('release', () => { this.wake = null; this.emit(); });
      this.emit();
    } catch { this.wake = null; }
  }

  private async releaseWake() {
    const w = this.wake;
    this.wake = null;
    try { await w?.release(); } catch { /* egal */ }
  }
}

function mikrofonFehler(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Kein Zugriff aufs Mikrofon. Bitte in den Browser-Einstellungen erlauben.';
  if (name === 'NotFoundError') return 'Kein Mikrofon gefunden.';
  if (name === 'NotReadableError') return 'Das Mikrofon wird gerade von einer anderen App benutzt.';
  return 'Die Aufnahme konnte nicht starten: ' + ((e as Error)?.message ?? String(e));
}

// ── Wiederherstellung und Upload-Teile ────────────────────

/** Sitzungen, die noch nicht beim Server sind (nach Absturz, Neuladen, Fehler). */
export async function offeneSitzungen(ausser?: string): Promise<Session[]> {
  const alle = await idb.sessions();
  const offen: Session[] = [];
  for (const s of alle) {
    if (s.id === ausser) continue;
    const chunks = await idb.chunks(s.id);
    if (!chunks.length) { await idb.deleteSession(s.id); continue; }
    if (s.state === 'aufnahme' || s.state === 'pausiert' || s.state === 'unterbrochen') {
      // Die App wurde während der Aufnahme geschlossen: Stand übernehmen.
      s.state = 'beendet';
      s.bytes = chunks.reduce((n, c) => n + c.blob.size, 0);
      await idb.putSession(s);
    }
    offen.push(s);
  }
  return offen.sort((a, b) => b.createdAt - a.createdAt);
}

/** Je Teilstück eine Datei, Blöcke in Aufnahmereihenfolge. */
export async function teileFuer(s: Session, endung: string): Promise<{ blob: Blob; name: string; dauer?: number }[]> {
  const chunks = await idb.chunks(s.id);
  const proSegment = new Map<number, Blob[]>();
  chunks.sort((a, b) => a.segment - b.segment || a.seq - b.seq);
  for (const c of chunks) {
    if (!proSegment.has(c.segment)) proSegment.set(c.segment, []);
    proSegment.get(c.segment)!.push(c.blob);
  }
  const typ = s.mime.split(';')[0] || 'audio/webm';
  return [...proSegment.entries()].map(([seg, blobs]) => ({
    blob: new Blob(blobs, { type: typ }),
    name: `teil-${seg + 1}.${endung}`,
    // Dauer aus der Aufnahmezeit; fehlt sie (Absturz), misst die Verarbeitung nach.
    dauer: s.segDur?.[seg] ? s.segDur[seg] / 1000 : proSegment.size === 1 && s.durationMs ? s.durationMs / 1000 : undefined,
  }));
}

export const recorder = new Recorder();
