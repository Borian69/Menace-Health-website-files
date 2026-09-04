/* Bordbuch — Ablauf und Verdrahtung.

   Zwei Bereiche: Eintragen und Verlauf. Der zweite hat drei Ansichten
   (Liste, Kalender, Verlauf), die Einstellungen liegen darüber.

   Alles, was gerechnet wird, steht in eintraege.js; alles, was gezeichnet
   wird, in kalender.js, diagramm.js und pdf.js. Hier steht, wann was
   passiert. */

import { $, $$, el, icon, euro, km, liter, verbrauchZahl, spritZahl, toKm, toCents, toMilliliter, formatDatum, formatMonat, heuteISO, istISO, uid, plural } from './util.js';
import { log, fehler, messe, setzeFlags, BEREICHE, protokollText, protokollLeeren, beiEintrag, flags } from './debug.js';
import { ladeEinstellungen, speichereEinstellungen, ladeEintraege, speichereEintraege, alsJSON, ausJSON, speicherInfo, alleDatenLoeschen } from './store.js';
import { ARTEN, artVon, normalisiere, sortiere, sortiereNeueste, statistik, strecken, monateFuerJahr, jahre, nachTag } from './eintraege.js';
import { gitter } from './kalender.js';
import { balken, kurve, tabelle, zeitreihe } from './diagramm.js';
import { erzeugePDF, testSeite } from './pdf.js';
import { verbrauchsBilanz, fehlenderGrund, unplausibelHinweis } from './verbrauch.js';
import * as belege from './belege.js';
import { erzeugeDemo, istDemo } from './demo.js';
import { BUILD } from './fassung.js';

/* ── Zustand ─────────────────────────────────────────────── */

let einstellungen = ladeEinstellungen();
let eintraege = [];
let neuArt = 'inspektion';
let tafelArt = 'inspektion';
let tafelId = null;
let suche = '';
let filterArt = null;
let kalJahr = new Date().getFullYear();
let kalMonat = new Date().getMonth();
let gewaehlterTag = null;
let jahr = new Date().getFullYear();
let letztesPDF = null;
let neueBelege = [];        // Belege des noch nicht gespeicherten Eintrags
let offenerBeleg = null;    // im Betrachter

/* Zahl im Systemsatz: monospaced, tabellarisch, 93 %. Gilt für jede
   Ziffer der App — Signatur-Regel 1. */
const zahl = (text) => el('span', { class: 'n', text: String(text) });

/* ── Start ───────────────────────────────────────────────── */

function start() {
  setzeFlags(einstellungen);
  log('ui', 'App startet', { fassung: BUILD });

  eintraege = ladeEintraege().map(normalisiere).filter(Boolean);
  $('#f-datum').value = heuteISO();
  springeZumLetztenMonat();

  baueArtChips($('#arten-chips'), () => neuArt, (id) => { neuArt = id; });
  baueArtChips($('#b-arten'), () => tafelArt, (id) => { tafelArt = id; });

  verdrahteTabs();
  verdrahteFormular();
  verdrahteListe();
  verdrahteKalender();
  verdrahteVerlauf();
  verdrahteTafel();
  verdrahteBelege();
  verdrahteEinstellungen();

  zeichneAlles();
  registriereWorker();

  // Bilder, auf die kein Eintrag mehr zeigt, belegen sonst für immer Platz.
  belege.raeumeAuf(eintraege);
}

function zeichneAlles() {
  const fertig = messe('ui', 'Alles neu aufgebaut');
  renderStand();
  renderLetzte();
  renderListe();
  renderKalender();
  renderVerlauf();
  renderVerbrauch();
  fertig({ eintraege: eintraege.length });
}

function sichere() {
  const ok = speichereEintraege(eintraege);
  if (!ok) melde('Konnte nicht speichern — Speicher voll?');
  return ok;
}

/* ── Bereiche und Ansichten ──────────────────────────────── */

function verdrahteTabs() {
  for (const knopf of $$('.tabbar button')) {
    knopf.addEventListener('click', () => zeigeTab(knopf.dataset.tab));
  }
  for (const knopf of $$('.segment button')) {
    knopf.addEventListener('click', () => zeigeAnsicht(knopf.dataset.ansicht));
  }
  $('#btn-einstellungen').addEventListener('click', oeffneEinstellungen);
  $('#btn-zurueck').addEventListener('click', () => {
    $('#view-einstellungen').hidden = true;
    log('ui', 'Einstellungen geschlossen');
  });
  $('#btn-alle-zeigen').addEventListener('click', () => {
    zeigeTab('verlauf');
    zeigeAnsicht('liste');
  });
}

function zeigeTab(name) {
  document.body.dataset.tab = name;
  for (const knopf of $$('.tabbar button')) {
    knopf.setAttribute('aria-current', String(knopf.dataset.tab === name));
  }
  log('ui', 'Bereich gewechselt', { bereich: name });
  // Die Diagramme brauchen eine sichtbare Breite — vorher ist sie null.
  if (name === 'verlauf') {
    renderDiagramme();
    renderVerbrauchsDiagramme();
  }
}

function zeigeAnsicht(name) {
  document.body.dataset.ansicht = name;
  $('#ansicht-liste').hidden = name !== 'liste';
  $('#ansicht-kalender').hidden = name !== 'kalender';
  $('#ansicht-verlauf').hidden = name !== 'verlauf';
  $('#ansicht-verbrauch').hidden = name !== 'verbrauch';
  for (const knopf of $$('.segment button')) {
    knopf.setAttribute('aria-selected', String(knopf.dataset.ansicht === name));
  }
  log('ui', 'Ansicht gewechselt', { ansicht: name });
  if (name === 'verlauf') renderDiagramme();
  if (name === 'verbrauch') renderVerbrauchsDiagramme();
}

/* ── Eintragen ───────────────────────────────────────────── */

function baueArtChips(halter, holeArt, setzeArt) {
  halter.textContent = '';
  for (const art of ARTEN) {
    const knopf = el('button', {
      class: 'chip',
      type: 'button',
      'data-art': art.id,
      'aria-pressed': String(art.id === holeArt()),
      onclick: () => {
        setzeArt(art.id);
        for (const anderer of halter.querySelectorAll('.chip')) {
          anderer.setAttribute('aria-pressed', String(anderer.dataset.art === art.id));
        }
        // Beschreibung nur füllen, solange nichts Eigenes drinsteht.
        const imFormular = halter.id === 'arten-chips';
        const feld = imFormular ? $('#f-text') : $('#b-text');
        const vorbelegt = ARTEN.some((eintrag) => eintrag.standard === feld.value);
        if (!feld.value || vorbelegt) feld.value = art.standard;
        zeigeTankfelder(imFormular);
      },
    }, icon(art.pfad, { size: 15 }), art.label);
    halter.append(knopf);
  }
}

/* Beim Tanken erscheinen Liter und Betrag oben im Formular. Der Betrag
   steht dann nicht mehr im Klappbereich — zwei Felder für dieselbe Zahl
   wären eine Falle. */
