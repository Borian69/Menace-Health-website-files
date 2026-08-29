/* Belegfotos für die Erkennung aufbereiten.

   Kassenbons sind lang und schmal. Skaliert man so ein Foto einfach auf
   die maximale Kantenlänge herunter, wird die Schrift unleserlich. Darum
   werden hohe Bilder in überlappende Abschnitte zerlegt, die einzeln in
   voller Schärfe übertragen werden. */

const MAX_EDGE = 2000;   // Kantenlänge je Abschnitt
const QUALITY  = 0.85;
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

/* Wie viele Abschnitte, und entlang welcher Achse?

   Vorher entschied allein das Seitenverhältnis, und nur hohe Bilder
   wurden geteilt. Das ging an der Wirklichkeit vorbei: Ein Handyfoto
   im Querformat mit zwei Bons nebeneinander (4080 × 3060) hat ein
   Verhältnis von 0,75, wurde also gar nicht geteilt — und komplett auf
   die maximale Kantenlänge heruntergerechnet. Von der Kassenschrift
   blieb nichts übrig.

   Jetzt entscheidet die Auflösung: Ist die lange Kante ein Vielfaches
   der Zielgrösse, wird entlang dieser Kante so oft geteilt. Damit
   behält jeder Abschnitt annähernd seine ursprüngliche Schärfe. */
const MAX_TEILE = 4;   // darüber wird die Anfrage unnötig teuer

function aufteilung(width, height) {
  const langeKante = Math.max(width, height);
  const teile = Math.max(1, Math.min(MAX_TEILE, Math.round(langeKante / MAX_EDGE)));
  return { teile, quer: width > height };
}

/* ── Aufbereitung für die Erkennung ──────────────────────────

   Kassenbons sind der unangenehmste Fall für ein Kameraauge: graue
   Nadeldruck-Schrift auf weissem Thermopapier, im Laden meist unter
   Mischlicht. Der Kontrast fällt dabei regelmässig weit unter das, was
   das Papier hergäbe — bei dem Foto, das den Anstoss gab, lag der
   Weisspunkt bei 181 statt 255.

   Zwei Schritte helfen und sind beide gutmütig: Der Tonwertumfang wird
   auf den vollen Bereich gespreizt, und die Kanten der Buchstaben
   werden nachgezogen. Beides in Graustufen — Farbe trägt auf einem
   Kassenbon keine Information und lenkt nur ab. */

/** Tonwerte spreizen: das dunkelste Grau nach Schwarz, das hellste nach Weiss. */
function kontrast(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bild = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = bild.data;

  const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) {
    hist[(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0] += 1;
  }

  /* Zwei Prozent an jedem Ende abschneiden. Ein einzelner Lichtreflex
     oder ein schwarzer Tischrand soll die Spreizung nicht bestimmen. */
  const rand = (p.length / 4) * 0.02;
  let unten = 0;
  let summe = 0;
  while (unten < 255 && (summe += hist[unten]) < rand) unten += 1;
  let oben = 255;
  summe = 0;
  while (oben > 0 && (summe += hist[oben]) < rand) oben -= 1;

  const spanne = Math.max(1, oben - unten);
  for (let i = 0; i < p.length; i += 4) {
    const grau = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
    const wert = Math.max(0, Math.min(255, ((grau - unten) / spanne) * 255));
    p[i] = wert; p[i + 1] = wert; p[i + 2] = wert;
  }
  ctx.putImageData(bild, 0, 0);
}

/** Unscharfmaskierung: die Differenz zur Unschärfe zurückaddieren. */
function schaerfen(canvas, staerke = 0.6) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const quelle = ctx.getImageData(0, 0, w, h);
  const ziel = ctx.createImageData(w, h);
  const a = quelle.data;
  const b = ziel.data;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      b[i + 3] = 255;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        b[i] = a[i]; b[i + 1] = a[i + 1]; b[i + 2] = a[i + 2];
        continue;
      }
      let summe = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) summe += a[((y + dy) * w + (x + dx)) * 4];
      }
      const wert = Math.max(0, Math.min(255, a[i] + (a[i] - summe / 9) * staerke * 3));
      b[i] = wert; b[i + 1] = wert; b[i + 2] = wert;
    }
  }
  ctx.putImageData(ziel, 0, 0);
}

/* Das JPEG asynchron erzeugen.

   Vorher stand hier canvas.toDataURL(). Das kodiert das Bild und
   verwandelt es in Base64 — beides in einem Rutsch und blockierend. Bei
   drei Abschnitten war der Hauptthread damit leicht eine halbe Sekunde
   am Stück belegt, und genau in dieser Zeit sollte die Animation
   anlaufen. toBlob() und FileReader erledigen dasselbe nebenher. */
async function renderSlice(bitmap, { sx, sy, sw, sh }, aufbereiten) {
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (aufbereiten) {
    kontrast(canvas);
    schaerfen(canvas);
  }

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
export async function prepareImage(file, onPreview, { aufbereiten = true } = {}) {
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

  const { teile, quer } = aufteilung(width, height);
  const achse = quer ? width : height;      // entlang der langen Kante schneiden
  const laenge = achse / teile;
  const overlap = teile > 1 ? laenge * OVERLAP : 0;

  const parts = [];
  for (let index = 0; index < teile; index += 1) {
    await durchatmen();
    const start = Math.max(0, laenge * index - (index > 0 ? overlap : 0));
    const end   = Math.min(achse, laenge * (index + 1) + (index < teile - 1 ? overlap : 0));
    parts.push(await renderSlice(bitmap, quer
      ? { sx: start, sy: 0, sw: end - start, sh: height }
      : { sx: 0, sy: start, sw: width, sh: end - start }, aufbereiten));
  }

  bitmap.close?.();

  return { parts, preview };
}
