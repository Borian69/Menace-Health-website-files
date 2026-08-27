/* Kleine Helfer: DOM, Geld, Datum. Beträge werden intern immer in Cent
   (ganze Zahlen) gerechnet — damit gibt es keine Rundungsfehler. */

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

const eurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const numFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1999 → "19,99 €" */
export const euro = (cents) => eurFormat.format((cents || 0) / 100);

/** 1999 → "19,99" (ohne Währungszeichen, z. B. für Canvas-Layouts) */
export const euroPlain = (cents) => numFormat.format((cents || 0) / 100);

/** Beliebige Eingabe ("2,49", "2.49", 2.49) → Cent. */
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

/** Menge als lesbarer Text: 1 → "", 0.732 kg → "0,732 kg", 3 → "3 ×" */
export function quantityLabel(quantity, unit) {
  if (!quantity || quantity === 1) return unit && unit !== 'Stk' ? `1 ${unit}` : '';
  const rounded = Math.round(quantity * 1000) / 1000;
  const text = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(rounded);
  return unit && unit !== 'Stk' ? `${text} ${unit}` : `${text} ×`;
}

export function parseQuantity(value) {
  const parsed = Number.parseFloat(String(value).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

export function formatDate(iso, { short = false } = {}) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return (short ? shortDateFormat : dateFormat).format(date);
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Grüßt den Nutzer nur, wenn wirklich ein Name gesetzt ist. */
export const trimOr = (value, fallback) => (value && value.trim() ? value.trim() : fallback);