function zeigeTankfelder(imFormular = true) {
  const tanken = (imFormular ? neuArt : tafelArt) === 'tanken';
  $(imFormular ? '#tank-felder' : '#b-tank-felder').hidden = !tanken;
  $(imFormular ? '#feld-kosten' : '#b-feld-kosten').hidden = tanken;
}

/** Der bezahlte Betrag — je nachdem, welches Feld gerade sichtbar ist. */
function betragAus(imFormular = true) {
  const tanken = (imFormular ? neuArt : tafelArt) === 'tanken';
  const feld = $(tanken
    ? (imFormular ? '#f-tank-betrag' : '#b-tank-betrag')
    : (imFormular ? '#f-kosten' : '#b-kosten'));
  return feld.value.trim() ? toCents(feld.value) : null;
}

function verdrahteFormular() {
  $('#form-neu').addEventListener('submit', (event) => {
    event.preventDefault();
    speichereNeuen();
  });
  $('#f-km').addEventListener('input', zeigeKmHinweis);
  $('#f-datum').addEventListener('change', zeigeKmHinweis);
}

function zeigeKmHinweis() {
  const hinweis = $('#km-hinweis');
  const letzterStand = eintraege.length ? Math.max(...eintraege.map((eintrag) => eintrag.km)) : null;
  const eingabe = toKm($('#f-km').value);

  if (letzterStand === null) {
    hinweis.textContent = 'Der erste Eintrag setzt den Ausgangspunkt.';
    return;
  }
  if (eingabe === null) {
    hinweis.textContent = `Zuletzt ${km(letzterStand)} km.`;
    return;
  }
  const differenz = eingabe - letzterStand;
  hinweis.textContent = differenz >= 0
    ? `${km(differenz)} km seit dem letzten Eintrag.`
    : `Achtung: ${km(Math.abs(differenz))} km unter dem letzten Stand (${km(letzterStand)} km).`;
}

function speichereNeuen() {
  const fehlerzeile = $('#form-fehler');
  const datum = $('#f-datum').value;
  const kmStand = toKm($('#f-km').value);

  if (!istISO(datum)) return zeigeFormFehler('Bitte ein gültiges Datum wählen.');
  if (kmStand === null) return zeigeFormFehler('Bitte den Kilometerstand eintragen.');

  const eintrag = normalisiere({
    id: uid(),
    datum,
    km: kmStand,
    art: neuArt,
    text: $('#f-text').value || artVon(neuArt).standard,
    kosten: betragAus(true),
    liter: neuArt === 'tanken' ? toMilliliter($('#f-liter').value) : null,
    voll: $('#f-voll').checked,
    belege: neueBelege.map((beleg) => beleg.id),
    werkstatt: $('#f-werkstatt').value,
    notiz: $('#f-notiz').value,
  });
  if (!eintrag) return zeigeFormFehler('Der Eintrag ließ sich nicht anlegen.');

  fehlerzeile.hidden = true;
  eintraege.push(eintrag);
  if (!sichere()) return undefined;

  log('eintrag', 'Eintrag angelegt', { id: eintrag.id, datum: eintrag.datum, km: eintrag.km, art: eintrag.art });

  // Die Belege gehören jetzt dem Eintrag. Bis hierhin trugen sie eine
  // vorläufige Kennung — die wird nachgezogen, damit die Ablage nicht
  // auf einen Eintrag zeigt, den es nie gab.
  for (const beleg of neueBelege) belege.ordneZu(beleg.id, eintrag.id).catch(() => {});
  neueBelege = [];
  renderBelegzeile('#f-belege', [], { entfernbar: true });

  $('#f-km').value = '';
  $('#f-text').value = '';
  $('#f-kosten').value = '';
  $('#f-notiz').value = '';
  $('#f-liter').value = '';
  $('#f-tank-betrag').value = '';
  $('#f-voll').checked = true;
  $('#f-datum').value = heuteISO();
  $('#mehr-angaben').open = false;
  zeigeKmHinweis();

  klopfen();
  melde(`Eingetragen bei ${km(eintrag.km)} km.`);
  zeichneAlles();
  return undefined;
}

function zeigeFormFehler(text) {
  const zeile = $('#form-fehler');
  zeile.textContent = text;
  zeile.hidden = false;
  log('eintrag', 'Eingabe abgelehnt', { grund: text });
  return undefined;
}

function renderStand() {
  const werte = statistik(eintraege);
  const odo = $('#odo');
  const meta = $('#odo-meta');

  odo.textContent = '';
  if (werte.stand === null) {
    odo.textContent = '—';
    meta.textContent = 'Noch kein Eintrag';
  } else {
    odo.append(zahl(km(werte.stand)), ' km');
    const teile = [`${plural(werte.anzahl, 'Eintrag', 'Einträge')}`];
    if (werte.gefahren > 0) teile.push(`${km(werte.gefahren)} km aufgezeichnet`);
    if (werte.letzter) teile.push(`zuletzt ${formatDatum(werte.letzter.datum, { kurz: true })}`);
    meta.textContent = teile.join(' · ');
  }

  $('#leer-hinweis').hidden = eintraege.length > 0;
  zeigeKmHinweis();
}

function renderLetzte() {
  const abschnitt = $('#letzte-abschnitt');
  const liste = $('#letzte-liste');
  liste.textContent = '';

  const neueste = sortiereNeueste(eintraege).slice(0, 3);
  abschnitt.hidden = neueste.length === 0;
  for (const eintrag of neueste) liste.append(el('li', {}, eintragZeile(eintrag)));
}

/* ── Eine Zeile in jeder Liste ───────────────────────────── */

function eintragZeile(eintrag, { strecke = null, verbrauch = null } = {}) {
  const art = artVon(eintrag.art);
  const meta = [];
  if (eintrag.art === 'tanken' && eintrag.liter) {
    meta.push(liter(eintrag.liter));
    if (!eintrag.voll) meta.push('Teilbetankung');
    if (eintrag.kosten) meta.push(`${spritZahl(eintrag.kosten / (eintrag.liter / 1000))} €/L`);
  }
  if (eintrag.werkstatt) meta.push(eintrag.werkstatt);
  if (einstellungen.kostenAnzeigen && eintrag.kosten) meta.push(euro(eintrag.kosten));
  if (eintrag.notiz) meta.push(eintrag.notiz);

  return el('button', {
    class: 'eintrag',
    type: 'button',
    onclick: () => oeffneTafel(eintrag.id),
  },
  el('span', { class: 'eintrag-symbol' }, icon(art.pfad, { size: 20 })),
  el('span', { class: 'eintrag-koerper' },
    el('span', { class: 'eintrag-kopf' },
      el('span', { class: 'eintrag-datum' }, zahl(formatDatum(eintrag.datum, { kurz: true }))),
      el('span', { class: 'eintrag-km' }, zahl(km(eintrag.km)), ' km'),
    ),
    el('span', { class: 'eintrag-text', text: eintrag.text || art.standard || art.label }),
    meta.length ? el('span', { class: 'eintrag-meta', text: meta.join(' · ') }) : null,
    strecke !== null
      ? el('span', { class: 'eintrag-strecke', text: strecke >= 0 ? `+${km(strecke)} km seit dem Eintrag davor` : `${km(strecke)} km — Stand niedriger als davor` })
      : null,
    verbrauch !== null
      ? el('span', { class: 'eintrag-strecke', text: `${verbrauchZahl(verbrauch)} L/100 km seit der letzten vollen Tankfüllung` })
      : null,
    eintrag.belege.length
      ? el('span', { class: 'eintrag-belege', 'aria-label': `${eintrag.belege.length} Beleg(e)` },
        eintrag.belege.map(() => el('i')))
      : null,
  ));
}

