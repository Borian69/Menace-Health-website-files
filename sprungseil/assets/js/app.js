/* Sprungseil — Ablauf und Verdrahtung.

   Drei Bereiche: Training, Gewicht, Verlauf. Darüber liegen die
   Laufansicht, der Abschluss, die Einstellungen und die Tafel.

   Gerechnet wird in rechnen.js, gezählt in uhr.js, gezeichnet in
   diagramm.js. Hier steht, wann was passiert. */

import { $, $$, el, zahl, datenzeile, meldung, uid, speichereDatei } from './util.js';
import { heuteISO, istISO, datumLang, datumKurz, monatJahr, plusTage, wochenStart, kalenderwoche } from './datum.js';
import { ganz, dez, vorzeichen, uhr, sekText, stundenText, liesZahl, plural } from './zahl.js';
import {
  TEMPO, TEMPI, EINHEITEN, KADENZ_MAX, einheitVon, pruefeEigene, springzeit, pausenzeit, dauer,
  bilanz, wochenSumme, letzteWochen, gesamt, gewichtAm, gleitend, gewichtTrend, empfehlung, phasen,
} from './rechnen.js';
import {
  ladeEinstellungen, speichereEinstellungen, ladeEinheiten, speichereEinheiten, ladeGewichte, speichereGewichte,
  speicherBytes, allesLoeschen, alsSicherung, ausSicherung,
} from './store.js';
import { Walzwerk } from './walzwerk.js';
import { Uhr } from './uhr.js';
import { wecke, TON, sage, verstumme, vibriere, wachHalten } from './signal.js';
import { wochenBalken, gewichtKurve } from './diagramm.js';
import { BUILD } from './fassung.js';

const M = window.Moch;

/* ── Zustand ─────────────────────────────────────────────── */

let einst = ladeEinstellungen();
let einheiten = ladeEinheiten();
let gewichte = ladeGewichte();
let gewaehlt = empfehlung(einheiten).id;
let lauf = null;        // { einheit, uhr } — solange eine Einheit läuft
let ergebnis = null;    // die beendete Einheit, bevor sie gespeichert ist
let seiten = null;
let eigeneFehler = false;   // die Felder der eigenen Einheit stimmen gerade nicht
const besucht = new Set([0]);

const heute = () => heuteISO();
const aktuelleEinheit = () => einheitVon(gewaehlt, einst.eigene);
const kgHeute = () => gewichtAm(gewichte, heute());
const nameVon = (id) => (EINHEITEN.find((e) => e.id === id) || EINHEITEN[0]).name;
const GEFUEHL = { leicht: 'Leicht', passend: 'Passend', hart: 'Hart' };

/* ── Bewegung (moch-motion.js) ───────────────────────────── */

const zwWoche = M.Zaehlwerk($('#zw-woche'), 0);
const wwGewicht = Walzwerk($('#zw-gewicht'), M);
const wwLauf = Walzwerk($('#zw-lauf'), M);
const wwAbschluss = Walzwerk($('#zw-abschluss'), M);
const summeKcal = M.Zaehler($('#summe-kcal'), 0);
const aktionTraining = M.Bedingt($('#aktion-training'));
const aktionGewicht = M.Bedingt($('#aktion-gewicht'));
const aktionAbschluss = M.Bedingt($('#aktion-abschluss'));
const toast = M.Toast($('#toast'));
let massWoche = null;
let massGewicht = null;

/** Eine Bemaßung je Spanne. Ändert sich die Spanne (neues Ziel), gibt es
    eine neue — die alte rechnete gegen falsche Enden. */
function mass(alt, knoten, von, bis) {
  if (alt && alt.von === von && alt.bis === bis) return alt;
  return Object.assign(M.Mass(knoten, von, bis), { von, bis });
}

/* ══════════════════ TRAINING ══════════════════ */

/* Der häufige Weg zuerst: vier Einheiten sichtbar, gezählt aus den
   eigenen Einträgen. Die gewählte und die empfohlene stehen immer vorn.
   Angezeigt wird in fester Reihenfolge — Stufen springen nicht. */
function baueEinheitChips() {
  const zaehler = new Map(EINHEITEN.map((e) => [e.id, 0]));
  einheiten.forEach((e) => zaehler.set(e.art, (zaehler.get(e.art) || 0) + 1));
  const ordnung = (id) => EINHEITEN.findIndex((e) => e.id === id);
  const nachHaeufigkeit = EINHEITEN.map((e) => e.id).sort((a, b) => zaehler.get(b) - zaehler.get(a) || ordnung(a) - ordnung(b));
  const muss = [gewaehlt, empfehlung(einheiten).id];
  const sichtbar = nachHaeufigkeit.slice(0, 4);
  for (const id of muss) {
    if (sichtbar.includes(id)) continue;
    const platz = [3, 2, 1, 0].find((i) => !muss.includes(sichtbar[i]));
    sichtbar[platz] = id;
  }
  const chip = (e) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(e.id === gewaehlt), 'data-id': e.id }, e.name);
  $('#chips-einheit').replaceChildren(...EINHEITEN.filter((e) => sichtbar.includes(e.id)).map(chip));
  const rest = EINHEITEN.filter((e) => !sichtbar.includes(e.id)).map(chip);
  rest.forEach((c, i) => c.style.setProperty('--i', i));
  $('#chips-einheit-2').replaceChildren(...rest);
  $('#btn-mehr span').textContent = mehrText();
  sperreMehr();
}

const mehrText = () => ($('#wahl-einheit').classList.contains('offen') ? 'Weniger anzeigen' : `Weitere ${$('#chips-einheit-2').children.length} anzeigen`);
/* Zugeklappte Chips sind unsichtbar — dann auch nicht per Tab erreichbar. */
const sperreMehr = () => { $('#wahl-einheit .mehr-wrap').inert = !$('#wahl-einheit').classList.contains('offen'); };

function waehleEinheit(id) {
  if (id === gewaehlt) return;
  gewaehlt = id;
  if (!$(`#chips-einheit [data-id="${id}"]`) && !$('#wahl-einheit').classList.contains('offen')) baueEinheitChips();
  $$('#wahl-einheit .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
  zeigeEinheit(true);
  zeigeHinweise();
}

function kennung(e) {
  const art = e.stufe ? `Stufe ${e.stufe}` : e.id === 'tabata' ? 'Zusatz' : 'Frei';
  return `${art} · ${e.runden} × ${sekText(e.springen)} / ${sekText(e.pause)}`;
}

function zeigeEinheit(animiert = false) {
  const e = aktuelleEinheit();
  const titel = $('#einheit-titel');
  if (titel.dataset.name !== e.name) {
    titel.dataset.name = e.name;
    titel.textContent = e.name;
    M.titelWoerter(titel);
    if (animiert) M.zeigeTitel($('#s-training .app-kopf'));
  }
  $('#einheit-kz').textContent = kennung(e);
  if (seiten && seiten.aktiv === 0) $('#leiste-titel').textContent = e.name;

  const eigene = e.id === 'eigene';
  $('#eigene-gruppe').hidden = !eigene;
  const gueltig = !eigene || !eigeneFehler;

  /* Die Strecke: Länge gleich Dauer. */
  const streifen = [];
  for (let r = 1; r <= e.runden; r += 1) {
    streifen.push(el('i', { class: 's', style: `flex-grow:${e.springen}` }));
    if (r < e.runden && e.pause > 0) streifen.push(el('i', { class: 'p', style: `flex-grow:${e.pause}` }));
  }
  $('#ablauf').replaceChildren(...(gueltig ? streifen : []));

  const b = bilanz({ springSek: springzeit(e), pauseSek: pausenzeit(e), tempo: einst.tempo, kg: kgHeute() });
  datenzeile($('#ablauf-daten'), gueltig ? [
    ['Springen', uhr(springzeit(e))],
    ['Gesamt', uhr(dauer(e))],
    b.kcal != null && ['≈', ganz(b.kcal), 'kcal'],
    ['≈', ganz(b.spruenge), 'Sprünge'],
  ] : []);

  aktionTraining.zeige(gueltig);
}

function baueTempoChips() {
  $('#chips-tempo').replaceChildren(...TEMPI.map((t) =>
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(t.id === einst.tempo), 'data-tempo': t.id }, t.name)));
  zeigeTempo();
}

