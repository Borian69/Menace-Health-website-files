/* Prüft alles, was gerechnet wird — ohne Browser.
   Aufruf:  node sprungseil/tools/pruefe.mjs

   Jede Prüfung nennt, was sie abfängt. Eine Zahl, die die App behauptet,
   steht hier mit ihrer Rechnung. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { alsDate, istISO, plusTage, tageZwischen, wochenStart, kalenderwoche, datumLang, datumKurz } from '../assets/js/datum.js';
import { ganz, dez, vorzeichen, uhr, sekText, stundenText, liesZahl } from '../assets/js/zahl.js';
import {
  EINHEITEN, STUFEN, TEMPO, kcalNetto, fettGramm, tempoAus, bilanz, springzeit, pausenzeit, dauer, einheitVon,
  pruefeEigene, wochenSumme, letzteWochen, gewichtAm, gleitend, gewichtTrend, empfehlung, phasen, standBei,
} from '../assets/js/rechnen.js';
import { ausSicherung, alsSicherung } from '../assets/js/store.js';
import { BUILD } from '../assets/js/fassung.js';

const hier = dirname(fileURLToPath(import.meta.url));
let bestanden = 0;
const fehler = [];

function pruefe(name, fn) {
  try {
    fn();
    bestanden += 1;
    console.log(`  BESTANDEN  ${name}`);
  } catch (e) {
    fehler.push(name);
    console.log(`  FEHLER     ${name}\n             ${e.message.split('\n').join('\n             ')}`);
  }
}
const nahe = (ist, soll, toleranz = 1e-6) => assert.ok(Math.abs(ist - soll) <= toleranz, `${ist} ist nicht ≈ ${soll}`);

console.log('\nSprungseil · Prüfung\n');

pruefe('Datum: Sommerzeit, Schaltjahr, Jahreswechsel', () => {
  assert.equal(plusTage('2026-03-28', 1), '2026-03-29');
  assert.equal(plusTage('2026-03-29', 1), '2026-03-30');      // Umstellung auf Sommerzeit
  assert.equal(tageZwischen('2026-10-24', '2026-10-26'), 2);  // Umstellung auf Winterzeit
  assert.equal(plusTage('2028-02-28', 1), '2028-02-29');
  assert.equal(plusTage('2026-12-31', 1), '2027-01-01');
  assert.ok(istISO('2028-02-29'));
  assert.ok(!istISO('2026-02-29'));
  assert.ok(!istISO('19.10.2026'));
  assert.equal(alsDate('2026-10-19').getHours(), 12);
});

pruefe('Woche beginnt am Montag, Kalenderwoche nach ISO', () => {
  assert.equal(wochenStart('2026-10-19'), '2026-10-19');      // Montag
  assert.equal(wochenStart('2026-10-25'), '2026-10-19');      // Sonntag
  assert.equal(wochenStart('2027-01-01'), '2026-12-28');      // über den Jahreswechsel
  assert.equal(kalenderwoche('2026-10-19'), 43);
  assert.equal(kalenderwoche('2026-01-01'), 1);
  assert.equal(kalenderwoche('2027-01-01'), 53);              // 2026 hat 53 Wochen
  assert.equal(kalenderwoche('2025-12-29'), 1);
  assert.equal(datumLang('2026-10-19'), '19.10.2026');
  assert.equal(datumKurz('2026-10-19'), '19.10.');
});

pruefe('Zahlen lesen und setzen', () => {
  assert.equal(liesZahl('84,2'), 84.2);
  assert.equal(liesZahl('84.2'), 84.2);
  assert.equal(liesZahl(' 1.234 '), 1234);
  assert.equal(liesZahl('1 234'), 1234);
  assert.ok(Number.isNaN(liesZahl('')));
  assert.ok(Number.isNaN(liesZahl('84,2,1')));
  assert.ok(Number.isNaN(liesZahl('-3')));
  assert.equal(ganz(1234.4), '1.234');
  assert.equal(dez(84.25, 1), '84,3');
  assert.equal(vorzeichen(-0.34), '−0,3');
  assert.equal(vorzeichen(0.04), '±0,0');
  assert.equal(vorzeichen(1.2), '+1,2');
  assert.equal(uhr(450), '7:30');
  assert.equal(uhr(9), '0:09');
  assert.equal(uhr(3725), '1:02:05');
  assert.equal(sekText(45), '45 s');
  assert.equal(sekText(180), '3 min');
  assert.equal(stundenText(15120), '4 h 12 min');
});

pruefe('Stufen: Springzeit wächst von 5 auf 15 Minuten', () => {
  const minuten = STUFEN.map((e) => springzeit(e) / 60);
  assert.deepEqual(minuten, [5, 7.5, 8, 10, 15]);
  for (let i = 1; i < minuten.length; i += 1) assert.ok(minuten[i] > minuten[i - 1], 'jede Stufe springt länger');
  const einstieg = einheitVon('einstieg');
  assert.equal(pausenzeit(einstieg), 9 * 30);                 // nach der letzten Runde keine Pause
  assert.equal(dauer(einstieg), 570);
  assert.equal(uhr(dauer(einheitVon('tabata'))), '3:50');
});

pruefe('Eigene Einheit: Grenzen und Rückfall', () => {
  assert.ok(pruefeEigene({ runden: 8, springen: 40, pause: 20 }).ok);
  assert.ok(pruefeEigene({ runden: 1, springen: 5, pause: 0 }).ok);
  const falsch = pruefeEigene({ runden: 0, springen: 4.5, pause: 301 });
  assert.ok(!falsch.ok);
  assert.deepEqual(Object.keys(falsch.fehler).sort(), ['pause', 'runden', 'springen']);
  const e = einheitVon('eigene', { runden: 12, springen: 30, pause: 15 });
  assert.equal(dauer(e), 12 * 30 + 11 * 15);
  assert.equal(einheitVon('gibt-es-nicht').id, 'einstieg');
});

pruefe('Kalorien netto nach MET: 80 kg, 7:30 min mittel, 9 Pausen à 30 s', () => {
  // (11,8 − 1) · 3,5 · 80 / 200 = 15,12 kcal/min · 7,5 = 113,4
  nahe(kcalNetto(TEMPO.mittel.met, 80, 450), 113.4);
  // (2,5 − 1) · 3,5 · 80 / 200 = 2,1 kcal/min · 4,5 = 9,45
  const b = bilanz({ springSek: 450, pauseSek: 270, tempo: 'mittel', kg: 80 });
  nahe(b.kcal, 122.85);
  assert.equal(b.spruenge, 825);
  nahe(b.fett, (122.85 / 7700) * 1000);
  assert.equal(kcalNetto(11.8, null, 450), null, 'ohne Gewicht keine Zahl');
  assert.equal(fettGramm(null), null);
});

pruefe('Gezählte Sprünge bestimmen das Tempo', () => {
  assert.equal(tempoAus(99.9), 'ruhig');
  assert.equal(tempoAus(100), 'mittel');
  assert.equal(tempoAus(120), 'mittel');
  assert.equal(tempoAus(121), 'schnell');
  const b = bilanz({ springSek: 300, tempo: 'schnell', kg: 70, gezaehlt: 450 });   // 90 pro Minute
  assert.equal(b.tempo, 'ruhig');
  assert.equal(b.met, 8.8);
  assert.ok(b.gemessen);
  assert.equal(b.spruenge, 450);
  nahe(b.kadenz, 90);
});

const einheit = (datum, art, extra = {}) => ({
  id: `${datum}-${art}`, datum, zeit: `${datum}T18:00:00`, art, runden: 10, rundenFertig: 10, vollstaendig: true,
  springSek: 300, dauerSek: 570, kcal: 80, spruenge: 550, gefuehl: 'passend', ...extra,
});

pruefe('Woche: Trainingszeit von Montag bis Sonntag', () => {
  const liste = [einheit('2026-10-18', 'einstieg'), einheit('2026-10-19', 'einstieg'), einheit('2026-10-25', 'aufbau', { dauerSek: 720 })];
  const w = wochenSumme(liste, '2026-10-19');
  assert.equal(w.anzahl, 2);
  assert.equal(w.minuten, Math.floor((570 + 720) / 60));
  assert.equal(w.kcal, 160);
  const acht = letzteWochen(liste, '2026-10-21', 8);
  assert.equal(acht.length, 8);
  assert.equal(acht[7].start, '2026-10-19');
  assert.equal(acht[6].anzahl, 1);
  assert.equal(acht[0].start, '2026-08-31');
});

pruefe('Plan: hoch nach zwei guten, wiederholen nach hart oder Abbruch', () => {
  assert.equal(empfehlung([]).id, 'einstieg');
  assert.equal(empfehlung([]).grund, 'erste');
  const eins = [einheit('2026-10-01', 'einstieg')];
  assert.equal(empfehlung(eins).id, 'einstieg');
  assert.equal(empfehlung(eins).grund, 'nochmal');
  const zwei = [...eins, einheit('2026-10-03', 'einstieg')];
  assert.deepEqual([empfehlung(zwei).id, empfehlung(zwei).grund], ['aufbau', 'zweimal']);
  const hart = [...zwei, einheit('2026-10-05', 'aufbau', { gefuehl: 'hart' })];
  assert.deepEqual([empfehlung(hart).id, empfehlung(hart).grund], ['aufbau', 'hart']);
  const leicht = [...hart, einheit('2026-10-07', 'aufbau', { gefuehl: 'leicht' })];
  assert.deepEqual([empfehlung(leicht).id, empfehlung(leicht).grund], ['ausdauer', 'leicht']);
  const abbruch = [...leicht, einheit('2026-10-09', 'ausdauer', { vollstaendig: false, rundenFertig: 5 })];
  assert.deepEqual([empfehlung(abbruch).id, empfehlung(abbruch).grund], ['ausdauer', 'abgebrochen']);
  const mitTabata = [...zwei, einheit('2026-10-04', 'tabata', { gefuehl: 'hart' })];
  assert.equal(empfehlung(mitTabata).id, 'aufbau', 'Tabata zählt nicht zum Plan');
  const oben = [einheit('2026-10-01', 'lang'), einheit('2026-10-03', 'lang')];
  assert.deepEqual([empfehlung(oben).id, empfehlung(oben).grund], ['lang', 'oben']);
});

pruefe('Gewicht: Tag, gleitender Schnitt, Tempo erst ab einer Woche', () => {
  const g = [
    { datum: '2026-10-01', kg: 86.0 },
    { datum: '2026-10-03', kg: 85.6 },
    { datum: '2026-10-05', kg: 85.8 },
  ];
  assert.equal(gewichtAm(g, '2026-10-04'), 85.6);
  assert.equal(gewichtAm(g, '2026-09-01'), 86.0, 'vor der ersten Messung gilt die erste');
  assert.equal(gewichtAm([], '2026-10-04'), null);
  const gl = gleitend(g);
  nahe(gl[2].trend, (86.0 + 85.6 + 85.8) / 3);
  assert.equal(gewichtTrend(g).proWoche, null, 'vier Tage reichen nicht für ein Tempo');

  // 0,1 kg weniger je Tag über drei Wochen: −0,7 kg pro Woche
  const lang = Array.from({ length: 22 }, (_, i) => ({ datum: plusTage('2026-09-01', i), kg: 90 - i * 0.1 }));
  const t = gewichtTrend(lang, 85);
  nahe(t.proWoche, -0.7, 1e-9);
  nahe(t.aktuell, (lang.slice(-7).reduce((s, x) => s + x.kg, 0)) / 7);
  assert.ok(t.zielDatum > '2026-09-22');
  assert.equal(t.erreicht, false);
  assert.equal(gewichtTrend(lang, 95).zielDatum, null, 'Ziel in der falschen Richtung: kein Datum');
  assert.equal(gewichtTrend([]), null);
});

pruefe('Ablauf: Phasen, Vorlauf, Stand nach t Sekunden', () => {
  const e = einheitVon('einstieg');
  const liste = phasen(e, 10);
  assert.equal(liste.length, 1 + 10 + 9);
  assert.equal(liste[0].art, 'vorlauf');
  assert.equal(liste[liste.length - 1].art, 'springen');
  assert.equal(liste[liste.length - 1].bis, 10 + 570);

  const s0 = standBei(liste, 0);
  assert.equal(s0.phase.art, 'vorlauf');
  assert.equal(s0.rest, 10);
  assert.equal(s0.verstrichen, 0);

  const s1 = standBei(liste, 10 + 30 + 5);     // fünf Sekunden in der ersten Pause
  assert.equal(s1.phase.art, 'pause');
  assert.equal(s1.runden, 1);
  assert.equal(s1.springSek, 30);
  assert.equal(s1.pauseSek, 5);
  assert.equal(s1.naechste.art, 'springen');

  const ende = standBei(liste, 10000);
  assert.ok(ende.fertig);
  assert.equal(ende.runden, 10);
  assert.equal(ende.springSek, 300);
  assert.equal(ende.pauseSek, 270);
  assert.equal(ende.verstrichen, 570);
  assert.equal(ende.naechste, null);

  const ohnePause = phasen(einheitVon('eigene', { runden: 3, springen: 60, pause: 0 }), 0);
  assert.equal(ohnePause.length, 3);
});

pruefe('Sicherung: hin und zurück, Unlesbares bleibt draußen', () => {
  const daten = {
    einstellungen: { wochenziel: 90, zielgewicht: 80, vorlauf: 5, tempo: 'schnell', toene: false },
    einheiten: [einheit('2026-10-01', 'einstieg'), { datum: 'gestern', art: 'einstieg' }],
    gewichte: [{ datum: '2026-10-01', kg: 86 }, { datum: '2026-10-01', kg: 85.8 }, { datum: '2026-10-02', kg: 12 }],
  };
  const zurueck = ausSicherung(alsSicherung(daten, BUILD));
  assert.equal(zurueck.einheiten.length, 1);
  assert.equal(zurueck.gewichte.length, 1, 'ein Eintrag je Tag');
  assert.equal(zurueck.gewichte[0].kg, 85.8, 'der zweite Wert des Tages gilt');
  assert.equal(zurueck.verworfen, 2);
  assert.equal(zurueck.einstellungen.wochenziel, 90);
  assert.equal(zurueck.einstellungen.toene, false);
  assert.equal(zurueck.einstellungen.ansage, true);
  assert.throws(() => ausSicherung('{kaputt'), /kein JSON/);
  assert.throws(() => ausSicherung('{"app":"bordbuch"}'), /keine Sicherung dieser App/);
});

pruefe('Fassung und Offline-Speicher passen zusammen', () => {
  const sw = readFileSync(join(hier, '..', 'sw.js'), 'utf8');
  assert.match(sw, new RegExp(`const CACHE = 'sprungseil-${BUILD}'`));
  const shell = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);
  for (const datei of ['assets/js/app.js', 'assets/js/rechnen.js', 'assets/app.css', '../design/moch.css']) {
    assert.ok(shell.includes(datei), `${datei} fehlt in SHELL`);
  }
  const html = readFileSync(join(hier, '..', 'index.html'), 'utf8');
  const app = readFileSync(join(hier, '..', 'assets', 'js', 'app.js'), 'utf8');
  for (const [, modul] of app.matchAll(/from '\.\/([^']+)'/g)) {
    assert.ok(shell.includes(`assets/js/${modul}`), `assets/js/${modul} fehlt in SHELL`);
  }
  assert.ok(html.includes('assets/js/app.js'));
});

pruefe('Jede Einheit hat Namen, Runden und Zeiten', () => {
  for (const e of EINHEITEN) {
    assert.ok(e.name && e.runden > 0 && e.springen > 0 && e.pause >= 0, e.id);
    assert.ok(pruefeEigene(e).ok, `${e.id} liegt in den Grenzen der eigenen Einheit`);
  }
});

console.log(`\n  ${bestanden} bestanden, ${fehler.length} fehlgeschlagen\n`);
if (fehler.length) process.exit(1);
