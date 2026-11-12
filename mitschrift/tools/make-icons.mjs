/* Erzeugt die App-Icons ohne externe Abhängigkeiten.
   Aufruf:  node mitschrift/tools/make-icons.mjs

   Motiv: Ton wird Text. Links fünf Pegelstriche in der Hauptfarbe, rechts
   drei Zeilen in der hellen Schrift des Systems, darunter eine Haarlinie.
   Kein Mikrofon-Klischee, kein Verlauf, kein Schatten – wie die Icons von
   Bordbuch und Sprungseil.

   Farben aus design/moch.css (dunkel · amber), als Zahlen, weil ein
   PNG-Generator keine CSS-Variablen lesen kann. Der PNG-Kodierer ist
   derselbe wie in sprungseil/tools/make-icons.mjs. */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUSGABE = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'icons');

const GRUND  = [0x0d, 0x18, 0x24];   // --ground
const TON    = [0xd9, 0x8a, 0x2b];   // --accent (Amber)
const TEXT   = [0xff, 0xfd, 0xf7];   // --text   (das Weiß des Systems)
const LINIE  = [0x3a, 0x46, 0x54];   // --line-strong (= --brass bei Amber)
const SS     = 4;

function inRundemRechteck(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9;
}

// Pegel: Mitte bei y = 0.47, Höhen symmetrisch um die Mitte
const MITTE = 0.47;
const STRICHE = [0.16, 0.34, 0.5, 0.28, 0.12];
const STRICH_B = 0.05;
const STRICH_X0 = 0.1;
const STRICH_ABSTAND = 0.085;
// Zeilen: rechts, auf gleicher Höhe wie der Pegel
const ZEILEN = [[MITTE - 0.11, 0.9], [MITTE, 0.86], [MITTE + 0.11, 0.76]];
const ZEILE_X0 = 0.56;
const ZEILE_H = 0.045;
const BODEN_Y = 0.8;

function farbeAn(x, y, { rund, einzug }) {
  if (rund && !inRundemRechteck(x, y, 0, 0, 1, 1, 0.225)) return null;
  const spanne = 1 - einzug * 2;
  const px = (x - einzug) / spanne;
  const py = (y - einzug) / spanne;
  if (px < -0.02 || px > 1.02 || py < -0.02 || py > 1.02) return GRUND;

  if (px >= 0.1 && px <= 0.9 && Math.abs(py - BODEN_Y) <= 0.009) return LINIE;

  for (let i = 0; i < STRICHE.length; i += 1) {
    const x0 = STRICH_X0 + i * STRICH_ABSTAND;
    const h = STRICHE[i] / 2;
    if (inRundemRechteck(px, py, x0, MITTE - h, x0 + STRICH_B, MITTE + h, STRICH_B / 2)) return TON;
  }
  for (const [zy, x1] of ZEILEN) {
    if (inRundemRechteck(px, py, ZEILE_X0, zy - ZEILE_H / 2, x1, zy + ZEILE_H / 2, ZEILE_H / 2)) return TEXT;
  }
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