function zeigeTempo() {
  const t = TEMPO[einst.tempo];
  const spanne = t.von ? [zahl(t.von, 'span'), '–', zahl(t.bis, 'span')] : ['Unter ', zahl(t.bis, 'span')];
  $('#tempo-info').replaceChildren(...spanne, ' Sprünge pro Minute · ', zahl(dez(t.met), 'span'), ' MET');
}

/* Diese Woche: Trainingsminuten gegen das Wochenziel. */
function zeigeWoche() {
  const w = wochenSumme(einheiten, wochenStart(heute()));
  const ziel = einst.wochenziel;
  massWoche = mass(massWoche, $('#woche-mass'), 0, ziel);
  zwWoche.zaehle(w.minuten);
  massWoche.zeige(w.minuten);
  $('#woche-von').replaceChildren('Mo ', zahl(datumKurz(w.start)));
  $('#woche-rest').replaceChildren(...(w.minuten >= ziel ? ['Ziel erreicht'] : ['noch ', zahl(ziel - w.minuten), ' min']));
  $('#woche-ziel').replaceChildren('Ziel ', zahl(ziel));
  datenzeile($('#woche-daten'), [
    [plural(w.anzahl, 'Einheit', 'Einheiten'), ganz(w.anzahl)],
    ['Springen', uhr(w.springSek)],
    w.kcal > 0 && ['', ganz(w.kcal), 'kcal'],
    w.kcal > 0 && ['Fett ≈', ganz(w.fett), 'g'],
  ]);
}

/* Der Plan spricht: welche Stufe als Nächstes, und warum. */
function zeigeHinweise() {
  const emp = empfehlung(einheiten);
  const ziel = einheitVon(emp.id);
  const letzte = emp.letzte ? nameVon(emp.letzte.art) : '';
  const fett = (t) => el('strong', { text: t });
  const teile = {
    erste: [fett('Start mit Einstieg.'), ' Zehn Runden à ', zahl(30, 'span'), ' s. Fünf Stufen führen von ',
      zahl(5, 'span'), ' auf ', zahl(15, 'span'), ' Minuten reine Springzeit.'],
    abgebrochen: [fett(`${ziel.name} wiederholen.`), ' Zuletzt ', zahl(emp.letzte?.rundenFertig ?? 0, 'span'), ' von ',
      zahl(emp.letzte?.runden ?? 0, 'span'), ' Runden.'],
    hart: [fett(`${ziel.name} wiederholen.`), ' Die letzte Einheit war hart. Erst sicher, dann länger.'],
    leicht: [fett(`Bereit für ${ziel.name}.`), ` ${letzte} war zuletzt leicht. Jetzt `, zahl(ziel.runden, 'span'), ' × ',
      zahl(sekText(ziel.springen), 'span'), '.'],
    zweimal: [fett(`Bereit für ${ziel.name}.`), ` Zweimal ${letzte} vollständig, keinmal hart. Jetzt `,
      zahl(ziel.runden, 'span'), ' × ', zahl(sekText(ziel.springen), 'span'), '.'],
    nochmal: [fett(`${ziel.name} noch einmal.`), ' Nach zwei vollständigen Einheiten ohne „hart“ geht es eine Stufe höher.'],
    oben: [fett(`${ziel.name} ist die letzte Stufe.`), ' Mehr bringt jetzt eine weitere Einheit pro Woche.'],
  }[emp.grund];
  const knopf = gewaehlt !== emp.id
    ? el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => waehleEinheit(emp.id) }, `${ziel.name} wählen`)
    : null;
  $('#empfehlung-text').replaceChildren(el('p', {}, ...teile), knopf || '');
  $('#hinweis-gewicht').hidden = gewichte.length > 0;
}

function pruefeEigeneFelder() {
  const felder = { runden: '#e-runden', springen: '#e-springen', pause: '#e-pause' };
  const werte = Object.fromEntries(Object.entries(felder).map(([k, sel]) => [k, liesZahl($(sel).value)]));
  const p = pruefeEigene(werte);
  for (const [k, sel] of Object.entries(felder)) {
    const fehlt = Boolean(p.fehler[k]);
    $(sel).closest('.field').classList.toggle('has-error', fehlt);
    $(sel).setAttribute('aria-invalid', String(fehlt));
  }
  const huelle = $('#feld-eigene-msg');
  huelle.classList.toggle('has-error', !p.ok);
  huelle.classList.toggle('is-valid', p.ok);
  eigeneFehler = !p.ok;
  if (p.ok) {
    einst.eigene = p.werte;
    speichereEinstellungen(einst);
    const e = aktuelleEinheit();
    meldung($('#eigene-msg'), zahl(uhr(springzeit(e)), 'span'), ' Springen in ', zahl(uhr(dauer(e)), 'span'), ' Minuten.');
  } else {
    /* Gespeichert bleibt der letzte gültige Stand; gestartet wird erst wieder,
       wenn alle drei Felder stimmen. */
    meldung($('#eigene-msg'), `Fehler: ${Object.values(p.fehler).join(' ')}`);
  }
  zeigeEinheit();
}

/* ══════════════════ LAUF ══════════════════ */

const PHASE = { vorlauf: 'Bereit machen', springen: 'Springen', pause: 'Pause' };

function zeigeUhr(text, sanft) {
  /* Breite in em: Walzen .62, Trenner .26 (moch.css). Die Uhr füllt die
     Zeile, egal ob „0:20“ oder „10:00“ dasteht. */
  const breite = text.replace(/\D/g, '').length * 0.62 + text.replace(/\d/g, '').length * 0.26 + 0.04;
  $('#zw-lauf').parentElement.style.setProperty('--breite', breite.toFixed(2));
  wwLauf.zeige(text, sanft ? { T: 0.55, stagger: 45 } : { T: 0.32, stagger: 0 });
}

