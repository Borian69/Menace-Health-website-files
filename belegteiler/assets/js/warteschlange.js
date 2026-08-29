/* Aufnahmen, die noch nicht durch sind.

   Bisher galt: Erkennung fehlgeschlagen — Foto weg, bitte nochmal
   fotografieren. Im Laden vor dem Regal ist das die falsche Antwort.
   Der Bon liegt dann schon wieder in der Tüte.

   Also wird jede Aufnahme abgelegt, bevor die Erkennung überhaupt
   startet, und erst gelöscht, wenn sie durch ist. Dazwischen darf alles
   schiefgehen: kein Netz, überlastetes Modell, App geschlossen, Handy
   neu gestartet. Der Beleg bleibt und wird später erneut versucht.

   IndexedDB und nicht localStorage: Ein aufbereitetes Foto sind
   mehrere Megabyte Base64, localStorage ist bei etwa fünf am Ende —
   und zwar für alles zusammen, Einstellungen und Verlauf inbegriffen. */

const DB = 'belegteiler';
const FACH = 'offene-scans';

let verbindung = null;

function oeffnen() {
  if (verbindung) return verbindung;
  verbindung = new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(DB, 1);
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(FACH)) db.createObjectStore(FACH, { keyPath: 'id' });
    };
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
  return verbindung;
}

function lauf(modus, arbeit) {
  return oeffnen().then((db) => new Promise((resolve, reject) => {
    const transaktion = db.transaction(FACH, modus);
    const anfrage = arbeit(transaktion.objectStore(FACH));
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  }));
}

/* Ohne IndexedDB (privater Modus mancher Browser) läuft die App weiter,
   nur eben ohne zweite Chance. Das ist kein Grund, den Scan zu
   verweigern. */
const still = (versprechen, ersatz) => versprechen.catch(() => ersatz);

/**
 * @typedef {{id: string, parts: string[], preview: string,
 *            angelegt: number, versuche: number, fehler: string,
 *            naechsterVersuch: number}} Auftrag
 */

/** @param {Auftrag} auftrag */
export const merken = (auftrag) => still(lauf('readwrite', (fach) => fach.put(auftrag)), null);

export const vergessen = (id) => still(lauf('readwrite', (fach) => fach.delete(id)), null);

/** @returns {Promise<Auftrag[]>} älteste zuerst */
export const alle = () =>
  still(lauf('readonly', (fach) => fach.getAll()), [])
    .then((liste) => (liste || []).sort((a, b) => a.angelegt - b.angelegt));

/** @returns {Promise<Auftrag|null>} der älteste offene Auftrag */
export const naechster = () => alle().then((liste) => liste[0] || null);

export const anzahl = () => alle().then((liste) => liste.length);

export const leeren = () => still(lauf('readwrite', (fach) => fach.clear()), null);
