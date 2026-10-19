/* Erzeugt die App-Icons ohne externe Abhängigkeiten.
   Aufruf:  node sprungseil/tools/make-icons.mjs

   Motiv: der Moment, in dem das Seil den Boden streift. Ein Bogen in
   der Hauptfarbe, der eine Haarlinie berührt, zwei Griffe in der hellen
   Schrift des Systems. Kein Mensch, kein Verlauf, kein Schatten — wie
   das Blatt im Bordbuch-Icon.

   Die Farben stehen hier als Zahlen, weil ein PNG-Generator keine
   CSS-Variablen lesen kann; sie stammen unverändert aus design/moch.css
   (dunkel · amber). Bei einer Token-Änderung hier nachziehen.

   Der PNG-Kodierer ist derselbe wie in bordbuch/tools/make-icons.mjs. */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUSGABE = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

const GRUND  = [0x0d, 0x18, 0x24];   // --ground       (eine Nuance unter #0F1A26, wie im Bordbuch)
const SEIL   = [0xd9, 0x8a, 0x2b];   // --accent       (Amber, die Fläche der Hauptfarbe)
const GRIFF  = [0xff, 0xfd, 0xf7];   // --text         (das Weiß des Systems)
const BODEN  = [0x3a, 0x46, 0x54];   // --line-strong  (= --brass bei Amber)
const SS     = 4;                    // Überabtastung für weiche Kanten

function inRundemRechteck(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9;
}

/* Abstand eines Punkts zur Ellipse, angenähert über den Gradienten —
   genau genug für eine Linie von 5 % Bildbreite. */
function abstandZurEllipse(x, y, cx, cy, rx, ry) {
  const dx = x - cx;
  const dy = y - cy;
  const f = (dx / rx) ** 2 + (dy / ry) ** 2 - 1;
  const gx = (2 * dx) / rx ** 2;
  const gy = (2 * dy) / ry ** 2;
  return Math.abs(f) / Math.max(1e-6, Math.hypot(gx, gy));
}

const BOGEN = { cx: 0.5, cy: 0.3, rx: 0.27, ry: 0.5, dicke: 0.046 };
const BODEN_Y = BOGEN.cy + BOGEN.ry + BOGEN.dicke / 2 + 0.014;

function farbeAn(x, y, { rund, einzug }) {
  if (rund && !inRundemRechteck(x, y, 0, 0, 1, 1, 0.225)) return null;

  const spanne = 1 - einzug * 2;
  const px = (x - einzug) / spanne;
  const py = (y - einzug) / spanne;
  if (px < -0.02 || px > 1.02 || py < -0.02 || py > 1.02) return GRUND;

  // Der Boden: eine Haarlinie, die das Seil gerade streift.
  if (px >= 0.1 && px <= 0.9 && Math.abs(py - BODEN_Y) <= 0.011) return BODEN;

  // Die Griffe: gerade Stücke über den Enden des Bogens, in der Hand.
  for (const gx of [BOGEN.cx - BOGEN.rx, BOGEN.cx + BOGEN.rx]) {
    if (inRundemRechteck(px, py, gx - 0.036, BOGEN.cy - 0.2, gx + 0.036, BOGEN.cy + 0.01, 0.03)) return GRIFF;
  }

  // Das Seil: die untere Hälfte der Ellipse.
  if (py >= BOGEN.cy && abstandZurEllipse(px, py, BOGEN.cx, BOGEN.cy, BOGEN.rx, BOGEN.ry) <= BOGEN.dicke / 2) return SEIL;

  return GRUND;
}

function raster(groesse, optionen) {
  const punkte = Buffer.alloc(groesse * groesse * 4);
  for (let py = 0; py < groesse; py += 1) {
    for (let px = 0; px < groesse; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const farbe = farbeAn((px + (sx + 0.5) / SS) / groesse, (py + (sy + 0.5) / SS) / groesse, optionen);
          if (farbe) { r += farbe[0]; g += farbe[1]; b += farbe[2]; a += 255; }
        }
      }
      const stelle = (py * groesse + px) * 4;
      if (a > 0) {
        const abdeckung = a / 255;
        punkte[stelle] = Math.round(r / abdeckung);
        punkte[stelle + 1] = Math.round(g / abdeckung);
        punkte[stelle + 2] = Math.round(b / abdeckung);
      }
      punkte[stelle + 3] = Math.round(a / (SS * SS));
    }
  }
  return punkte;
}

/* ── Minimaler PNG-Kodierer ──────────────────────────────── */

const CRC_TABELLE = (() => {
  const tabelle = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelle[n] = c;
  }
  return tabelle;
})();

function crc32(puffer) {
  let c = 0xffffffff;
  for (const byte of puffer) c = CRC_TABELLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function block(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const koerper = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(koerper));
  return Buffer.concat([laenge, koerper, pruef]);
}

function alsPNG(groesse, punkte) {
  const zeilenbreite = groesse * 4;
  const roh = Buffer.alloc((zeilenbreite + 1) * groesse);
  for (let y = 0; y < groesse; y += 1) {
    roh[y * (zeilenbreite + 1)] = 0;
    punkte.copy(roh, y * (zeilenbreite + 1) + 1, y * zeilenbreite, (y + 1) * zeilenbreite);
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(groesse, 0);
  kopf.writeUInt32BE(groesse, 4);
  kopf[8] = 8;
  kopf[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf),
    block('IDAT', deflateSync(roh, { level: 9 })),
    block('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(AUSGABE, { recursive: true });

const ZIELE = [
  ['icon-192.png',          192, { rund: true,  einzug: 0.13 }],
  ['icon-512.png',          512, { rund: true,  einzug: 0.13 }],
  ['icon-maskable-512.png', 512, { rund: false, einzug: 0.22 }],
  ['apple-touch-icon.png',  180, { rund: false, einzug: 0.13 }],
];

for (const [name, groesse, optionen] of ZIELE) {
  writeFileSync(join(AUSGABE, name), alsPNG(groesse, raster(groesse, optionen)));
  console.log(`${name}  ${groesse}×${groesse}`);
}