function zeigePhase(stand) {
  const ansicht = $('#lauf');
  const { phase, naechste } = stand;
  const e = lauf.einheit;
  ansicht.dataset.phase = phase.art;
  $('#lauf-phase').textContent = PHASE[phase.art];
  $('#lauf-runde').textContent = `Runde ${phase.runde} von ${e.runden}`;
  let danach = 'Danach: geschafft.';
  if (naechste && naechste.art === 'pause') danach = `Danach: ${sekText(naechste.dauer)} Pause.`;
  else if (naechste) danach = `Danach: Runde ${naechste.runde}, ${sekText(naechste.dauer)} springen.`;
  $('#lauf-danach').textContent = danach;
}

function beiWechsel(stand, war) {
  zeigePhase(stand);
  if (war < 0) return;
  const { phase } = stand;
  const n = lauf.einheit.runden;
  if (phase.art === 'springen') {
    if (einst.toene) TON.springen();
    if (einst.ansage) sage(phase.runde === n && n > 1 ? 'Letzte Runde' : 'Springen');
    if (einst.haptik) vibriere(90);
  } else if (phase.art === 'pause') {
    const uebrig = n - phase.runde;
    if (einst.toene) TON.pause();
    if (einst.ansage) sage(uebrig === 1 ? 'Pause. Noch eine Runde.' : `Pause. Noch ${uebrig} Runden.`);
    if (einst.haptik) vibriere([40, 60, 40]);
  }
}

function beiSekunde(stand, sekunde) {
  zeigeUhr(uhr(sekunde));
  /* Drei, zwei, eins — dann der Wechselton. */
  if (sekunde >= 1 && sekunde <= 3 && sekunde < stand.phase.dauer && einst.toene) TON.zaehlen();
  $('#lauf-verstrichen').textContent = uhr(stand.verstrichen);
  $('#lauf-rest').replaceChildren('noch ', zahl(uhr(stand.gesamt - stand.verstrichen)));
  const b = bilanz({ springSek: stand.springSek, pauseSek: stand.pauseSek, tempo: einst.tempo, kg: lauf.kg });
  datenzeile($('#lauf-daten'), [
    ['Springen', uhr(stand.springSek)],
    b.kcal != null && ['', ganz(b.kcal), 'kcal'],
    ['≈', ganz(b.spruenge), 'Sprünge'],
  ]);
}

function beiBild(stand) {
  $('#lauf-mass').style.setProperty('--wert', stand.gesamt ? stand.verstrichen / stand.gesamt : 0);
}

function beiEnde(stand) {
  wachHalten(false);
  if (einst.toene) TON.fertig();
  if (einst.ansage) sage('Geschafft.');
  if (einst.haptik) vibriere([80, 60, 80, 60, 160]);
  $('#lauf-phase').textContent = 'Geschafft';
  $('#btn-halt').disabled = true;
  setTimeout(() => zeigeAbschluss(stand, true), 900);
}

function starteTraining() {
  const e = aktuelleEinheit();
  if (e.id === 'eigene' && eigeneFehler) return;
  wecke();
  const liste = phasen(e, einst.vorlauf);
  lauf = { einheit: e, kg: kgHeute(), uhr: Uhr(liste, { beiWechsel, beiSekunde, beiBild, beiEnde }) };

  const ansicht = $('#lauf');
  ansicht.classList.remove('angehalten');
  ansicht.hidden = false;
  $('#lauf-name').textContent = e.name;
  $('#lauf-gesamt').textContent = uhr(dauer(e));
  $('#btn-halt').textContent = 'Anhalten';
  $('#btn-halt').disabled = false;
  /* Der zweite Knopf hält seinen Platz frei: Erscheint er beim Anhalten,
     springt die Uhr nicht nach oben. */
  $('#btn-beenden').style.visibility = 'hidden';
  $('#lauf-mass').style.setProperty('--wert', 0);

  /* Die Uhr rollt beim Start von null auf den Vorlauf hoch. */
  zeigeUhr(uhr(einst.vorlauf), true);
  wachHalten(true);
  if (einst.ansage) sage(`${e.name}. ${e.runden} Runden.`);
  lauf.uhr.los();
  $('#btn-halt').focus({ preventScroll: true });
}

function halteOderWeiter() {
  if (!lauf) return;
  const ansicht = $('#lauf');
  if (lauf.uhr.laeuft) {
    lauf.uhr.halt();
    verstumme();
    ansicht.classList.add('angehalten');
    $('#lauf-phase').textContent = 'Angehalten';
    $('#btn-halt').textContent = 'Weiter';
    $('#btn-beenden').style.visibility = '';
  } else {
    wecke();
    ansicht.classList.remove('angehalten');
    zeigePhase(lauf.uhr.stand());
    $('#btn-halt').textContent = 'Anhalten';
    $('#btn-beenden').style.visibility = 'hidden';
    lauf.uhr.los();
  }
}

function beendeTraining() {
  if (!lauf) return;
  const stand = lauf.uhr.aus();
  wachHalten(false);
  verstumme();
  if (stand.springSek < 1) {
    $('#lauf').hidden = true;
    lauf = null;
    toast.zeige('Abgebrochen.', 'Nichts gespeichert — gesprungen wurde noch nicht.');
    return;
  }
  zeigeAbschluss(stand, false);
}

/* ══════════════════ ABSCHLUSS ══════════════════ */

