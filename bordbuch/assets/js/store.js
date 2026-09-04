/* Alles bleibt auf dem Gerät. Kein Server, kein Konto, keine Übertragung —
   das Bordbuch ist eine Datei im Browser-Speicher dieses Handys.

   Genau deshalb gibt es den JSON-Export in den Einstellungen: er ist die
   einzige Sicherung, die es gibt. */

import { log, fehler } from './debug.js';

const EINSTELLUNGEN_KEY = 'bordbuch.einstellungen.v1';
const EINTRAEGE_KEY     = 'bordbuch.eintraege.v1';

export const VORGABEN = {
  /* Fahrzeug — steht im Kopf des PDF und macht aus der Liste einen
     Nachweis, der beim Verkauf etwas wert ist. */
  fahrzeug:    '',
  kennzeichen: '',
  baujahr:     '',
  fin:         '',

  kostenAnzeigen: true,
  haptik:         true,

  pdfKosten:   true,
  pdfNotizen:  true,
  pdfBelege:   true,
  pdfFormat:   'a4',

  /* Diagnose. Der Hauptschalter ist aus; die Bereiche stehen auf an,
     damit ein eingeschalteter Debug-Modus sofort etwas zeigt. */
  debug:            false,
  debug_daten:      true,
  debug_eintrag:    true,
  debug_auswertung: true,
  debug_kalender:   true,
  debug_diagramm:   true,
  debug_pdf:        true,
  debug_ui:         true,
};

function lies(key, ersatz) {
  try {
    const raw = localStorage.getItem(key);
    log('daten', 'gelesen', { key, bytes: raw ? raw.length : 0 });
    return raw ? JSON.parse(raw) : ersatz;
  } catch (error) {
    fehler('daten', `Konnte ${key} nicht lesen`, error);
    return ersatz;
  }
}

function schreibe(key, wert) {
  try {
    const raw = JSON.stringify(wert);
    localStorage.setItem(key, raw);
    log('daten', 'geschrieben', { key, bytes: raw.length });
    return true;
  } catch (error) {
    // Voller Speicher oder Privatmodus. Der Aufrufer muss das erfahren,
    // sonst hält der Nutzer einen Eintrag für gesichert, den es nicht gibt.
    fehler('daten', `Konnte ${key} nicht schreiben`, error);
    return false;
  }
}

/* ── Einstellungen ───────────────────────────────────────── */

export function ladeEinstellungen() {
  const gespeichert = lies(EINSTELLUNGEN_KEY, {});
  return { ...VORGABEN, ...(gespeichert && typeof gespeichert === 'object' ? gespeichert : {}) };
}

export function speichereEinstellungen(aenderung) {
  const naechste = { ...ladeEinstellungen(), ...aenderung };
  schreibe(EINSTELLUNGEN_KEY, naechste);
  return naechste;
}

/* ── Einträge ────────────────────────────────────────────── */

export function ladeEintraege() {
  const liste = lies(EINTRAEGE_KEY, []);
  return Array.isArray(liste) ? liste : [];
}

export function speichereEintraege(liste) {
  return schreibe(EINTRAEGE_KEY, liste);
}

/* ── Sicherung ───────────────────────────────────────────── */

export function alsJSON() {
  return JSON.stringify({
    app: 'bordbuch',
    fassung: 1,
    erstellt: new Date().toISOString(),
    einstellungen: ladeEinstellungen(),
    eintraege: ladeEintraege(),
  }, null, 2);
}

/** Import aus einer Sicherung. Gibt zurück, was übernommen wurde — der
    Aufrufer entscheidet, ob ersetzt oder ergänzt wird. */
export function ausJSON(text) {
  const daten = JSON.parse(text);
  if (!daten || typeof daten !== 'object') throw new Error('Datei enthält kein Objekt.');
  if (!Array.isArray(daten.eintraege)) throw new Error('Im Datensatz fehlt die Liste „eintraege“.');
  return {
    eintraege: daten.eintraege,
    einstellungen: daten.einstellungen && typeof daten.einstellungen === 'object' ? daten.einstellungen : null,
    belege: Array.isArray(daten.belege) ? daten.belege : [],
  };
}

export function speicherInfo() {
  const eintraege = localStorage.getItem(EINTRAEGE_KEY) || '';
  const einstellungen = localStorage.getItem(EINSTELLUNGEN_KEY) || '';
  const protokoll = localStorage.getItem('bordbuch.protokoll.v1') || '';
  return {
    anzahl: ladeEintraege().length,
    bytesEintraege: eintraege.length,
    bytesEinstellungen: einstellungen.length,
    bytesProtokoll: protokoll.length,
    bytesGesamt: eintraege.length + einstellungen.length + protokoll.length,
  };
}

export function alleDatenLoeschen() {
  try {
    localStorage.removeItem(EINTRAEGE_KEY);
    localStorage.removeItem(EINSTELLUNGEN_KEY);
    log('daten', 'Alle Daten gelöscht');
    return true;
  } catch (error) {
    fehler('daten', 'Löschen fehlgeschlagen', error);
    return false;
  }
}
