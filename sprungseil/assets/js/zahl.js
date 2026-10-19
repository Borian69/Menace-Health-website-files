/* Zahlen als Text, deutsch gesetzt. Ohne DOM — läuft auch unter Node. */

import { pad } from './datum.js';

const formate = new Map();
function format(stellen) {
  if (!formate.has(stellen)) {
    formate.set(stellen, new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: stellen,
      maximumFractionDigits: stellen,
    }));
  }
  return formate.get(stellen);
}

/** 1234.4 → „1.234“ */
export const ganz = (zahl) => format(0).format(Math.round(zahl));

/** 84.25 → „84,3“ */
export const dez = (zahl, stellen = 1) => format(stellen).format(zahl);

/** −0,3 · +1,2 · ±0,0 — mit echtem Minuszeichen, nicht dem Bindestrich. */
export function vorzeichen(zahl, stellen = 1) {
  const gerundet = Number(zahl.toFixed(stellen));
  const zeichen = gerundet > 0 ? '+' : gerundet < 0 ? '−' : '±';
  return zeichen + dez(Math.abs(gerundet), stellen);
}

/** 450 → „7:30“, 3725 → „1:02:05“ */
export function uhr(sekunden) {
  const s = Math.max(0, Math.round(sekunden));
  const stunden = Math.floor(s / 3600);
  const minuten = Math.floor((s % 3600) / 60);
  return stunden ? `${stunden}:${pad(minuten)}:${pad(s % 60)}` : `${minuten}:${pad(s % 60)}`;
}

/** 45 → „45 s“, 180 → „3 min“ — volle Minuten lesen sich als Minuten. */
export const sekText = (sekunden) =>
  (sekunden >= 60 && sekunden % 60 === 0 ? `${sekunden / 60} min` : `${sekunden} s`);

/** 15120 → „4 h 12 min“, 1800 → „30 min“ */
export function stundenText(sekunden) {
  const minuten = Math.round(sekunden / 60);
  const stunden = Math.floor(minuten / 60);
  return stunden ? `${stunden} h ${minuten % 60} min` : `${minuten} min`;
}

/** Liest „84,2“, „84.2“ und „1.234“. Ein Punkt vor genau drei Ziffern ist
    ein Tausenderpunkt, sonst ein Dezimalpunkt — Handytastaturen bieten
    oft nur den Punkt an. */
export function liesZahl(text) {
  const roh = String(text ?? '').trim().replace(/\s/g, '');
  if (!roh) return NaN;
  const ohneTausender = roh.replace(/\.(?=\d{3}(?!\d))/g, '');
  if (!/^\d+([.,]\d+)?$/.test(ohneTausender)) return NaN;
  return Number(ohneTausender.replace(',', '.'));
}

export const plural = (anzahl, eins, mehr) => (anzahl === 1 ? eins : mehr);
