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

  return {
    store:   storeLabel(bill),
    date,
    weekday: weekday(date),
    dateLabel: formatDate(date),
    from:    trimOr(settings.fromName, ''),
    to:      trimOr(settings.toName, ''),
    payTo:   trimOr(settings.payTo, ''),
    showMine,
    groups:  groupByCategory(visible),
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
  node.append(el('h2', { class: 'p-title', text: `Einkauf bei ${summary.store}` }));
  node.append(el('p', {
    class: 'p-sub',
    text: [
      [summary.weekday, summary.dateLabel].filter(Boolean).join(', '),
      `${summary.countShown} ${positionWord(summary.countShown)}`,
    ].join(' · '),
  }));

  node.append(el('div', { class: 'p-hr' }));

  if (!summary.groups.length) {
    node.append(el('p', { class: 'p-sub', text: 'Keine Positionen zum Abrechnen.' }));
  }

  for (const group of summary.groups) {
    node.append(el('div', { class: 'p-cat', text: group.label }));
    for (const item of group.items) {
      const quantity = quantityLabel(item.quantity, item.unit);
      node.append(el('div', { class: `p-row${item.mine ? ' p-mine' : ''}` },
        el('span', { class: 'p-name' }, item.name, quantity ? el('span', { class: 'p-qty', text: `  ${quantity}` }) : null),
        el('span', { class: 'p-amt', text: euro(item.price) }),
      ));
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
  lines.push(`Einkauf bei ${summary.store} — ${formatDate(summary.date, { short: true })}`);
  lines.push('');

  for (const group of summary.groups) {
    lines.push(group.label.toUpperCase());
    for (const item of group.items) {
      const quantity = quantityLabel(item.quantity, item.unit);
      const mark = item.mine ? ' (meins)' : '';
      lines.push(`• ${item.name}${quantity ? ` (${quantity})` : ''}${mark} — ${euro(item.price)}`);
    }
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
