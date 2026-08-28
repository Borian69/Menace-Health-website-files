/* Rückmeldung: Klang, Vibration, Bewegung.

   Die Töne werden im Browser erzeugt statt als Datei geladen — das hält
   die App bei null Bytes Zusatzgewicht und funktioniert offline. Vorbild
   ist die Bestätigung beim Bezahlen am Handy: sehr kurz, zwei helle
   Glockentöne, sofort vorbei.

   Ton und Vibration brauchen eine echte Nutzergeste, bevor der Browser
   sie zulässt. `unlock()` wird deshalb beim ersten Tippen aufgerufen. */

import { renderTone } from './wav.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let audio = null;
let master = null;                 // Lautstärkeregler für den Web-Audio-Weg
let element = null;                // Ersatzweg über ein <audio>-Element
let sinkId = '';                   // gewähltes Ausgabegerät, wo der Browser das kann
let lastPath = '';                 // welcher Weg zuletzt geklungen hat
let enabled = { sounds: true, haptics: true, volume: 0.7 };

export function configure(settings) {
  enabled = {
    sounds:  settings.sounds !== false,
    haptics: settings.haptics !== false,
    volume:  typeof settings.volume === 'number' ? settings.volume : 0.7,
  };
  if (master) master.gain.value = enabled.volume;
}

let lastFault = '';

/** Beim Tippen aufrufen — vorher lässt kein Browser Ton zu. */
export function unlock() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) { lastFault = 'Dieser Browser kann keine Töne erzeugen (kein Web Audio).'; return; }
  try {
    audio = new Ctor();
    master = audio.createGain();
    master.gain.value = enabled.volume;
    master.connect(audio.destination);
    audio.resume?.().catch(() => {});
    if (sinkId && audio.setSinkId) audio.setSinkId(sinkId).catch(() => {});
  } catch (error) {
    audio = null;
    master = null;
    lastFault = `Der Tonkanal ließ sich nicht öffnen (${error.name || 'Fehler'}).`;
  }
}

/* ── Ersatzweg ohne Web Audio ────────────────────────────── */

const wavCache = new Map();

/** Spielt einen vorberechneten Ton über ein gewöhnliches Audio-Element. */
function playViaElement(key, notes) {
  if (!wavCache.has(key)) wavCache.set(key, renderTone(notes));
  try {
    element = new Audio(wavCache.get(key));
    element.volume = Math.max(0, Math.min(1, enabled.volume));
    if (sinkId && element.setSinkId) element.setSinkId(sinkId).catch(() => {});
    const played = element.play();
    played?.catch(() => {});
    lastPath = 'Audio-Element';
    return true;
  } catch {
    return false;
  }
}

/** Ist der Web-Audio-Weg gerade wirklich benutzbar? */
const webAudioReady = () => Boolean(audio && master && audio.state === 'running');

/**
 * Spielt ein Signal: bevorzugt über Web Audio, sonst über das
 * Audio-Element. Beide Wege klingen gleich.
 */
function play(key, notes) {
  if (!enabled.sounds) return;
  if (audio?.state === 'suspended') audio.resume().catch(() => {});

  if (webAudioReady()) {
    lastPath = 'Web Audio';
    for (const note of notes) {
      if (note.to) riser(note.freq, note.to, note);
      else bell(note.freq, note);
    }
    return;
  }
  playViaElement(key, notes);
}

/* ── Ausgabegerät ────────────────────────────────────────── */

export const canPickOutput = () =>
  Boolean(navigator.mediaDevices?.selectAudioOutput || HTMLMediaElement.prototype.setSinkId);

/**
 * Öffnet die Geräteauswahl des Browsers. Fragt dabei selbst nach der
 * nötigen Berechtigung. Auf Telefonen gibt es das nicht — dort folgt der
 * Ton immer der Medienlautstärke.
 * @returns {Promise<string>} Name des gewählten Geräts
 */
export async function pickOutput() {
  if (!navigator.mediaDevices?.selectAudioOutput) {
    throw new Error('Dieser Browser lässt keine Geräteauswahl zu. Der Ton folgt der Medienlautstärke des Geräts.');
  }
  const device = await navigator.mediaDevices.selectAudioOutput();
  sinkId = device.deviceId;
  if (audio?.setSinkId) await audio.setSinkId(sinkId).catch(() => {});
  return device.label || 'Ausgewähltes Gerät';
}

