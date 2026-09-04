/* Monatsgitter. Die Woche beginnt am Montag — alles andere wäre in einem
   deutschen Kalender falsch. Tage aus dem Vor- und Folgemonat werden mit
   angezeigt, aber nicht angeboten: sie gehören zu einem anderen Blatt. */

import { el, isoVon, heuteISO } from './util.js';
import { log, aktiv } from './debug.js';

export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Wie viele leere Felder stehen vor dem Ersten? (Montag = 0) */
const versatz = (jahr, monat) => (new Date(jahr, monat, 1).getDay() + 6) % 7;

const tageImMonat = (jahr, monat) => new Date(jahr, monat + 1, 0).getDate();

export function gitter(jahr, monat, nachTag, { ausgewaehlt = null, beiTag } = {}) {
  const heute = heuteISO();
  const kopf = el('div', { class: 'kal-kopf' },
    WOCHENTAGE.map((tag) => el('span', { text: tag })));

  const felder = el('div', { class: 'kal-gitter' });

  const vorlauf = versatz(jahr, monat);
  const anzahl = tageImMonat(jahr, monat);

  // Vorlauf: die letzten Tage des Vormonats, sichtbar aber stumm.
  const vormonatTage = tageImMonat(monat === 0 ? jahr - 1 : jahr, (monat + 11) % 12);
  for (let i = 0; i < vorlauf; i += 1) {
    felder.append(el('div', { class: 'kal-tag fremd', text: String(vormonatTage - vorlauf + 1 + i) }));
  }

  let tageMitEintrag = 0;

  for (let tag = 1; tag <= anzahl; tag += 1) {
    const iso = isoVon(new Date(jahr, monat, tag));
    const eintraege = nachTag.get(iso) || [];
    if (eintraege.length) tageMitEintrag += 1;

    const klassen = ['kal-tag'];
    if (eintraege.length) klassen.push('hat');
    if (iso === heute) klassen.push('heute');
    if (iso === ausgewaehlt) klassen.push('an');

    const feld = el('button', {
      class: klassen.join(' '),
      type: 'button',
      'data-datum': iso,
      'aria-pressed': iso === ausgewaehlt ? 'true' : 'false',
      'aria-label': `${tag}. ${monat + 1}. ${jahr}${eintraege.length ? `, ${eintraege.length} Eintrag/Einträge` : ''}`,
      onclick: () => beiTag && beiTag(iso, eintraege),
    }, el('span', { class: 'kal-zahl', text: String(tag) }));

    /* Ein Punkt je Eintrag, höchstens drei — darüber steht die Zahl.
       Farbe allein soll nichts tragen, deshalb hat der ausgewählte Tag
       zusätzlich eine Fläche und der heutige eine Kante. */
    if (eintraege.length) {
      feld.append(el('span', { class: 'kal-punkte' },
        eintraege.length > 3
          ? el('span', { class: 'kal-mehr', text: `${eintraege.length}` })
          : eintraege.map(() => el('i'))));
    }

    if (aktiv('kalender')) {
      feld.append(el('span', { class: 'kal-debug', text: iso.slice(5) }));
    }

    felder.append(feld);
  }

  // Nachlauf auf volle Wochen auffüllen, damit das Gitter nicht ausfranst.
  const belegt = vorlauf + anzahl;
  const rest = (7 - (belegt % 7)) % 7;
  for (let i = 1; i <= rest; i += 1) {
    felder.append(el('div', { class: 'kal-tag fremd', text: String(i) }));
  }

  log('kalender', 'Monat aufgebaut', {
    jahr, monat: monat + 1, vorlauf, tage: anzahl, tageMitEintrag, felder: belegt + rest,
  });

  return el('div', { class: 'kalender' }, kopf, felder);
}