/* ── Liste ───────────────────────────────────────────────── */

function verdrahteListe() {
  $('#f-suche').addEventListener('input', (event) => {
    suche = event.target.value.trim().toLowerCase();
    renderListe();
  });
}

function renderFilterChips() {
  const halter = $('#filter-chips');
  halter.textContent = '';
  const vorhanden = ARTEN.filter((art) => eintraege.some((eintrag) => eintrag.art === art.id));
  if (vorhanden.length < 2) return;

  for (const art of vorhanden) {
    halter.append(el('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(filterArt === art.id),
      onclick: () => {
        filterArt = filterArt === art.id ? null : art.id;
        renderListe();
      },
    }, art.label));
  }
}

function renderListe() {
  const fertig = messe('ui', 'Liste aufgebaut');
  renderFilterChips();

  const halter = $('#liste-halter');
  halter.textContent = '';

  // Strecken vorab, damit jede Zeile zeigen kann, was seit dem Eintrag
  // davor gefahren wurde.
  const streckeNach = new Map();
  for (const abschnitt of strecken(eintraege)) streckeNach.set(abschnitt.bis.id, abschnitt.km);

  // Der gemessene Verbrauch hängt am abschließenden vollen Tank.
  const verbrauchNach = new Map();
  for (const messung of verbrauchsBilanz(eintraege).reihe) verbrauchNach.set(messung.bis.id, messung.verbrauch);

  const gefiltert = sortiereNeueste(eintraege).filter((eintrag) => {
    if (filterArt && eintrag.art !== filterArt) return false;
    if (!suche) return true;
    const heuhaufen = [
      eintrag.text, eintrag.werkstatt, eintrag.notiz, artVon(eintrag.art).label,
      eintrag.datum, String(eintrag.km),
    ].join(' ').toLowerCase();
    return heuhaufen.includes(suche);
  });

  const ausreisser = strecken(eintraege).filter((abschnitt) => !abschnitt.gueltig);
  if (ausreisser.length && !suche && !filterArt) {
    halter.append(el('div', { class: 'warnkarte' },
      icon('<path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', { size: 18 }),
      el('span', { text: `${plural(ausreisser.length, 'Übergang', 'Übergänge')} mit fallendem Kilometerstand. Diese Strecken zählen nicht mit — bitte die Stände prüfen.` }),
    ));
  }

  if (!gefiltert.length) {
    halter.append(el('p', { class: 'leer', text: eintraege.length ? 'Kein Eintrag passt zu dieser Suche.' : 'Noch nichts eingetragen.' }));
    fertig({ zeilen: 0 });
    return;
  }

  let letztesJahr = null;
  const liste = el('ul', { class: 'liste' });
  for (const eintrag of gefiltert) {
    const eintragsJahr = eintrag.datum.slice(0, 4);
    if (eintragsJahr !== letztesJahr) {
      letztesJahr = eintragsJahr;
      liste.append(el('li', { class: 'jahr-trenner' }, zahl(eintragsJahr)));
    }
    liste.append(el('li', {}, eintragZeile(eintrag, {
      strecke: streckeNach.has(eintrag.id) ? streckeNach.get(eintrag.id) : null,
      verbrauch: verbrauchNach.has(eintrag.id) ? verbrauchNach.get(eintrag.id) : null,
    })));
  }
  halter.append(liste);
  fertig({ zeilen: gefiltert.length });
}

/* ── Kalender ────────────────────────────────────────────── */

function verdrahteKalender() {
  $('#monat-zurueck').addEventListener('click', () => blaettereMonat(-1));
  $('#monat-vor').addEventListener('click', () => blaettereMonat(1));
}

/* Der Kalender öffnet dort, wo etwas steht: im Monat des jüngsten
   Eintrags. Ein leerer laufender Monat wäre ein schlechter Empfang. */
function springeZumLetztenMonat() {
  const werte = statistik(eintraege);
  const ziel = werte.letzter ? werte.letzter.datum : heuteISO();
  kalJahr = Number(ziel.slice(0, 4));
  kalMonat = Number(ziel.slice(5, 7)) - 1;
  jahr = kalJahr;
}

function blaettereMonat(richtung) {
  kalMonat += richtung;
  if (kalMonat < 0) { kalMonat = 11; kalJahr -= 1; }
  if (kalMonat > 11) { kalMonat = 0; kalJahr += 1; }
  renderKalender();
}

function renderKalender() {
  const karte = nachTag(eintraege);
  $('#monat-titel').textContent = formatMonat(kalJahr, kalMonat);

  const halter = $('#kalender-halter');
  halter.textContent = '';
  halter.append(gitter(kalJahr, kalMonat, karte, {
    ausgewaehlt: gewaehlterTag,
    beiTag: (iso) => {
      gewaehlterTag = gewaehlterTag === iso ? null : iso;
      renderKalender();
    },
  }));

  const tagesHalter = $('#kalender-tag');
  tagesHalter.textContent = '';

  if (!gewaehlterTag) {
    const imMonat = [...karte.entries()]
      .filter(([iso]) => Number(iso.slice(0, 4)) === kalJahr && Number(iso.slice(5, 7)) - 1 === kalMonat)
      .reduce((summe, [, liste]) => summe + liste.length, 0);
    tagesHalter.append(el('p', { class: 'fussnote', text: imMonat
      ? `${plural(imMonat, 'Eintrag', 'Einträge')} in diesem Monat. Tag antippen für die Details.`
      : 'In diesem Monat wurde nichts eingetragen.' }));
    return;
  }

  const desTages = karte.get(gewaehlterTag) || [];
  tagesHalter.append(el('div', { class: 'tag-kopf', text: formatDatum(gewaehlterTag, { mitTag: true }) }));

  if (!desTages.length) {
    tagesHalter.append(el('p', { class: 'fussnote', text: 'An diesem Tag wurde nichts eingetragen.' }));
    return;
  }
  const liste = el('ul', { class: 'liste' });
  for (const eintrag of desTages) liste.append(el('li', {}, eintragZeile(eintrag)));
  tagesHalter.append(liste);
}

/* ── Verlauf ─────────────────────────────────────────────── */

function verdrahteVerlauf() {
  $('#jahr-zurueck').addEventListener('click', () => { jahr -= 1; renderVerlauf(); });
  $('#jahr-vor').addEventListener('click', () => { jahr += 1; renderVerlauf(); });
  $('#btn-pdf').addEventListener('click', pdfSichern);
  $('#btn-pdf-teilen').addEventListener('click', pdfTeilen);

  // Die Diagramme rechnen in Pixeln — bei Drehung des Geräts neu.
  let timer = null;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(renderDiagramme, 180);
  });
}

