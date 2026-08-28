/* Belegfotos für die Erkennung aufbereiten.

   Kassenbons sind lang und schmal. Skaliert man so ein Foto einfach auf
   die maximale Kantenlänge herunter, wird die Schrift unleserlich. Darum
   werden hohe Bilder in überlappende Abschnitte zerlegt, die einzeln in
   voller Schärfe übertragen werden. */

const MAX_EDGE = 1568;   // größere Bilder bringen der Erkennung nichts mehr
const QUALITY  = 0.82;
const OVERLAP  = 0.08;   // Anteil, um den sich zwei Abschnitte überlappen

async function toBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation dreht hochkant aufgenommene Fotos korrekt.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* Fällt unten auf <img> zurück. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Das Bild konnte nicht geladen werden.'));
      image.src = url;
    });
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const dimensions = (bitmap) => ({
  width:  bitmap.width  || bitmap.naturalWidth,
  height: bitmap.height || bitmap.naturalHeight,
});

function sliceCount(width, height) {
  const ratio = height / width;
  if (ratio > 2.6) return 3;
  if (ratio > 1.6) return 2;
  return 1;
}

/* Das JPEG asynchron erzeugen.

   Vorher stand hier canvas.toDataURL(). Das kodiert das Bild und
   verwandelt es in Base64 — beides in einem Rutsch und blockierend. Bei
   drei Abschnitten war der Hauptthread damit leicht eine halbe Sekunde
   am Stück belegt, und genau in dieser Zeit sollte die Animation
   anlaufen. toBlob() und FileReader erledigen dasselbe nebenher. */
async function renderSlice(bitmap, { sourceY, sourceHeight, width }) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, sourceY, width, sourceHeight, 0, 0, canvas.width, canvas.height);

  return base64(await encode(canvas, QUALITY));
}

const encode = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild ließ sich nicht umwandeln.'))),
      'image/jpeg',
      quality,
    );
  });

const base64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Das Bild ließ sich nicht lesen.'));
    reader.readAsDataURL(blob);
  });

/* Dem Browser zwischen zwei Abschnitten Luft zum Zeichnen geben. Ohne
   das laufen sie in einem Zug durch und die Animation hakt trotzdem. */
const durchatmen = () => new Promise((resolve) => {
  requestAnimationFrame(() => setTimeout(resolve, 0));
});

/**
 * @param {File} file
 * @param {(preview: string) => void} [onPreview]
 *   Wird aufgerufen, sobald die kleine Vorschau da ist — also lange
 *   bevor die Abschnitte fertig sind. Vorher entstand die Vorschau
 *   zuletzt, und der Rahmen der Scan-Animation blieb die ganze
 *   Rechenzeit über leer.
 * @returns {Promise<{parts: string[], preview: string}>}
 *   parts   – Base64-JPEGs (ohne data:-Präfix), oben nach unten sortiert
 *   preview – kleine Vorschau als data:-URL für die Scan-Animation
 */
export async function prepareImage(file, onPreview) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Das ist keine Bilddatei.');
  }

  const bitmap = await toBitmap(file);
  const { width, height } = dimensions(bitmap);
  if (!width || !height) throw new Error('Das Bild ist leer.');

  // Zuerst die Vorschau: bewusst klein, sie wird nur hinter der
  // Scan-Animation gezeigt — und sie soll sofort da sein.
  const previewCanvas = document.createElement('canvas');
  const previewScale = Math.min(1, 420 / Math.max(width, height));
  previewCanvas.width  = Math.max(1, Math.round(width * previewScale));
  previewCanvas.height = Math.max(1, Math.round(height * previewScale));
  previewCanvas.getContext('2d').drawImage(bitmap, 0, 0, previewCanvas.width, previewCanvas.height);
  const preview = `data:image/jpeg;base64,${await base64(await encode(previewCanvas, 0.7))}`;
  onPreview?.(preview);

  const slices = sliceCount(width, height);
  const baseHeight = height / slices;
  const overlap = slices > 1 ? baseHeight * OVERLAP : 0;

  const parts = [];
  for (let index = 0; index < slices; index += 1) {
    await durchatmen();
    const start = Math.max(0, baseHeight * index - (index > 0 ? overlap : 0));
    const end   = Math.min(height, baseHeight * (index + 1) + (index < slices - 1 ? overlap : 0));
    parts.push(await renderSlice(bitmap, { sourceY: start, sourceHeight: end - start, width }));
  }

  bitmap.close?.();

  return { parts, preview };
}
