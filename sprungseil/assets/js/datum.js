/* Datum als Text „JJJJ-MM-TT“ in Ortszeit. Gerechnet wird immer mit
   12 Uhr mittags — so verschiebt kein Sommerzeit-Wechsel einen Tag, und
   ein Training um 23:50 Uhr landet am richtigen Datum.

   Ohne DOM: tools/pruefe.mjs liest diese Datei unter Node. */

export const pad = (zahl) => String(zahl).padStart(2, '0');

export const isoVon = (datum) =>
  `${datum.getFullYear()}-${pad(datum.getMonth() + 1)}-${pad(datum.getDate())}`;

export function alsDate(iso) {
  const [jahr, monat, tag] = iso.split('-').map(Number);
  return new Date(jahr, monat - 1, tag, 12);
}

export const heuteISO = () => isoVon(new Date());

export function istISO(text) {
  return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text) && isoVon(alsDate(text)) === text;
}

export function plusTage(iso, tage) {
  const datum = alsDate(iso);
  datum.setDate(datum.getDate() + tage);
  return isoVon(datum);
}

/** Ganze Tage von a nach b. Über eine Zeitumstellung liegen 23 oder 25
    Stunden zwischen zwei Mittagen — gerundet ist es trotzdem ein Tag. */
export const tageZwischen = (a, b) => Math.round((alsDate(b) - alsDate(a)) / 864e5);

/** Die Woche beginnt am Montag. */
export function wochenStart(iso) {
  const datum = alsDate(iso);
  datum.setDate(datum.getDate() - ((datum.getDay() + 6) % 7));
  return isoVon(datum);
}

/** Kalenderwoche nach ISO 8601: Die Woche mit dem ersten Donnerstag ist KW 1. */
export function kalenderwoche(iso) {
  const donnerstag = alsDate(plusTage(wochenStart(iso), 3));
  const vierterJanuar = new Date(donnerstag.getFullYear(), 0, 4, 12);
  const ersterDonnerstag = alsDate(plusTage(wochenStart(isoVon(vierterJanuar)), 3));
  return 1 + Math.round((donnerstag - ersterDonnerstag) / (7 * 864e5));
}

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

/** 2026-10-18 → „18.10.2026“ */
export function datumLang(iso) {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
}

/** 2026-10-18 → „18.10.“ */
export function datumKurz(iso) {
  const [, monat, tag] = iso.split('-');
  return `${tag}.${monat}.`;
}

/** 2026-10-18 → „Oktober 2026“ */
export function monatJahr(iso) {
  const [jahr, monat] = iso.split('-');
  return `${MONATE[Number(monat) - 1]} ${jahr}`;
}