function renderVerlauf() {
  const verfuegbar = jahre(eintraege);
  $('#jahr-titel').textContent = String(jahr);
  $('#jahr-zurueck').disabled = jahr <= Math.min(...verfuegbar);
  $('#jahr-vor').disabled = jahr >= Math.max(new Date().getFullYear(), ...verfuegbar);

  const daten = monateFuerJahr(eintraege, jahr);
  const werte = statistik(eintraege);

  const jahrKm = $('#jahr-km');
  jahrKm.textContent = '';
  jahrKm.append(zahl(km(daten.gesamt)), ' km');

  const gefahrene = daten.monate.filter((wert) => wert > 0).length;
  $('#jahr-meta').textContent = gefahrene
    ? `verteilt über ${plural(gefahrene, 'Monat', 'Monate')}`
    : 'Für dieses Jahr liegen keine Strecken vor.';

  renderKennzahlen(daten, werte);
  renderDiagramme(daten);

  const tabellenHalter = $('#jahr-tabelle');
  tabellenHalter.textContent = '';
  tabellenHalter.append(tabelle(daten));
}

function renderKennzahlen(daten, werte) {
  const halter = $('#jahr-kennzahlen');
  halter.textContent = '';

  const monateMitDaten = daten.letzterMonat >= 0 ? daten.letzterMonat + 1 : 0;
  const felder = [
    ['Ø je Monat', monateMitDaten ? `${km(daten.gesamt / monateMitDaten)} km` : '—'],
    ['Ø je Tag', werte.proTag ? `${km(Math.round(werte.proTag))} km` : '—'],
    ['Stärkster Monat', daten.max ? `${km(daten.max)} km` : '—'],
    ['Hochrechnung', werte.proJahr ? `${km(Math.round(werte.proJahr))} km` : '—'],
  ];
  if (einstellungen.kostenAnzeigen && werte.kosten) {
    felder.push(['Kosten gesamt', euro(werte.kosten)]);
    felder.push(['Kosten je 100 km', werte.gefahren ? euro(Math.round((werte.kosten / werte.gefahren) * 100)) : '—']);
  }

  for (const [label, wert] of felder) {
    halter.append(el('div', { class: 'kennzahl' },
      el('span', { class: 'label', text: label }),
      el('div', { class: 'kennzahl-wert' }, zahl(wert)),
    ));
  }
}

let letzteDaten = null;

function renderDiagramme(daten) {
  if (daten) letzteDaten = daten;
  if (!letzteDaten) return;

  const halterBalken = $('#halter-balken');
  const halterKurve = $('#halter-kurve');
  const breite = halterBalken.clientWidth;
  // Unsichtbar heißt Breite null — dann später noch einmal.
  if (!breite) return;

  const fertig = messe('ui', 'Diagramme gezeichnet');

  halterBalken.textContent = '';
  halterBalken.append(balken(letzteDaten, breite, {
    beiAuswahl: (monat) => zeigeLesehilfe('#lese-balken', monat, letzteDaten.monate, 'Antippen für den Monatswert'),
  }));

  halterKurve.textContent = '';
  halterKurve.append(kurve(letzteDaten, halterKurve.clientWidth || breite, {
    beiAuswahl: (monat) => zeigeLesehilfe('#lese-kurve', monat, letzteDaten.kumuliert, 'Antippen für den Stand im Monat'),
  }));

  fertig({ breite, jahr: letzteDaten.jahr });
}

const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function zeigeLesehilfe(sel, monat, werte, ersatz) {
  const feld = $(sel);
  feld.textContent = monat === null ? ersatz : `${MONATE_LANG[monat]} · ${km(werte[monat])} km`;
}

/* ── PDF ─────────────────────────────────────────────────── */

async function baueLetztePDF({ druck = false } = {}) {
  /* Die Bilder müssen erst aus der Ablage geholt werden — deshalb ist
     das hier asynchron, während pdf.js selbst synchron bleibt und nur
     fertige Bytes bekommt. */
  let bilder = [];
  if (einstellungen.pdfBelege !== false) {
    /* Wer der Eigentümer ist, sagt die Liste des Eintrags — nicht das
       Feld im Beleg. Beim Anlegen über das Formular gibt es die Kennung
       des Eintrags noch gar nicht, wenn das Foto schon gewählt wird. */
    for (const eintrag of sortiere(eintraege)) {
      for (const id of eintrag.belege) {
        const beleg = await belege.alsBytes(id).catch(() => null);
        if (beleg) bilder.push({ ...beleg, eintragId: eintrag.id });
      }
    }
  }

  // Aufsteigend wie ein Scheckheft: vorne die erste Fahrt, hinten die
  // letzte. So liest ein Käufer die Geschichte des Wagens.
  const ergebnis = erzeugePDF({
    eintraege: sortiere(eintraege),
    einstellungen,
    statistik: statistik(eintraege),
    bilanz: verbrauchsBilanz(eintraege),
    belege: bilder,
    druck,
  });

  // Zum Teilen wird nur die Versandfassung gemerkt.
  if (!druck) letztesPDF = ergebnis;
  return ergebnis;
}

