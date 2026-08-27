/* Zeichnet die Übersicht als Bild — das ist es, was am Ende bei den
   Eltern ankommt. Layout und Inhalt entsprechen der Karte in der App.

   Gearbeitet wird in zwei Durchgängen: einmal nur messen, um die
   Bildhöhe zu bestimmen, danach richtig zeichnen. */

import { euro, quantityLabel } from './util.js';

const W = 1080;
const PAD = 76;
const CONTENT = W - PAD * 2;

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
const SANS  = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const INK        = '#14181A';
const MUTED      = '#6E7A76';
const FAINT      = '#93A09B';
const LINE       = '#E2E0D6';
const GREEN      = '#068450';
const GREEN_DEEP = '#05663F';
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
    gradient.addColorStop(0, '#0BBE6E');
    gradient.addColorStop(1, '#05A35D');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, 12);
  });
  y = 12 + 62;

  // Kopfzeile
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const eyebrow = (summary.to ? `Einkauf für ${summary.to}` : 'Einkaufsabrechnung').toUpperCase();
  ctx.font = `700 21px ${SANS}`;
  draw(() => { ctx.fillStyle = GREEN; tracked(ctx, eyebrow, PAD, y, 4.4); });
  y += 40;

  ctx.font = `54px ${SERIF}`;
  draw(() => { ctx.fillStyle = INK; ctx.fillText(ellipsise(ctx, `Einkauf bei ${summary.store}`, CONTENT), PAD, y + 42); });
  y += 42 + 26;

  const subtitle = [
    [summary.weekday, summary.dateLabel].filter(Boolean).join(', '),
    `${summary.countShown} ${summary.countShown === 1 ? 'Position' : 'Positionen'}`,
  ].join('  ·  ');
  ctx.font = `26px ${SANS}`;
  draw(() => { ctx.fillStyle = MUTED; ctx.fillText(subtitle, PAD, y + 20); });
  y += 20 + 44;

  draw(() => { ctx.fillStyle = LINE; ctx.fillRect(PAD, y, CONTENT, 1); });
  y += 42;

  // Positionen
  for (const [index, group] of summary.groups.entries()) {
    if (index > 0) y += 22;

    ctx.font = `700 19px ${SANS}`;
    const headline = group.label.toUpperCase();
    const headWidth = trackedWidth(ctx, headline, 3.6);
    draw(() => {
      ctx.fillStyle = FAINT;
      tracked(ctx, headline, PAD, y + 14, 3.6);
      ctx.fillRect(PAD + headWidth + 18, y + 8, CONTENT - headWidth - 18, 1);
    });
    y += 14 + 24;

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
        ctx.fillStyle = item.mine ? '#A5AFAB' : INK;
        ctx.font = `30px ${SERIF}`;
        ctx.fillText(name, PAD, y + 24);
        const drawnName = ctx.measureText(name).width;

        if (quantity) {
          ctx.font = `23px ${SANS}`;
          ctx.fillStyle = item.mine ? '#B7BFBB' : FAINT;
          ctx.fillText(`  ${quantity}`, PAD + drawnName, y + 24);
        }

        ctx.fillStyle = item.mine ? '#A5AFAB' : INK;
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
  }

  y += 30;
  draw(() => { ctx.fillStyle = LINE; ctx.fillRect(PAD, y, CONTENT, 1); });
  y += 40;

  // Betrag — Beschriftung links, Summe rechts, beides auf einer Achse
  const boxHeight = 124;
  draw(() => {
    roundRect(ctx, PAD, y, CONTENT, boxHeight, 16);
    ctx.fillStyle = '#F0F4F1';
    ctx.fill();
    ctx.strokeStyle = '#DDE6E0';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `700 21px ${SANS}`;
    ctx.fillStyle = '#55635E';
    tracked(ctx, (summary.to ? `${summary.to} zahlt` : 'Bitte überweisen').toUpperCase(), PAD + 32, y + 70, 2.6);

    ctx.font = `700 60px ${SERIF}`;
    ctx.fillStyle = GREEN_DEEP;
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
      ctx.strokeStyle = '#C9D3CD';
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

  y += 14;
  draw(() => {
    ctx.font = `20px ${SANS}`;
    ctx.fillStyle = '#A9B3AF';
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
