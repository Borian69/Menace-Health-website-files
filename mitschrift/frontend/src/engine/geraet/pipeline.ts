// Verarbeitung im Browser: dekodieren → in 2-Minuten-Abschnitte teilen →
// MP3 → Whisper über OpenRouter → zusammenfassen.
//
// Jeder fertige Abschnitt wird sofort gespeichert. Bricht die Verarbeitung
// ab (App geschlossen, kein Netz, Guthaben leer), überspringt der nächste
// Start alles Fertige. Die App muss während der Verarbeitung geöffnet sein.

import { einstellungen } from '../../lib/einstellungen';
import { store } from '../../lib/idb';
import type { Progress, ProjectStatus, Segment } from '../types';
import { alsMp3, AudioFehler, base64, dekodiere, FENSTER_S, pegel, RATE, STILLE } from './audio';
import {
  aendereProjekt, aufnahme, aufnahmen, audioTeile, recordingsKey, transkripte, type LAufnahme,
} from './daten';
import { LLMError, transkribiere } from './openrouter';
import { fasseZusammen } from './summarizer';

let aktiv: string | null = null;
export const laeuftGerade = (id: string) => aktiv === id;
export const beschaeftigt = () => aktiv !== null;

type WakeLock = { release: () => Promise<void> };

async function status(projectId: string, s: ProjectStatus, progress: Progress | null, error: string | null = null) {
  await aendereProjekt(projectId, { status: s, progress, error });
}

async function transkribiereAufnahme(rec: LAufnahme, nr: number, anzahl: number, projectId: string) {
  const model = einstellungen().sttModel;
  const teile = await audioTeile(rec.id);
  if (!teile.length) throw new AudioFehler(`Zu „${rec.filename}“ sind keine Audiodaten auf diesem Gerät.`);
  const alle: Segment[] = [];
  const dauern: number[] = [];
  let offset = 0;

  for (let t = 0; t < teile.length; t++) {
    const teilText = teile.length > 1 ? `Teil ${t + 1} von ${teile.length} · ` : '';
    await status(projectId, 'transkribiert', {
      step: 'transkribiert', done: t, total: teile.length,
      detail: `Aufnahme ${nr} von ${anzahl} · ${teilText}wird gelesen`,
    });
    let pcm: Float32Array | null = await dekodiere(teile[t].blob);
    const dauer = pcm.length / RATE;
    const n = Math.max(1, Math.ceil(dauer / FENSTER_S));
    for (let w = 0; w < n; w++) {
      await status(projectId, 'transkribiert', {
        step: 'transkribiert', done: t * n + w, total: teile.length * n,
        detail: `Aufnahme ${nr} von ${anzahl} · ${teilText}Abschnitt ${w + 1} von ${n}`,
      });
      const key = `${rec.id}:${t}:${w}:${model}`;
      const fertig = await store.get<{ segments: Segment[] }>('tparts', key);
      if (fertig) { alle.push(...fertig.segments); continue; }
      const start = w * FENSTER_S;
      const stueck = pcm.subarray(Math.floor(start * RATE), Math.min(pcm.length, Math.floor((start + FENSTER_S) * RATE)));
      const laenge = stueck.length / RATE;
      let segs: Segment[] = [];
      if (laenge >= 0.5 && pegel(stueck) >= STILLE) {
        segs = await transkribiere(base64(alsMp3(stueck)), offset + start, laenge, projectId);
      }
      await store.put('tparts', { key, recId: rec.id, segments: segs });
      alle.push(...segs);
    }
    pcm = null;  // Speicher freigeben, bevor der nächste Teil dekodiert wird
    dauern.push(dauer);
    offset += dauer;
  }

  const aktuell = await aufnahme(rec.id);
  await store.put('aufnahmen', {
    ...aktuell,
    transcript: alle, transcript_model: model, status: 'transkribiert', error: null,
    duration_s: Math.round(offset * 100) / 100,
    teile: aktuell.teile.map((x, i) => ({ ...x, dauer: dauern[i] ?? x.dauer })),
  });
  await store.delByIndex('tparts', 'byAufnahme', rec.id);
}

export async function verarbeite(projectId: string): Promise<void> {
  if (aktiv) return;
  aktiv = projectId;
  let wake: WakeLock | null = null;
  try {
    // Bildschirm wach halten: Im Hintergrund pausiert der Browser die Arbeit.
    wake = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeLock> } })
      .wakeLock?.request('screen').catch(() => null) ?? null;
  } catch { wake = null; }

  try {
    const recs = await aufnahmen(projectId);
    if (!recs.length) throw new Error('Das Projekt enthält keine Aufnahmen.');
    const model = einstellungen().sttModel;
    const offen = recs.filter((r) => !r.transcript || r.transcript_model !== model);
    for (let i = 0; i < offen.length; i++) {
      try {
        await transkribiereAufnahme(offen[i], i + 1, offen.length, projectId);
      } catch (e) {
        const a = await aufnahme(offen[i].id);
        await store.put('aufnahmen', { ...a, status: 'fehler', error: (e as Error).message });
        throw new Error(`„${offen[i].filename}“: ${(e as Error).message}`);
      }
    }

    await status(projectId, 'analysiert', { step: 'analysiert', done: 0, total: 0, detail: 'Transkripte werden gelesen' });
    const blocks = await transkripte(projectId);
    const ergebnis = await fasseZusammen(blocks, projectId, (step, done, total, detail) =>
      status(projectId, step, { step, done, total, detail }));
    const ts = new Date().toISOString();
    await aendereProjekt(projectId, {
      summary: ergebnis, summary_key: recordingsKey(blocks.map((b) => b.recording_id)), summary_at: ts,
      status: 'fertig', progress: null, error: null, updated_at: ts,
    });
  } catch (e) {
    const msg = e instanceof LLMError || e instanceof AudioFehler || e instanceof Error ? e.message : String(e);
    console.warn('Verarbeitung fehlgeschlagen:', e);
    await status(projectId, 'fehler', null, msg).catch(() => undefined);
  } finally {
    aktiv = null;
    await wake?.release().catch(() => undefined);
  }
}