function zeigeAbschluss(stand, vollstaendig) {
  const e = lauf.einheit;
  ergebnis = { einheit: e, stand, vollstaendig, kg: lauf.kg, gefuehl: null, gezaehlt: null, gezaehltFehler: false,
    datum: heute(), zeit: new Date().toISOString() };
  $('#lauf').hidden = true;
  lauf = null;

  const blatt = $('#abschluss');
  blatt.hidden = false;
  $('.blatt-scroll', blatt).scrollTop = 0;
  const titel = $('#abschluss-titel');
  titel.textContent = e.name;
  M.titelWoerter(titel);
  $('#abschluss-kz').textContent = `${vollstaendig ? 'Vollständig' : 'Abgebrochen'} · ${stand.runden} von ${e.runden} Runden`;
  $$('#chips-gefuehl .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  $('#a-gezaehlt').value = '';
  pruefeGezaehlt();
  aktionAbschluss.zeige(false);
  $('#btn-sichern').textContent = 'Einheit speichern';
  $('#btn-sichern').removeAttribute('aria-busy');

  M.zeigeTitel($('#abschluss-kopf'));
  M.staffel($$('#abschluss .gruppe'), 70, 120);
  setTimeout(() => { zeigeErgebnis(true); M.zieheLinie($$('#abschluss .dataline')); }, 220);
}

function zeigeErgebnis(sanft = false) {
  const { stand } = ergebnis;
  const b = bilanz({ springSek: stand.springSek, pauseSek: stand.pauseSek, tempo: einst.tempo, kg: ergebnis.kg, gezaehlt: ergebnis.gezaehlt });
  ergebnis.bilanz = b;
  const feder = { T: sanft ? 0.55 : 0.4, stagger: sanft ? 45 : 20 };
  if (b.kcal != null) {
    $('#abschluss-lb').textContent = 'Verbrannt · netto';
    $('#abschluss-einheit').textContent = 'KCAL';
    wwAbschluss.zeige(ganz(b.kcal), feder);
  } else {
    $('#abschluss-lb').textContent = 'Springzeit · ohne Gewicht keine Kalorien';
    $('#abschluss-einheit').textContent = 'MIN';
    wwAbschluss.zeige(uhr(stand.springSek), feder);
  }
  datenzeile($('#abschluss-daten'), [
    b.kcal != null && ['Springen', uhr(stand.springSek)],
    [b.gemessen ? 'Sprünge' : 'Sprünge ≈', ganz(b.spruenge)],
    b.gemessen && ['', ganz(b.kadenz), '/ min'],
    b.fett != null && ['Fett ≈', ganz(b.fett), 'g'],
  ]);
}

function pruefeGezaehlt() {
  const feld = $('#a-gezaehlt');
  const roh = feld.value.trim();
  const n = liesZahl(roh);
  const minuten = ergebnis.stand.springSek / 60;
  let fehler = null;
  if (roh && !(Number.isInteger(n) && n > 0)) fehler = 'Fehler: Bitte eine ganze Zahl.';
  else if (roh && n / minuten > KADENZ_MAX) {
    fehler = `Fehler: Das wären ${ganz(n / minuten)} pro Minute. Mehr als ${KADENZ_MAX} hält niemand eine Einheit lang.`;
  }
  ergebnis.gezaehlt = roh && !fehler ? n : null;
  ergebnis.gezaehltFehler = Boolean(fehler);
  const huelle = $('#feld-gezaehlt');
  huelle.classList.toggle('has-error', Boolean(fehler));
  huelle.classList.toggle('is-valid', Boolean(ergebnis.gezaehlt));
  feld.setAttribute('aria-invalid', String(Boolean(fehler)));
  zeigeErgebnis();
  const b = ergebnis.bilanz;
  const msg = $('#gezaehlt-msg');
  if (fehler) meldung(msg, fehler);
  else if (ergebnis.gezaehlt) {
    meldung(msg, zahl(ganz(b.kadenz), 'span'), ' pro Minute — Tempo ', TEMPO[b.tempo].name.toLowerCase(), ', ',
      zahl(dez(b.met), 'span'), ' MET. Gemessen statt geschätzt.');
  } else meldung(msg, 'Mit Zähler im Griff wird aus der Schätzung eine Messung.');
  pruefeAbschluss();
}

/* Gespeichert wird erst mit einem Gefühl: Davon hängt die nächste Stufe ab. */
const pruefeAbschluss = () => aktionAbschluss.zeige(Boolean(ergebnis.gefuehl) && !ergebnis.gezaehltFehler);

function sichereEinheit() {
  const knopf = $('#btn-sichern');
  if (!ergebnis || !ergebnis.gefuehl || knopf.getAttribute('aria-busy') === 'true') return;
  knopf.setAttribute('aria-busy', 'true');
  knopf.textContent = 'Speichert …';
  setTimeout(() => {
    const { einheit: e, stand, bilanz: b } = ergebnis;
    const eintrag = {
      id: uid(),
      datum: ergebnis.datum,
      zeit: ergebnis.zeit,
      art: e.id,
      runden: e.runden,
      springen: e.springen,
      pause: e.pause,
      rundenFertig: stand.runden,
      vollstaendig: ergebnis.vollstaendig,
      springSek: Math.round(stand.springSek),
      dauerSek: Math.round(stand.verstrichen),
      tempo: b.tempo,
      gezaehlt: b.gemessen,
      spruenge: b.spruenge,
      kg: ergebnis.kg,
      kcal: b.kcal == null ? null : Math.round(b.kcal),
      gefuehl: ergebnis.gefuehl,
    };
    const neu = [...einheiten, eintrag];
    if (!speichereEinheiten(neu)) {
      knopf.removeAttribute('aria-busy');
      knopf.textContent = 'Einheit speichern';
      toast.zeige('Nicht gespeichert.', 'Der Speicher des Browsers ist voll oder gesperrt.');
      return;
    }
    einheiten = neu;
    ergebnis = null;
    $('#abschluss').hidden = true;

    /* Der Plan rückt weiter: Die nächste Empfehlung ist gewählt. */
    gewaehlt = empfehlung(einheiten).id;
    baueEinheitChips();
    zeigeEinheit(true);
    zeigeHinweise();
    zeigeVerlauf();
    zeigeGewicht();
    if (seiten.aktiv !== 0) seiten.gehe(0);
    $('#s-training').scrollTo({ top: 0, behavior: M.reduziert.matches ? 'auto' : 'smooth' });
    zeigeWoche();
    toast.zeige('Gespeichert.', `${e.name} · ${uhr(eintrag.springSek)} min Springen${eintrag.kcal != null ? ` · ${ganz(eintrag.kcal)} kcal` : ''}`);
  }, 450);
}

function verwirfEinheit() {
  const s = ergebnis.stand;
  tafel({
    titel: 'Einheit verwerfen?',
    inhalt: [el('p', {}, zahl(uhr(s.springSek), 'span'), ' Minuten Springen tauchen dann nirgends auf — nicht in der Woche, nicht im Plan.')],
    knoepfe: [
      { text: 'Verwerfen', klasse: 'btn-ghost gefahr', tun: () => { ergebnis = null; $('#abschluss').hidden = true; toast.zeige('Verworfen.', 'Nichts gespeichert.'); } },
      { text: 'Zurück' },
    ],
  });
}

/* ══════════════════ GEWICHT ══════════════════ */

function zeigeGewicht(animiert = besucht.has(1)) {
  const trend = gewichtTrend(gewichte, einst.zielgewicht);
  const ziel = einst.zielgewicht;
  $('#gewicht-gruppe').hidden = !trend;
  $('#gewicht-leer').hidden = Boolean(trend);
  $('#gewicht-figur').hidden = gewichte.length < 2;

  $('#gewicht-kz').textContent = trend
    ? `${trend.anzahl} ${plural(trend.anzahl, 'Messung', 'Messungen')} seit ${datumLang(trend.erster.datum)}`
    : 'Noch keine Messung';

  zeigeFettText();
  zeigeGewichtListe();
  if (!trend) return;

  if (animiert) wwGewicht.zeige(dez(trend.aktuell, 1));
  datenzeile($('#gewicht-daten'), [
    ['Zuletzt', dez(trend.letzter.kg), 'kg'],
    trend.anzahl > 1 && ['Seit Start', vorzeichen(trend.seitStart), 'kg'],
    trend.proWoche != null && ['Pro Woche', vorzeichen(trend.proWoche), 'kg'],
    trend.zielDatum && ['Ziel ≈', datumLang(trend.zielDatum)],
  ]);

  const mitMass = ziel > 0 && Math.abs(trend.erster.kg - ziel) >= 0.5;
  $('#gewicht-mass').hidden = !mitMass;
  if (mitMass) {
    massGewicht = mass(massGewicht, $('#gewicht-mass'), trend.erster.kg, ziel);
    if (animiert) massGewicht.zeige(trend.aktuell);
    $('#g-start').replaceChildren('Start ', zahl(dez(trend.erster.kg)));
    $('#g-ziel').replaceChildren('Ziel ', zahl(dez(ziel)));
    $('#g-rest').replaceChildren(...(trend.erreicht ? ['Ziel erreicht'] : ['noch ', zahl(dez(Math.abs(ziel - trend.aktuell))), ' kg']));
  }
  if (animiert) zeichneGewicht();
}

/* Was das Training wiegt — und was nicht. Ein Satz mit Zahlen statt
   eines Versprechens. */
function zeigeFettText() {
  const ab = plusTage(heute(), -6);
  const kcal = einheiten.filter((e) => e.datum >= ab).reduce((s, e) => s + (e.kcal || 0), 0);
  const n = (t) => zahl(t, 'span');
  const nb = '\u00a0';   // Zahl und Einheit brechen nicht auseinander
  const teile = ['Ein Kilo Körperfett speichert rund ', n('7.700'), `${nb}kcal. `];
  if (kcal > 0) teile.push('Deine Einheiten der letzten sieben Tage: ', n(ganz(kcal)), `${nb}kcal, also${nb}≈${nb}`, n(ganz((kcal / 7700) * 1000)), `${nb}g. `);
  teile.push('Den Rest macht die Ernährung: ', n(500), `${nb}kcal weniger am Tag sind${nb}≈${nb}`, n(450), `${nb}g pro Woche.`);
  $('#fett-text').replaceChildren(...teile);
}

function zeichneGewicht() {
  const halter = $('#gewicht-diagramm');
  if (gewichte.length < 2) { halter.replaceChildren(); return; }
  const letzter = gewichte[gewichte.length - 1].datum;
  const punkte = gleitend(gewichte).filter((g) => g.datum >= plusTage(letzter, -89));
  const lesehilfe = $('#gewicht-lesehilfe');
  const ruhe = () => lesehilfe.replaceChildren(zahl(punkte.length, 'span'), ` ${plural(punkte.length, 'Messung', 'Messungen')} · antippen für Werte`);
  ruhe();
  halter.replaceChildren(gewichtKurve(punkte, einst.zielgewicht, breiteVon(halter), {
    beiAuswahl(i) {
      if (i === null) return ruhe();
      const p = punkte[i];
      lesehilfe.replaceChildren(zahl(datumKurz(p.datum), 'span'), ' · ', zahl(dez(p.kg), 'span'), ' kg · Ø 7 Tage ', zahl(dez(p.trend), 'span'), ' kg');
    },
  }));
  $('#legende-ziel').hidden = !halter.querySelector('.dg-ziel');
}

function zeigeGewichtListe() {
  const liste = gleitend(gewichte).reverse();
  const behaelter = $('#gewicht-liste');
  if (!liste.length) { behaelter.replaceChildren(); return; }
  const monate = [];
  liste.forEach((g, i) => {
    const titel = monatJahr(g.datum);
    if (!monate.length || monate[monate.length - 1].titel !== titel) monate.push({ titel, zeilen: [] });
    const davor = liste[i + 1];
    const zeile = el('button', { type: 'button', class: 'eintrag', onclick: () => zeigeMessung(g) },
      el('span', { class: 'tag n', text: datumKurz(g.datum) }),
      el('span', { class: 'was' }, ...(davor ? [zahl(vorzeichen(g.kg - davor.kg), 'span'), ' kg'] : ['Erste Messung']),
        el('small', {}, 'Ø 7 Tage ', zahl(dez(g.trend), 'span'), ' kg')),
      el('span', { class: 'wert n', text: dez(g.kg) }));
    monate[monate.length - 1].zeilen.push(zeile);
  });
  behaelter.replaceChildren(...monate.map((m) => el('div', { class: 'monat' }, el('span', { class: 'lb', text: m.titel }), ...m.zeilen)));
}

function zeigeMessung(g) {
  tafel({
    titel: `${dez(g.kg)} kg`,
    inhalt: [tafelListe([['Datum', datumLang(g.datum)], ['Ø 7 Tage', `${dez(g.trend)} kg`]])],
    knoepfe: [
      { text: 'Messung löschen', klasse: 'btn-ghost gefahr', tun: () => {
        gewichte = gewichte.filter((h) => h.datum !== g.datum);
        speichereGewichte(gewichte);
        zeigeGewicht(true);
        zeigeEinheit();
        zeigeHinweise();
        toast.zeige('Gelöscht.', `${dez(g.kg)} kg vom ${datumKurz(g.datum)}`);
      } },
      { text: 'Schließen' },
    ],
  });
}

function pruefeGewicht() {
  const feld = $('#g-kg');
  const roh = feld.value.trim();
  const kg = liesZahl(roh);
  const datum = $('#g-datum').value;
  let fehler = null;
  let info = ['Morgens, nüchtern, gleiche Waage — dann ist der Trend vergleichbar.'];
  if (!istISO(datum)) fehler = 'Fehler: Das Datum fehlt.';
  else if (datum > heute()) fehler = 'Fehler: Das Datum liegt in der Zukunft.';
  else if (roh && !(kg >= 30 && kg <= 300)) fehler = 'Fehler: Zwischen 30 und 300 kg.';
  else if (roh) {
    const gleich = gewichte.find((g) => g.datum === datum);
    const davor = gewichte.filter((g) => g.datum < datum).pop();
    if (gleich) info = ['Ersetzt ', zahl(dez(gleich.kg), 'span'), ` kg vom ${datumKurz(datum)}`];
    else if (davor) info = [zahl(vorzeichen(kg - davor.kg), 'span'), ` kg zum ${datumKurz(davor.datum)}`];
    else info = ['Erste Messung. Ab drei Messungen über eine Woche steht hier ein Tempo.'];
  }
  const ok = Boolean(roh) && !fehler;
  $('#feld-kg').classList.toggle('has-error', Boolean(fehler));
  $('#feld-kg-msg').classList.toggle('has-error', Boolean(fehler));
  $('#feld-kg-msg').classList.toggle('is-valid', ok);
  feld.setAttribute('aria-invalid', String(Boolean(fehler)));
  meldung($('#kg-msg'), ...(fehler ? [fehler] : info));
  aktionGewicht.zeige(ok);
  return ok ? { datum, kg: Math.round(kg * 10) / 10 } : null;
}

function speichereGewicht() {
  const wert = pruefeGewicht();
  const knopf = $('#btn-gewicht');
  if (!wert || knopf.getAttribute('aria-busy') === 'true') return;
  knopf.setAttribute('aria-busy', 'true');
  knopf.textContent = 'Speichert …';
  setTimeout(() => {
    knopf.removeAttribute('aria-busy');
    knopf.textContent = 'Gewicht speichern';
    const davor = gewichte.filter((g) => g.datum < wert.datum).pop();
    const neu = [...gewichte.filter((g) => g.datum !== wert.datum), wert].sort((a, b) => (a.datum < b.datum ? -1 : 1));
    if (!speichereGewichte(neu)) { toast.zeige('Nicht gespeichert.', 'Der Speicher des Browsers ist voll oder gesperrt.'); return; }
    gewichte = neu;
    $('#g-kg').value = '';
    $('#g-kg').blur();
    pruefeGewicht();
    zeigeGewicht(true);
    zeigeEinheit();
    zeigeHinweise();
    if (navigator.vibrate && einst.haptik) navigator.vibrate(12);
    toast.zeige('Gespeichert.', `${dez(wert.kg)} kg am ${datumKurz(wert.datum)}${davor ? ` · ${vorzeichen(wert.kg - davor.kg)} kg` : ''}`);
  }, 450);
}

/* ══════════════════ VERLAUF ══════════════════ */

function zeigeVerlauf(animiert = besucht.has(2)) {
  const g = gesamt(einheiten);
  $('#verlauf-kz').textContent = einheiten.length
    ? `${einheiten.length} ${plural(einheiten.length, 'Einheit', 'Einheiten')} seit ${datumLang(einheiten[0].datum)}`
    : 'Noch keine Einheit';
  if (animiert) summeKcal.zu(g.kcal);
  datenzeile($('#summe-daten'), [
    ['Springen', stundenText(g.springSek)],
    ['Sprünge ≈', ganz(g.spruenge)],
    ['Fett ≈', ganz(g.fett), 'g'],
  ]);
  if (animiert) zeichneWochen();
  zeigeVerlaufListe();
}

function zeichneWochen() {
  const wochen = letzteWochen(einheiten, heute(), 8);
  const ziel = einst.wochenziel;
  const erreicht = wochen.filter((w) => w.minuten >= ziel).length;
  const lesehilfe = $('#wochen-lesehilfe');
  const ruhe = () => lesehilfe.replaceChildren(zahl(erreicht, 'span'), ' von ', zahl(wochen.length, 'span'), ' Wochen am Ziel · antippen für Werte');
  ruhe();
  $('#wochen-ziel-text').textContent = ziel;
  const halter = $('#wochen-diagramm');
  halter.replaceChildren(wochenBalken(wochen, ziel, breiteVon(halter), {
    beiAuswahl(i) {
      if (i === null) return ruhe();
      const w = wochen[i];
      lesehilfe.replaceChildren(`KW `, zahl(kalenderwoche(w.start), 'span'), ' · ', zahl(w.minuten, 'span'), ' min · ',
        zahl(w.anzahl, 'span'), ` ${plural(w.anzahl, 'Einheit', 'Einheiten')}`, ...(w.kcal ? [' · ', zahl(ganz(w.kcal), 'span'), ' kcal'] : []));
    },
  }));
}

function zeigeVerlaufListe() {
  const behaelter = $('#verlauf-liste');
  if (!einheiten.length) {
    const erste = einheitVon('einstieg');
    behaelter.replaceChildren(el('div', { class: 'empty' }, el('p', {}, 'Noch keine Einheit. Die erste dauert ',
      zahl(uhr(dauer(erste)), 'span'), ' Minuten, davon ', zahl(uhr(springzeit(erste)), 'span'), ' springen.')));
    return;
  }
  const monate = [];
  [...einheiten].reverse().forEach((e) => {
    const titel = monatJahr(e.datum);
    if (!monate.length || monate[monate.length - 1].titel !== titel) monate.push({ titel, zeilen: [] });
    const runden = e.vollstaendig ? `${e.runden}` : `${e.rundenFertig}/${e.runden}`;
    const worte = [TEMPO[e.tempo].name, e.gefuehl && GEFUEHL[e.gefuehl]].filter(Boolean).join(' · ');
    const zusatz = [zahl(runden, 'span'), ' × ', zahl(sekText(e.springen), 'span'), ` · ${worte}`];
    monate[monate.length - 1].zeilen.push(el('button', { type: 'button', class: 'eintrag', onclick: () => zeigeEinheitDetails(e) },
      el('span', { class: 'tag n', text: datumKurz(e.datum) }),
      el('span', { class: 'was' }, nameVon(e.art), el('small', {}, ...zusatz)),
      el('span', { class: 'wert n' }, uhr(e.springSek), e.kcal != null ? el('small', { text: `${ganz(e.kcal)} kcal` }) : '')));
  });
  behaelter.replaceChildren(...monate.map((m) => el('div', { class: 'monat' }, el('span', { class: 'lb', text: m.titel }), ...m.zeilen)));
}

function zeigeEinheitDetails(e) {
  const zeit = new Date(e.zeit);
  const uhrzeit = Number.isNaN(zeit.getTime()) ? '' : `, ${zeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  tafel({
    titel: nameVon(e.art),
    inhalt: [tafelListe([
      ['Datum', `${datumLang(e.datum)}${uhrzeit}`],
      ['Runden', `${e.rundenFertig} von ${e.runden} · ${sekText(e.springen)} / ${sekText(e.pause)}`],
      ['Springen', `${uhr(e.springSek)} min`],
      ['Gesamt', `${uhr(e.dauerSek)} min`],
      ['Tempo', `${TEMPO[e.tempo].name}${e.gezaehlt ? ', gemessen' : ', geschätzt'}`],
      ['Sprünge', `${e.gezaehlt ? '' : '≈ '}${ganz(e.spruenge)}`],
      ['Verbrannt', e.kcal != null ? `${ganz(e.kcal)} kcal netto` : 'ohne Gewicht keine Zahl'],
      e.kg && ['Gewicht', `${dez(e.kg)} kg`],
      ['Gefühl', e.gefuehl ? GEFUEHL[e.gefuehl] : '–'],
    ])],
    knoepfe: [
      { text: 'Einheit löschen', klasse: 'btn-ghost gefahr', tun: () => {
        einheiten = einheiten.filter((x) => x.id !== e.id);
        speichereEinheiten(einheiten);
        baueEinheitChips();
        zeigeWoche();
        zeigeHinweise();
        zeigeVerlauf(true);
        zeigeGewicht();
        toast.zeige('Gelöscht.', `${nameVon(e.art)} vom ${datumKurz(e.datum)}`);
      } },
      { text: 'Schließen' },
    ],
  });
}

/* ══════════════════ TAFEL ══════════════════ */

function tafelListe(zeilen) {
  return el('dl', { class: 'tafel-liste' }, ...zeilen.filter(Boolean).map(([k, v]) =>
    el('div', {}, el('dt', { text: k }), el('dd', { class: /\d/.test(v) ? 'n' : '', text: v }))));
}

let tafelVorher = null;
function tafel({ titel, inhalt = [], knoepfe = [] }) {
  tafelVorher = document.activeElement;
  $('#tafel-titel').textContent = titel;
  $('#tafel-inhalt').replaceChildren(...inhalt);
  $('#tafel-knoepfe').replaceChildren(...knoepfe.map((k) => el('button', {
    type: 'button',
    class: `btn btn-block ${k.klasse || 'btn-quiet'}`,
    onclick: () => { schliesseTafel(); if (k.tun) k.tun(); },
  }, k.text)));
  $('#blende').hidden = false;
  $('#tafel-knoepfe button')?.focus({ preventScroll: true });
}

function schliesseTafel() {
  $('#blende').hidden = true;
  if (tafelVorher && tafelVorher.isConnected) tafelVorher.focus({ preventScroll: true });
}

/* ══════════════════ EINSTELLUNGEN ══════════════════ */

function oeffneEinstellungen() {
  $('#s-wochenziel').value = einst.wochenziel;
  $('#s-zielgewicht').value = einst.zielgewicht ? dez(einst.zielgewicht) : '';
  $('#s-toene').checked = einst.toene;
  $('#s-ansage').checked = einst.ansage;
  $('#s-haptik').checked = einst.haptik;
  $('#chips-vorlauf').replaceChildren(...[5, 10, 15].map((s) =>
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(s === einst.vorlauf), 'data-vorlauf': s }, `${s} s`)));
  pruefeZiele();
  zeigeDatenInfo();
  $('#fassung').replaceChildren('Fassung ', zahl(BUILD, 'span'));
  $('#einstellungen').hidden = false;
  $('#btn-einstellungen-zu').focus({ preventScroll: true });
}

function schliesseEinstellungen() {
  $('#einstellungen').hidden = true;
  $('#btn-einstellungen').focus({ preventScroll: true });
}

function zeigeDatenInfo() {
  const kb = Math.max(1, Math.round(speicherBytes() / 1024));
  $('#daten-info').replaceChildren('Alles liegt nur auf diesem Gerät: ', zahl(einheiten.length, 'span'), ` ${plural(einheiten.length, 'Einheit', 'Einheiten')}, `,
    zahl(gewichte.length, 'span'), ` ${plural(gewichte.length, 'Messung', 'Messungen')}, `, zahl(kb, 'span'), ' KB. Die Sicherung ist die einzige Kopie.');
}

function pruefeZiele() {
  const rohZiel = $('#s-wochenziel').value.trim();
  const rohKg = $('#s-zielgewicht').value.trim();
  const wochenziel = liesZahl(rohZiel);
  const kg = liesZahl(rohKg);
  const fehlerWoche = !(Number.isInteger(wochenziel) && wochenziel >= 10 && wochenziel <= 600);
  const fehlerKg = Boolean(rohKg) && !(kg >= 30 && kg <= 300);
  $('#feld-wochenziel').classList.toggle('has-error', fehlerWoche);
  $('#feld-zielgewicht').classList.toggle('has-error', fehlerKg);
  const msg = $('#feld-ziele-msg');
  msg.classList.toggle('has-error', fehlerWoche || fehlerKg);
  msg.classList.toggle('is-valid', !fehlerWoche && !fehlerKg);
  if (fehlerWoche) meldung($('#ziele-msg'), 'Fehler: Wochenziel zwischen 10 und 600 Minuten.');
  else if (fehlerKg) meldung($('#ziele-msg'), 'Fehler: Zielgewicht zwischen 30 und 300 kg.');
  else meldung($('#ziele-msg'), 'Die WHO empfiehlt ', zahl(75, 'span'), ' Minuten intensive Bewegung pro Woche.');
  return { ok: !fehlerWoche && !fehlerKg, wochenziel, zielgewicht: rohKg ? Math.round(kg * 10) / 10 : null };
}

function uebernimmZiele() {
  const p = pruefeZiele();
  if (!p.ok || (p.wochenziel === einst.wochenziel && p.zielgewicht === einst.zielgewicht)) return;
  einst = { ...einst, wochenziel: p.wochenziel, zielgewicht: p.zielgewicht };
  speichereEinstellungen(einst);
  zeigeWoche();
  zeigeGewicht();
  zeigeVerlauf();
}

function speichereSicherung() {
  speichereDatei(`sprungseil-sicherung-${heute()}.json`, alsSicherung({ einstellungen: einst, einheiten, gewichte }, BUILD));
  toast.zeige('Sicherung gespeichert.', `${einheiten.length} ${plural(einheiten.length, 'Einheit', 'Einheiten')}, ${gewichte.length} ${plural(gewichte.length, 'Messung', 'Messungen')}`);
}

function liesSicherung(datei) {
  datei.text().then((text) => {
    let daten;
    try {
      daten = ausSicherung(text);
    } catch (fehler) {
      toast.zeige('Nicht eingelesen.', fehler.message);
      return;
    }
    tafel({
      titel: 'Sicherung einlesen?',
      inhalt: [el('p', {}, 'Ersetzt ', zahl(einheiten.length, 'span'), ' Einheiten und ', zahl(gewichte.length, 'span'),
        ' Messungen auf diesem Gerät durch ', zahl(daten.einheiten.length, 'span'), ' Einheiten und ',
        zahl(daten.gewichte.length, 'span'), ' Messungen aus der Datei.',
        daten.verworfen ? ` ${daten.verworfen} unlesbare Einträge bleiben draußen.` : '')],
      knoepfe: [
        { text: 'Ersetzen', klasse: 'btn-ghost gefahr', tun: () => {
          einst = daten.einstellungen;
          einheiten = daten.einheiten;
          gewichte = daten.gewichte;
          speichereEinstellungen(einst);
          speichereEinheiten(einheiten);
          speichereGewichte(gewichte);
          allesNeu();
          oeffneEinstellungen();
          toast.zeige('Eingelesen.', `${einheiten.length} Einheiten, ${gewichte.length} Messungen`);
        } },
        { text: 'Abbrechen' },
      ],
    });
  });
}

function loescheAlles() {
  tafel({
    titel: 'Alle Daten löschen?',
    inhalt: [el('p', {}, zahl(einheiten.length, 'span'), ' Einheiten, ', zahl(gewichte.length, 'span'),
      ' Messungen und alle Einstellungen. Ohne Sicherung sind sie weg.')],
    knoepfe: [
      { text: 'Endgültig löschen', klasse: 'btn-ghost gefahr', tun: () => {
        allesLoeschen();
        einst = ladeEinstellungen();
        einheiten = [];
        gewichte = [];
        allesNeu();
        schliesseEinstellungen();
        toast.zeige('Gelöscht.', 'Die App steht wieder am Anfang.');
      } },
      { text: 'Abbrechen' },
    ],
  });
}

/* ══════════════════ ALLGEMEIN ══════════════════ */

function breiteVon(halter) {
  const b = halter.clientWidth || $('#rahmen').clientWidth - 52;
  return Math.max(260, Math.round(b));
}

function allesNeu() {
  gewaehlt = empfehlung(einheiten).id;
  baueEinheitChips();
  baueTempoChips();
  zeigeEinheit(true);
  zeigeHinweise();
  zeigeWoche();
  zeigeGewicht(true);
  zeigeVerlauf(true);
}

function verdrahte() {
  M.chipDruck(document);

  /* Training */
  $('#wahl-einheit').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (chip) waehleEinheit(chip.dataset.id);
  });
  M.mehr($('#btn-mehr'), $('#wahl-einheit'), { zu: mehrText() });
  $('#btn-mehr').addEventListener('click', () => { $('#btn-mehr span').textContent = mehrText(); sperreMehr(); });
  $('#chips-tempo').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    einst.tempo = chip.dataset.tempo;
    speichereEinstellungen(einst);
    $$('#chips-tempo .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    zeigeTempo();
    zeigeEinheit();
  });
  ['#e-runden', '#e-springen', '#e-pause'].forEach((sel) => $(sel).addEventListener('input', pruefeEigeneFelder));
  $('#btn-zum-gewicht').addEventListener('click', () => {
    seiten.gehe(1);
    setTimeout(() => $('#g-kg').focus({ preventScroll: true }), 420);
  });
  $('#btn-start').addEventListener('click', starteTraining);

  /* Lauf und Abschluss */
  $('#btn-halt').addEventListener('click', halteOderWeiter);
  $('#btn-beenden').addEventListener('click', beendeTraining);
  $('#chips-gefuehl').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip || !ergebnis) return;
    ergebnis.gefuehl = chip.dataset.gefuehl;
    $$('#chips-gefuehl .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    pruefeAbschluss();
  });
  $('#a-gezaehlt').addEventListener('input', pruefeGezaehlt);
  $('#btn-sichern').addEventListener('click', sichereEinheit);
  $('#btn-verwerfen').addEventListener('click', verwirfEinheit);

  /* Gewicht */
  $('#g-datum').value = heute();
  $('#g-datum').max = heute();
  $('#g-datum').addEventListener('input', pruefeGewicht);
  $('#g-kg').addEventListener('input', pruefeGewicht);
  $('#form-gewicht').addEventListener('submit', (ev) => { ev.preventDefault(); speichereGewicht(); });

  /* Einstellungen */
  $('#btn-einstellungen').addEventListener('click', oeffneEinstellungen);
  $('#btn-einstellungen-zu').addEventListener('click', schliesseEinstellungen);
  $('#s-wochenziel').addEventListener('input', uebernimmZiele);
  $('#s-zielgewicht').addEventListener('input', uebernimmZiele);
  for (const schalter of ['toene', 'ansage', 'haptik']) {
    $(`#s-${schalter}`).addEventListener('change', (ev) => {
      einst[schalter] = ev.target.checked;
      speichereEinstellungen(einst);
    });
  }
  $('#chips-vorlauf').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    einst.vorlauf = Number(chip.dataset.vorlauf);
    speichereEinstellungen(einst);
    $$('#chips-vorlauf .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  });
  $('#btn-sicherung').addEventListener('click', speichereSicherung);
  $('#btn-einlesen').addEventListener('click', () => $('#datei-sicherung').click());
  $('#datei-sicherung').addEventListener('change', (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    if (datei) liesSicherung(datei);
    ev.target.value = '';
  });
  $('#btn-alles-loeschen').addEventListener('click', loescheAlles);

  /* Tafel: ein Tipp daneben oder Escape schließt sie. */
  $('#blende').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) schliesseTafel(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('#blende').hidden) schliesseTafel();
    else if (!$('#einstellungen').hidden) schliesseEinstellungen();
  });

  /* Wer mitten in der Einheit die Seite schließt, soll gefragt werden. */
  window.addEventListener('beforeunload', (ev) => {
    if (lauf || ergebnis) { ev.preventDefault(); ev.returnValue = ''; }
  });

  let warte = 0;
  window.addEventListener('resize', () => {
    clearTimeout(warte);
    warte = setTimeout(() => { if (besucht.has(1)) zeichneGewicht(); if (besucht.has(2)) zeichneWochen(); }, 150);
  });

  /* Ein neuer Tag beginnt, während die App offen liegt: Woche und Datum
     nachziehen, sobald sie wieder sichtbar wird. */
  let tag = heute();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || heute() === tag) return;
    tag = heute();
    $('#g-datum').value = tag;
    $('#g-datum').max = tag;
    zeigeWoche();
    if (besucht.has(2)) zeichneWochen();
  });
}

