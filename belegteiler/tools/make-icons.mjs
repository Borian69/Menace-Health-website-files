/* Erzeugt die App-Icons ohne externe Abhängigkeiten.
   Aufruf:  node tools/make-icons.mjs

   Gezeichnet wird ein Kassenbon mit gezacktem unteren Rand und einem
   grünen Haken — dieselbe Bildsprache wie in der App. Kantenglättung
   entsteht durch dreifaches Überabtasten. */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

const BG      = [0x0e, 0x12, 0x11];
const PAPER   = [0xfb, 0xfa, 0xf6];
const RULE    = [0xb8, 0xc2, 0xbd];
const GREEN   = [0x0b, 0xbe, 0x6e];
const SS      = 3;   // Überabtastung

/* ── Geometrie-Helfer (alles in Einheitskoordinaten 0…1) ── */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function insideRoundRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = clamp(x, x0 + radius, x1 - radius);
  const cy = clamp(y, y0 + radius, y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9;
}

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((x - ax) * dx + (y - ay) * dy) / lengthSquared, 0, 1);
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Kassenbon: oben abgerundet, unten gezackt. */
function insideReceipt(x, y, box) {
  const { x0, y0, x1, y1 } = box;
  if (x < x0 || x > x1) return false;

  const teeth = 5;
  const amplitude = (x1 - x0) * 0.055;
  const period = (x1 - x0) / teeth;
  const phase = ((x - x0) % period) / period;          // 0…1 je Zacke
  const bottom = y1 - amplitude * Math.abs(1 - 2 * phase);

  if (y > bottom) return false;
  return insideRoundRect(x, y, x0, y0, x1, y1, (x1 - x0) * 0.09);
}

/** Farbe eines Punktes — oder null für „durchsichtig lassen“. */
function sample(x, y, { rounded, inset }) {
  // Hintergrund
  const background = rounded
    ? insideRoundRect(x, y, 0, 0, 1, 1, 0.225)
    : true;
  if (!background) return null;

  const span = 1 - inset * 2;
  const px = (x - inset) / span;
  const py = (y - inset) / span;
  if (px < 0 || px > 1 || py < 0 || py > 1) return BG;

  const box = { x0: 0.20, y0: 0.06, x1: 0.78, y1: 0.86 };

  // Grüner Haken, überlappt den Bon unten rechts
  const stroke = 0.075;
  const check = Math.min(
    distanceToSegment(px, py, 0.55, 0.70, 0.68, 0.83),
    distanceToSegment(px, py, 0.68, 0.83, 0.95, 0.44),
  );
  const halo = check <= stroke / 2 + 0.038;

  if (check <= stroke / 2) return GREEN;

  if (insideReceipt(px, py, box)) {
    if (halo) return BG;   // Freistellung, damit der Haken sich abhebt

    // Zeilen auf dem Bon
    const lines = [
      { y: 0.24, x0: 0.29, x1: 0.69 },
      { y: 0.38, x0: 0.29, x1: 0.62 },
      { y: 0.52, x0: 0.29, x1: 0.66 },
    ];
    for (const line of lines) {
      if (Math.abs(py - line.y) <= 0.030 && px >= line.x0 && px <= line.x1) return RULE;
    }
    return PAPER;
  }

  return BG;
}

/* ── Rasterung ───────────────────────────────────────────── */

function render(size, options) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const colour = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, options);
          if (colour) { r += colour[0]; g += colour[1]; b += colour[2]; a += 255; }
        }
      }
      const samples = SS * SS;
      const offset = (py * size + px) * 4;
      if (a > 0) {
        // Über den abgedeckten Anteil mitteln, Alpha aus der Abdeckung.
        const covered = a / 255;
        pixels[offset]     = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
      }
      pixels[offset + 3] = Math.round(a / samples);
    }
  }
  return pixels;
}

/* ── Minimaler PNG-Encoder ───────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePNG(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;  // Filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;    // Bittiefe
  header[9] = 6;    // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Ausgabe ─────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });

const targets = [
  ['icon-192.png',          192, { rounded: true,  inset: 0.16 }],
  ['icon-512.png',          512, { rounded: true,  inset: 0.16 }],
  ['icon-maskable-512.png', 512, { rounded: false, inset: 0.24 }],
  ['apple-touch-icon.png',  180, { rounded: false, inset: 0.16 }],
];

for (const [name, size, options] of targets) {
  writeFileSync(join(OUT, name), encodePNG(size, render(size, options)));
  console.log(`${name}  ${size}×${size}`);
}
