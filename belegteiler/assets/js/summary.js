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

/* Der Betreff für die Überweisung.

   Er soll ohne Nachfrage erklären, wofür das Geld ist: welche Märkte,
   welcher Tag. Die Länge ist nicht beliebig — im SEPA-Verwendungszweck
   sind 140 Zeichen Platz, und viele Banking-Apps schneiden gnadenlos
   ab. Passt die Aufzählung nicht, wird sie gekürzt und die Zahl der
   übrigen Läden angehängt, statt mitten im Namen abzubrechen. */
const ZWECK_MAX = 140;

function verwendungszweck(perReceipt, stores, date) {
  const tage = [...new Set(perReceipt.map((receipt) => receipt.date).filter(Boolean))].sort();
  const wann = tage.length > 1
    ? `${formatDate(tage[0], { short: true })}–${formatDate(tage[tage.length - 1], { short: true })}`
    : formatDate(tage[0] || date, { short: true });

  const bauen = (namen, rest) =>
    `Einkauf ${wann}: ${namen.join(', ')}${rest ? ` +${rest} weitere` : ''}`;

  let namen = [...stores];
  let text = bauen(namen, 0);
  while (text.length > ZWECK_MAX && namen.length > 1) {
    namen = namen.slice(0, -1);
    text = bauen(namen, stores.length - namen.length);
  }
  return text.slice(0, ZWECK_MAX);
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
  const tage = [...new Set(perReceipt.map((receipt) => receipt.date).filter(Boolean))].sort();
  const mehrereTage = tage.length > 1;

  /* Zieht sich eine Abrechnung über mehrere Tage, ist der Tag die
     gröbere Ordnung — dann wird er als eigene Zwischenüberschrift
     gesetzt, sobald er wechselt. Sonst stünden Belege von Mittwoch und
     Freitag ununterscheidbar untereinander. */
  const byStore = perReceipt.length > 1;
  let letzterTag = '';
  const sections = byStore
    ? perReceipt.map((receipt) => {
        const tagLabel = mehrereTage && receipt.date !== letzterTag
          ? `${weekday(receipt.date)}, ${formatDate(receipt.date)}`
          : '';
        letzterTag = receipt.date;
        return {
          label: receipt.store,
          meta: [formatDate(receipt.date, { short: true }), receipt.time && `${receipt.time} Uhr`].filter(Boolean).join(' · '),
          tagLabel,
          items: receipt.items,
          sum: receipt.parents,
        };
      })
    : groupByCategory(visible).map((group) => ({ label: group.label, meta: '', tagLabel: '', items: group.items, sum: group.sum }));

  /* Bei einem Beleg nennt die Überschrift den Laden. Bei mehreren
     stehen die Läden ohnehin als Zwischenüberschriften — dann benennt
     sie, was das Papier ist. */
  const stores = [...new Set(perReceipt.map((receipt) => receipt.store).filter(Boolean))];
  const title = !byStore && stores.length === 1
    ? `Einkauf bei ${stores[0]}`
    : (mehrereTage ? 'Abrechnung' : 'Tagesabrechnung');

  /* Über mehrere Tage steht der Zeitraum in der Unterzeile, nicht nur
     der erste Tag. Sonst stand dort der 27., obwohl auch Belege vom 29.
     dabei waren. */
  const zeitraum = mehrereTage
    ? `${formatDate(tage[0])} – ${formatDate(tage[tage.length - 1])}`
    : formatDate(tage[0] || date);

  return {
    receipts: perReceipt.length > 1 ? perReceipt : [],
    title,
    verwendungszweck: verwendungszweck(perReceipt, stores, date),
    store:   storeLabel(bill),
    date,
    // Über mehrere Tage trägt der Zeitraum die Angabe, nicht ein Wochentag.
    weekday: mehrereTage ? '' : weekday(date),
    dateLabel: zeitraum,
    mehrereTage,
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
    if (section.tagLabel) node.append(el('div', { class: 'p-day', text: section.tagLabel }));
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

  /* Was der Einkauf insgesamt kostete und was davon meins war, geht
     die Empfänger nichts an — sie sollen sehen, was sie zahlen, sonst
     nichts. Nur wer die eigenen Positionen ausdrücklich mitschickt,
     bekommt die Aufschlüsselung dazu. */
  if (summary.showMine && summary.mine !== 0) {
    node.append(el('div', { class: 'p-minor' },
      el('span', { text: 'Einkauf gesamt' }), el('span', { text: euro(summary.total) })));
    node.append(el('div', { class: 'p-minor' },
      el('span', { text: 'Davon meins' }), el('span', { text: `− ${euro(Math.abs(summary.mine))}` })));
  }

  if (summary.payTo) {
    node.append(el('div', { class: 'p-pay' }, el('b', { text: 'Überweisen an' }), summary.payTo));
  }

  // Der Betreff gehört mit aufs Papier — sonst muss ihn jemand abtippen.
  node.append(el('div', { class: 'p-zweck' },
    el('b', { text: 'Verwendungszweck' }), summary.verwendungszweck));

  node.append(el('div', {
    class: 'p-foot',
    text: summary.from ? `Zusammengestellt von ${summary.from}` : 'Belegteiler',
  }));
}

/* ── Text zum Verschicken ────────────────────────────────── */

export function buildText(summary) {
  const lines = [];
  lines.push(`${summary.title} — ${summary.dateLabel}`);
  lines.push('');

  for (const section of summary.sections) {
    if (section.tagLabel) { lines.push(section.tagLabel.toUpperCase()); lines.push(''); }
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
  // Gesamtsumme und Eigenanteil bleiben draussen — siehe renderPaper.
  if (summary.showMine && summary.mine !== 0) {
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
