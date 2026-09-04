/* Erzeugt die App-Icons ohne externe Abhängigkeiten.
   Aufruf:  node bordbuch/tools/make-icons.mjs

   Motiv: ein Blatt aus dem Bordbuch. Heller Hemd-Block auf Nacht, eine
   Messing-Haarlinie oben, darunter drei Walnuss-Zeilen — dieselben vier
   Rollen wie im Design-System (Tuch, Hemd, Leder, Details). Kein Symbol,
   kein Verlauf, kein Schatten.

   Die Farben sind hier als Hexwerte hinterlegt, weil ein PNG-Generator
   keine CSS-Variablen lesen kann; sie stammen unverändert aus
   design/tokens.css. Bei einer Token-Änderung hier nachziehen. */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUSGABE = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

const NACHT   = [0x0e, 0x0f, 0x11];   // --ground
const HEMD    = [0xf5, 0xf0, 0xe6];   // --shirt
const WALNUSS = [0x6b, 0x4a, 0x2f];   // --brand
const MESSING = [0xd4, 0xac, 0x52];   // --brass-line
const SS      = 3;                    // Überabtastung für weiche Kanten

const klemme = (wert, min, max) => Math.min(max, Math.max(min, wert));

function inRundemRechteck(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = klemme(x, x0 + radius, x1 - radius);
  const cy = klemme(y, y0 + radius, y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9;
}

const inBalken = (x, y, x0, x1, mitte, dicke) =>
  x >= x0 && x <= x1 && Math.abs(y - mitte) <= dicke / 2;

/* Die drei Zeilen werden nach unten kürzer — so liest sich das Blatt als
   Eintrag und nicht als Muster. */
const ZEILEN = [
  { y: 0.455, x0: 0.315, x1: 0.700 },
  { y: 0.575, x0: 0.315, x1: 0.640 },
  { y: 0.695, x0: 0.315, x1: 0.560 },
];

function farbeAn(x, y, { rund, einzug }) {
  if (rund && !inRundemRechteck(x, y, 0, 0, 1, 1, 0.225)) return null;

  const spanne = 1 - einzug * 2;
  const px = (x - einzug) / spanne;
  const py = (y - einzug) / spanne;
  if (px < 0 || px > 1 || py < 0 || py > 1) return NACHT;

  // Das Blatt
  if (!inRundemRechteck(px, py, 0.215, 0.130, 0.785, 0.870, 0.02)) return NACHT;

  // Messing-Haarlinie: die einzige Stelle, an der Messing vorkommt.
  if (inBalken(px, py, 0.315, 0.700, 0.290, 0.026)) return MESSING;

  for (const zeile of ZEILEN) {
    if (inBalken(px, py, zeile.x0, zeile.x1, zeile.y, 0.042)) return WALNUSS;
  }

  return HEMD;
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
      const proben = SS * SS;
      const stelle = (py * groesse + px) * 4;
      if (a > 0) {
        const abdeckung = a / 255;
        punkte[stelle]     = Math.round(r / abdeckung);
        punkte[stelle + 1] = Math.round(g / abdeckung);
        punkte[stelle + 2] = Math.round(b / abdeckung);
      }
      punkte[stelle + 3] = Math.round(a / proben);
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
    roh[y * (zeilenbreite + 1)] = 0;   // Filter: keiner
    punkte.copy(roh, y * (zeilenbreite + 1) + 1, y * zeilenbreite, (y + 1) * zeilenbreite);
  }

  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(groesse, 0);
  kopf.writeUInt32BE(groesse, 4);
  kopf[8] = 8;    // Bittiefe
  kopf[9] = 6;    // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf),
    block('IDAT', deflateSync(roh, { level: 9 })),
    block('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(AUSGABE, { recursive: true });

const ZIELE = [
  ['icon-192.png',          192, { rund: true,  einzug: 0.15 }],
  ['icon-512.png',          512, { rund: true,  einzug: 0.15 }],
  ['icon-maskable-512.png', 512, { rund: false, einzug: 0.24 }],
  ['apple-touch-icon.png',  180, { rund: false, einzug: 0.15 }],
];

for (const [name, groesse, optionen] of ZIELE) {
  writeFileSync(join(AUSGABE, name), alsPNG(groesse, raster(groesse, optionen)));
  console.log(`${name}  ${groesse}×${groesse}`);
}
