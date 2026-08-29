/* Zeichnet die Übersicht als Bild — das ist es, was am Ende bei den
   Eltern ankommt. Layout und Inhalt entsprechen der Karte in der App.

   Gearbeitet wird in zwei Durchgängen: einmal nur messen, um die
   Bildhöhe zu bestimmen, danach richtig zeichnen. */

import { euro, formatDate, quantityLabel } from './util.js';

const W = 1080;
const PAD = 76;
const CONTENT = W - PAD * 2;

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
const SANS  = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const INK        = '#14181A';
const MUTED      = '#75736A';
const FAINT      = '#A39B84';
const LINE       = '#E4E0D2';
const GOLD       = '#8A6614';
const GOLD_DEEP  = '#7A5A12';
const PAPER      = '#FBFAF6';

function roundRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); return; }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/* Gesperrte Versalien-Zeilen. Moderne Browser können das nativ und
   behalten dabei das Kerning; sonst wird Zeichen für Zeichen gesetzt. */
const NATIVE_TRACKING = typeof CanvasRenderingContext2D !== 'undefined'
  && 'letterSpacing' in CanvasRenderingContext2D.prototype;

function tracked(ctx, text, x, y, spacing) {
  if (NATIVE_TRACKING) {
    const previous = ctx.letterSpacing;
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = previous;
    return;
  }
  // Zeichenweise setzen — dabei muss textAlign selbst nachgebildet werden.
  const align = ctx.textAlign;
  let cursor = x;
  if (align === 'center')     cursor -= trackedWidth(ctx, text, spacing) / 2;
  else if (align === 'right') cursor -= trackedWidth(ctx, text, spacing);
  ctx.textAlign = 'left';
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
  ctx.textAlign = align;
}

function trackedWidth(ctx, text, spacing) {
  if (NATIVE_TRACKING) {
    const previous = ctx.letterSpacing;
    ctx.letterSpacing = `${spacing}px`;
    const width = ctx.measureText(text).width;
    ctx.letterSpacing = previous;
    return width;
  }
  let width = 0;
  for (const char of text) width += ctx.measureText(char).width + spacing;
  return Math.max(0, width - spacing);
}

