// Transkript – Audiodatei zu Text über Whisper bei OpenRouter.
//
// Ablauf: Datei dekodieren (16 kHz mono) → Brummen und Trittschall
// herausfiltern (Hochpass 80 Hz) → an Sprechpausen in Abschnitte von
// 90–150 s teilen → Stille überspringen, lange Pausen auf 0,5 s kürzen
// (Whisper rechnet pro Sekunde ab und erfindet in Pausen gern Sätze) →
// jeden Abschnitt auf Sprechpegel anheben → MP3 48 kbit/s → drei Abschnitte gleichzeitig an Whisper →
// erfundene Abspann-Sätze und Wiederholungsschleifen entfernen.
//
// Der Schlüssel liegt nur in localStorage und geht nur an openrouter.ai.

(() => {
  'use strict';

  const API = 'https://openrouter.ai/api/v1';
  const RATE = 16000;            // Whisper rechnet intern mit 16 kHz
  const FRAME = 800;             // 50 ms je Pegelfenster
  const FPS = RATE / FRAME;      // 20 Fenster pro Sekunde
  const MIN_S = 90, ZIEL_S = 120, MAX_S = 150;
  const STILLE = 0.004;          // Sprechpegel darunter: nichts zu hören
  const ZIELPEGEL = 0.1;         // ≈ −20 dBFS
  const MAX_GAIN = 30;           // höchstens +30 dB
  const PAUSE_MAX = 30, PAUSE_REST = 10;   // Pausen über 1,5 s auf 0,5 s kürzen (in Fenstern)
  const TIMEOUT = 120000;        // ein Abschnitt braucht selten über 20 s; hängt er, neu versuchen
  const KBPS = 48;               // 2 min ≈ 720 KB; genug Reserve für verrauschte Aufnahmen
  const PARALLEL = 3;
  const VERSUCHE = 4;
  const KEY_SPEICHER = 'transkript.einstellungen';
  const KEY_LETZTER = 'transkript.letzter';

  // Listenpreise pro Stunde Audio (OpenRouter, Nov. 2026). Abgerechnet wird nach Sekunden;
  // was ein Lauf wirklich gekostet hat, meldet OpenRouter in usage.cost.
  const MODELLE = {
    'openai/whisper-large-v3': { preis: 0.111, info: 'Large V3: hält Rauschen, Hall und Dialekt am besten stand. ≈ 0,11 $ pro Stunde Audio.' },
    'openai/whisper-large-v3-turbo': { preis: 0.04, info: 'Turbo: etwa doppelt so schnell, bei schlechten Aufnahmen etwas mehr Fehler. ≈ 0,04 $ pro Stunde Audio.' },
  };

  const $ = (id) => document.getElementById(id);
  const M = window.Moch;
  const toast = M.Toast($('toast'));
  const aktion = M.Bedingt($('aktion'));

  // ───────────── Einstellungen ─────────────

  const lies = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const schreib = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privates Fenster */ } };

  const e = Object.assign({ key: '', sprache: 'de', modell: 'openai/whisper-large-v3', begriffe: '' }, lies(KEY_SPEICHER));
  if (!MODELLE[e.modell]) e.modell = 'openai/whisper-large-v3';
  // Gleiche Adresse wie die Mitschrift: deren Schlüssel übernehmen, falls hier noch keiner steht.
  if (!e.key) e.key = (lies('mitschrift.einstellungen') || {}).apiKey || '';
  const merke = () => schreib(KEY_SPEICHER, e);

  // ───────────── Zustand ─────────────

  // Eine Zeile je Datei: { file, dauer (Sekunden laut Metadaten), lauf, status, el }
  // lauf = { sig, teile: [{ a, b, fa, fb, text, fehler, weg }], kosten, gemeldet }
  const liste = [];
  let audio = null;          // { sig, pcm, frames } – immer nur die Datei, die gerade läuft
  let laeuft = false;
  let keyStatus = 'unbekannt';   // unbekannt | ok | falsch
  // Was der Anbieter ablehnt, wird für die Sitzung weggelassen.
  const ohne = { prompt: false, temperature: false };

  // ───────────── Format ─────────────

  const zahl = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const zeit = (s) => {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sek}` : `${m}:${sek}`;
  };
  const groesse = (b) => (b >= 1e6 ? `${zahl(b / 1e6, 1)} MB` : `${zahl(b / 1e3)} KB`);
  const cent = (usd) => `${zahl(usd * 100, usd * 100 < 10 ? 2 : 1)} US-Cent`;

  function datenzeile(el, paare) {
    el.textContent = '';
    for (const [k, v] of paare) {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.className = 'n';
      b.textContent = v;
      s.append(`${k} `, b);
      el.append(s);
    }
    const neu = el.hidden;
    el.hidden = false;
    if (neu) M.zieheLinie([el]);
  }

  function meldung(feld, msg, text, art) {
    msg.textContent = text;
    feld.classList.toggle('has-error', art === 'fehler');
    feld.classList.toggle('is-valid', art === 'ok');
  }

  // ───────────── Schlüssel ─────────────

  const inKey = $('schluessel');
  const feldKey = $('feld-schluessel');
  inKey.value = e.key;
  let keyTimer = 0, keyLauf = 0;

  async function pruefeKey() {
    const key = inKey.value.trim();
    const nr = ++keyLauf;
    if (!key) { keyStatus = 'unbekannt'; meldung(feldKey, $('schluessel-msg'), 'Einen Schlüssel gibt es unter openrouter.ai/keys. Er bleibt auf diesem Gerät.', ''); return pruefeAktion(); }
    try {
      const h = { Authorization: `Bearer ${key}` };
      const r = await fetch(`${API}/key`, { headers: h });
      if (nr !== keyLauf) return;
      if (r.status === 401) throw new Error('Dieser Schlüssel ist ungültig. Bitte neu aus openrouter.ai/keys kopieren.');
      if (!r.ok) throw new Error(`OpenRouter antwortet mit ${r.status}.`);
      const d = (await r.json()).data || {};
      keyStatus = 'ok';
      let rest = typeof d.limit_remaining === 'number' ? d.limit_remaining : null;
      if (rest === null) {
        const c = await fetch(`${API}/credits`, { headers: h }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        const cd = c && c.data;
        if (cd && typeof cd.total_credits === 'number') rest = cd.total_credits - (cd.total_usage || 0);
      }
      if (nr !== keyLauf) return;
      meldung(feldKey, $('schluessel-msg'), rest === null ? 'Schlüssel gültig.' : `Schlüssel gültig · Guthaben ${zahl(rest, 2)} $ ≈ ${zahl(rest / MODELLE[e.modell].preis)} Stunden Audio.`, 'ok');
    } catch (err) {
      if (nr !== keyLauf) return;
      const offline = err instanceof TypeError;
      keyStatus = offline ? 'unbekannt' : 'falsch';
      meldung(feldKey, $('schluessel-msg'), offline ? 'openrouter.ai ist gerade nicht erreichbar. Prüfung beim Start.' : err.message, offline ? '' : 'fehler');
    }
    pruefeAktion();
  }

  inKey.addEventListener('input', () => {
    e.key = inKey.value.trim(); merke();
    keyStatus = 'unbekannt'; pruefeAktion();
    clearTimeout(keyTimer); keyTimer = setTimeout(pruefeKey, 500);
  });

  // ───────────── Auswahl ─────────────

  function chips(id, feld, nachher) {
    const gruppe = $(id);
    const setze = () => gruppe.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.wert === e[feld])));
    gruppe.addEventListener('click', (ev) => {
      const c = ev.target.closest('.chip'); if (!c || laeuft) return;
      e[feld] = c.dataset.wert; merke(); setze(); nachher && nachher(); pruefeAktion();
    });
    setze();
  }
  const modellInfo = () => { $('modell-info').textContent = MODELLE[e.modell].info; zeigeListe(); };
  chips('chips-sprache', 'sprache');
  chips('chips-modell', 'modell', () => { modellInfo(); if (keyStatus === 'ok') pruefeKey(); });
  modellInfo();
  M.chipDruck();

  const inBegriffe = $('begriffe');
  inBegriffe.value = e.begriffe;
  inBegriffe.addEventListener('input', () => { e.begriffe = inBegriffe.value; merke(); pruefeAktion(); });

  // ───────────── Dateien ─────────────

  const ablage = $('ablage');
  const inDatei = $('datei');
  const ohneEndung = (n) => n.replace(/\.[^.]+$/, '') || n;

  function setzeTitel(text) {
    const h = $('titel');
    h.textContent = text;
    M.titelWoerter(h);
    M.zeigeTitel($('kopf'));
    $('leiste-titel').textContent = text;
  }
  M.kopf($('seite'), $('leiste'))();

  const fsig = (f) => [f.name, f.size, f.lastModified].join('|');
  const sig = (x) => [fsig(x.file), e.modell, e.sprache, e.begriffe.trim()].join('|');
  // Offene Abschnitte: −1 = noch nie gestartet (oder Einstellungen geändert), 0 = fertig.
  const offen = (x) => (x.lauf && x.lauf.sig === sig(x) ? x.lauf.teile.filter((t) => t.text === null).length : -1);

  function statusText(x) {
    if (x.status) return x.status;
    const n = offen(x);
    if (n === 0) return 'Fertig';
    if (n > 0) return `${zahl(n)} fehlen`;
    return 'Wartet';
  }

  function zeigeListe() {
    const box = $('dateien');
    box.textContent = '';
    liste.forEach((x, i) => {
      if (!x.el) {
        x.el = document.createElement('div'); x.el.className = 'eintrag';
        x.el.innerHTML = '<span class="tag n"></span><span class="was"><span></span><small class="n"></small></span><span class="wert"></span>';
      }
      const [tag, was, wert] = x.el.children;
      tag.textContent = String(i + 1).padStart(2, '0');
      was.firstChild.textContent = x.file.name;
      was.lastChild.textContent = [x.dauer ? zeit(x.dauer) : '', groesse(x.file.size)].filter(Boolean).join(' · ');
      wert.textContent = statusText(x);
      wert.className = 'wert' + (x.fehler ? ' fehler' : offen(x) === 0 ? ' fertig' : '');
      box.append(x.el);
    });
    const dauer = liste.reduce((s, x) => s + (x.dauer || 0), 0);
    if (liste.length) {
      const paare = [];
      if (liste.length > 1) paare.push(['Dateien', zahl(liste.length)]);
      if (dauer) paare.push(['Dauer', zeit(dauer)], ['Kosten ≈', cent((dauer / 3600) * MODELLE[e.modell].preis)]);
      paare.push(['Größe', groesse(liste.reduce((s, x) => s + x.file.size, 0))]);
      datenzeile($('datei-daten'), paare);
    } else $('datei-daten').hidden = true;
    $('btn-leeren').hidden = !liste.length || laeuft;
    $('ablage-text').textContent = liste.length ? 'Weitere Dateien hinzufügen' : 'Audiodateien wählen oder hierher ziehen';
  }

  function fuegeHinzu(files) {
    if (laeuft) return;
    const neu = [...(files || [])].filter((f) => !liste.some((x) => fsig(x.file) === fsig(f)));
    if (!neu.length) return;
    for (const f of neu) {
      const x = { file: f, dauer: 0, lauf: null, status: '', fehler: null, el: null };
      liste.push(x);
      // Dauer aus den Metadaten: sofort, ohne die ganze Datei zu dekodieren.
      const url = URL.createObjectURL(f);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { if (Number.isFinite(a.duration)) { x.dauer = a.duration; zeigeListe(); } URL.revokeObjectURL(url); };
      a.onerror = () => URL.revokeObjectURL(url);
      a.src = url;
    }
    setzeTitel(liste.length === 1 ? ohneEndung(liste[0].file.name) : `${liste.length} Aufnahmen`);
    zeigeListe();
    pruefeAktion();
  }

  inDatei.addEventListener('change', () => { fuegeHinzu(inDatei.files); inDatei.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => ablage.addEventListener(t, (ev) => { ev.preventDefault(); ablage.classList.add('ueber'); }));
  ['dragleave', 'drop'].forEach((t) => ablage.addEventListener(t, () => ablage.classList.remove('ueber')));
  // Überall auf der Seite fallen lassen geht; die Seite wird nie verlassen.
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => { ev.preventDefault(); ablage.classList.remove('ueber'); fuegeHinzu(ev.dataTransfer.files); });

  $('btn-leeren').addEventListener('click', () => {
    if (laeuft) return;
    liste.length = 0; audio = null;
    setzeTitel('Transkript');
    zeigeListe(); pruefeAktion();
  });

  // ───────────── Hauptaktion ─────────────

  function pruefeAktion() {
    const todo = liste.filter((x) => offen(x) !== 0);
    const fehlend = todo.reduce((s, x) => s + Math.max(0, offen(x)), 0);
    const btn = $('btn-start');
    if (todo.length && todo.every((x) => offen(x) > 0)) btn.textContent = `${zahl(fehlend)} fehlende ${fehlend === 1 ? 'Abschnitt' : 'Abschnitte'} wiederholen`;
    else btn.textContent = todo.length > 1 ? `${zahl(todo.length)} Dateien transkribieren` : 'Transkribieren';
    aktion.zeige(!laeuft && todo.length > 0 && !!inKey.value.trim() && keyStatus !== 'falsch');
    if (!laeuft) liste.forEach((x) => { if (x.el) x.el.lastChild.textContent = statusText(x); });
  }

  $('btn-start').addEventListener('click', starte);

  // ───────────── Audio ─────────────

  class Fehler extends Error {}

  async function dekodiere(f) {
    const buf = await f.arrayBuffer();
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    let rate = RATE, ctx;
    try { ctx = new Ctx(1, 1, RATE); } catch { rate = 44100; ctx = new Ctx(1, 1, rate); }   // ältere Safari: kein 16-kHz-Kontext
    let ab;
    try {
      ab = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    } catch {
      throw new Fehler('Dieser Browser kann das Format nicht lesen. Datei als MP3 oder M4A speichern oder am Computer in Chrome, Edge oder Firefox öffnen.');
    }
    const n = ab.length, k = ab.numberOfChannels;
    let mono = ab.getChannelData(0);
    if (k > 1) {
      mono = new Float32Array(n);
      for (let c = 0; c < k; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i]; }
      for (let i = 0; i < n; i++) mono[i] /= k;
    }
    if (rate !== RATE) mono = resample(mono, rate);
    if (mono.length < RATE / 2) throw new Fehler('Die Aufnahme ist kürzer als eine halbe Sekunde.');
    return mono;
  }

  // Mittelwert über das Quellintervall: einfacher Tiefpass gegen Aliasing.
  function resample(x, von) {
    const f = von / RATE, out = new Float32Array(Math.floor(x.length / f));
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(i * f), b = Math.min(x.length, Math.floor((i + 1) * f));
      let s = 0; for (let j = a; j < b; j++) s += x[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  }

  // Hochpass 80 Hz (Biquad, Butterworth) an Ort und Stelle: nimmt Brummen,
  // Wind und Trittschall weg, lässt jede Stimme unberührt. Liefert dabei den
  // Effektivwert je 50-ms-Fenster – ein Durchgang für beides.
  function filtereUndMiss(x) {
    const w0 = (2 * Math.PI * 80) / RATE, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), a0 = 1 + al;
    const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    const frames = new Float32Array(Math.ceil(x.length / FRAME));
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, sum = 0;
    for (let i = 0; i < x.length; i++) {
      const x0 = x[i], y = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y;
      x[i] = y; sum += y * y;
      if ((i + 1) % FRAME === 0 || i === x.length - 1) { frames[Math.floor(i / FRAME)] = Math.sqrt(sum / FRAME); sum = 0; }
    }
    return frames;
  }

  // Schnitte an der leisesten Stelle (200 ms) zwischen 90 und 150 s: kein Wort wird zerteilt.
  function abschnitte(frames) {
    const g = [0], n = frames.length;
    let pos = 0;
    while (n - pos > MAX_S * FPS) {
      let best = pos + ZIEL_S * FPS, bestV = Infinity;
      for (let f = pos + MIN_S * FPS; f < pos + MAX_S * FPS - 3; f++) {
        const v = frames[f] + frames[f + 1] + frames[f + 2] + frames[f + 3];
        if (v < bestV) { bestV = v; best = f + 2; }
      }
      g.push(best); pos = best;
    }
    g.push(n);
    const teile = [];
    for (let i = 0; i < g.length - 1; i++) teile.push({ a: g[i] * FRAME, b: g[i + 1] * FRAME, fa: g[i], fb: g[i + 1], text: null, fehler: null });
    return teile;
  }

  // Sprechpegel = 90. Perzentil der Fenster: Pausen ziehen ihn nicht herunter.
  function sprechpegel(frames, fa, fb) {
    const s = Array.from(frames.subarray(fa, fb)).sort((x, y) => x - y);
    return s[Math.floor(s.length * 0.9)] || 0;
  }

  // Pausen über 1,5 s auf 0,5 s kürzen. Pause = 24 dB unter dem Sprechpegel:
  // In verrauschten Aufnahmen liegt das Rauschen darüber, dann bleibt alles stehen.
  function verdichte(pcm, frames, fa, fb, pegel) {
    const schwelle = Math.max(STILLE / 4, pegel * 0.063);
    const behalten = [];
    let f = fa;
    while (f < fb) {
      let g = f;
      while (g < fb && frames[g] < schwelle) g++;
      if (g - f > PAUSE_MAX) { behalten.push([f, f + PAUSE_REST / 2], [g - PAUSE_REST / 2, g]); }
      else if (g > f) behalten.push([f, g]);
      let h = g;
      while (h < fb && frames[h] >= schwelle) h++;
      if (h > g) behalten.push([g, h]);
      f = h;
    }
    let n = 0;
    for (const [a, b] of behalten) n += b - a;
    const ende = Math.min(fb * FRAME, pcm.length);
    if (n === fb - fa) return { x: pcm.subarray(fa * FRAME, ende), weg: 0 };
    const x = new Float32Array(n * FRAME);
    let pos = 0;
    for (const [a, b] of behalten) {
      const teil = pcm.subarray(a * FRAME, Math.min(b * FRAME, pcm.length));
      x.set(teil, pos); pos += teil.length;
    }
    return { x: x.subarray(0, pos), weg: (ende - fa * FRAME - pos) / RATE };
  }

  // Anheben auf Sprechpegel, Spitzen weich begrenzen, als MP3 kodieren.
  function mp3(x, gain) {
    const enc = new lamejs.Mp3Encoder(1, RATE, KBPS);
    const block = 1152, pcm = new Int16Array(block), teile = [];
    for (let i = 0; i < x.length; i += block) {
      const n = Math.min(block, x.length - i);
      for (let j = 0; j < n; j++) {
        let v = x[i + j] * gain;
        const a = Math.abs(v);
        if (a > 0.8) v = Math.sign(v) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
        pcm[j] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      const out = enc.encodeBuffer(n === block ? pcm : pcm.subarray(0, n));
      if (out.length) teile.push(new Uint8Array(out));
    }
    const rest = enc.flush();
    if (rest.length) teile.push(new Uint8Array(rest));
    return new Blob(teile, { type: 'audio/mpeg' });
  }

  // Base64 über FileReader: nativ, blockiert die Seite nicht.
  const base64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  // ───────────── OpenRouter ─────────────

  class Endgueltig extends Error {}
  const ENDGUELTIG = {
    401: 'Der Schlüssel ist ungültig (401).',
    402: 'Das OpenRouter-Guthaben reicht nicht (402). Unter openrouter.ai/credits aufladen.',
    403: 'OpenRouter hat die Anfrage blockiert (403).',
    404: 'Das Modell ist bei OpenRouter gerade nicht verfügbar (404). Das andere Modell wählen.',
  };
  const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
  
  // Gleichzeitige Anfragen begrenzen. OpenRouter reserviert für jede laufende
  // Anfrage vorab Guthaben; bei kleinem Guthaben lehnt es parallele Anfragen
  // mit 402 „in-flight requests“ ab, obwohl jede einzeln durchginge. Dann geht
  // es einzeln weiter – nur ein 402 ohne andere laufende Anfrage ist echt.
  const platz = { aktiv: 0, grenze: PARALLEL, warten: [] };
  async function belege() {
    while (platz.aktiv >= platz.grenze) await new Promise((r) => platz.warten.push(r));
    platz.aktiv++;
  }
  function gib() { platz.aktiv--; platz.warten.splice(0).forEach((f) => f()); }

  async function whisper(b64, hinweis) {
    let letzter = '', reserviert = 0;
    for (let v = 1; v <= VERSUCHE; v++) {
      const body = { model: e.modell, input_audio: { data: b64, format: 'mp3' } };
      if (e.sprache) body.language = e.sprache;
      if (!ohne.temperature) body.temperature = 0;   // kein Raten: weniger erfundene Sätze
      // Begriffe als Satz: Whisper übernimmt Schreibweise und Stil des Prompts.
      if (!ohne.prompt && e.begriffe.trim()) body.prompt = `${e.begriffe.trim().replace(/[.,;\s]+$/, '')}.`;
      await belege();
      let r, d = null, andere = 0;
      try {
        r = await fetch(`${API}/audio/transcriptions`, {
          method: 'POST',
          signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined,
          headers: { Authorization: `Bearer ${inKey.value.trim()}`, 'Content-Type': 'application/json', 'X-Title': 'Transkript', 'HTTP-Referer': location.origin },
          body: JSON.stringify(body),
        });
        andere = platz.aktiv - 1;
        try { d = await r.json(); } catch { d = null; }
      } catch (err) {
        letzter = err && err.name === 'TimeoutError' ? 'keine Antwort nach 2 Minuten' : navigator.onLine ? 'Netzwerkfehler' : 'keine Internetverbindung';
        gib(); await warte(v); continue;
      }
      gib();
      const detail = d && d.error ? String(d.error.message || d.error).slice(0, 240) : '';
      // 402 „in-flight“: OpenRouter hält für laufende Anfragen Guthaben zurück, das
      // erst einige Sekunden nach der Antwort wieder frei wird. Ab jetzt einzeln,
      // mit wachsender Pause (6, 12, 24, 48 s). Erst danach ist es echter Mangel.
      if (r.status === 402 && /in-flight|settle/i.test(detail) && (andere > 0 || reserviert < 4)) {
        platz.grenze = 1;
        if (!andere) reserviert++;
        v--;
        letzter = 'Guthaben durch laufende Anfragen reserviert';
        if (hinweis) hinweis('OpenRouter hält für laufende Anfragen Guthaben zurück. Es geht einzeln weiter, das dauert etwas länger.');
        await schlaf(andere > 0 ? 1500 : 3000 * 2 ** reserviert); continue;
      }
      if (r.status === 402 && /in-flight|settle/i.test(detail)) {
        throw new Endgueltig('OpenRouter gibt auch für eine einzelne Anfrage nicht genug Guthaben frei (402). Häufigste Ursache: Der Schlüssel hat ein eigenes Ausgabenlimit, das fast aufgebraucht ist – unter openrouter.ai/settings/keys erhöhen. Sonst unter openrouter.ai/credits aufladen.');
      }
      if (r.status in ENDGUELTIG) throw new Endgueltig(`${ENDGUELTIG[r.status]} ${detail}`.trim());
      if (r.status === 400) {
        const weg = ['prompt', 'temperature'].find((k) => !ohne[k] && k in body && new RegExp(k, 'i').test(detail));
        if (weg) { ohne[weg] = true; v--; continue; }
        throw new Endgueltig(`OpenRouter lehnt den Abschnitt ab (400). ${detail}`.trim());
      }
      if (r.status === 429 || r.status >= 500 || r.status === 408) {
        letzter = `OpenRouter antwortet mit ${r.status}`;
        await warte(v, r.headers.get('retry-after')); continue;
      }
      if (!d) { letzter = 'Antwort war kein JSON'; await warte(v); continue; }
      if (d.error && d.text === undefined) { letzter = detail; await warte(v); continue; }
      const kosten = d.usage && typeof d.usage.cost === 'number' ? d.usage.cost : null;
      return { text: String(d.text || ''), kosten };
    }
    throw new Error(`nach ${VERSUCHE} Versuchen nicht erreichbar (${letzter})`);
  }

  function warte(v, retryAfter) {
    if (v >= VERSUCHE) return Promise.resolve();
    const ra = Number(retryAfter);
    return schlaf(Math.min(30000, Math.max(Number.isFinite(ra) ? ra * 1000 : 0, 2 ** v * 700 + Math.random() * 600)));
  }

  // ───────────── Aufräumen ─────────────

  // Whisper wurde mit Fernseh-Untertiteln trainiert und schreibt bei Stille
  // oder Rauschen gern deren Abspann. Nur diese bekannten Sätze fallen weg.
  const PHANTOM = [
    /^untertitel(ung)?( im auftrag| des| der| von| by|:)/i,
    /amara\.org/i,
    /^(vielen )?dank (fürs|für's|für das) zu(schauen|sehen)/i,
    /^(thanks?|thank you) (so much )?for watching/i,
    /^(copyright|©)\s/i,
    /^(swr|wdr|zdf|ard|ndr|br) (19|20)\d\d\.?$/i,
    /^(bis zum nächsten mal|tschüss)\.?$/i,
  ];

  function raeume(text) {
    // Schleifen innerhalb eines Satzes („und dann und dann und dann …“) auf ein Vorkommen kürzen.
    let t = text.replace(/\s+/g, ' ').trim().replace(/(\b[^.!?]{2,60}?)(?:[\s,]+\1\b){3,}/gi, '$1');
    const saetze = t.split(/(?<=[.!?…])\s+/);
    const out = [];
    let vorher = '', gleich = 0;
    for (const s of saetze) {
      const kern = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!kern) continue;
      if (PHANTOM.some((re) => re.test(s.trim()))) continue;
      // Derselbe Satz mehr als zweimal hintereinander ist eine Schleife, kein Gespräch.
      gleich = kern === vorher ? gleich + 1 : 0;
      vorher = kern;
      if (gleich >= 2) continue;
      out.push(s);
    }
    return out.join(' ');
  }

  // ───────────── Lauf ─────────────

  const mass = { el: $('mass'), m: null };

  function fortschritt(fertig, gesamt, t0) {
    if (!mass.m || mass.gesamt !== gesamt) { mass.m = M.Mass(mass.el, 0, gesamt); mass.gesamt = gesamt; }
    mass.m.zeige(fertig);
    $('mass-links').textContent = `${zahl(fertig)} von ${zahl(gesamt)} Abschnitten`;
    const vergangen = (performance.now() - t0) / 1000;
    $('mass-rechts').textContent = fertig && fertig < gesamt ? `≈ ${zeit((vergangen / fertig) * (gesamt - fertig))} übrig` : '';
  }

  async function starte() {
    if (laeuft) return;
    const todo = liste.filter((x) => offen(x) !== 0);
    if (!todo.length) return;
    laeuft = true; pruefeAktion(); $('btn-leeren').hidden = true;
    const t0 = performance.now();
    const msg = $('lauf-msg'), feldLauf = $('lauf-feld');
    $('lauf').hidden = false;
    $('lauf').scrollIntoView({ behavior: M.reduziert ? 'auto' : 'smooth', block: 'center' });
    let wake = null;
    try { wake = await navigator.wakeLock.request('screen'); } catch { /* nicht überall verfügbar */ }
    platz.grenze = PARALLEL;
    let abbruch = null;

    for (let n = 0; n < todo.length && !abbruch; n++) {
      const x = todo[n];
      $('lauf-titel').textContent = todo.length > 1 ? `Datei ${n + 1} von ${todo.length} · ${x.file.name}` : 'Transkription';
      x.fehler = null; x.status = 'Liest …'; zeigeListe();
      meldung(feldLauf, msg, 'Aufnahme wird gelesen …', '');
      try {
        await verarbeite(x, t0, msg, feldLauf);
      } catch (err) {
        x.fehler = err.message;
        if (err instanceof Endgueltig) abbruch = err;
      }
      x.status = x.fehler && offen(x) <= 0 ? 'Fehler' : '';
      zeigeListe();
      zeigeErgebnis(t0);
    }
    audio = null;   // Speicher freigeben; ein Wiederholen liest die Datei neu

    const fehler = liste.filter((x) => x.fehler || offen(x) > 0);
    if (abbruch) {
      meldung(feldLauf, msg, abbruch.message, 'fehler');
      if (/401/.test(abbruch.message)) { keyStatus = 'falsch'; meldung(feldKey, $('schluessel-msg'), abbruch.message, 'fehler'); }
    } else if (fehler.length) {
      const fehlend = fehler.reduce((s, x) => s + Math.max(0, offen(x)), 0);
      meldung(feldLauf, msg, `${fehlend ? `${zahl(fehlend)} Abschnitte fehlen` : `${zahl(fehler.length)} Dateien fehlen`}: ${fehler[0].fehler || 'siehe Liste'}. Unten erneut versuchen – Fertiges bleibt.`, 'fehler');
    } else {
      $('lauf').hidden = true;
      $('ergebnis').scrollIntoView({ behavior: M.reduziert ? 'auto' : 'smooth', block: 'start' });
      const dauer = todo.reduce((s, x) => s + (x.dauer || 0), 0);
      toast.zeige('Fertig.', `${zeit(dauer)} Audio in ${zeit((performance.now() - t0) / 1000)} transkribiert.`);
    }
    laeuft = false;
    if (wake) wake.release().catch(() => {});
    zeigeListe();
    pruefeAktion();
  }

  async function verarbeite(x, t0, msg, feldLauf) {
    const s = sig(x);
    if (!audio || audio.sig !== fsig(x.file)) {
      audio = null;   // vorige Datei zuerst freigeben
      await schlaf(30);  // Meldung zuerst zeichnen, dann rechnen
      const pcm = await dekodiere(x.file);
      const frames = filtereUndMiss(pcm);
      audio = { sig: fsig(x.file), pcm, frames };
      x.dauer = pcm.length / RATE;
    }
    if (!x.lauf || x.lauf.sig !== s) x.lauf = { sig: s, teile: abschnitte(audio.frames), kosten: 0, gemeldet: true };

    const teile = x.lauf.teile;
    const zuTun = teile.filter((t) => t.text === null);
    const zaehle = () => {
      const f = teile.filter((t) => t.text !== null).length;
      fortschritt(f, teile.length, t0);
      x.status = `${zahl(f)} / ${zahl(teile.length)}`; x.el.lastChild.textContent = x.status;
    };
    zaehle();
    meldung(feldLauf, msg, `${zahl(teile.length)} Abschnitte, bis zu ${PARALLEL} gleichzeitig. Die Seite bitte offen lassen.`, '');

    let abbruch = null, i = 0;
    const arbeiter = async () => {
      while (i < zuTun.length && !abbruch) {
        const t = zuTun[i++];
        try {
          const pegel = sprechpegel(audio.frames, t.fa, t.fb);
          if (pegel < STILLE) { t.text = ''; t.weg = (t.b - t.a) / RATE; }
          else {
            const gain = Math.min(MAX_GAIN, Math.max(1, ZIELPEGEL / pegel));
            const v = verdichte(audio.pcm, audio.frames, t.fa, t.fb, pegel);
            t.weg = v.weg;
            const r = await whisper(await base64(mp3(v.x, gain)), (hinweis) => meldung(feldLauf, msg, hinweis, ''));
            t.text = raeume(r.text);
            if (r.kosten === null) x.lauf.gemeldet = false; else x.lauf.kosten += r.kosten;
          }
          t.fehler = null;
        } catch (err) {
          t.fehler = err.message;
          if (err instanceof Endgueltig) abbruch = err;
        }
        zaehle();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, zuTun.length) }, arbeiter));
    if (abbruch) throw abbruch;
    const fehlt = teile.find((t) => t.text === null);
    if (fehlt) x.fehler = fehlt.fehler;
  }

  // Alle Dateien mit Ergebnis, in Listenreihenfolge. Bei mehreren steht der Dateiname über jedem Text.
  function bloecke() {
    return liste.filter((x) => x.lauf && x.lauf.teile.some((t) => t.text)).map((x) => ({
      titel: ohneEndung(x.file.name),
      text: x.lauf.teile
        .map((t) => (t.text === null ? `[Abschnitt ${zeit(t.a / RATE)}–${zeit(t.b / RATE)} fehlt]` : t.text))
        .filter(Boolean).join('\n\n'),
    }));
  }

  let ergebnis = null;   // { name, titel: [..], text, paare }

  function zeigeErgebnis(t0) {
    const b = bloecke();
    // Noch nichts Erkanntes: kein Ergebnis zeigen und kein früheres überschreiben.
    if (!b.length) return;
    const text = b.length === 1 ? b[0].text : b.map((x) => `${x.titel}\n\n${x.text}`).join('\n\n\n');
    $('text').value = text;
    $('ergebnis').hidden = false;
    const mit = liste.filter((x) => x.lauf);
    const alle = mit.flatMap((x) => x.lauf.teile);
    const woerter = alle.reduce((n, t) => n + (t.text ? t.text.split(' ').length : 0), 0);
    const weg = alle.reduce((s, t) => s + (t.weg || 0), 0);
    const kosten = mit.reduce((s, x) => s + x.lauf.kosten, 0);
    const gemeldet = mit.every((x) => x.lauf.gemeldet);
    const paare = [];
    if (b.length > 1) paare.push(['Dateien', zahl(b.length)]);
    paare.push(['Dauer', zeit(mit.reduce((s, x) => s + (x.dauer || 0), 0))], ['Wörter', zahl(woerter)]);
    if (weg >= 1) paare.push(['Stille gespart', zeit(weg)]);
    if (kosten || gemeldet) paare.push([gemeldet ? 'Kosten' : 'Kosten mind.', cent(kosten)]);
    if (t0) paare.push(['Zeit', zeit((performance.now() - t0) / 1000)]);
    datenzeile($('ergebnis-daten'), paare);
    const name = b.length === 1 ? b[0].titel : `Transkripte ${new Date().toLocaleDateString('de-DE')}`;
    ergebnis = { name, titel: b.length > 1 ? b.map((x) => x.titel) : [], text, paare };
    schreib(KEY_LETZTER, ergebnis);
  }

  // ───────────── Ergebnis ─────────────

  $('btn-kopieren').addEventListener('click', async () => {
    const t = $('text');
    try { await navigator.clipboard.writeText(t.value); }
    catch { t.select(); document.execCommand('copy'); }
    toast.zeige('Kopiert.', `${zahl(t.value.length)} Zeichen in der Zwischenablage.`);
  });

  const dateiname = () => ((ergebnis && ergebnis.name) || 'Transkript').replace(/[\\/:*?"<>|]+/g, '-').trim();

  function lade(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('btn-speichern').addEventListener('click', () => {
    lade(new Blob([$('text').value], { type: 'text/plain;charset=utf-8' }), `${dateiname()}.txt`);
  });

  // jsPDF erst laden, wenn jemand ein PDF will (420 KB).
  let jspdfLaden = null;
  const ladeJsPDF = () => jspdfLaden || (jspdfLaden = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/jspdf.js?v=4.2.1';
    sc.onload = () => res(window.jspdf.jsPDF);
    sc.onerror = () => { jspdfLaden = null; rej(new Error('PDF-Baustein konnte nicht geladen werden. Internetverbindung prüfen.')); };
    document.head.append(sc);
  }));

  // Die Standardschrift im PDF kennt nur Windows-1252 (alle deutschen Zeichen,
  // „“ – …). Was darüber hinausgeht, wird ersetzt statt falsch gedruckt.
  const CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const pdfText = (t) => t.replace(/[^\n\x20-\x7e\xa0-\xff]/g, (c) => (CP1252.includes(c) ? c : ({ '\u2009': ' ', '\u202f': ' ', '\u2011': '-', '\u2212': '-', '\u201f': '"', '\u2033': '"' }[c] || '?')));

  $('btn-pdf').addEventListener('click', async () => {
    const btn = $('btn-pdf');
    btn.disabled = true;
    try {
      const JsPDF = await ladeJsPDF();
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      const L = 22, B = 210 - 2 * L, UNTEN = 297 - 22;
      const titel = new Set((ergebnis && ergebnis.titel) || []);
      let y = 28;
      const platzFuer = (h) => { if (y + h > UNTEN) { doc.addPage(); y = 24; } };
      doc.setFont('helvetica', 'normal'); doc.setFontSize(20); doc.setTextColor(34, 39, 44);
      doc.splitTextToSize(pdfText(dateiname()), B).forEach((z) => { doc.text(z, L, y); y += 8.5; });
      doc.setFontSize(8.5); doc.setTextColor(110, 116, 122);
      const kopf = [new Date().toLocaleDateString('de-DE'), ...((ergebnis && ergebnis.paare) || []).filter(([k]) => k !== 'Zeit').map(([k, v]) => `${k} ${v}`)].join('   ·   ');
      doc.text(pdfText(kopf), L, y); y += 3;
      doc.setDrawColor(180, 184, 188); doc.setLineWidth(0.2); doc.line(L, y, L + B, y); y += 9;
      doc.setTextColor(34, 39, 44);
      for (const abs of $('text').value.split(/\n{2,}/)) {
        const t = abs.trim(); if (!t) continue;
        if (titel.has(t)) {
          platzFuer(20); y += 4;
          doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
          doc.splitTextToSize(pdfText(t), B).forEach((z) => { doc.text(z, L, y); y += 6; });
          y += 2;
          continue;
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        for (const z of doc.splitTextToSize(pdfText(t.replace(/\n/g, ' ')), B)) { platzFuer(5.2); doc.text(z, L, y); y += 5.2; }
        y += 3;
      }
      const seiten = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 146, 152);
      for (let i = 1; i <= seiten; i++) { doc.setPage(i); doc.text(`${i} / ${seiten}`, L + B, 297 - 12, { align: 'right' }); }
      lade(doc.output('blob'), `${dateiname()}.pdf`);
    } catch (err) {
      toast.zeige('PDF nicht erstellt.', err.message, 5000);
    } finally { btn.disabled = false; }
  });

  // ───────────── Start ─────────────

  const letzter = lies(KEY_LETZTER);
  if (letzter && letzter.text) {
    ergebnis = letzter;
    $('text').value = letzter.text;
    $('ergebnis').hidden = false;
    datenzeile($('ergebnis-daten'), letzter.paare || []);
  }
  setzeTitel('Transkript');
  M.staffel(document.querySelectorAll('.rein'));
  pruefeKey();
})();
