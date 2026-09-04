/* Belegablage: Fotos von Rechnungen und Quittungen.

   Warum IndexedDB und nicht localStorage wie der Rest: Dort passen rund
   fünf Megabyte hinein, und zwar als Text — ein Foto müsste erst nach
   Base64 umkodiert werden und wächst dabei um ein Drittel. Nach zwei
   Belegen wäre Schluss, und beim Überlaufen verliert man nicht nur das
   Bild, sondern den ganzen Speicher. IndexedDB nimmt Blobs direkt und
   hat Platz.

   Jedes Bild wird beim Hinzufügen neu berechnet: auf 1.600 px lange Kante
   verkleinert und als JPEG gespeichert. Ein Handyfoto von vier Megabyte
   wird so zu etwa 300 Kilobyte, ohne dass eine Rechnung unlesbar wird.
   Dazu kommt ein kleines Vorschaubild für die Listen — sonst müsste für
   jede Zeile das große Bild in den Speicher.

   Die Maße werden beim Verkleinern mitgeschrieben. Das PDF braucht sie
   später, um das Bild einzupassen, und kann sie einer JPEG-Datei sonst
   nur mühsam ansehen. */

import { uid } from './util.js';
import { log, fehler } from './debug.js';

const DB_NAME = 'bordbuch';
const DB_FASSUNG = 1;
const LAGER = 'belege';

const MAX_KANTE = 1600;
const VORSCHAU_KANTE = 320;
const GUETE = 0.72;

let verbindung = null;

function oeffne() {
  if (verbindung) return Promise.resolve(verbindung);

  return new Promise((erfuellt, abgelehnt) => {
    const anfrage = indexedDB.open(DB_NAME, DB_FASSUNG);

    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(LAGER)) {
        const lager = db.createObjectStore(LAGER, { keyPath: 'id' });
        // Nach Eintrag suchen zu können spart das Durchgehen aller Belege.
        lager.createIndex('eintragId', 'eintragId', { unique: false });
      }
    };

    anfrage.onsuccess = () => {
      verbindung = anfrage.result;
      erfuellt(verbindung);
    };
    anfrage.onerror = () => abgelehnt(anfrage.error);
  });
}

function vorgang(modus, arbeit) {
  return oeffne().then((db) => new Promise((erfuellt, abgelehnt) => {
    const transaktion = db.transaction(LAGER, modus);
    const lager = transaktion.objectStore(LAGER);
    let ergebnis;
    try {
      ergebnis = arbeit(lager);
    } catch (error) {
      abgelehnt(error);
      return;
    }
    /* Eine IDBRequest wird ausgepackt — auch dann, wenn ihr Ergebnis
       `undefined` ist. Sonst käme bei einem fehlenden Schlüssel das
       Anfrage-Objekt selbst zurück, und das ist wahr: Ein gelöschter
       Beleg würde sich als vorhanden ausgeben. */
    transaktion.oncomplete = () => erfuellt(ergebnis instanceof IDBRequest ? ergebnis.result : ergebnis);
    transaktion.onerror = () => abgelehnt(transaktion.error);
    transaktion.onabort = () => abgelehnt(transaktion.error);
  }));
}

/* ── Bild aufbereiten ────────────────────────────────────── */

async function nachCanvas(datei, maxKante) {
  /* createImageBitmap versteht auch das HEIC der iPhone-Kamera, sofern
     das Gerät den Decoder mitbringt. Wo nicht, gibt es einen Fehler mit
     Ansage statt eines leeren Bildes. */
  let bild;
  try {
    bild = await createImageBitmap(datei);
  } catch (error) {
    throw new Error('Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPEG oder PNG aufnehmen.');
  }

  const faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
  const breite = Math.max(1, Math.round(bild.width * faktor));
  const hoehe = Math.max(1, Math.round(bild.height * faktor));

  const flaeche = document.createElement('canvas');
  flaeche.width = breite;
  flaeche.height = hoehe;
  const stift = flaeche.getContext('2d');
  /* Ein PNG mit durchsichtigen Stellen bekäme als JPEG schwarze Flächen.
     Dahinter liegt deshalb Papier — und Papier ist in diesem System
     Hemd-Elfenbein, nicht Reinweiß. Der Wert steht hier als Zahl, weil
     ein Canvas keine CSS-Variablen lesen kann; er stammt unverändert aus
     design/tokens.css (--shirt). */
  stift.fillStyle = '#F5F0E6';
  stift.fillRect(0, 0, breite, hoehe);
  stift.drawImage(bild, 0, 0, breite, hoehe);
  bild.close?.();

  return { flaeche, breite, hoehe };
}

const alsBlob = (flaeche) => new Promise((erfuellt, abgelehnt) => {
  flaeche.toBlob(
    (blob) => (blob ? erfuellt(blob) : abgelehnt(new Error('Bild ließ sich nicht speichern.'))),
    'image/jpeg',
    GUETE,
  );
});

/* ── Öffentlich ──────────────────────────────────────────── */

/** Datei aufnehmen und dem Eintrag zuordnen. Gibt den fertigen Beleg
    ohne die Blobs zurück — die holt sich die Anzeige einzeln. */
