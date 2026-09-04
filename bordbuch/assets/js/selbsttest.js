/* Selbsttest: prüft jede Funktion der App einmal durch und sagt, was
   kaputt ist. Läuft in den Einstellungen auf Knopfdruck.

   Der Test arbeitet auf eigenen Daten und fasst die echten Einträge nicht
   an — bis auf einen Probeschlüssel im Speicher, der sofort wieder
   entfernt wird. */

import { toKm, toCents, toMilliliter, istISO, tageZwischen, plusTage, isoVon, formatDatum, liter } from './util.js';
import { normalisiere, sortiere, statistik, monateFuerJahr, ausreisser, nachTag, ARTEN } from './eintraege.js';
import { gitter } from './kalender.js';
import { balken, kurve } from './diagramm.js';
import { erzeugePDF, testSeite, _intern } from './pdf.js';
import { messungen, verbrauchsBilanz } from './verbrauch.js';
import * as belege from './belege.js';
import { ladeEinstellungen, speicherInfo } from './store.js';
import { log, fehler } from './debug.js';
import { BUILD } from './fassung.js';

const pruefe = (bedingung, meldung) => {
  if (!bedingung) throw new Error(meldung);
};

/* Ein kleiner, künstlicher Datensatz: zwei Jahre, bekannte Summen. */
function testdaten() {
  return [
    { id: 't1', datum: '2025-01-01', km: 100000, art: 'inspektion', text: 'Start', angelegt: 1 },
    { id: 't2', datum: '2025-07-01', km: 106000, art: 'oel', text: 'Ölwechsel', kosten: 8990, angelegt: 2 },
    { id: 't3', datum: '2026-01-01', km: 112000, art: 'hu', text: 'HU', kosten: 13500, angelegt: 3 },
  ].map(normalisiere);
}