/**
 * Was ist gerade mit dem Ton los? Für die Hörprobe in den Einstellungen —
 * damit im Zweifel nicht geraten werden muss, woran es liegt.
 */
export function audioStatus() {
  if (!enabled.sounds) return { ok: false, text: 'Töne sind in den Einstellungen ausgeschaltet.' };
  if (!audio) return { ok: false, text: lastFault || 'Der Tonkanal wurde noch nicht geöffnet. Bildschirm einmal antippen.' };
  if (audio.state === 'suspended') {
    return { ok: false, text: 'Der Browser hält den Ton noch an. Nochmal tippen sollte helfen.' };
  }
  if (audio.state === 'closed') return { ok: false, text: 'Der Tonkanal wurde geschlossen. Seite neu laden.' };
  return {
    ok: true,
    text: `Ton wurde abgespielt (über ${lastPath || 'Web Audio'}). Kommt trotzdem nichts an, liegt es am Gerät: `
      + 'Lautlos-Schalter oder Medienlautstärke. Web Audio und das Audio-Element hängen beide daran.',
  };
}

/**
 * Ein Glockenton: Grundton plus eine leisere Oberschwingung, die
 * schneller ausklingt. Das macht den metallischen, teuren Klang.
 */
function bell(freq, { at = 0, duration = 0.4, gain = 0.18, partial = 2.7 } = {}) {
  if (!audio) return;
  // Der Browser darf den Kanal jederzeit angehalten haben.
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const start = audio.currentTime + at;

  for (const [ratio, level, decay] of [[1, gain, duration], [partial, gain * 0.32, duration * 0.55]]) {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;

    // Sehr kurzer Anschlag, danach exponentielles Ausklingen.
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(level, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + decay);

    osc.connect(amp).connect(master || audio.destination);
    osc.start(start);
    osc.stop(start + decay + 0.05);
  }
}

/**
 * Riser: die Tonhöhe steigt an und wird lauter, ohne auszuklingen. Er
 * baut die Spannung auf, die der Glockenton danach auflöst. Ohne ihn
 * kommt die Bestätigung aus dem Nichts; mit ihm hat sie einen Anlauf.
 */
