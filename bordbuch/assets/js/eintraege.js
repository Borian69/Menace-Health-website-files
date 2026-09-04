/* Fachliches: was ein Eintrag ist, wie sortiert wird und wie aus einer
   Reihe von Kilometerständen eine Fahrleistung wird.

   Der wichtigste Gedanke: Ein Eintrag misst einen *Stand*, keine Strecke.
   Gefahren wurde immer zwischen zwei Ständen. Alles unten baut darauf auf. */

import { alsDate, istISO, tageZwischen, uid, heuteISO } from './util.js';
import { log } from './debug.js';

export const ARTEN = [
  { id: 'inspektion', label: 'Inspektion', standard: 'Inspektion nach Herstellervorgabe',
    pfad: '<path d="M15.5 3.6a5 5 0 0 0-4.6 6.9l-7.2 7.2a2.1 2.1 0 0 0 3 3l7.2-7.2a5 5 0 0 0 6.2-6.6l-3 3-2.6-.7-.7-2.6 3-3Z"/>' },
  { id: 'oel', label: 'Ölwechsel', standard: 'Motoröl und Ölfilter gewechselt',
    pfad: '<path d="M12 3s5.5 6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 9 12 3 12 3Z"/>' },
  { id: 'reifen', label: 'Reifen', standard: 'Reifen gewechselt',
    pfad: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5"/>' },
  { id: 'hu', label: 'HU / AU', standard: 'Hauptuntersuchung bestanden',
    pfad: '<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.2 2.4 2.4 4.8-5.2"/>' },
  { id: 'bremsen', label: 'Bremsen', standard: 'Bremsen erneuert',
    pfad: '<circle cx="12" cy="12" r="7.5"/><path d="M6.2 6.4a9 9 0 0 0 0 11.2"/><circle cx="12" cy="12" r="1.6"/>' },
  { id: 'reparatur', label: 'Reparatur', standard: 'Reparatur',
    pfad: '<path d="m14.4 6.6 3-3 3 3-3 3-3-3ZM12.9 8.1 4 17v3h3l8.9-8.9"/>' },
  { id: 'tanken', label: 'Tanken', standard: 'Getankt',
    pfad: '<path d="M4.5 20.5V5.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15M3 20.5h12M6.5 8.5h5"/><path d="M13.5 9.5h3a2 2 0 0 1 2 2v3.5a1.5 1.5 0 0 0 3 0V9.5L19 7"/>' },
  { id: 'pflege', label: 'Pflege', standard: 'Gewaschen und gepflegt',
    pfad: '<path d="M8 4.4c0 2-2 3.2-2 5a2 2 0 0 0 4 0c0-1.8-2-3-2-5ZM16 10.4c0 2-2 3.2-2 5a2 2 0 0 0 4 0c0-1.8-2-3-2-5Z"/>' },
  { id: 'sonstiges', label: 'Sonstiges', standard: '',
    pfad: '<path d="M4.5 5.5h15v13h-15z"/><path d="M8 9.8h8M8 14h5"/>' },
];

export const artVon = (id) => ARTEN.find((art) => art.id === id) || ARTEN[ARTEN.length - 1];

/** Rohdaten (Eingabe, Import, alte Fassung) in einen sauberen Eintrag.
    Gibt null zurück, wenn Pflichtangaben fehlen — Datum und Stand. */
export function normalisiere(roh) {
  if (!roh || typeof roh !== 'object') return null;

  const datum = istISO(roh.datum) ? roh.datum : null;
  const kmStand = Number.parseInt(roh.km, 10);
  if (!datum || !Number.isFinite(kmStand) || kmStand < 0) return null;

  const milliliter = Number.parseInt(roh.liter, 10);

  return {
    id:         typeof roh.id === 'string' && roh.id ? roh.id : uid(),
    datum,
    km:         kmStand,
    art:        ARTEN.some((art) => art.id === roh.art) ? roh.art : 'sonstiges',
    text:       String(roh.text || '').slice(0, 400).trim(),
    kosten:     Number.isFinite(Number.parseInt(roh.kosten, 10)) ? Math.max(0, Number.parseInt(roh.kosten, 10)) : null,
    werkstatt:  String(roh.werkstatt || '').slice(0, 120).trim(),
    notiz:      String(roh.notiz || '').slice(0, 800).trim(),

    /* Nur beim Tanken belegt. Menge in Millilitern — ganzzahlig, wie die
       Kosten in Cent, damit sich beim Summieren nichts verschiebt.
       `voll` entscheidet über die Verbrauchsrechnung: Nur zwischen zwei
       vollen Tanks steht fest, wie viel wirklich verbraucht wurde. */
    liter:      Number.isFinite(milliliter) && milliliter > 0 ? milliliter : null,
    voll:       roh.voll !== false,

    // Verweise auf Bilder in der Belegablage (IndexedDB).
    belege:     Array.isArray(roh.belege) ? roh.belege.filter((id) => typeof id === 'string').slice(0, 12) : [],

    demo:       roh.demo === true,
    angelegt:   Number.isFinite(roh.angelegt) ? roh.angelegt : Date.now(),
    geaendert:  Number.isFinite(roh.geaendert) ? roh.geaendert : Date.now(),
  };
}

/** Älteste zuerst. Bei gleichem Tag entscheidet der Stand — zwei Einträge
    an einem Tag sind sonst in beliebiger Reihenfolge, und die Strecken
    dazwischen würden negativ. */
export const sortiere = (liste) => liste.slice().sort((a, b) => (
  a.datum === b.datum ? a.km - b.km || a.angelegt - b.angelegt : a.datum < b.datum ? -1 : 1
));

/** Neueste zuerst — so wird die Liste in der Übersicht gezeigt. */
export const sortiereNeueste = (liste) => sortiere(liste).reverse();

/* ── Strecken ────────────────────────────────────────────────
   Zwischen zwei aufeinanderfolgenden Ständen liegt eine Strecke. Ein
   niedrigerer Stand als zuvor ist keine Strecke, sondern ein Tippfehler
   oder ein getauschter Tacho: solche Paare werden als Ausreißer gemeldet
   und aus jeder Summe herausgehalten. */

export function strecken(liste) {
  const sortiert = sortiere(liste);
  const raus = [];
  for (let i = 1; i < sortiert.length; i += 1) {
    const von = sortiert[i - 1];
    const bis = sortiert[i];
    raus.push({
      von,
      bis,
      km: bis.km - von.km,
      tage: tageZwischen(von.datum, bis.datum),
      gueltig: bis.km >= von.km,
    });
  }
  return raus;
}

export const ausreisser = (liste) => strecken(liste).filter((strecke) => !strecke.gueltig);

/* ── Kennzahlen ──────────────────────────────────────────── */

export function statistik(liste) {
  const sortiert = sortiere(liste);
  const alle = strecken(sortiert);
  const gueltige = alle.filter((strecke) => strecke.gueltig);

  const gefahren = gueltige.reduce((summe, strecke) => summe + strecke.km, 0);
  const kosten = sortiert.reduce((summe, eintrag) => summe + (eintrag.kosten || 0), 0);
  const erster = sortiert[0] || null;
  const letzter = sortiert[sortiert.length - 1] || null;
  const tage = erster && letzter ? tageZwischen(erster.datum, letzter.datum) : 0;

  return {
    anzahl: sortiert.length,
    erster,
    letzter,
    stand: letzter ? Math.max(...sortiert.map((eintrag) => eintrag.km)) : null,
    gefahren,
    kosten,
    tage,
    proTag: tage > 0 ? gefahren / tage : 0,
    proJahr: tage > 0 ? (gefahren / tage) * 365 : 0,
    ausreisser: alle.filter((strecke) => !strecke.gueltig),
  };
}

/* ── Verteilung über die Zeit ────────────────────────────────
   Für die Jahreskurve muss eine Strecke auf die Tage aufgeteilt werden,
   über die sie sich erstreckt: Wer im März abliest und erst im Juli
   wieder, ist nicht im Juli 4.000 km gefahren, sondern in vier Monaten.
   Gleichverteilung ist die einzige ehrliche Annahme ohne weitere Daten —
   und sie ist im Diagramm als solche gekennzeichnet.

   Zwei Ablesungen am selben Tag landen vollständig auf diesem Tag. */

export function monateFuerJahr(liste, jahr) {
  const monate = new Array(12).fill(0);

  for (const strecke of strecken(liste)) {
    if (!strecke.gueltig || strecke.km === 0) continue;

    if (strecke.tage <= 0) {
      const datum = alsDate(strecke.bis.datum);
      if (datum.getFullYear() === jahr) monate[datum.getMonth()] += strecke.km;
      continue;
    }

    const proTag = strecke.km / strecke.tage;
    const lauf = alsDate(strecke.von.datum);
    for (let i = 0; i < strecke.tage; i += 1) {
      lauf.setDate(lauf.getDate() + 1);
      if (lauf.getFullYear() === jahr) monate[lauf.getMonth()] += proTag;
    }
  }

  const gerundet = monate.map((wert) => Math.round(wert));
  const kumuliert = [];
  gerundet.reduce((summe, wert) => {
    const neu = summe + wert;
    kumuliert.push(neu);
    return neu;
  }, 0);

  log('auswertung', 'Monatswerte berechnet', { jahr, monate: gerundet, gesamt: kumuliert[11] });

  return {
    jahr,
    monate: gerundet,
    kumuliert,
    gesamt: kumuliert[11] || 0,
    max: Math.max(0, ...gerundet),
    // Bis zu welchem Monat gibt es überhaupt Daten? Danach wird die
    // Kurve nicht weitergezogen, sonst liest sich Stillstand als Fahrt.
    letzterMonat: letzterMonatMitDaten(liste, jahr),
  };
}

function letzterMonatMitDaten(liste, jahr) {
  const sortiert = sortiere(liste);
  if (!sortiert.length) return -1;
  const erstes = alsDate(sortiert[0].datum);
  const letztes = alsDate(sortiert[sortiert.length - 1].datum);
  if (letztes.getFullYear() < jahr || erstes.getFullYear() > jahr) return -1;
  if (letztes.getFullYear() > jahr) return 11;
  return letztes.getMonth();
}

/** Jahre, für die es etwas zu zeigen gibt — inklusive der Jahre, die eine
    lange Strecke nur überspannt. */
export function jahre(liste) {
  const sortiert = sortiere(liste);
  if (!sortiert.length) return [Number(heuteISO().slice(0, 4))];
  const von = Number(sortiert[0].datum.slice(0, 4));
  const bis = Number(sortiert[sortiert.length - 1].datum.slice(0, 4));
  const raus = [];
  for (let jahr = von; jahr <= bis; jahr += 1) raus.push(jahr);
  return raus;
}

/** Einträge nach Tag gebündelt — die Grundlage des Kalenders. */
export function nachTag(liste) {
  const karte = new Map();
  for (const eintrag of liste) {
    const vorhanden = karte.get(eintrag.datum);
    if (vorhanden) vorhanden.push(eintrag);
    else karte.set(eintrag.datum, [eintrag]);
  }
  for (const [, tagesListe] of karte) tagesListe.sort((a, b) => a.km - b.km);
  return karte;
}
