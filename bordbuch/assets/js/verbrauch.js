/* Was das Auto wirklich verbraucht.

   Die Rechnung ist die klassische Voll-zu-Voll-Methode, und sie ist die
   einzige, die stimmt:

   Wer volltankt, weiß danach genau, wie viel im Tank ist — nämlich voll.
   Tankt er später wieder voll, füllt er exakt die Menge nach, die er
   dazwischen verbraucht hat. Auf die Strecke dazwischen bezogen ergibt
   das den tatsächlichen Verbrauch.

   Daraus folgen drei Dinge, die die Oberfläche auch so erklärt:

   1. Der erste volle Tank zählt nur als Startpunkt. Wie viel vor ihm
      verbraucht wurde, weiß niemand.
   2. Teilbetankungen dazwischen gehen voll in die Rechnung ein — sie
      liegen ja auch im Tank. Nur den Abschluss muss ein voller Tank
      bilden.
   3. Ohne mindestens zwei volle Tankfüllungen gibt es kein Ergebnis.
      Eine Schätzung wäre hier schlimmer als gar keine Zahl.

   Alle Mengen in Millilitern, alle Beträge in Cent — ganzzahlig. */

import { tageZwischen } from './util.js';
import { sortiere } from './eintraege.js';
import { log } from './debug.js';

const istTankung = (eintrag) => eintrag.art === 'tanken' && eintrag.liter > 0;

/* Grenzen der Plausibilität. Wer eine Tankfüllung zu notieren vergisst,
   erzeugt eine Messung über 12.000 km mit einer einzigen Füllung — das
   sind rechnerisch 0,4 L/100 km. Solche Werte sind kein Sparrekord,
   sondern eine Lücke, und sie würden den Schnitt ruinieren.

   Deshalb: Messungen außerhalb dieses Fensters werden gezeigt, aber nicht
   mitgemittelt. Verschwiegen wird nichts — die Ansicht sagt, wie viele
   es sind und woran es liegt. */
const UNTERGRENZE = 2;
const OBERGRENZE = 30;

/** Alle Messstrecken zwischen zwei vollen Tankfüllungen. */
export function messungen(liste) {
  const tankungen = sortiere(liste).filter(istTankung);
  const raus = [];

  let start = null;         // die letzte volle Tankfüllung
  let offen = [];           // Tankungen seit dieser vollen Füllung

  for (const tankung of tankungen) {
    if (!start) {
      // Vor der ersten vollen Füllung lässt sich nichts messen.
      if (tankung.voll) start = tankung;
      continue;
    }

    offen.push(tankung);
    if (!tankung.voll) continue;

    const km = tankung.km - start.km;
    const liter = offen.reduce((summe, eintrag) => summe + eintrag.liter, 0);
    const kosten = offen.reduce((summe, eintrag) => summe + (eintrag.kosten || 0), 0);

    // Ein Rückwärtssprung oder eine Strecke von null ergibt keinen Wert.
    if (km > 0 && liter > 0) {
      const verbrauch = (liter / 1000 / km) * 100;
      raus.push({
        plausibel: verbrauch >= UNTERGRENZE && verbrauch <= OBERGRENZE,
        von: start,
        bis: tankung,
        datum: tankung.datum,
        km,
        tage: tageZwischen(start.datum, tankung.datum),
        liter,
        kosten,
        tankungen: offen.length,
        // Liter je 100 km, auf eine Nachkommastelle gerundet erst in der Anzeige.
        verbrauch,
        // Cent je Liter und Cent je 100 km.
        preisJeLiter: kosten ? (kosten / (liter / 1000)) : null,
        kostenJe100: kosten ? (kosten / km) * 100 : null,
      });
    }

    start = tankung;
    offen = [];
  }

  log('auswertung', 'Verbrauch berechnet', {
    tankungen: tankungen.length,
    messungen: raus.length,
    offen: offen.length,
  });

  return raus;
}

/** Zusammenfassung über alle Messungen — plus die Angaben, die auch ohne
    Messung schon feststehen (getankte Menge, Spritkosten). */
