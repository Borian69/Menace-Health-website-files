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
        // Hoch ansetzen: Kassenschrift ist fein, und der Browser gibt
        // sonst gern eine bequeme kleine Auflösung zurück.
        width:  { ideal: 4096 },
        height: { ideal: 2160 },
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
  await maximise();
  return track;
}

/**
 * Holt aus der Kamera, was sie hergibt: höchste Auflösung und
 * fortlaufender Autofokus. Ohne das liefert der Browser gern eine
 * bequeme kleine Auflösung mit festem Fokus — und Kassenbons werden
 * unlesbar, weil genau die feine Schrift verlorengeht.
 */
async function maximise() {
  const caps = track?.getCapabilities?.();
  if (!caps) return;

  const wanted = {};
  if (caps.width?.max)  wanted.width  = { ideal: caps.width.max };
  if (caps.height?.max) wanted.height = { ideal: caps.height.max };

  const advanced = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
  if (advanced.length) wanted.advanced = advanced;

  try {
    await track.applyConstraints(wanted);
  } catch { /* Gerät kann es nicht — dann eben mit dem, was läuft */ }
}

/**
 * Auf einen Punkt scharfstellen. x und y sind Anteile 0…1 im Bild.
 * @returns {boolean} ob das Gerät das kann
 */
export async function focusAt(x, y) {
  const caps = track?.getCapabilities?.();
  if (!caps?.focusMode?.includes('single-shot')) return false;
  try {
    const advanced = [{ focusMode: 'single-shot' }];
    if (caps.pointsOfInterest) advanced[0].pointsOfInterest = [{ x, y }];
    await track.applyConstraints({ advanced });
    return true;
  } catch {
    return false;
  }
}

/** Reicht die aktuelle Auflösung für einen Kassenbon? */
export function resolution() {
  const settings = track?.getSettings?.() || {};
  return { width: settings.width || 0, height: settings.height || 0 };
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

  // Volles Sensorbild, wo der Browser es hergibt — das ist der
  // entscheidende Unterschied zum Videobild, das für feine Kassenschrift
  // meist zu grob ist.
  if (window.ImageCapture) {
    try {
      const capture = new window.ImageCapture(track);
      let options;
      try {
        const photo = await capture.getPhotoCapabilities();
        if (photo?.imageWidth?.max) {
          options = { imageWidth: photo.imageWidth.max, imageHeight: photo.imageHeight?.max };
        }
      } catch { /* ohne Angabe nimmt der Browser seine Vorgabe */ }

      const blob = await capture.takePhoto(options);
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
