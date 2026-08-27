/* Kamera in der App statt Umweg über die System-Kamera.

   Der Grund ist ein handfester: `<input capture="environment">` ist für
   den Browser nur ein Vorschlag. Viele Android-Browser ignorieren die
   Richtung und öffnen die Frontkamera. Über getUserMedia lässt sich die
   Rückkamera dagegen verbindlich anfordern — und nebenbei gibt es eine
   Vorschau mit Rahmen, Licht für dunkle Bons und keinen App-Wechsel.

   Für die Aufnahme wird ImageCapture bevorzugt: das liefert das volle
   Sensorbild statt nur eines Videobildes. Wo es fehlt, wird das
   laufende Bild abgegriffen. */

let stream = null;
let track = null;
let facing = 'environment';

export const supported = () => Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Startet die Vorschau im übergebenen <video>.
 * @throws Error mit verständlichem Text, wenn es nicht geht
 */
export async function start(video, { preferred = 'environment' } = {}) {
  await stop();
  facing = preferred;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        // "ideal" statt "exact": Geräte ohne zweite Kamera sollen nicht
        // scheitern, sondern nehmen, was da ist.
        facingMode: { ideal: facing },
        width:  { ideal: 2560 },
        height: { ideal: 1440 },
      },
      audio: false,
    });
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Die Kamera ist für diese Seite gesperrt. In den Browser-Einstellungen für diese Seite freigeben.');
    }
    if (error.name === 'NotFoundError') {
      throw new Error('Es wurde keine Kamera gefunden.');
    }
    throw new Error('Die Kamera lässt sich nicht öffnen.');
  }

  track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play().catch(() => {});
  return track;
}

export async function stop() {
  stream?.getTracks().forEach((entry) => entry.stop());
  stream = null;
  track = null;
}

/** Vorne/hinten umschalten. */
export async function flip(video) {
  facing = facing === 'environment' ? 'user' : 'environment';
  await start(video, { preferred: facing });
  return facing;
}

export const facingNow = () => facing;

/* ── Licht ───────────────────────────────────────────────── */

export function hasTorch() {
  return Boolean(track?.getCapabilities?.().torch);
}

export async function setTorch(on) {
  if (!hasTorch()) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}

/* ── Auslösen ────────────────────────────────────────────── */

/** @returns {Promise<File>} das aufgenommene Bild */
export async function shoot(video) {
  if (!track) throw new Error('Die Kamera läuft nicht.');

  // Volles Sensorbild, wo der Browser es hergibt.
  if (window.ImageCapture) {
    try {
      const blob = await new window.ImageCapture(track).takePhoto();
      if (blob?.size > 0) return new File([blob], 'beleg.jpg', { type: blob.type || 'image/jpeg' });
    } catch { /* fällt unten auf das Videobild zurück */ }
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (!canvas.width || !canvas.height) throw new Error('Die Vorschau ist noch nicht bereit.');
  canvas.getContext('2d').drawImage(video, 0, 0);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Die Aufnahme ist fehlgeschlagen.');
  return new File([blob], 'beleg.jpg', { type: 'image/jpeg' });
}