export function verbrauchsBilanz(liste) {
  const alleTankungen = sortiere(liste).filter(istTankung);
  const reihe = messungen(liste);

  const literGesamt = alleTankungen.reduce((summe, eintrag) => summe + eintrag.liter, 0);
  const kostenGesamt = alleTankungen.reduce((summe, eintrag) => summe + (eintrag.kosten || 0), 0);

  // Gemittelt wird nur über das, was ein Auto wirklich verbrauchen kann.
  const gute = reihe.filter((messung) => messung.plausibel);
  const unplausibel = reihe.length - gute.length;

  if (!gute.length) {
    return {
      reihe,
      tankungen: alleTankungen.length,
      volle: alleTankungen.filter((eintrag) => eintrag.voll).length,
      literGesamt,
      kostenGesamt,
      unplausibel,
      messstrecke: 0,
      schnitt: null,
      bester: null,
      schlechtester: null,
      letzter: null,
      preisJeLiter: literGesamt ? kostenGesamt / (literGesamt / 1000) : null,
      kostenJe100: null,
    };
  }

  /* Der Schnitt wird über die Summen gebildet, nicht als Mittel der
     Einzelwerte: Eine kurze Stadtstrecke soll nicht so schwer wiegen wie
     eine lange Fahrt. */
  const kmSumme = gute.reduce((summe, messung) => summe + messung.km, 0);
  const literSumme = gute.reduce((summe, messung) => summe + messung.liter, 0);
  const kostenSumme = gute.reduce((summe, messung) => summe + messung.kosten, 0);

  const nachVerbrauch = gute.slice().sort((a, b) => a.verbrauch - b.verbrauch);

  return {
    reihe,
    tankungen: alleTankungen.length,
    volle: alleTankungen.filter((eintrag) => eintrag.voll).length,
    literGesamt,
    kostenGesamt,
    unplausibel,
    messstrecke: kmSumme,
    schnitt: (literSumme / 1000 / kmSumme) * 100,
    bester: nachVerbrauch[0],
    schlechtester: nachVerbrauch[nachVerbrauch.length - 1],
    letzter: gute[gute.length - 1],
    preisJeLiter: kostenSumme ? kostenSumme / (literSumme / 1000) : null,
    kostenJe100: kostenSumme ? (kostenSumme / kmSumme) * 100 : null,
  };
}

/** Warum es (noch) kein Ergebnis gibt — als Satz, den die App anzeigt. */
export function fehlenderGrund(bilanz) {
  if (bilanz.tankungen === 0) {
    return 'Trag beim Tanken die Literzahl mit ein. Nach der zweiten vollen '
      + 'Tankfüllung steht hier, was der Wagen wirklich verbraucht.';
  }
  if (bilanz.volle === 0) {
    return 'Bisher ist keine Tankfüllung als „vollgetankt“ markiert. Nur zwischen '
      + 'zwei vollen Tanks steht fest, wie viel tatsächlich verbraucht wurde.';
  }
  if (bilanz.volle === 1) {
    return 'Ein voller Tank ist eingetragen — er ist der Startpunkt. Ab der '
      + 'nächsten vollen Tankfüllung wird gerechnet.';
  }
  if (bilanz.unplausibel) {
    return `${bilanz.unplausibel === 1 ? 'Eine Messung liegt' : `${bilanz.unplausibel} Messungen liegen`} `
      + `außerhalb dessen, was ein Auto verbrauchen kann (${UNTERGRENZE} bis ${OBERGRENZE} L/100 km). `
      + 'Meist fehlt dazwischen eine Tankfüllung. Nachtragen genügt.';
  }
  return 'Zwischen den vollen Tankfüllungen liegt keine gefahrene Strecke. '
    + 'Bitte die Kilometerstände prüfen.';
}

/** Satz für die Fußnote, wenn einzelne Messungen aussortiert wurden. */
export function unplausibelHinweis(bilanz) {
  if (!bilanz.unplausibel) return '';
  return ` ${bilanz.unplausibel === 1 ? 'Eine Messung' : `${bilanz.unplausibel} Messungen`} `
    + `außerhalb von ${UNTERGRENZE}–${OBERGRENZE} L/100 km ${bilanz.unplausibel === 1 ? 'ist' : 'sind'} `
    + 'nicht eingerechnet — dort fehlt vermutlich eine Tankfüllung.';
}