function dateiname({ druck = false } = {}) {
  const kennung = (einstellungen.kennzeichen || einstellungen.fahrzeug || 'Fahrzeug')
    .replace(/[^\wÄÖÜäöüß-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Bordbuch-${kennung}-${heuteISO()}${druck ? '-DRUCK' : ''}.pdf`;
}

async function pdfSichern() {
  if (!eintraege.length) return melde('Noch nichts einzutragen ins PDF.');
  const knopf = $('#btn-pdf');
  knopf.disabled = true;
  try {
    const ergebnis = await baueLetztePDF();
    ladeDatei(ergebnis.blob, dateiname());
    melde(`PDF mit ${plural(eintraege.length, 'Eintrag', 'Einträgen')} auf ${plural(ergebnis.seiten, 'Seite', 'Seiten')}.`);
  } catch (error) {
    fehler('pdf', 'PDF fehlgeschlagen', error);
    melde('Das PDF ließ sich nicht erzeugen. Details stehen im Protokoll.');
  } finally {
    knopf.disabled = false;
  }
  return undefined;
}

async function pdfTeilen() {
  try {
    const ergebnis = letztesPDF || await baueLetztePDF();
    const datei = new File([ergebnis.blob], dateiname(), { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      await navigator.share({ files: [datei], title: 'Bordbuch' });
      log('pdf', 'PDF geteilt');
    } else {
      ladeDatei(ergebnis.blob, dateiname());
    }
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    fehler('pdf', 'Teilen fehlgeschlagen', error);
  }
}

function ladeDatei(blob, name) {
  const adresse = URL.createObjectURL(blob);
  const verweis = el('a', { href: adresse, download: name });
  document.body.append(verweis);
  verweis.click();
  verweis.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 5000);
  log('pdf', 'Datei ausgegeben', { name, bytes: blob.size });
}

/* ── Belege ──────────────────────────────────────────────────
   Ein Foto der Rechnung neben dem Eintrag ist das, was aus einer Liste
   einen Nachweis macht. Die Bilder liegen in IndexedDB, nicht bei den
   Einträgen — siehe belege.js. */

function verdrahteBelege() {
  $('#btn-beleg').addEventListener('click', () => $('#datei-beleg').click());
  $('#datei-beleg').addEventListener('change', (event) => nimmBeleg(event, true));

  $('#btn-b-beleg').addEventListener('click', () => $('#datei-b-beleg').click());
  $('#datei-b-beleg').addEventListener('change', (event) => nimmBeleg(event, false));

  $('#btn-betrachter-zu').addEventListener('click', schliesseBetrachter);
  $('#btn-beleg-loeschen').addEventListener('click', loescheOffenenBeleg);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#betrachter').hidden) schliesseBetrachter();
  });
}

async function nimmBeleg(event, imFormular) {
  const datei = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!datei) return;

  const knopf = $(imFormular ? '#btn-beleg' : '#btn-b-beleg');
  knopf.disabled = true;
  melde('Beleg wird aufbereitet …');

  try {
    /* Beim neuen Eintrag gibt es noch keine Kennung — sie wird jetzt
       vergeben und beim Speichern übernommen. So gehört das Bild von
       Anfang an zum richtigen Eintrag. */
    const eintragId = imFormular ? (neueBelege[0]?.eintragId || `vor-${uid()}`) : tafelId;
    const beleg = await belege.lege(datei, eintragId);

    if (imFormular) {
      neueBelege.push(beleg);
      renderBelegzeile('#f-belege', neueBelege, { entfernbar: true });
    } else {
      const eintrag = eintraege.find((kandidat) => kandidat.id === tafelId);
      if (eintrag) {
        eintrag.belege = [...eintrag.belege, beleg.id];
        eintrag.geaendert = Date.now();
        sichere();
        await zeigeTafelBelege(eintrag);
        zeichneAlles();
      }
    }
    melde(`Beleg gesichert (${(beleg.bytes / 1024).toFixed(0)} KB).`);
  } catch (error) {
    fehler('daten', 'Beleg abgelehnt', error);
    melde(error.message || 'Der Beleg ließ sich nicht speichern.');
  } finally {
    knopf.disabled = false;
  }
}

/* Jedes angezeigte Bild bekommt eine Objekt-Adresse, und die hält den
   Speicher fest, bis sie freigegeben wird. Deshalb merkt sich jeder
   Behälter seine eigenen und räumt sie beim nächsten Aufbau weg. */
const adressen = new Map();

function frischeAdresse(schluessel, blob) {
  const adresse = URL.createObjectURL(blob);
  const bisher = adressen.get(schluessel) || [];
  bisher.push(adresse);
  adressen.set(schluessel, bisher);
  return adresse;
}

function gibAdressenFrei(schluessel) {
  for (const adresse of adressen.get(schluessel) || []) URL.revokeObjectURL(adresse);
  adressen.set(schluessel, []);
}

function renderBelegzeile(sel, liste, { entfernbar = false } = {}) {
  const halter = $(sel);
  gibAdressenFrei(sel);
  halter.textContent = '';

  for (const beleg of liste) {
    halter.append(el('button', {
      class: 'beleg-daumen',
      type: 'button',
      'aria-label': 'Beleg ansehen',
      onclick: () => oeffneBetrachter(beleg, entfernbar ? liste : null),
    }, el('img', { src: frischeAdresse(sel, beleg.vorschau || beleg.bild), alt: '' })));
  }
}

async function zeigeTafelBelege(eintrag) {
  const halter = $('#b-belege');
  halter.textContent = '';
  if (!eintrag.belege.length) return;

  halter.append(el('span', { class: 'beleg-daumen beleg-laedt', text: '…' }));
  const geladen = await belege.holeViele(eintrag.belege);
  renderBelegzeile('#b-belege', geladen);
}

function oeffneBetrachter(beleg, ausListe) {
  offenerBeleg = { beleg, ausListe };
  gibAdressenFrei('betrachter');
  $('#betrachter-bild').src = frischeAdresse('betrachter', beleg.bild);
  $('#betrachter-titel').textContent = `${beleg.breite} × ${beleg.hoehe} · ${(beleg.bytes / 1024).toFixed(0)} KB`;
  $('#betrachter').hidden = false;
  log('ui', 'Beleg geöffnet', { id: beleg.id });
}

function schliesseBetrachter() {
  $('#betrachter').hidden = true;
  $('#betrachter-bild').removeAttribute('src');
  gibAdressenFrei('betrachter');
  offenerBeleg = null;
}

async function loescheOffenenBeleg() {
  if (!offenerBeleg) return;
  const { beleg, ausListe } = offenerBeleg;
  if (!window.confirm('Diesen Beleg löschen?')) return;

  await belege.loesche(beleg.id);

  if (ausListe) {
    neueBelege = neueBelege.filter((kandidat) => kandidat.id !== beleg.id);
    renderBelegzeile('#f-belege', neueBelege, { entfernbar: true });
  } else {
    const eintrag = eintraege.find((kandidat) => kandidat.belege.includes(beleg.id));
    if (eintrag) {
      eintrag.belege = eintrag.belege.filter((id) => id !== beleg.id);
      eintrag.geaendert = Date.now();
      sichere();
      await zeigeTafelBelege(eintrag);
      zeichneAlles();
    }
  }

  schliesseBetrachter();
  melde('Beleg gelöscht.');
}

/* ── Verbrauch ───────────────────────────────────────────── */

let letzteBilanz = null;

function renderVerbrauch() {
  const bilanz = verbrauchsBilanz(eintraege);
  letzteBilanz = bilanz;

  const wert = $('#verbrauch-wert');
  wert.textContent = '';
  if (bilanz.schnitt) {
    wert.append(zahl(verbrauchZahl(bilanz.schnitt)), ' L/100 km');
    // Gezählt wird, was auch gerechnet wurde — sonst passen Zahl und
    // Strecke in derselben Zeile nicht zusammen.
    const gerechnet = bilanz.reihe.filter((messung) => messung.plausibel).length;
    $('#verbrauch-meta').textContent = `aus ${plural(gerechnet, 'Messung', 'Messungen')} über `
      + `${km(bilanz.messstrecke)} km`;
  } else {
    wert.textContent = '—';
    $('#verbrauch-meta').textContent = `${plural(bilanz.tankungen, 'Tankfüllung', 'Tankfüllungen')} eingetragen`;
  }

  $('#verbrauch-hinweis').textContent = bilanz.schnitt
    ? 'Gerechnet wird von voller Tankfüllung zu voller Tankfüllung — nur dann steht '
      + 'die verbrauchte Menge fest. Der erste volle Tank zählt als Startpunkt. '
      + 'Teilbetankungen dazwischen gehen mit ein.' + unplausibelHinweis(bilanz)
    : fehlenderGrund(bilanz);

  renderVerbrauchsKennzahlen(bilanz);

  const zeigbar = bilanz.reihe.filter((messung) => messung.plausibel);
  $('#verbrauch-diagramm').hidden = zeigbar.length < 2;
  $('#preis-diagramm').hidden = !zeigbar.some((messung) => messung.preisJeLiter) || zeigbar.length < 2;
  renderVerbrauchsDiagramme();
  renderVerbrauchsTabelle(bilanz);
}

function renderVerbrauchsKennzahlen(bilanz) {
  const halter = $('#verbrauch-kennzahlen');
  halter.textContent = '';

  const felder = [];
  if (bilanz.letzter) felder.push(['Zuletzt', `${verbrauchZahl(bilanz.letzter.verbrauch)} L/100 km`]);
  if (bilanz.bester) felder.push(['Bester Wert', `${verbrauchZahl(bilanz.bester.verbrauch)} L/100 km`]);
  if (bilanz.schlechtester) felder.push(['Schlechtester', `${verbrauchZahl(bilanz.schlechtester.verbrauch)} L/100 km`]);
  if (bilanz.preisJeLiter) felder.push(['Ø Preis je Liter', `${spritZahl(bilanz.preisJeLiter)} €`]);
  if (bilanz.kostenJe100) felder.push(['Sprit je 100 km', euro(Math.round(bilanz.kostenJe100))]);
  if (bilanz.literGesamt) felder.push(['Getankt gesamt', liter(bilanz.literGesamt)]);
  if (bilanz.kostenGesamt) felder.push(['Spritkosten', euro(bilanz.kostenGesamt)]);

  for (const [label, text] of felder) {
    halter.append(el('div', { class: 'kennzahl' },
      el('span', { class: 'label', text: label }),
      el('div', { class: 'kennzahl-wert' }, zahl(text)),
    ));
  }
}

function renderVerbrauchsDiagramme() {
  // Unplausible Messungen würden die Skala sprengen und die Kurve
  // unlesbar machen — sie stehen in der Tabelle, nicht im Bild.
  const reihe = letzteBilanz ? letzteBilanz.reihe.filter((messung) => messung.plausibel) : [];
  if (reihe.length < 2) return;

  const halterVerbrauch = $('#halter-verbrauch');
  const breite = halterVerbrauch.clientWidth;
  if (!breite) return;

  const fertig = messe('ui', 'Verbrauchsdiagramme gezeichnet');

  halterVerbrauch.textContent = '';
  halterVerbrauch.append(zeitreihe(
    reihe.map((messung) => ({ datum: messung.datum, wert: messung.verbrauch, messung })),
    breite,
    {
      formatiere: (wert) => verbrauchZahl(wert),
      beschriftung: 'Verbrauch je Tankfüllung in Litern auf 100 Kilometer',
      beiAuswahl: (ort) => {
        $('#lese-verbrauch').textContent = ort
          ? `${formatDatum(ort.datum, { kurz: true })} · ${verbrauchZahl(ort.wert)} L/100 km · ${km(ort.messung.km)} km`
          : 'Antippen für die einzelne Messung';
      },
    },
  ));

  const mitPreis = reihe.filter((messung) => messung.preisJeLiter);
  const halterPreis = $('#halter-preis');
  if (mitPreis.length > 1 && halterPreis.clientWidth) {
    halterPreis.textContent = '';
    halterPreis.append(zeitreihe(
      mitPreis.map((messung) => ({ datum: messung.datum, wert: messung.preisJeLiter / 100, messung })),
      halterPreis.clientWidth,
      {
        formatiere: (wert) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(wert),
        beschriftung: 'Preis je Liter über die Zeit',
        beiAuswahl: (ort) => {
          $('#lese-preis').textContent = ort
            ? `${formatDatum(ort.datum, { kurz: true })} · ${spritZahl(ort.messung.preisJeLiter)} €/L`
            : 'Antippen für den Preis der Tankfüllung';
        },
      },
    ));
  }

  fertig({ messungen: reihe.length, ausgelassen: letzteBilanz.unplausibel });
}

function renderVerbrauchsTabelle(bilanz) {
  const halter = $('#verbrauch-tabelle');
  halter.textContent = '';
  if (!bilanz.reihe.length) return;

  const koerper = el('tbody');
  for (const messung of bilanz.reihe.slice().reverse()) {
    koerper.append(el('tr', { class: messung.plausibel ? '' : 'ausgelassen' },
      el('td', {}, zahl(formatDatum(messung.datum, { kurz: true }))),
      el('td', { class: 'zahl' }, zahl(km(messung.km))),
      el('td', { class: 'zahl' }, zahl(liter(messung.liter).replace(' L', ''))),
      el('td', { class: 'zahl' },
        zahl(verbrauchZahl(messung.verbrauch)),
        // Form statt Farbe allein: Das Sternchen sagt es auch in Graustufen.
        messung.plausibel ? null : el('span', { class: 'marke', title: 'nicht eingerechnet', text: ' *' })),
    ));
  }

  halter.append(el('table', { class: 'dg-tabelle' },
    el('thead', {}, el('tr', {},
      el('th', { text: 'Datum' }),
      el('th', { class: 'zahl', text: 'km' }),
      el('th', { class: 'zahl', text: 'Liter' }),
      el('th', { class: 'zahl', text: 'L/100' }),
    )),
    koerper,
  ));
}

/* ── Eintrag bearbeiten ──────────────────────────────────── */

function verdrahteTafel() {
  $('#btn-tafel-abbrechen').addEventListener('click', schliesseTafel);
  $('#blende').addEventListener('click', (event) => {
    if (event.target === $('#blende')) schliesseTafel();
  });
  $('#btn-tafel-sichern').addEventListener('click', sichereTafel);
  $('#btn-tafel-loeschen').addEventListener('click', loescheTafel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#blende').hidden) schliesseTafel();
  });
}

function oeffneTafel(id) {
  const eintrag = eintraege.find((kandidat) => kandidat.id === id);
  if (!eintrag) return;

  tafelId = id;
  tafelArt = eintrag.art;
  $('#tafel-titel').textContent = formatDatum(eintrag.datum);
  $('#b-datum').value = eintrag.datum;
  $('#b-km').value = String(eintrag.km);
  $('#b-text').value = eintrag.text;
  const betrag = eintrag.kosten ? (eintrag.kosten / 100).toFixed(2).replace('.', ',') : '';
  $('#b-kosten').value = betrag;
  $('#b-tank-betrag').value = betrag;
  $('#b-liter').value = eintrag.liter ? (eintrag.liter / 1000).toFixed(2).replace('.', ',') : '';
  $('#b-voll').checked = eintrag.voll !== false;
  $('#b-werkstatt').value = eintrag.werkstatt;
  $('#b-notiz').value = eintrag.notiz;
  $('#tafel-fehler').hidden = true;
  zeigeTankfelder(false);
  zeigeTafelBelege(eintrag);

  for (const chip of $$('#b-arten .chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.art === eintrag.art));
  }

  $('#blende').hidden = false;
  log('eintrag', 'Tafel geöffnet', { id });
}

function schliesseTafel() {
  $('#blende').hidden = true;
  tafelId = null;
}

function sichereTafel() {
  const alt = eintraege.find((kandidat) => kandidat.id === tafelId);
  if (!alt) return schliesseTafel();

  const geaendert = normalisiere({
    ...alt,
    datum: $('#b-datum').value,
    km: toKm($('#b-km').value),
    art: tafelArt,
    text: $('#b-text').value,
    kosten: betragAus(false),
    liter: tafelArt === 'tanken' ? toMilliliter($('#b-liter').value) : null,
    voll: $('#b-voll').checked,
    werkstatt: $('#b-werkstatt').value,
    notiz: $('#b-notiz').value,
    geaendert: Date.now(),
  });

  if (!geaendert) {
    const zeile = $('#tafel-fehler');
    zeile.textContent = 'Datum und Kilometerstand müssen stimmen.';
    zeile.hidden = false;
    return undefined;
  }

  eintraege = eintraege.map((kandidat) => (kandidat.id === tafelId ? geaendert : kandidat));
  sichere();
  log('eintrag', 'Eintrag geändert', { id: tafelId });
  schliesseTafel();
  melde('Änderung gesichert.');
  zeichneAlles();
  return undefined;
}

function loescheTafel() {
  const eintrag = eintraege.find((kandidat) => kandidat.id === tafelId);
  if (!eintrag) return;
  if (!window.confirm(`Eintrag vom ${formatDatum(eintrag.datum)} löschen?`)) return;

  for (const belegId of eintrag.belege) belege.loesche(belegId).catch(() => {});
  eintraege = eintraege.filter((kandidat) => kandidat.id !== tafelId);
  sichere();
  log('eintrag', 'Eintrag gelöscht', { id: tafelId, belege: eintrag.belege.length });
  schliesseTafel();
  melde('Eintrag gelöscht.');
  zeichneAlles();
}

/* ── Einstellungen ───────────────────────────────────────── */

const TEXTFELDER = {
  '#e-fahrzeug': 'fahrzeug',
  '#e-kennzeichen': 'kennzeichen',
  '#e-baujahr': 'baujahr',
  '#e-fin': 'fin',
};

const SCHALTER = {
  '#e-kosten-anzeigen': 'kostenAnzeigen',
  '#e-haptik': 'haptik',
  '#e-pdf-kosten': 'pdfKosten',
  '#e-pdf-notizen': 'pdfNotizen',
  '#e-pdf-belege': 'pdfBelege',
  '#e-debug': 'debug',
};

function verdrahteEinstellungen() {
  for (const [sel, schluessel] of Object.entries(TEXTFELDER)) {
    $(sel).addEventListener('input', (event) => aendere({ [schluessel]: event.target.value }));
  }
  for (const [sel, schluessel] of Object.entries(SCHALTER)) {
    $(sel).addEventListener('change', (event) => {
      aendere({ [schluessel]: event.target.checked });
      if (schluessel === 'debug') {
        baueDebugBereiche();
        zeichneAlles();
      }
      if (schluessel === 'kostenAnzeigen') zeichneAlles();
    });
  }
  $('#e-format').addEventListener('change', (event) => aendere({ pdfFormat: event.target.value }));

  $('#btn-pdf-druck').addEventListener('click', async () => {
    if (!eintraege.length) return melde('Noch nichts einzutragen ins PDF.');
    try {
      const ergebnis = await baueLetztePDF({ druck: true });
      ladeDatei(ergebnis.blob, dateiname({ druck: true }));
      melde(`Druckfassung auf ${plural(ergebnis.seiten, 'Seite', 'Seiten')}.`);
    } catch (error) {
      fehler('pdf', 'Druckfassung fehlgeschlagen', error);
      melde('Die Druckfassung ließ sich nicht erzeugen.');
    }
    return undefined;
  });

  $('#btn-pdf-test').addEventListener('click', () => {
    try {
      const ergebnis = testSeite();
      ladeDatei(ergebnis.blob, 'Bordbuch-Testseite.pdf');
      melde(`Testseite erzeugt (${(ergebnis.bytes / 1024).toFixed(1)} KB).`);
    } catch {
      melde('Die Testseite ließ sich nicht erzeugen.');
    }
  });

  $('#btn-export').addEventListener('click', async () => {
    const knopf = $('#btn-export');
    knopf.disabled = true;
    try {
      /* Die Belege wandern als Base64 mit in die Datei. Das macht sie
         deutlich größer — dafür ist die Sicherung dann vollständig, und
         genau darum geht es. */
      const daten = JSON.parse(alsJSON());
      daten.belege = await belege.exportierbar();
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
      ladeDatei(blob, `Bordbuch-Sicherung-${heuteISO()}.json`);
      melde(`Sicherung gespeichert (${(blob.size / 1024 / 1024).toFixed(2)} MB).`);
    } catch (error) {
      fehler('daten', 'Sicherung fehlgeschlagen', error);
      melde('Die Sicherung ließ sich nicht erzeugen.');
    } finally {
      knopf.disabled = false;
    }
  });
  $('#btn-import').addEventListener('click', () => $('#datei-import').click());
  $('#datei-import').addEventListener('change', importiere);

  $('#btn-alles-loeschen').addEventListener('click', () => {
    if (!window.confirm('Wirklich alle Einträge und Einstellungen löschen? Das lässt sich nicht rückgängig machen.')) return;
    alleDatenLoeschen();
    belege.alleLoeschen().catch(() => {});
    eintraege = [];
    einstellungen = ladeEinstellungen();
    setzeFlags(einstellungen);
    fuelleEinstellungen();
    zeichneAlles();
    melde('Alles gelöscht.');
  });

  $('#btn-selbsttest').addEventListener('click', starteSelbsttest);
  $('#btn-demo').addEventListener('click', legeDemoAn);
  $('#btn-demo-weg').addEventListener('click', entferneDemo);

  $('#btn-protokoll-kopieren').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(protokollText() || '(leer)');
      melde('Protokoll kopiert.');
    } catch {
      melde('Kopieren nicht möglich — Text bitte markieren.');
    }
  });
  $('#btn-protokoll-leeren').addEventListener('click', () => {
    protokollLeeren();
    zeigeProtokoll();
    melde('Protokoll geleert.');
  });

  $('#btn-neu-laden').addEventListener('click', async () => {
    const registrierung = await navigator.serviceWorker?.getRegistration();
    if (registrierung) await registrierung.update();
    window.location.reload();
  });

  // Läuft das Protokoll mit, wächst die Anzeige live mit.
  beiEintrag(() => {
    if (!$('#protokoll-block').open) return;
    zeigeProtokoll();
  });
}

function aendere(patch) {
  einstellungen = speichereEinstellungen(patch);
  setzeFlags(einstellungen);
  log('daten', 'Einstellung geändert', patch);
}

function oeffneEinstellungen() {
  fuelleEinstellungen();
  $('#view-einstellungen').hidden = false;
  log('ui', 'Einstellungen geöffnet');
}

function fuelleEinstellungen() {
  for (const [sel, schluessel] of Object.entries(TEXTFELDER)) $(sel).value = einstellungen[schluessel] || '';
  for (const [sel, schluessel] of Object.entries(SCHALTER)) $(sel).checked = Boolean(einstellungen[schluessel]);
  $('#e-format').value = einstellungen.pdfFormat;

  baueDebugBereiche();
  zeigeSpeicher();
  zeigeProtokoll();

  $('#ueber-text').textContent = `Bordbuch ${BUILD} — alle Daten liegen auf diesem Gerät, `
    + 'nichts wird übertragen. Die Sicherung in den Daten-Einstellungen ist die einzige Kopie.';
}

function baueDebugBereiche() {
  const halter = $('#debug-bereiche');
  halter.textContent = '';
  halter.hidden = !einstellungen.debug;
  if (!einstellungen.debug) return;

  for (const bereich of BEREICHE) {
    const schluessel = `debug_${bereich.id}`;
    const kasten = el('input', { type: 'checkbox' });
    kasten.checked = einstellungen[schluessel] !== false;
    kasten.addEventListener('change', () => {
      aendere({ [schluessel]: kasten.checked });
      zeichneAlles();
    });

    halter.append(el('label', { class: 'schalter' },
      kasten,
      el('span', { class: 'schalter-bahn' }, el('span', { class: 'schalter-knopf' })),
      el('span', { class: 'schalter-text' }, bereich.label, el('small', { text: bereich.hinweis })),
    ));
  }
}

async function zeigeSpeicher() {
  const info = speicherInfo();
  const ablage = await belege.belegt();
  const karte = $('#speicher-status');
  karte.textContent = '';
  const zeilen = [
    ['Einträge', String(info.anzahl)],
    ['Davon Testdaten', String(eintraege.filter(istDemo).length)],
    ['Belege', `${ablage.anzahl} · ${(ablage.bytes / 1024 / 1024).toFixed(2)} MB`],
    ['Einträge belegen', `${(info.bytesGesamt / 1024).toFixed(1)} KB`],
    ['Fassung', BUILD],
  ];
  for (const [label, wert] of zeilen) {
    karte.append(el('div', {}, `${label}: `, el('b', { text: wert })));
  }
}

function zeigeProtokoll() {
  const text = protokollText();
  $('#protokoll').textContent = text || (flags.an
    ? 'Noch nichts protokolliert.'
    : 'Der Debug-Modus ist aus. Fehler werden trotzdem festgehalten.');
}

async function starteSelbsttest() {
  const halter = $('#test-ergebnisse');
  halter.textContent = '';
  const knopf = $('#btn-selbsttest');
  knopf.disabled = true;

  const summe = el('div', { class: 'test-summe', text: 'Läuft …' });
  halter.append(summe);

  try {
    // Erst hier laden: Der Selbsttest zieht jedes Modul der App herein
    // und hat beim normalen Start nichts zu suchen.
    const { laufeAlle, anzahlTests } = await import('./selbsttest.js');
    summe.textContent = `Läuft … 0 von ${anzahlTests}`;

    const ergebnisse = await laufeAlle((ergebnis, bisher) => {
      halter.append(el('div', { class: `testzeile ${ergebnis.ok ? 'ok' : 'weg'}` },
        el('span', { class: 'testmarke', text: ergebnis.ok ? 'bestanden' : 'fehler' }),
        el('span', {},
          el('span', { text: ergebnis.name }),
          el('span', { class: 'test-info', text: `${ergebnis.info}${ergebnis.ms ? ` · ${ergebnis.ms} ms` : ''}` }),
        ),
      ));
      summe.textContent = `Läuft … ${bisher.length} von ${anzahlTests}`;
    });

    const durchgefallen = ergebnisse.filter((ergebnis) => !ergebnis.ok).length;
    summe.textContent = durchgefallen
      ? `${durchgefallen} von ${ergebnisse.length} Prüfungen fehlgeschlagen`
      : `Alle ${ergebnisse.length} Prüfungen bestanden`;
  } catch (error) {
    fehler('ui', 'Selbsttest ließ sich nicht starten', error);
    summe.textContent = 'Der Selbsttest ließ sich nicht laden.';
  } finally {
    knopf.disabled = false;
    zeigeProtokoll();
  }
}

function legeDemoAn() {
  const neue = erzeugeDemo();
  eintraege = [...eintraege.filter((eintrag) => !istDemo(eintrag)), ...neue];
  sichere();
  springeZumLetztenMonat();
  zeichneAlles();
  zeigeSpeicher();
  melde(`${plural(neue.length, 'Testeintrag', 'Testeinträge')} angelegt.`);
  log('daten', 'Testdaten angelegt', { anzahl: neue.length });
}

function entferneDemo() {
  const vorher = eintraege.length;
  eintraege = eintraege.filter((eintrag) => !istDemo(eintrag));
  sichere();
  zeichneAlles();
  zeigeSpeicher();
  melde(`${plural(vorher - eintraege.length, 'Testeintrag', 'Testeinträge')} entfernt.`);
}

async function importiere(event) {
  const datei = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!datei) return;

  try {
    const daten = ausJSON(await datei.text());
    const gelesen = daten.eintraege.map(normalisiere).filter(Boolean);
    const ersetzen = window.confirm(
      `${plural(gelesen.length, 'Eintrag', 'Einträge')} gefunden.\n\n`
      + 'OK: bestehende Einträge ersetzen.\nAbbrechen: an die vorhandenen anhängen.',
    );

    if (ersetzen) {
      eintraege = gelesen;
    } else {
      const bekannt = new Set(eintraege.map((eintrag) => eintrag.id));
      eintraege = [...eintraege, ...gelesen.filter((eintrag) => !bekannt.has(eintrag.id))];
    }
    if (Array.isArray(daten.belege)) await belege.importiere(daten.belege);
    if (daten.einstellungen) {
      einstellungen = speichereEinstellungen(daten.einstellungen);
      setzeFlags(einstellungen);
      fuelleEinstellungen();
    }
    sichere();
    zeichneAlles();
    melde(`${plural(gelesen.length, 'Eintrag', 'Einträge')} übernommen.`);
    log('daten', 'Sicherung eingelesen', { anzahl: gelesen.length, ersetzt: ersetzen });
  } catch (error) {
    fehler('daten', 'Import fehlgeschlagen', error);
    melde(`Die Datei ließ sich nicht lesen: ${error.message}`);
  }
}

/* ── Rückmeldung ─────────────────────────────────────────── */

let toastTimer = null;

function melde(text) {
  const halter = $('#toast-halter');
  halter.textContent = '';
  halter.append(el('div', { class: 'toast', text }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { halter.textContent = ''; }, 3200);
}

function klopfen() {
  if (!einstellungen.haptik) return;
  try { navigator.vibrate?.(18); } catch { /* nicht überall vorhanden */ }
}

/* ── Offline ─────────────────────────────────────────────── */

function registriereWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((registrierung) => log('ui', 'Service Worker bereit', { scope: registrierung.scope }))
      .catch((error) => fehler('ui', 'Service Worker abgelehnt', error));
  });
}

start();
