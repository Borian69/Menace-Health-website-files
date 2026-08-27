/* Töne als fertige WAV-Datei berechnen — ohne Web Audio.

   Warum doppelt: Web Audio ist der schöne Weg, aber manche Browser
   dämpfen oder blockieren es (Brave etwa zählt es zum
   Fingerprinting-Schutz). Dann bleibt still, was klingen sollte. Diese
   Datei erzeugt dieselben Glockentöne als reine Zahlenreihe und
   verpackt sie in ein WAV, das ein gewöhnliches <audio>-Element
   abspielt. Zwei unabhängige Wege, gleicher Klang. */

const RATE = 22050;

/**
 * @param {{freq:number, at?:number, duration?:number, gain?:number, partial?:number}[]} notes
 * @returns {string} data:-URL eines 16-Bit-Mono-WAV
 */
export function renderTone(notes) {
  const length = Math.max(...notes.map((n) => (n.at || 0) + (n.duration ?? 0.4))) + 0.05;
  const count = Math.ceil(length * RATE);
  const samples = new Float32Array(count);

  for (const note of notes) {
    const { freq, at = 0, duration = 0.4, gain = 0.18, partial = 2.7 } = note;
    const start = Math.floor(at * RATE);

    // Gleiche Form wie im Web-Audio-Weg: Grundton plus schneller
    // ausklingende Oberschwingung, sehr kurzer Anschlag.
    for (const [ratio, level, decay] of [[1, gain, duration], [partial, gain * 0.32, duration * 0.55]]) {
      const steps = Math.ceil(decay * RATE);
      for (let i = 0; i < steps; i += 1) {
        const index = start + i;
        if (index >= count) break;
        const t = i / RATE;
        const attack = Math.min(1, t / 0.008);
        const envelope = attack * Math.exp(-t / (decay / 4.6));
        samples[index] += Math.sin(2 * Math.PI * freq * ratio * t) * level * envelope;
      }
    }
  }

  return wavDataUri(samples);
}

function wavDataUri(samples) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);

  const text = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i);
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);         // Länge des Formatblocks
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);   // Bytes pro Sekunde
  view.setUint16(32, 2, true);          // Bytes pro Rahmen
  view.setUint16(34, 16, true);         // Bits je Wert
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }

  // In Blöcken umwandeln, sonst sprengt der Aufruf bei langen Tönen den Stapel.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
