/* Die Uhr einer laufenden Einheit. Sie zählt nichts mit, sondern misst
   die verstrichene Zeit und fragt standBei(), wo die Einheit steht.

   Zwei Takte treiben sie: requestAnimationFrame für die Bemaßung, die
   flüssig wachsen soll, und ein Intervall von 250 ms für Ton und Ansage
   — das Bild steht still, sobald die Seite verdeckt ist, der Takt läuft
   gedrosselt weiter. Beide rufen dieselbe Funktion; doppelt schadet nicht.

   Date.now() statt performance.now(): Manche Telefone halten die
   Seitenuhr an, wenn das Gerät kurz schläft. Die Wanduhr läuft weiter —
   wie der Springende auch. */

import { standBei } from './rechnen.js';

export function Uhr(liste, { beiWechsel, beiSekunde, beiBild, beiEnde }) {
  let gesammelt = 0;     // ms bis zum letzten Anhalten
  let seit = null;       // Zeitpunkt des letzten Starts, null = angehalten
  let bild = 0;
  let takt = 0;
  let index = -1;
  let sekunde = null;
  let beendet = false;

  const t = () => (gesammelt + (seit === null ? 0 : Date.now() - seit)) / 1000;

  function halte() {
    cancelAnimationFrame(bild);
    clearInterval(takt);
    bild = 0;
    takt = 0;
  }

  function schritt() {
    if (beendet) return;
    const stand = standBei(liste, t());
    if (stand.index !== index) {
      const war = index;
      index = stand.index;
      beiWechsel(stand, war);
    }
    /* Angezeigt wird aufgerundet: 30 steht die erste Sekunde lang da,
       1 die letzte. Die 0 erscheint nie — dann beginnt schon die nächste
       Phase. Nur am Ende der Einheit steht 0:00. */
    const s = Math.max(0, Math.ceil(stand.rest - 1e-6));
    if (s !== sekunde) {
      sekunde = s;
      beiSekunde(stand, s);
    }
    beiBild(stand);
    if (stand.fertig) {
      beendet = true;
      if (seit !== null) { gesammelt += Date.now() - seit; seit = null; }
      halte();
      beiEnde(stand);
    }
  }

  function schleife() {
    schritt();
    if (seit !== null && !beendet) bild = requestAnimationFrame(schleife);
  }

  return {
    los() {
      if (seit !== null || beendet) return;
      seit = Date.now();
      bild = requestAnimationFrame(schleife);
      takt = setInterval(schritt, 250);
      schritt();
    },
    halt() {
      if (seit === null) return;
      gesammelt += Date.now() - seit;
      seit = null;
      halte();
    },
    /** Beendet die Uhr und liefert den Stand, an dem sie stand. */
    aus() {
      if (seit !== null) { gesammelt += Date.now() - seit; seit = null; }
      beendet = true;
      halte();
      return standBei(liste, t());
    },
    stand: () => standBei(liste, t()),
    get laeuft() { return seit !== null; },
  };
}
