/* Kleine Helfer: DOM, Zahlen, Datum. Kosten werden intern immer in Cent
   (ganze Zahlen) gerechnet, Kilometer immer als ganze Zahl — damit gibt es
   keine Rundungsfehler. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** SVG-Symbol aus einem Pfad. `el()` kann das nicht: SVG braucht einen
    eigenen Namensraum, sonst bleibt das Element leer. */
export function icon(path, { size = 20 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;
  svg.innerHTML = path;
  return svg;
}

const eurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const kmFormat  = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** 8990 → "89,90 €" */
export const euro = (cents) => eurFormat.format((cents || 0) / 100);

/** 123456 → "123.456" */
export const km = (value) => kmFormat.format(Math.round(value || 0));

/* Kraftstoff wird in Millilitern gerechnet, damit sich beim Summieren
   nichts verschiebt — wie die Kosten in Cent. */
const literFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const verbrauchFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const spritFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** 45670 → "45,67 L" */
export const liter = (milliliter) => `${literFormat.format((milliliter || 0) / 1000)} L`;

/** 6,43 → "6,4" — die Einheit steht in der Überschrift, nicht am Wert. */
export const verbrauchZahl = (wert) => verbrauchFormat.format(wert || 0);

/** 174,9 Cent → "1,749" */
export const spritZahl = (cent) => spritFormat.format((cent || 0) / 100);

/** Eingabe "45,67" → 45670 Milliliter. */
export function toMilliliter(value) {
  const cent = toCents(value);          // dieselbe Kommalogik, zwei Stellen
  return cent > 0 ? cent * 10 : null;
}

/** Beliebige Eingabe ("89,90", "89.90", 89.9) → Cent. */
export function toCents(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/[^\d,.\-]/g, '').trim();
  if (!cleaned) return 0;
  // Letztes Trennzeichen gilt als Dezimaltrenner ("1.234,56" und "1,234.56").
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot   = cleaned.lastIndexOf('.');
  let normalised = cleaned;
  if (lastComma > lastDot)      normalised = cleaned.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) normalised = cleaned.replace(/,/g, '');
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** Kilometerstand aus einer Eingabe. "123 456 km" und "123.456" ergeben
    beide 123456 — Punkt und Leerzeichen sind hier Tausendertrenner, kein
    Komma-Ersatz, denn Bruchteile von Kilometern gibt es am Tacho nicht. */
export function toKm(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/* ── Datum ───────────────────────────────────────────────────
   Gerechnet wird ausschließlich mit ISO-Tagen (JJJJ-MM-TT). Ein Tag ist
   für dieses Buch ein Kalendertag, keine Uhrzeit — deshalb wird beim
   Umwandeln immer 12:00 Uhr angenommen. Sonst schiebt die Zeitzone einen
   Eintrag über Mitternacht in den Vortag. */

const langesDatum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
const kurzesDatum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const wochentag   = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const monatJahr   = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });

export const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const alsDate = (iso) => new Date(`${iso}T12:00:00`);

export function formatDatum(iso, { kurz = false, mitTag = false } = {}) {
  if (!iso) return '';
  const date = alsDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = (kurz ? kurzesDatum : langesDatum).format(date);
  return mitTag ? `${wochentag.format(date)}, ${text}` : text;
}

export function formatMonat(jahr, monat) {
  return monatJahr.format(new Date(jahr, monat, 1, 12));
}

export const heuteISO = () => isoVon(new Date());

/** Date → "JJJJ-MM-TT" in Ortszeit (toISOString rechnet nach UTC um). */
export function isoVon(date) {
  const jahr  = date.getFullYear();
  const monat = String(date.getMonth() + 1).padStart(2, '0');
  const tag   = String(date.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

/** Tage zwischen zwei ISO-Tagen (b − a). */
export function tageZwischen(a, b) {
  const eins = alsDate(a).getTime();
  const zwei = alsDate(b).getTime();
  if (Number.isNaN(eins) || Number.isNaN(zwei)) return 0;
  return Math.round((zwei - eins) / 86400000);
}

export function plusTage(iso, tage) {
  const date = alsDate(iso);
  date.setDate(date.getDate() + tage);
  return isoVon(date);
}

/** Ist der Text ein gültiger ISO-Tag? Schützt Import und Eingabe. */
export function istISO(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = alsDate(value);
  return !Number.isNaN(date.getTime()) && isoVon(date) === value;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const trimOr = (value, fallback) => (value && value.trim() ? value.trim() : fallback);

/** "3 Einträge" / "1 Eintrag" — spart überall den Ternär. */
export const plural = (anzahl, eins, viele) => `${km(anzahl)} ${anzahl === 1 ? eins : viele}`;
