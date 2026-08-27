/* Rückmeldung: Klang, Vibration, Bewegung.

   Die Töne werden im Browser erzeugt statt als Datei geladen — das hält
   die App bei null Bytes Zusatzgewicht und funktioniert offline. Vorbild
   ist die Bestätigung beim Bezahlen am Handy: sehr kurz, zwei helle
   Glockentöne, sofort vorbei.

   Ton und Vibration brauchen eine echte Nutzergeste, bevor der Browser
   sie zulässt. `unlock()` wird deshalb beim ersten Tippen aufgerufen. */

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let audio = null;
let enabled = { sounds: true, haptics: true };

export function configure(settings) {
  enabled = {
    sounds:  settings.sounds !== false,
    haptics: settings.haptics !== false,
  };
}

/** Beim ersten Tippen aufrufen — vorher lässt kein Browser Ton zu. */
export function unlock() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try {
    audio = new Ctor();
  } catch {
    audio = null;
  }
}

/**
 * Ein Glockenton: Grundton plus eine leisere Oberschwingung, die
 * schneller ausklingt. Das macht den metallischen, teuren Klang.
 */
function bell(freq, { at = 0, duration = 0.4, gain = 0.18, partial = 2.7 } = {}) {
  if (!audio) return;
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

    osc.connect(amp).connect(audio.destination);
    osc.start(start);
    osc.stop(start + decay + 0.05);
  }
}

/** Trockener kurzer Klick fürs Antippen. */
function click(freq = 1050, gain = 0.07) {
  if (!audio) return;
  const start = audio.currentTime;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, start + 0.05);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
  osc.connect(amp).connect(audio.destination);
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
    if (enabled.sounds) click(1180, 0.05);
    buzz(8);
  },

  /** Beleg erkannt — die Zwei-Ton-Bestätigung wie beim Bezahlen. */
  success() {
    if (enabled.sounds) {
      bell(1318.5);                      // E6
      bell(1975.5, { at: 0.085, gain: 0.15 });  // B6
    }
    buzz([12, 45, 22]);
  },

  /** Abrechnung abgeschlossen — aufsteigender Dreiklang. */
  done() {
    if (enabled.sounds) {
      bell(1046.5, { gain: 0.14 });                          // C6
      bell(1318.5, { at: 0.09,  gain: 0.15 });               // E6
      bell(1568.0, { at: 0.18,  gain: 0.16, duration: 0.7 }); // G6
      bell(2093.0, { at: 0.30,  gain: 0.09, duration: 0.9 }); // C7 als Schimmer
    }
    buzz([14, 40, 14, 40, 30]);
  },

  /** Etwas ist schiefgegangen. */
  error() {
    if (enabled.sounds) {
      bell(392, { gain: 0.12, duration: 0.28, partial: 2 });
      bell(294, { at: 0.11, gain: 0.11, duration: 0.42, partial: 2 });
    }
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

/** Kurzes Aufploppen eines Elements. */
export function pop(node) {
  if (!node || reduceMotion()) return;
  node.classList.remove('pop');
  void node.offsetWidth;              // Neustart der Animation erzwingen
  node.classList.add('pop');
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
