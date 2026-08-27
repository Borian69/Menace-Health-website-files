/* Aus einer Abrechnung wird die fertige Übersicht: einmal als Karte in
   der App, einmal als Text zum Verschicken. Das Bild dazu entsteht in
   canvas.js aus demselben Datensatz. */

import { el, euro, formatDate, quantityLabel, trimOr } from './util.js';
import { groupByCategory, totals, storeLabel, billDate } from './receipt.js';

const weekdayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });

function weekday(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : weekdayFormat.format(date);
}

/** Gemeinsame Datenbasis für Karte, Text und Bild. */
export function buildSummary(bill, settings) {
  const showMine = Boolean(settings.showMine);
  const visible = showMine ? bill.items : bill.items.filter((item) => !item.mine);
  const sums = totals(bill);
  const date = billDate(bill);

  // Liegen mehrere Bons zugrunde, wird unten aufgeschlüsselt, welcher
  // Beleg welchen Anteil ausmacht.
  const perReceipt = bill.receipts
    .map((receipt) => ({
      store: receipt.store,
      date:  receipt.date,
      time:  receipt.time || '',
      parents: bill.items
        .filter((item) => item.receiptId === receipt.id && !item.mine)
        .reduce((sum, item) => sum + item.price, 0),
      items: visible.filter((item) => item.receiptId === receipt.id),
    }))
    .filter((receipt) => receipt.items.length > 0)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  /* Bei einem Beleg ordnen Warengruppen die Liste am besten. Sobald
     mehrere im Spiel sind, ist die entscheidende Frage „was habe ich wo
     gekauft“ — dann gliedert die Rechnung nach Beleg, mit Ort und
     Uhrzeit in der Überschrift. */
  const byStore = perReceipt.length > 1;
  const sections = byStore
    ? perReceipt.map((receipt) => ({
        label: receipt.store,
        meta: [formatDate(receipt.date, { short: true }), receipt.time && `${receipt.time} Uhr`].filter(Boolean).join(' · '),
        items: receipt.items,
        sum: receipt.parents,
      }))
    : groupByCategory(visible).map((group) => ({ label: group.label, meta: '', items: group.items, sum: group.sum }));

  /* Bei einem Beleg nennt die Überschrift den Laden. Bei mehreren
     stehen die Läden ohnehin als Zwischenüberschriften — dann benennt
     sie, was das Papier ist. */
  const stores = [...new Set(perReceipt.map((receipt) => receipt.store).filter(Boolean))];
  const oneDay = new Set(perReceipt.map((receipt) => receipt.date)).size <= 1;
  const title = !byStore && stores.length === 1
    ? `Einkauf bei ${stores[0]}`
    : (oneDay ? 'Tagesabrechnung' : 'Abrechnung');

  return {
    receipts: perReceipt.length > 1 ? perReceipt : [],
    title,
    store:   storeLabel(bill),
    date,
    weekday: weekday(date),
    dateLabel: formatDate(date),
    from:    trimOr(settings.fromName, ''),
    to:      trimOr(settings.toName, ''),
    payTo:   trimOr(settings.payTo, ''),
    showMine,
    byStore,
    sections,
    parents: sums.parents,
    mine:    sums.mine,
    total:   sums.total,
    countShown: visible.length,
    countAll: sums.count,
  };
}

const positionWord = (count) => (count === 1 ? 'Position' : 'Positionen');

/* ── Karte in der App ────────────────────────────────────── */

export function renderPaper(node, summary) {
  node.replaceChildren();

  node.append(el('div', { class: 'p-eyebrow', text: summary.to ? `Einkauf für ${summary.to}` : 'Einkaufsabrechnung' }));
  node.append(el('h2', { class: 'p-title', text: summary.title }));
  node.append(el('p', {
    class: 'p-sub',
    text: [
      [summary.weekday, summary.dateLabel].filter(Boolean).join(', '),
      `${summary.countShown} ${positionWord(summary.countShown)}`,
    ].join(' · '),
  }));

  node.append(el('div', { class: 'p-hr' }));

  if (!summary.sections.length) {
    node.append(el('p', { class: 'p-sub', text: 'Keine Positionen zum Abrechnen.' }));
  }

  for (const section of summary.sections) {
    node.append(el('div', { class: `p-cat${summary.byStore ? ' p-store' : ''}` },
      el('span', { text: section.label }),
      section.meta ? el('em', { text: section.meta }) : null,
    ));
    for (const item of section.items) {
      const quantity = quantityLabel(item.quantity, item.unit);
      node.append(el('div', { class: `p-row${item.mine ? ' p-mine' : ''}` },
        el('span', { class: 'p-name' }, item.name, quantity ? el('span', { class: 'p-qty', text: `  ${quantity}` }) : null),
        el('span', { class: 'p-amt', text: euro(item.price) }),
      ));
    }
    if (summary.byStore) {
      node.append(el('div', { class: 'p-subtotal' },
        el('span', { text: 'Zwischensumme' }), el('span', { text: euro(section.sum) })));
    }
  }

  node.append(el('div', { class: 'p-hr' }));

  node.append(el('div', { class: 'p-total' },
    el('span', { class: 'p-total-label', text: summary.to ? `${summary.to} zahlt` : 'Bitte überweisen' }),
    el('span', { class: 'p-total-amt', text: euro(summary.parents) }),
  ));

  if (summary.mine !== 0) {
    node.append(el('div', { class: 'p-minor' },
      el('span', { text: 'Einkauf gesamt' }), el('span', { text: euro(summary.total) })));
    node.append(el('div', { class: 'p-minor' },
      el('span', { text: 'Davon meins' }), el('span', { text: `− ${euro(Math.abs(summary.mine))}` })));
  }

  if (summary.payTo) {
    node.append(el('div', { class: 'p-pay' }, el('b', { text: 'Überweisen an' }), summary.payTo));
  }

  node.append(el('div', {
    class: 'p-foot',
    text: summary.from ? `Zusammengestellt von ${summary.from}` : 'Belegteiler',
  }));
}

/* ── Text zum Verschicken ────────────────────────────────── */

export function buildText(summary) {
  const lines = [];
  lines.push(`${summary.title} — ${formatDate(summary.date, { short: true })}`);
  lines.push('');

  for (const section of summary.sections) {
    lines.push(section.meta ? `${section.label.toUpperCase()} — ${section.meta}` : section.label.toUpperCase());
    for (const item of section.items) {
      const quantity = quantityLabel(item.quantity, item.unit);
      const mark = item.mine ? ' (meins)' : '';
      lines.push(`• ${item.name}${quantity ? ` (${quantity})` : ''}${mark} — ${euro(item.price)}`);
    }
    if (summary.byStore) lines.push(`  Zwischensumme: ${euro(section.sum)}`);
    lines.push('');
  }

  lines.push(summary.to ? `${summary.to} zahlt: ${euro(summary.parents)}` : `Bitte überweisen: ${euro(summary.parents)}`);
  if (summary.mine !== 0) {
    lines.push(`(Einkauf gesamt ${euro(summary.total)}, davon meins ${euro(Math.abs(summary.mine))})`);
  }
  if (summary.payTo) {
    lines.push('');
    lines.push(`Überweisen an: ${summary.payTo}`);
  }
  if (summary.from) {
    lines.push('');
    lines.push(`— ${summary.from}`);
  }
  return lines.join('\n');
}

export function fileName(summary) {
  const store = summary.store.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase();
  return `einkauf-${store || 'beleg'}-${summary.date}.png`;
}