function ellipsise(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trim()}…`;
}

/**
 * Malt die Übersicht. Mit `dry: true` wird nichts gezeichnet, sondern
 * nur die benötigte Höhe ermittelt.
 */
function paint(ctx, summary, dry) {
  const draw = (fn) => { if (!dry) fn(); };
  let y = 0;

  // Akzentleiste am oberen Rand
  draw(() => {
    const gradient = ctx.createLinearGradient(0, 0, W, 0);
    gradient.addColorStop(0, '#E7C05A');
    gradient.addColorStop(1, '#B0821F');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, 12);
  });
  y = 12 + 62;

  // Kopfzeile
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const eyebrow = (summary.to ? `Einkauf für ${summary.to}` : 'Einkaufsabrechnung').toUpperCase();
  ctx.font = `700 21px ${SANS}`;
  draw(() => { ctx.fillStyle = GOLD; tracked(ctx, eyebrow, PAD, y, 4.4); });
  y += 40;

  ctx.font = `54px ${SERIF}`;
  draw(() => { ctx.fillStyle = INK; ctx.fillText(ellipsise(ctx, summary.title, CONTENT), PAD, y + 42); });
  y += 42 + 26;

  const subtitle = [
    [summary.weekday, summary.dateLabel].filter(Boolean).join(', '),
    summary.byStore ? `${summary.sections.length} Belege` : '',
    `${summary.countShown} ${summary.countShown === 1 ? 'Position' : 'Positionen'}`,
  ].filter(Boolean).join('  ·  ');
  ctx.font = `26px ${SANS}`;
  draw(() => { ctx.fillStyle = MUTED; ctx.fillText(subtitle, PAD, y + 20); });
  y += 20 + 44;

  draw(() => { ctx.fillStyle = LINE; ctx.fillRect(PAD, y, CONTENT, 1); });
  y += 42;

  // Positionen — nach Beleg oder nach Warengruppe gegliedert
  for (const [index, group] of summary.sections.entries()) {
    if (index > 0) y += summary.byStore ? 30 : 22;

    if (summary.byStore) {
      // Ladenname groß, Datum und Uhrzeit rechts daneben
      ctx.font = `600 34px ${SERIF}`;
      const headWidth = ctx.measureText(group.label).width;
      ctx.font = `21px ${SANS}`;
      const metaWidth = group.meta ? ctx.measureText(group.meta).width : 0;
      draw(() => {
        ctx.font = `600 34px ${SERIF}`;
        ctx.fillStyle = INK;
        ctx.fillText(group.label, PAD, y + 26);
        if (group.meta) {
          ctx.font = `21px ${SANS}`;
          ctx.fillStyle = '#93907F';
          ctx.textAlign = 'right';
          ctx.fillText(group.meta, W - PAD, y + 26);
          ctx.textAlign = 'left';
        }
        ctx.fillStyle = LINE;
        const from = PAD + headWidth + 20;
        const to = W - PAD - metaWidth - (metaWidth ? 20 : 0);
        if (to > from) ctx.fillRect(from, y + 18, to - from, 1);
      });
      y += 26 + 22;
    } else {
      ctx.font = `700 19px ${SANS}`;
      const headline = group.label.toUpperCase();
      const headWidth = trackedWidth(ctx, headline, 3.6);
      draw(() => {
        ctx.fillStyle = FAINT;
        tracked(ctx, headline, PAD, y + 14, 3.6);
        ctx.fillRect(PAD + headWidth + 18, y + 8, CONTENT - headWidth - 18, 1);
      });
      y += 14 + 24;
    }

    for (const item of group.items) {
      const amount = euro(item.price);
      ctx.font = `600 30px ${SERIF}`;
      const amountWidth = ctx.measureText(amount).width;

      const quantity = quantityLabel(item.quantity, item.unit);
      ctx.font = `23px ${SANS}`;
      const quantityWidth = quantity ? ctx.measureText(`  ${quantity}`).width : 0;

      ctx.font = `30px ${SERIF}`;
      const nameWidth = CONTENT - amountWidth - quantityWidth - 40;
      const name = ellipsise(ctx, item.name, Math.max(60, nameWidth));

      draw(() => {
        ctx.fillStyle = item.mine ? '#ADA898' : INK;
        ctx.font = `30px ${SERIF}`;
        ctx.fillText(name, PAD, y + 24);
        const drawnName = ctx.measureText(name).width;

        if (quantity) {
          ctx.font = `23px ${SANS}`;
          ctx.fillStyle = item.mine ? '#BDB8A8' : FAINT;
          ctx.fillText(`  ${quantity}`, PAD + drawnName, y + 24);
        }

        ctx.fillStyle = item.mine ? '#ADA898' : INK;
        ctx.textAlign = 'right';
        ctx.fillText(amount, W - PAD, y + 24);
        if (item.mine) {
          const strikeY = y + 15;
          ctx.fillRect(W - PAD - amountWidth, strikeY, amountWidth, 1.5);
        }
        ctx.textAlign = 'left';
      });
      y += 46;
    }

    // Zwischensumme je Beleg
    if (summary.byStore) {
      y += 8;
      draw(() => {
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, y + 0.5);
        ctx.lineTo(W - PAD, y + 0.5);
        ctx.stroke();
        ctx.restore();

        ctx.font = `21px ${SANS}`;
        ctx.fillStyle = '#93907F';
        ctx.fillText('Zwischensumme', PAD + 2, y + 26);
        ctx.textAlign = 'right';
        ctx.fillText(euro(group.sum), W - PAD - 2, y + 26);
        ctx.textAlign = 'left';
      });
      y += 34;
    }
  }

  y += 30;
  draw(() => { ctx.fillStyle = LINE; ctx.fillRect(PAD, y, CONTENT, 1); });
  y += 40;

  // Betrag — Beschriftung links, Summe rechts, beides auf einer Achse
  const boxHeight = 124;
  draw(() => {
    roundRect(ctx, PAD, y, CONTENT, boxHeight, 16);
    ctx.fillStyle = '#F8F3E6';
    ctx.fill();
    ctx.strokeStyle = '#EBE1C8';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `700 21px ${SANS}`;
    ctx.fillStyle = '#6B6250';
    tracked(ctx, (summary.to ? `${summary.to} zahlt` : 'Bitte überweisen').toUpperCase(), PAD + 32, y + 70, 2.6);

    ctx.font = `700 60px ${SERIF}`;
    ctx.fillStyle = GOLD_DEEP;
    ctx.textAlign = 'right';
    ctx.fillText(euro(summary.parents), W - PAD - 32, y + 84);
    ctx.textAlign = 'left';
  });
  y += boxHeight + 26;

  if (summary.mine !== 0) {
    for (const [label, value] of [
      ['Einkauf gesamt', euro(summary.total)],
      ['Davon meins', `− ${euro(Math.abs(summary.mine))}`],
    ]) {
      draw(() => {
        ctx.font = `24px ${SANS}`;
        ctx.fillStyle = MUTED;
        ctx.fillText(label, PAD + 4, y + 18);
        ctx.textAlign = 'right';
        ctx.fillText(value, W - PAD - 4, y + 18);
        ctx.textAlign = 'left';
      });
      y += 38;
    }
    y += 8;
  }

  if (summary.payTo) {
    ctx.font = `26px ${SANS}`;
    const payLines = wrap(ctx, summary.payTo, CONTENT - 60);
    const payHeight = 62 + payLines.length * 34 + 26;
    draw(() => {
      ctx.save();
      ctx.setLineDash([7, 6]);
      roundRect(ctx, PAD, y, CONTENT, payHeight, 14);
      ctx.strokeStyle = '#D6CBAE';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      ctx.font = `700 19px ${SANS}`;
      ctx.fillStyle = FAINT;
      tracked(ctx, 'ÜBERWEISEN AN', PAD + 30, y + 38, 3.4);

      ctx.font = `26px ${SANS}`;
      ctx.fillStyle = INK;
      payLines.forEach((line, index) => ctx.fillText(line, PAD + 30, y + 74 + index * 34));
    });
    y += payHeight + 26;
  }

  /* Der Verwendungszweck steht mit auf dem Bild. Wer es in WhatsApp
     bekommt, hat den Betreff sonst nirgends und tippt ihn ab. */
  if (summary.verwendungszweck) {
    ctx.font = `24px ${SANS}`;
    const zweckLines = wrap(ctx, summary.verwendungszweck, CONTENT - 60);
    const zweckHeight = 58 + zweckLines.length * 32 + 22;
    draw(() => {
      ctx.font = `700 19px ${SANS}`;
      ctx.fillStyle = FAINT;
      tracked(ctx, 'VERWENDUNGSZWECK', PAD + 30, y + 30, 3.4);

      ctx.font = `24px ${SANS}`;
      ctx.fillStyle = INK;
      zweckLines.forEach((line, index) => ctx.fillText(line, PAD + 30, y + 66 + index * 32));
    });
    y += zweckHeight;
  }

  y += 14;
  draw(() => {
    ctx.font = `20px ${SANS}`;
    ctx.fillStyle = '#B3AC98';
    ctx.textAlign = 'center';
    const footer = (summary.from ? `Zusammengestellt von ${summary.from}` : 'Belegteiler').toUpperCase();
    tracked(ctx, footer, W / 2, y + 16, 3);
    ctx.textAlign = 'left';
  });
  y += 16 + 54;

  return Math.ceil(y);
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

/** @returns {Promise<Blob>} PNG der Übersicht. */
export function renderSummaryImage(summary) {
  const measure = document.createElement('canvas').getContext('2d');
  const height = paint(measure, summary, true);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);
  paint(ctx, summary, false);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild konnte nicht erzeugt werden.'))),
      'image/png',
    );
  });
}
