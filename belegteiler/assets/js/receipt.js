/* Datenmodell einer Abrechnung.

   Eine Abrechnung kann mehrere Belege enthalten (langer Bon in zwei
   Aufnahmen, oder zwei Läden an einem Tag). Alle Beträge liegen als
   ganze Cent vor. */

import { normaliseCategory, categoryRank, category } from './categories.js';
import { toCents, uid, todayISO } from './util.js';

export function createBill() {
  return { id: uid(), createdAt: Date.now(), receipts: [], items: [] };
}

/** Ergebnis einer Erkennung in die Abrechnung übernehmen. */
export function addScan(bill, parsed) {
  const receipt = {
    id:    uid(),
    store: (parsed.store || '').trim() || 'Einkauf',
    date:  isValidDate(parsed.date) ? parsed.date : todayISO(),
    time:  (parsed.time || '').trim(),
    total: parsed.receipt_total === null || parsed.receipt_total === undefined
      ? null
      : toCents(parsed.receipt_total),
    notes: (parsed.notes || '').trim(),
  };
  bill.receipts.push(receipt);

  for (const raw of parsed.items || []) {
    const price = toCents(raw.total_price);
    const name = (raw.name || '').trim() || (raw.raw_text || '').trim() || 'Position';
    bill.items.push({
      id:         uid(),
      receiptId:  receipt.id,
      name,
      raw:        (raw.raw_text || '').trim(),
      quantity:   Number.isFinite(raw.quantity) && raw.quantity > 0 ? raw.quantity : 1,
      unit:       (raw.unit || 'Stk').trim() || 'Stk',
      unitPrice:  raw.unit_price === null || raw.unit_price === undefined ? null : toCents(raw.unit_price),
      price,
      category:   normaliseCategory(raw.category, name),
      uncertain:  Boolean(raw.uncertain),
      mine:       false,
    });
  }
  return receipt;
}

export function createItem(overrides = {}) {
  return {
    id: uid(),
    receiptId: null,
    name: '',
    raw: '',
    quantity: 1,
    unit: 'Stk',
    unitPrice: null,
    price: 0,
    category: 'sonstiges',
    uncertain: false,
    mine: false,
    ...overrides,
  };
}

const isValidDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function totals(bill) {
  let parents = 0;
  let mine = 0;
  for (const item of bill.items) {
    if (item.mine) mine += item.price;
    else parents += item.price;
  }
  return { parents, mine, total: parents + mine, count: bill.items.length };
}

/** Aufgedruckte Endsummen aller Belege — für den Abgleich. */
export function printedTotal(bill) {
  const known = bill.receipts.filter((receipt) => receipt.total !== null);
  if (!known.length) return null;
  return known.reduce((sum, receipt) => sum + receipt.total, 0);
}

/** Positionen nach Kategorie gruppiert, in fester Reihenfolge. */
export function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]))
    .map(([id, entries]) => ({
      id,
      label: category(id).label,
      color: category(id).color,
      items: entries,
      sum: entries.reduce((total, item) => total + item.price, 0),
    }));
}

/** Kurzbeschreibung der Läden, z. B. "REWE" oder "REWE + dm". */
export function storeLabel(bill) {
  const names = [...new Set(bill.receipts.map((receipt) => receipt.store).filter(Boolean))];
  if (!names.length) return 'Einkauf';
  if (names.length <= 2) return names.join(' + ');
  return `${names[0]} + ${names.length - 1} weitere`;
}

export function billDate(bill) {
  const dates = bill.receipts.map((receipt) => receipt.date).filter(Boolean).sort();
  return dates[0] || todayISO();
}