function riser(from, to, { at = 0, duration = 0.42, gain = 0.1 } = {}) {
  if (!audio) return;
  const start = audio.currentTime + at;

  for (const [ratio, level] of [[1, gain], [2, gain * 0.4]]) {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from * ratio, start);
    osc.frequency.exponentialRampToValueAtTime(to * ratio, start + duration);

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(level, start + duration * 0.88);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(amp).connect(master || audio.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

/** Trockener kurzer Klick fürs Antippen. */
function click(freq = 1050, gain = 0.07) {
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const start = audio.currentTime;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, start + 0.05);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
  osc.connect(amp).connect(master || audio.destination);
  osc.start(start);
  osc.stop(start + 0.09);
}

const buzz = (pattern) => {
  if (enabled.haptics) navigator.vibrate?.(pattern);
};

/* ── Die Signale ─────────────────────────────────────────── */

export const cue = {
  /** Position an- oder abgewählt. */
  tick() {
    if (enabled.sounds && webAudioReady()) { lastPath = 'Web Audio'; click(1180, 0.05); }
    else play('tick', [{ freq: 1180, gain: 0.16, duration: 0.09, partial: 2 }]);
    buzz(8);
  },

  /* Beleg erkannt. Der Aufbau ist bewusst dreiteilig:
     tiefer Anlauf — Stille — Piep.

     Die Stille dazwischen trägt das Ganze. Läuft der Anlauf direkt in
     den Ton, verschwimmen beide zu einem einzigen Geräusch. Erst die
     kurze Lücke macht aus dem Anlauf eine Frage und aus dem Piep die
     Antwort. Und der Anlauf beginnt tief: von unten hat er Platz zu
     steigen, weiter oben klingt er bloss dünn. */
  success() {
    play('success', [
      { freq: 98, to: 523, duration: 0.5, gain: 0.11 },      // G2 → C5, der Anlauf
      // 0,14 s Stille
      { freq: 1318.5, at: 0.64, gain: 0.2, duration: 0.42 }, // E6 — der Piep
      { freq: 2637.0, at: 0.70, gain: 0.07, duration: 0.3 }, // eine Oktave als Glanz
    ]);
    buzz([0, 440, 140, 55, 24]);
  },

  /** Abrechnung abgeschlossen — gleicher Aufbau, längerer Anlauf. */
  done() {
    play('done', [
      { freq: 73, to: 440, duration: 0.7, gain: 0.12 },          // D2 → A4
      // 0,16 s Stille
      { freq: 1046.5, at: 0.86, gain: 0.16 },                    // C6
      { freq: 1318.5, at: 0.95, gain: 0.16 },                    // E6
      { freq: 1568.0, at: 1.04, gain: 0.17, duration: 0.75 },    // G6
      { freq: 2093.0, at: 1.16, gain: 0.10, duration: 0.95 },    // C7 als Schimmer
    ]);
    buzz([0, 640, 160, 40, 14, 40, 34]);
  },

  /** Beleg wandert in die Ablage — dasselbe im Kleinen. */
  filed() {
    play('filed', [
      { freq: 220, to: 780, duration: 0.22, gain: 0.08 },
      // 0,07 s Stille
      { freq: 1760, at: 0.29, gain: 0.11, duration: 0.24, partial: 2 },
    ]);
    buzz([10, 30, 16]);
  },

  /** Etwas ist schiefgegangen. */
  error() {
    play('error', [
      { freq: 392, gain: 0.12, duration: 0.28, partial: 2 },
      { freq: 294, at: 0.11, gain: 0.11, duration: 0.42, partial: 2 },
    ]);
    buzz([40, 60, 40]);
  },
};

/* ── Bewegung ────────────────────────────────────────────── */

/**
 * Zählt einen Geldbetrag hoch statt ihn springen zu lassen.
 * @param {HTMLElement} node
 * @param {number} to     Zielwert in Cent
 * @param {(cents:number)=>string} format
 */
export function countTo(node, to, format) {
  const from = Number(node.dataset.value ?? to);
  node.dataset.value = String(to);

  if (from === to || reduceMotion()) {
    node.textContent = format(to);
    return;
  }

  const duration = Math.min(700, 260 + Math.abs(to - from) * 0.35);
  const started = performance.now();

  cancelAnimationFrame(Number(node.dataset.raf || 0));
  const step = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - progress) ** 3;          // sanft ausrollen
    node.textContent = format(Math.round(from + (to - from) * eased));
    if (progress < 1) node.dataset.raf = String(requestAnimationFrame(step));
  };
  node.dataset.raf = String(requestAnimationFrame(step));
}

/**
 * Kurzes Aufploppen eines Elements. Der Klassenname ist wählbar, damit
 * dieselbe Neustart-Mechanik auch andere Animationen auslösen kann.
 */
export function pop(node, className = 'pop') {
  if (!node || reduceMotion()) return;
  node.classList.remove(className);
  void node.offsetWidth;              // Neustart der Animation erzwingen
  node.classList.add(className);
}

/**
 * Die große Bestätigung: Ring, Haken, Funken. Legt sich über alles und
 * verschwindet von selbst.
 * @returns {Promise<void>} erfüllt, wenn die Anzeige durch ist
 */
export function celebrate({ label, amount, tone = 'success' } = {}) {
  const overlay = document.querySelector('#burst');
  if (!overlay) return Promise.resolve();

  document.querySelector('#burst-label').textContent = label || '';
  document.querySelector('#burst-amount').textContent = amount || '';
  document.querySelector('#burst-amount').hidden = !amount;

  cue[tone]?.();

  if (reduceMotion()) {
    overlay.hidden = false;
    return new Promise((resolve) => setTimeout(() => { overlay.hidden = true; resolve(); }, 700));
  }

  overlay.classList.remove('run');
  overlay.hidden = false;
  void overlay.offsetWidth;
  overlay.classList.add('run');

  return new Promise((resolve) => {
    setTimeout(() => { overlay.hidden = true; overlay.classList.remove('run'); resolve(); }, 1250);
  });
}
