/* Testdaten für die Diagnose: zwei Jahre Fahrzeugleben, plausibel
   verteilt. Jeder erzeugte Eintrag trägt `demo: true` und lässt sich
   deshalb später gezielt wieder entfernen, ohne echte Einträge zu
   berühren.

   Enthalten sind auch regelmäßige Tankungen — ohne sie hätte die
   Verbrauchsansicht nichts zu zeigen, und genau die will man beim
   Ausprobieren sehen. */

import { normalisiere } from './eintraege.js';
import { plusTage, heuteISO, uid } from './util.js';

/* Im Sommer wird mehr gefahren als im Winter — sonst sähe die Jahreskurve
   aus wie eine Gerade und würde nichts zeigen. */
const SAISON = [0.7, 0.75, 0.95, 1.05, 1.2, 1.35, 1.4, 1.3, 1.1, 0.95, 0.8, 0.85];

/* Und im Winter braucht der Wagen mehr: Kaltstarts, Heizung, Winterreifen.
   Das ist der Grund, warum die Verbrauchskurve überhaupt eine Kurve ist. */
const VERBRAUCH = [7.8, 7.6, 7.1, 6.7, 6.4, 6.2, 6.1, 6.2, 6.5, 6.9, 7.4, 7.7];

const WERKSTATT = [
  { nach: 0,   art: 'inspektion', text: 'Gekauft, Zustand aufgenommen', kosten: null },
  { nach: 71,  art: 'reifen',     text: 'Sommerreifen aufgezogen', kosten: 4500 },
  { nach: 186, art: 'bremsen',    text: 'Bremsbeläge vorne erneuert', kosten: 24800 },
  { nach: 243, art: 'pflege',     text: 'Innenraum und Lack aufbereitet', kosten: 6000 },
  { nach: 288, art: 'reifen',     text: 'Winterreifen aufgezogen', kosten: 4500 },
  { nach: 341, art: 'inspektion', text: 'Große Inspektion nach Herstellervorgabe', kosten: 42900 },
  { nach: 402, art: 'oel',        text: 'Motoröl und Ölfilter gewechselt', kosten: 9200 },
  { nach: 465, art: 'hu',         text: 'Hauptuntersuchung bestanden, ohne Mängel', kosten: 13500 },
  { nach: 522, art: 'reparatur',  text: 'Radlager hinten links getauscht', kosten: 31500 },
  { nach: 587, art: 'reifen',     text: 'Sommerreifen aufgezogen, Profil 5,5 mm', kosten: 4500 },
  { nach: 651, art: 'oel',        text: 'Motoröl und Ölfilter gewechselt', kosten: 9400 },
  { nach: 705, art: 'sonstiges',  text: 'Scheibenwischer und Innenraumfilter erneuert', kosten: 5400 },
];

const TAGE = 730;
const KM_JE_TAG = 45;

export function erzeugeDemo({ startKm = 84500 } = {}) {
  const start = plusTage(heuteISO(), -TAGE);

  /* Erst der Kilometerstand für jeden Tag — Werkstattbesuche und
     Tankungen lesen ihn danach nur noch ab. So passen beide zueinander,
     und der Verbrauch ergibt sich aus derselben Strecke, die auch im
     Kilometerdiagramm steht. */
  const standAm = [startKm];
  for (let tag = 1; tag <= TAGE; tag += 1) {
    const monat = Number(plusTage(start, tag).slice(5, 7)) - 1;
    standAm.push(standAm[tag - 1] + Math.round(KM_JE_TAG * SAISON[monat]));
  }

  const eintraege = [];
  const lege = (tag, felder) => {
    eintraege.push(normalisiere({
      id: `demo-${uid()}`,
      datum: plusTage(start, tag),
      km: standAm[tag],
      demo: true,
      ...felder,
    }));
  };

  for (const termin of WERKSTATT) {
    lege(termin.nach, {
      art: termin.art,
      text: termin.text,
      kosten: termin.kosten,
      werkstatt: termin.art === 'pflege' ? '' : 'Werkstatt am Ring',
    });
  }

  /* Getankt wird etwa alle fünf Wochen. Jede sechste Füllung ist eine
     Teilbetankung — die Rechnung muss auch damit stimmen, und wer die
     App ausprobiert, soll genau das sehen können. */
  let letzteTankung = 0;        // Tag der letzten Tankung, gleich welcher Art
  let verbrauchtSeitVoll = 0;   // Liter, die seit dem letzten vollen Tank draufgingen
  let nachgetankt = 0;          // Liter, die seitdem schon nachgefüllt wurden
  let nummer = 0;

  for (let tag = 12; tag <= TAGE; tag += 34 + (nummer % 3)) {
    const monat = Number(plusTage(start, tag).slice(5, 7)) - 1;
    const gefahren = standAm[tag] - standAm[letzteTankung];
    verbrauchtSeitVoll += (gefahren * VERBRAUCH[monat]) / 100;

    const teilbetankung = nummer > 0 && nummer % 6 === 0;

    /* Wer volltankt, füllt genau das nach, was seit dem letzten vollen
       Tank verbraucht und noch nicht nachgefüllt wurde. Sonst käme in der
       App ein zu hoher Verbrauch heraus — die Teilbetankung wäre doppelt
       gezählt. */
    const menge = teilbetankung
      ? 22 + (nummer % 5)
      : Math.max(5, verbrauchtSeitVoll - nachgetankt);

    // Preis läuft über die zwei Jahre leicht nach oben, mit Ausschlägen.
    const preisJeLiter = 1.62 + (tag / TAGE) * 0.24 + ((nummer % 4) - 1.5) * 0.035;

    lege(tag, {
      art: 'tanken',
      text: teilbetankung ? 'Zwischendurch nachgetankt' : 'Vollgetankt',
      liter: Math.round(menge * 1000),
      voll: !teilbetankung,
      kosten: Math.round(menge * preisJeLiter * 100),
    });

    if (teilbetankung) {
      nachgetankt += menge;
    } else {
      verbrauchtSeitVoll = 0;
      nachgetankt = 0;
    }

    letzteTankung = tag;
    nummer += 1;
  }

  return eintraege;
}

export const istDemo = (eintrag) => eintrag.demo === true;
