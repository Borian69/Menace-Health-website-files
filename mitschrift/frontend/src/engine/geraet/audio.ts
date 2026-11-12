// Audio im Browser vorbereiten: dekodieren (16 kHz mono), in Fenster teilen,
// Stille erkennen, als MP3 kodieren. 16 kHz mono ist das, was Whisper intern
// nutzt; 32 kbit/s MP3 macht aus einer Stunde ≈ 14 MB statt 115 MB WAV.

import { Mp3Encoder } from '@breezystack/lamejs';

export const RATE = 16000;
/** Länge eines Transkriptionsabschnitts. Klein genug für jedes Upload-Limit
 *  und jedes Anbieter-Zeitlimit, groß genug für Zusammenhang. */
export const FENSTER_S = 120;

export class AudioFehler extends Error {}

export async function dekodiere(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctx(1, 1, RATE);
  let ab: AudioBuffer;
  try {
    ab = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(buf, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  } catch {
    throw new AudioFehler(
      'Dieser Browser kann das Format nicht lesen. Am Computer (Chrome, Edge, Firefox) verarbeiten oder die Datei als MP3/M4A speichern.',
    );
  }
  if (ab.numberOfChannels === 1) return ab.getChannelData(0);
  // Auf Mono mischen
  const out = new Float32Array(ab.length);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / ab.numberOfChannels;
  }
  return out;
}

/** Effektivwert – unter etwa 0,003 ist ein Abschnitt praktisch still.
 *  Stille geht gar nicht erst an Whisper: spart Kosten und verhindert
 *  erfundene Sätze („Untertitel im Auftrag …“). */
export function pegel(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i += 4) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, Math.ceil(s.length / 4)));
}
export const STILLE = 0.003;

export function alsMp3(s: Float32Array): Uint8Array {
  const enc = new Mp3Encoder(1, RATE, 32);
  const block = 1152;
  const pcm = new Int16Array(block);
  const teile: Uint8Array[] = [];
  let laenge = 0;
  for (let i = 0; i < s.length; i += block) {
    const n = Math.min(block, s.length - i);
    for (let j = 0; j < n; j++) {
      const v = Math.max(-1, Math.min(1, s[i + j]));
      pcm[j] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const out = enc.encodeBuffer(n === block ? pcm : pcm.subarray(0, n));
    if (out.length) { teile.push(new Uint8Array(out)); laenge += out.length; }
  }
  const rest = enc.flush();
  if (rest.length) { teile.push(new Uint8Array(rest)); laenge += rest.length; }
  const alles = new Uint8Array(laenge);
  let pos = 0;
  for (const t of teile) { alles.set(t, pos); pos += t.length; }
  return alles;
}

export function base64(u8: Uint8Array): string {
  let s = '';
  const block = 0x8000;
  for (let i = 0; i < u8.length; i += block) s += String.fromCharCode(...u8.subarray(i, i + block));
  return btoa(s);
}
