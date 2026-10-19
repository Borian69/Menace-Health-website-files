/* Signale für jemanden, der zwei Meter vom Telefon entfernt springt und
   nicht hinsehen kann: Töne, Ansage, Vibration — und ein Bildschirm, der
   nicht ausgeht.

   Browser spielen Ton und Sprache erst, nachdem jemand getippt hat.
   wecke() muss deshalb im Klick auf „Training starten“ laufen. */

let klang = null;
let sperre = null;
let wachGewuenscht = false;

export function wecke() {
  try {
    const Kontext = window.AudioContext || window.webkitAudioContext;
    if (Kontext && !klang) klang = new Kontext();
    if (klang && klang.state === 'suspended') klang.resume();
  } catch { /* ohne Ton geht es auch */ }
  /* iOS gibt die Sprachausgabe erst nach einer Äußerung im Klick frei. */
  if ('speechSynthesis' in window) {
    const leer = new SpeechSynthesisUtterance(' ');
    leer.volume = 0;
    window.speechSynthesis.speak(leer);
  }
}

/** Ein Sinuston mit weichem Ein- und Ausklang — kein Knacken. */
function ton(frequenz, dauer, lautstaerke = 0.3, verzoegerung = 0) {
  if (!klang) return;
  try {
    const t = klang.currentTime + verzoegerung;
    const osz = klang.createOscillator();
    const pegel = klang.createGain();
    osz.type = 'sine';
    osz.frequency.value = frequenz;
    pegel.gain.setValueAtTime(0.0001, t);
    pegel.gain.exponentialRampToValueAtTime(lautstaerke, t + 0.012);
    pegel.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    osz.connect(pegel).connect(klang.destination);
    osz.start(t);
    osz.stop(t + dauer + 0.03);
  } catch { /* still weiter */ }
}

/* Hoch heißt los, tief heißt Pause — hörbar ohne Worte. */
export const TON = {
  zaehlen:  () => ton(880, 0.09, 0.22),
  springen: () => ton(1175, 0.32, 0.34),
  pause:    () => ton(587, 0.4, 0.3),
  fertig:   () => { ton(784, 0.16, 0.3); ton(1047, 0.16, 0.3, 0.17); ton(1568, 0.45, 0.3, 0.34); },
};

let stimme = null;
function deutscheStimme() {
  if (stimme || !('speechSynthesis' in window)) return stimme;
  stimme = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('de')) || null;
  return stimme;
}

export function sage(text) {
  if (!('speechSynthesis' in window)) return;
  const satz = new SpeechSynthesisUtterance(text);
  satz.lang = 'de-DE';
  satz.rate = 1.05;
  const s = deutscheStimme();
  if (s) satz.voice = s;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(satz);
}

export function verstumme() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function vibriere(muster) {
  if (navigator.vibrate) navigator.vibrate(muster);
}

/* ── Bildschirm wach halten ──────────────────────────────── */

async function holeSperre() {
  if (!('wakeLock' in navigator) || sperre || document.visibilityState !== 'visible') return;
  try {
    sperre = await navigator.wakeLock.request('screen');
    sperre.addEventListener('release', () => { sperre = null; });
  } catch { /* Akkusparmodus oder abgelehnt */ }
}

/* Die Sperre fällt, sobald die Seite verdeckt wird. Kommt sie zurück,
   wird sie neu geholt — sonst ginge der Bildschirm nach einem kurzen
   Blick in eine andere App mitten in der Runde aus. */
document.addEventListener('visibilitychange', () => {
  if (wachGewuenscht && document.visibilityState === 'visible') holeSperre();
});

export function wachHalten(an) {
  wachGewuenscht = an;
  if (an) holeSperre();
  else if (sperre) { sperre.release().catch(() => {}); sperre = null; }
}

export const kannWachHalten = () => 'wakeLock' in navigator;