const TESTS = [
  {
    name: 'Speicher beschreibbar',
    bereich: 'daten',
    async lauf() {
      const key = 'bordbuch.selbsttest';
      localStorage.setItem(key, JSON.stringify({ a: 1 }));
      const zurueck = JSON.parse(localStorage.getItem(key));
      localStorage.removeItem(key);
      pruefe(zurueck && zurueck.a === 1, 'Gelesener Wert weicht ab.');
      const info = speicherInfo();
      return `${info.anzahl} Einträge, ${(info.bytesGesamt / 1024).toFixed(1)} KB belegt`;
    },
  },
  {
    name: 'Einstellungen vollständig',
    bereich: 'daten',
    async lauf() {
      const einstellungen = ladeEinstellungen();
      pruefe(typeof einstellungen.pdfFormat === 'string', 'pdfFormat fehlt.');
      pruefe('debug' in einstellungen, 'Debug-Schalter fehlt.');
      return `Format ${einstellungen.pdfFormat}, Debug ${einstellungen.debug ? 'an' : 'aus'}`;
    },
  },
  {
    name: 'Zahlen einlesen',
    bereich: 'eintrag',
    async lauf() {
      pruefe(toKm('123.456 km') === 123456, 'Tausenderpunkt nicht erkannt.');
      pruefe(toKm('123 456') === 123456, 'Leerzeichen nicht erkannt.');
      pruefe(toKm('') === null, 'Leere Eingabe muss null ergeben.');
      pruefe(toCents('89,90') === 8990, 'Komma-Betrag falsch.');
      pruefe(toCents('1.234,56') === 123456, 'Tausenderpunkt im Betrag falsch.');
      return 'Kilometer und Beträge korrekt';
    },
  },
  {
    name: 'Datum rechnen',
    bereich: 'eintrag',
    async lauf() {
      pruefe(istISO('2026-02-29') === false, 'Der 29. Februar 2026 existiert nicht.');
      pruefe(istISO('2024-02-29') === true, 'Schaltjahr nicht erkannt.');
      // Über die Sommerzeitumstellung hinweg: 30 Tage bleiben 30 Tage.
      pruefe(tageZwischen('2026-03-15', '2026-04-14') === 30, 'Zeitumstellung verschiebt die Tagesrechnung.');
      pruefe(plusTage('2025-12-31', 1) === '2026-01-01', 'Jahreswechsel falsch.');
      pruefe(isoVon(new Date(2026, 0, 5)) === '2026-01-05', 'Ortszeit-Umwandlung falsch.');
      return formatDatum('2026-01-05', { mitTag: true });
    },
  },
  {
    name: 'Eingaben prüfen',
    bereich: 'eintrag',
    async lauf() {
      pruefe(normalisiere({ datum: 'unfug', km: 10 }) === null, 'Falsches Datum wurde angenommen.');
      pruefe(normalisiere({ datum: '2026-01-01', km: -5 }) === null, 'Negativer Stand wurde angenommen.');
      const eintrag = normalisiere({ datum: '2026-01-01', km: '1000', art: 'gibtsnicht' });
      pruefe(eintrag && eintrag.art === 'sonstiges', 'Unbekannte Art wurde nicht aufgefangen.');
      pruefe(eintrag.kosten === null, 'Fehlende Kosten müssen null sein.');
      return `${ARTEN.length} Arten verfügbar`;
    },
  },
  {
    name: 'Reihenfolge und Kennzahlen',
    bereich: 'auswertung',
    async lauf() {
      const daten = testdaten();
      const sortiert = sortiere(daten);
      pruefe(sortiert[0].datum === '2025-01-01', 'Älteste zuerst stimmt nicht.');
      const werte = statistik(daten);
      pruefe(werte.gefahren === 12000, `Fahrleistung falsch: ${werte.gefahren}`);
      pruefe(werte.stand === 112000, 'Kilometerstand falsch.');
      pruefe(werte.kosten === 22490, 'Kostensumme falsch.');
      return `${werte.gefahren} km über ${werte.tage} Tage`;
    },
  },
  {
    name: 'Ausreißer erkennen',
    bereich: 'auswertung',
    async lauf() {
      const daten = [...testdaten(), normalisiere({ datum: '2026-02-01', km: 90000, art: 'sonstiges' })];
      const gefunden = ausreisser(daten);
      pruefe(gefunden.length === 1, `Erwartet 1 Ausreißer, gefunden ${gefunden.length}.`);
      const werte = statistik(daten);
      pruefe(werte.gefahren === 12000, 'Rückwärts laufender Stand darf die Fahrleistung nicht erhöhen.');
      return 'Rückwärts laufender Tacho wird ausgeschlossen';
    },
  },
  {
    name: 'Monatsverteilung',
    bereich: 'auswertung',
    async lauf() {
      const daten = testdaten();
      const jahr2025 = monateFuerJahr(daten, 2025);
      const jahr2026 = monateFuerJahr(daten, 2026);
      const summe = jahr2025.gesamt + jahr2026.gesamt;
      // 12.000 km auf zwei Jahre verteilt, Rundung je Monat erlaubt ±12 km.
      pruefe(Math.abs(summe - 12000) <= 12, `Summe der Monate weicht ab: ${summe}`);
      pruefe(jahr2025.kumuliert[11] === jahr2025.gesamt, 'Kumulierte Reihe endet nicht auf der Summe.');
      for (let i = 1; i < 12; i += 1) {
        pruefe(jahr2025.kumuliert[i] >= jahr2025.kumuliert[i - 1], 'Kumulierte Kurve fällt.');
      }
      return `2025: ${jahr2025.gesamt} km · 2026: ${jahr2026.gesamt} km`;
    },
  },
  {
    name: 'Verbrauch rechnen',
    bereich: 'auswertung',
    async lauf() {
      pruefe(toMilliliter('45,67') === 45670, 'Literzahl falsch eingelesen.');

      /* Von voll zu voll: 1.000 km, 70 Liter — das sind glatte 7,0 L.
         Die erste volle Füllung zählt nur als Startpunkt. */
      const einfach = [
        { datum: '2026-01-01', km: 100000, art: 'tanken', liter: 50000, voll: true, kosten: 8500 },
        { datum: '2026-02-01', km: 101000, art: 'tanken', liter: 70000, voll: true, kosten: 12250 },
      ].map(normalisiere);

      const reihe = messungen(einfach);
      pruefe(reihe.length === 1, `Erwartet 1 Messung, bekommen ${reihe.length}.`);
      pruefe(Math.abs(reihe[0].verbrauch - 7) < 0.001, `Verbrauch falsch: ${reihe[0].verbrauch}`);
      pruefe(Math.abs(reihe[0].preisJeLiter - 175) < 0.01, `Preis je Liter falsch: ${reihe[0].preisJeLiter}`);

      // Mit Teilbetankung dazwischen: 30 + 40 Liter auf 1.000 km = 7,0 L.
      const mitTeil = [
        { datum: '2026-01-01', km: 100000, art: 'tanken', liter: 50000, voll: true },
        { datum: '2026-01-15', km: 100400, art: 'tanken', liter: 30000, voll: false },
        { datum: '2026-02-01', km: 101000, art: 'tanken', liter: 40000, voll: true },
      ].map(normalisiere);
      const zwei = messungen(mitTeil);
      pruefe(zwei.length === 1, 'Die Teilbetankung darf keine eigene Messung erzeugen.');
      pruefe(Math.abs(zwei[0].verbrauch - 7) < 0.001, `Verbrauch mit Teilbetankung falsch: ${zwei[0].verbrauch}`);
      pruefe(zwei[0].tankungen === 2, 'Beide Tankungen müssen in die Messung eingehen.');

      /* Eine vergessene Tankfüllung erzeugt eine Messung über 12.000 km
         mit 45 Litern — 0,4 L/100 km. Die darf den Schnitt nicht ziehen. */
      const mitLuecke = [
        ...mitTeil,
        normalisiere({ datum: '2026-08-01', km: 113000, art: 'tanken', liter: 45000, voll: true }),
      ];
      const geprueft = verbrauchsBilanz(mitLuecke);
      pruefe(geprueft.unplausibel === 1, `Erwartet 1 unplausible Messung, bekommen ${geprueft.unplausibel}.`);
      pruefe(Math.abs(geprueft.schnitt - 7) < 0.001, `Der Ausreißer verfälscht den Schnitt: ${geprueft.schnitt}`);
      pruefe(geprueft.reihe.length === 2, 'Die unplausible Messung muss in der Tabelle sichtbar bleiben.');

      // Ein einzelner voller Tank ergibt noch kein Ergebnis.
      const einzeln = verbrauchsBilanz([normalisiere({ datum: '2026-01-01', km: 100000, art: 'tanken', liter: 50000, voll: true })]);
      pruefe(einzeln.schnitt === null, 'Aus einer Tankfüllung darf kein Verbrauch entstehen.');
      pruefe(einzeln.literGesamt === 50000, 'Getankte Menge fehlt in der Bilanz.');

      return `${liter(zwei[0].liter)} auf ${zwei[0].km} km`;
    },
  },
  {
    name: 'Belege ablegen',
    bereich: 'daten',
    async lauf() {
      if (!('indexedDB' in window)) return 'IndexedDB in diesem Browser nicht verfügbar';

      // Ein winziges Bild erzeugen, damit der Test keine Datei braucht.
      const flaeche = document.createElement('canvas');
      flaeche.width = 40;
      flaeche.height = 60;
      const stift = flaeche.getContext('2d');
      stift.fillStyle = '#CCCCCC';
      stift.fillRect(0, 0, 40, 60);
      const blob = await new Promise((fertig) => flaeche.toBlob(fertig, 'image/png'));

      const beleg = await belege.lege(blob, 'selbsttest');
      pruefe(beleg.bild.size > 0, 'Der abgelegte Beleg ist leer.');
      pruefe(beleg.breite === 40 && beleg.hoehe === 60, `Maße falsch: ${beleg.breite}×${beleg.hoehe}`);

      const zurueck = await belege.hole(beleg.id);
      pruefe(zurueck && zurueck.id === beleg.id, 'Beleg nicht wiedergefunden.');

      const bytes = await belege.alsBytes(beleg.id);
      pruefe(bytes.bytes[0] === 0xff && bytes.bytes[1] === 0xd8, 'Gespeichertes Bild ist kein JPEG.');

      await belege.loesche(beleg.id);
      pruefe(!(await belege.hole(beleg.id)), 'Beleg ließ sich nicht löschen.');

      return `${beleg.breite}×${beleg.hoehe}, ${beleg.bytes} Bytes als JPEG`;
    },
  },
  {
    name: 'Kalender aufbauen',
    bereich: 'kalender',
    async lauf() {
      // Februar 2026 beginnt an einem Sonntag → 6 Felder Vorlauf.
      const knoten = gitter(2026, 1, nachTag(testdaten()));
      const felder = knoten.querySelectorAll('.kal-tag');
      pruefe(felder.length % 7 === 0, `Gitter geht nicht auf: ${felder.length} Felder.`);
      const eigene = knoten.querySelectorAll('.kal-tag:not(.fremd)');
      pruefe(eigene.length === 28, `Februar 2026 hat 28 Tage, gezählt: ${eigene.length}.`);
      const markiert = knoten.querySelectorAll('.kal-tag.hat');
      pruefe(markiert.length === 0, 'Im Februar 2026 liegt kein Testeintrag.');
      const januar = gitter(2026, 0, nachTag(testdaten()));
      pruefe(januar.querySelectorAll('.kal-tag.hat').length === 1, 'Eintrag am 1. Januar nicht markiert.');
      return `${felder.length} Felder, Wochenstart Montag`;
    },
  },
  {
    name: 'Diagramme zeichnen',
    bereich: 'diagramm',
    async lauf() {
      const daten = monateFuerJahr(testdaten(), 2025);
      const balkenSvg = balken(daten, 340, {});
      const kurveSvg = kurve(daten, 340, {});
      pruefe(balkenSvg.querySelectorAll('.dg-treffer').length === 12, 'Es fehlen antippbare Monate.');
      pruefe(balkenSvg.querySelectorAll('.dg-balken').length > 0, 'Keine Balken gezeichnet.');
      const linie = kurveSvg.querySelector('.dg-linie');
      pruefe(linie && linie.getAttribute('d').startsWith('M'), 'Kurvenpfad fehlt.');
      pruefe(!/NaN/.test(kurveSvg.innerHTML + balkenSvg.innerHTML), 'Im Diagramm steckt ein NaN.');
      return `Balken und Kurve für ${daten.jahr}`;
    },
  },
  {
    name: 'Textumbruch im PDF',
    bereich: 'pdf',
    async lauf() {
      const zeilen = _intern.umbrich('Zahnriemenwechsel einschließlich Wasserpumpe und Spannrolle', 9.5, 120);
      pruefe(zeilen.length > 1, 'Langer Text wurde nicht umbrochen.');
      for (const zeile of zeilen) {
        pruefe(_intern.breiteVon(zeile, 9.5) <= 120.5, `Zeile zu breit: ${zeile}`);
      }
      const einzeln = _intern.umbrich('Donaudampfschifffahrtsgesellschaftskapitaen', 9.5, 60);
      pruefe(einzeln.length > 1, 'Überlanges Einzelwort wurde nicht getrennt.');
      pruefe(_intern.winAnsi('äöü ß €').length === 7, 'Umlaute werden nicht als je ein Byte kodiert.');
      return `${zeilen.length} Zeilen, Trennung greift`;
    },
  },
  {
    name: 'PDF erzeugen',
    bereich: 'pdf',
    async lauf() {
      const probe = testSeite();
      const kopf = new Uint8Array(await probe.blob.slice(0, 8).arrayBuffer());
      const marke = String.fromCharCode(...kopf.slice(0, 5));
      pruefe(marke === '%PDF-', `Datei beginnt nicht mit %PDF-, sondern mit ${marke}`);
      pruefe(probe.bytes > 800, 'Datei verdächtig klein.');

      // Viele Einträge, damit der Seitenumbruch wirklich einmal läuft.
      const viele = [];
      for (let i = 0; i < 90; i += 1) {
        viele.push(normalisiere({
          datum: plusTage('2024-01-01', i * 4),
          km: 100000 + i * 350,
          art: 'inspektion',
          text: 'Inspektion, Ölwechsel, Bremsflüssigkeit gewechselt und Achsvermessung',
          kosten: 12900,
          werkstatt: 'Werkstatt am Ring',
        }));
      }
      const gross = erzeugePDF({
        eintraege: viele.reverse(),
        einstellungen: ladeEinstellungen(),
        statistik: statistik(viele),
      });
      pruefe(gross.seiten > 1, 'Kein Seitenumbruch bei 90 Einträgen.');

      /* Ein Beleg muss als JPEG in der Datei landen — mit /DCTDecode und
         einer eigenen Seite. */
      const mitBeleg = normalisiere({
        datum: '2026-01-01', km: 100000, art: 'reparatur', text: 'Mit Beleg', belege: ['b1'],
      });
      const einJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
      const mitBild = erzeugePDF({
        eintraege: [mitBeleg],
        einstellungen: ladeEinstellungen(),
        statistik: statistik([mitBeleg]),
        belege: [{ id: 'b1', eintragId: mitBeleg.id, breite: 800, hoehe: 1200, bytes: einJpeg }],
      });
      const roh = await mitBild.blob.text();
      pruefe(roh.includes('/DCTDecode'), 'Das Bild wurde nicht als JPEG eingebettet.');
      pruefe(roh.includes('/Im1 Do'), 'Das Bild wird auf keiner Seite gezeichnet.');
      pruefe(mitBild.seiten === 2, `Erwartet 2 Seiten (Tabelle + Beleg), bekommen ${mitBild.seiten}.`);
      const ende = new Uint8Array(await gross.blob.slice(-6).arrayBuffer());
      pruefe(String.fromCharCode(...ende).includes('%%EOF'), 'Datei endet nicht auf %%EOF.');
      return `Testseite ${(probe.bytes / 1024).toFixed(1)} KB · 90 Einträge auf ${gross.seiten} Seiten · Beleg eingebettet`;
    },
  },
  {
    name: 'Fassung und Offline-Speicher',
    bereich: 'ui',
    async lauf() {
      if (!('serviceWorker' in navigator)) return 'Kein Service Worker in diesem Browser';
      const antwort = await fetch('sw.js', { cache: 'no-store' });
      const text = await antwort.text();
      const treffer = text.match(/const CACHE = '([^']+)'/);
      pruefe(treffer, 'Im Service Worker steht kein Cache-Name.');
      pruefe(treffer[1] === `bordbuch-${BUILD}`,
        `Fassung und Cache passen nicht zusammen: ${BUILD} gegen ${treffer[1]}`);
      const registrierung = await navigator.serviceWorker.getRegistration();
      return `${BUILD} · Service Worker ${registrierung ? 'aktiv' : 'nicht registriert'}`;
    },
  },
];

/** Alle Tests der Reihe nach. `beiErgebnis` wird nach jedem Test
    aufgerufen, damit die Liste sichtbar wächst. */
export async function laufeAlle(beiErgebnis) {
  const ergebnisse = [];

  for (const test of TESTS) {
    const start = performance.now();
    let ergebnis;
    try {
      const info = await test.lauf();
      ergebnis = { name: test.name, bereich: test.bereich, ok: true, info: info || '' };
    } catch (error) {
      ergebnis = { name: test.name, bereich: test.bereich, ok: false, info: error.message };
      fehler(test.bereich, `Selbsttest „${test.name}“ fehlgeschlagen`, error);
    }
    ergebnis.ms = Math.round(performance.now() - start);
    ergebnisse.push(ergebnis);
    if (beiErgebnis) beiErgebnis(ergebnis, ergebnisse);
  }

  const durchgefallen = ergebnisse.filter((eintrag) => !eintrag.ok).length;
  log('ui', 'Selbsttest beendet', { tests: ergebnisse.length, durchgefallen });
  return ergebnisse;
}

export const anzahlTests = TESTS.length;
