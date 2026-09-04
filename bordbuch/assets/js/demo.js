/* Testdaten für die Diagnose: zwei Jahre Fahrzeugleben, plausibel
   verteilt. Jeder erzeugte Eintrag trägt `demo: true` und lässt sich
   deshalb später gezielt wieder entfernen, ohne echte Einträge zu
   berühren. */

import { normalisiere } from './eintraege.js';
import { plusTage, heuteISO, uid } from './util.js';

/* Im Sommer wird mehr gefahren als im Winter — sonst sähe die Jahreskurve
   aus wie eine Gerade und würde nichts zeigen. */
const SAISON = [0.7, 0.75, 0.95, 1.05, 1.2, 1.35, 1.4, 1.3, 1.1, 0.95, 0.8, 0.85];

const ABLAUF = [
  { nach: 0,   art: 'inspektion', text: 'Gekauft, Zustand aufgenommen', kosten: null },
  { nach: 34,  art: 'oel',        text: 'Motoröl und Ölfilter gewechselt', kosten: 8900 },
  { nach: 71,  art: 'reifen',     text: 'Sommerreifen aufgezogen', kosten: 4500 },
  { nach: 128, art: 'tanken',     text: 'Vollgetankt', kosten: 8250 },
  { nach: 186, art: 'bremsen',    text: 'Bremsbeläge vorne erneuert', kosten: 24800 },
  { nach: 243, art: 'pflege',     text: 'Innenraum und Lack aufbereitet', kosten: 6000 },
  { nach: 288, art: 'reifen',     text: 'Winterreifen aufgezogen', kosten: 4500 },
  { nach: 341, art: 'inspektion', text: 'Große Inspektion nach Herstellervorgabe', kosten: 42900 },
  { nach: 402, art: 'oel',        text: 'Ölwechsel', kosten: 9200 },
  { nach: 465, art: 'hu',         text: 'Hauptuntersuchung bestanden, ohne Mängel', kosten: 13500 },
  { nach: 522, art: 'reparatur',  text: 'Radlager hinten links getauscht', kosten: 31500 },
  { nach: 587, art: 'reifen',     text: 'Sommerreifen aufgezogen, Profil 5,5 mm', kosten: 4500 },
  { nach: 651, art: 'oel',        text: 'Motoröl und Ölfilter gewechselt', kosten: 9400 },
  { nach: 705, art: 'sonstiges',  text: 'Scheibenwischer und Innenraumfilter erneuert', kosten: 5400 },
];

export function erzeugeDemo({ startKm = 84500 } = {}) {
  const start = plusTage(heuteISO(), -730);
  const eintraege = [];
  let km = startKm;
  let letzterTag = 0;

  for (const schritt of ABLAUF) {
    const datum = plusTage(start, schritt.nach);
    const tage = schritt.nach - letzterTag;
    const monat = Number(datum.slice(5, 7)) - 1;
    // Grundleistung rund 45 km je Tag, mit dem Faktor der Jahreszeit.
    km += Math.round(tage * 45 * SAISON[monat]);
    letzterTag = schritt.nach;

    eintraege.push(normalisiere({
      id: `demo-${uid()}`,
      datum,
      km,
      art: schritt.art,
      text: schritt.text,
      kosten: schritt.kosten,
      werkstatt: schritt.art === 'tanken' || schritt.art === 'pflege' ? '' : 'Werkstatt am Ring',
      demo: true,
    }));
  }

  return eintraege;
}

export const istDemo = (eintrag) => eintrag.demo === true;