export async function lege(datei, eintragId) {
  if (!datei || !datei.type.startsWith('image/')) {
    throw new Error('Bitte ein Foto oder Bild wählen — PDFs kann die App nicht anzeigen.');
  }

  const gross = await nachCanvas(datei, MAX_KANTE);
  const klein = await nachCanvas(datei, VORSCHAU_KANTE);
  const bild = await alsBlob(gross.flaeche);
  const vorschau = await alsBlob(klein.flaeche);

  const beleg = {
    id: `bel-${uid()}`,
    eintragId,
    bild,
    vorschau,
    breite: gross.breite,
    hoehe: gross.hoehe,
    bytes: bild.size,
    quelle: datei.name || '',
    angelegt: Date.now(),
  };

  await vorgang('readwrite', (lager) => lager.put(beleg));
  log('daten', 'Beleg abgelegt', {
    id: beleg.id,
    eintragId,
    vorher: datei.size,
    nachher: bild.size,
    masse: `${beleg.breite}×${beleg.hoehe}`,
  });

  return beleg;
}

export const hole = (id) => vorgang('readonly', (lager) => lager.get(id));

export async function holeViele(ids) {
  if (!ids || !ids.length) return [];
  const alle = await Promise.all(ids.map((id) => hole(id).catch(() => null)));
  return alle.filter(Boolean);
}

export async function loesche(id) {
  await vorgang('readwrite', (lager) => lager.delete(id));
  log('daten', 'Beleg gelöscht', { id });
}

export const alle = () => vorgang('readonly', (lager) => lager.getAll());

/** Einen Beleg nachträglich einem Eintrag zuordnen. Nötig, weil beim
    Anlegen über das Formular die Kennung des Eintrags noch nicht
    feststeht, wenn das Foto schon gewählt wird. */
export async function ordneZu(id, eintragId) {
  const beleg = await hole(id);
  if (!beleg) return false;
  await vorgang('readwrite', (lager) => lager.put({ ...beleg, eintragId }));
  log('daten', 'Beleg zugeordnet', { id, eintragId });
  return true;
}

/** Belege, auf die kein Eintrag mehr zeigt — etwa nachdem ein Eintrag
    gelöscht wurde. Wird beim Start einmal aufgeräumt. */
export async function raeumeAuf(eintraege) {
  try {
    const bekannt = new Set(eintraege.flatMap((eintrag) => eintrag.belege || []));
    const gespeicherte = await alle();
    const verwaist = gespeicherte.filter((beleg) => !bekannt.has(beleg.id));
    for (const beleg of verwaist) await loesche(beleg.id);
    if (verwaist.length) log('daten', 'Verwaiste Belege entfernt', { anzahl: verwaist.length });
    return verwaist.length;
  } catch (error) {
    fehler('daten', 'Aufräumen der Belege fehlgeschlagen', error);
    return 0;
  }
}

export async function belegt() {
  try {
    const gespeicherte = await alle();
    return {
      anzahl: gespeicherte.length,
      bytes: gespeicherte.reduce((summe, beleg) => summe + (beleg.bytes || 0), 0),
    };
  } catch {
    return { anzahl: 0, bytes: 0 };
  }
}

export async function alleLoeschen() {
  await vorgang('readwrite', (lager) => lager.clear());
  log('daten', 'Alle Belege gelöscht');
}

/* ── Für die Sicherung ───────────────────────────────────── */

const nachBase64 = (blob) => new Promise((erfuellt, abgelehnt) => {
  const leser = new FileReader();
  leser.onload = () => erfuellt(String(leser.result).split(',')[1] || '');
  leser.onerror = () => abgelehnt(leser.error);
  leser.readAsDataURL(blob);
});

function ausBase64(text, typ = 'image/jpeg') {
  const roh = atob(text);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return new Blob([bytes], { type: typ });
}

/** Für den JSON-Export: Blobs werden zu Base64. Das macht die Datei
    deutlich größer — deshalb steht die Größe in den Einstellungen. */
export async function exportierbar() {
  const gespeicherte = await alle();
  return Promise.all(gespeicherte.map(async (beleg) => ({
    id: beleg.id,
    eintragId: beleg.eintragId,
    breite: beleg.breite,
    hoehe: beleg.hoehe,
    quelle: beleg.quelle,
    angelegt: beleg.angelegt,
    bild: await nachBase64(beleg.bild),
    vorschau: await nachBase64(beleg.vorschau),
  })));
}

export async function importiere(liste) {
  if (!Array.isArray(liste)) return 0;
  let uebernommen = 0;

  for (const roh of liste) {
    if (!roh || typeof roh.id !== 'string' || typeof roh.bild !== 'string') continue;
    try {
      const bild = ausBase64(roh.bild);
      const vorschau = roh.vorschau ? ausBase64(roh.vorschau) : bild;
      await vorgang('readwrite', (lager) => lager.put({
        id: roh.id,
        eintragId: roh.eintragId,
        bild,
        vorschau,
        breite: roh.breite || 0,
        hoehe: roh.hoehe || 0,
        bytes: bild.size,
        quelle: roh.quelle || '',
        angelegt: roh.angelegt || Date.now(),
      }));
      uebernommen += 1;
    } catch (error) {
      fehler('daten', 'Beleg aus Sicherung abgelehnt', error);
    }
  }

  log('daten', 'Belege eingelesen', { uebernommen });
  return uebernommen;
}

/** Bytes eines Belegs für das PDF. */
export async function alsBytes(id) {
  const beleg = await hole(id);
  if (!beleg) return null;
  return {
    id: beleg.id,
    eintragId: beleg.eintragId,
    breite: beleg.breite,
    hoehe: beleg.hoehe,
    bytes: new Uint8Array(await beleg.bild.arrayBuffer()),
  };
}