function seitenAufbauen() {
  const seitenEls = [$('#s-training'), $('#s-gewicht'), $('#s-verlauf')];
  const koepfe = seitenEls.map((s) => $('.app-kopf', s));
  koepfe.forEach((k) => M.titelWoerter($('h1', k)));
  const leiste = $('#leiste');
  const kopfUpd = seitenEls.map((s) => M.kopf(s, leiste, null));
  const mini = [() => aktuelleEinheit().name, () => 'Gewicht', () => 'Verlauf'];
  const sichtbarkeit = (i) => {
    $('#aktion-training').style.visibility = i === 0 ? '' : 'hidden';
    $('#aktion-gewicht').style.visibility = i === 1 ? '' : 'hidden';
  };

  /* Gruppen auf Gewicht und Verlauf stehen sofort; dort zählen beim
     ersten Besuch die Zahlen, die Linie zieht auf, die Liste staffelt. */
  $$('#s-gewicht .gruppe, #s-verlauf .gruppe').forEach((g) => g.classList.add('da'));

  seiten = M.Seiten({
    rahmen: $('#rahmen'),
    track: $('#seiten'),
    tabs: $$('.tabs button'),
    ind: $('#ind'),
    onWechsel(i, war) {
      if (i !== war) M.zeigeTitel(koepfe[i]);
      $('#leiste-titel').textContent = mini[i]();
      kopfUpd[i]();
      sichtbarkeit(i);
      if (i === war) return;
      const erstes = !besucht.has(i);
      besucht.add(i);
      if (i === 1) {
        if (erstes) { zeigeGewicht(true); M.zieheLinie($$('#s-gewicht .dataline')); }
        M.staffel($$('#gewicht-liste .eintrag'), 35, 60);
      }
      if (i === 2) {
        if (erstes) { zeigeVerlauf(true); M.zieheLinie($$('#s-verlauf .dataline')); }
        M.staffel($$('#verlauf-liste .eintrag'), 35, 60);
      }
    },
  });
  sichtbarkeit(0);
  $('#leiste-titel').textContent = mini[0]();
  return koepfe;
}

function registriereServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  /* Übernimmt ein neuer Worker, lädt die Seite einmal neu: alte Shell
     und neue Module dürfen sich nicht mischen. Nie mitten im Training. */
  let laedtNeu = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (laedtNeu || lauf || ergebnis) return;
    laedtNeu = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}

/* ══════════════════ START ══════════════════ */

function start() {
  baueEinheitChips();
  baueTempoChips();
  verdrahte();
  $('#e-runden').value = einst.eigene.runden;
  $('#e-springen').value = einst.eigene.springen;
  $('#e-pause').value = einst.eigene.pause;
  pruefeEigeneFelder();
  const koepfe = seitenAufbauen();
  $('#einheit-titel').dataset.name = '';
  zeigeEinheit();
  zeigeHinweise();
  zeigeGewicht(false);
  zeigeVerlauf(false);
  pruefeGewicht();

  /* Auftritt: Titel, Gruppen 70 ms versetzt, dann rollt die Zahl und die
     Linie zieht auf. */
  document.fonts.ready.then(() => {
    M.zeigeTitel(koepfe[0]);
    M.staffel($$('#s-training .gruppe'), 70, 120);
    setTimeout(() => {
      zeigeWoche();
      M.zieheLinie($$('#s-training .dataline'));
    }, 220);
  });
  registriereServiceWorker();
}

start();
