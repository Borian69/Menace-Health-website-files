/* Alles bleibt auf dem Gerät: kein Konto, kein Server, keine Übertragung.
   Die Sicherung in den Einstellungen ist deshalb die einzige Kopie, die
   es gibt — wer das Telefon wechselt, braucht sie. */

import { istISO } from './datum.js';
import { EINHEITEN, TEMPO } from './rechnen.js';

const SCHLUESSEL = {
  einstellungen: 'sprungseil.einstellungen.v1',
  einheiten:     'sprungseil.einheiten.v1',
  gewichte:      'sprungseil.gewichte.v1',
};

export const VORGABEN = {
  wochenziel:  75,      // Minuten — die Empfehlung der WHO für intensive Bewegung
  zielgewicht: null,    // kg, optional
  vorlauf:     10,      // Sekunden, um das Seil zu greifen
  toene:       true,
  ansage:      true,
  haptik:      true,
  tempo:       'mittel',
  eigene:      { runden: 8, springen: 40, pause: 20 },
};

function lies(schluessel, ersatz) {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? JSON.parse(roh) : ersatz;
  } catch {
    return ersatz;
  }
}

/** false, wenn der Speicher voll oder gesperrt ist (Privatmodus). */
function schreib(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

/* ── Bereinigen: alles, was gelesen wird, geht hier durch ── */

const zahlOder = (wert, ersatz) => (Number.isFinite(Number(wert)) && wert !== null && wert !== '' ? Number(wert) : ersatz);

function einstellungenAus(roh = {}) {
  const e = { ...VORGABEN, ...roh, eigene: { ...VORGABEN.eigene, ...(roh.eigene || {}) } };
  e.wochenziel = Math.round(Math.min(600, Math.max(10, zahlOder(e.wochenziel, VORGABEN.wochenziel))));
  const ziel = zahlOder(e.zielgewicht, null);
  e.zielgewicht = ziel >= 30 && ziel <= 300 ? ziel : null;
  e.vorlauf = [5, 10, 15].includes(Number(e.vorlauf)) ? Number(e.vorlauf) : VORGABEN.vorlauf;
  e.tempo = TEMPO[e.tempo] ? e.tempo : VORGABEN.tempo;
  for (const schalter of ['toene', 'ansage', 'haptik']) e[schalter] = e[schalter] !== false;
  return e;
}

function einheitAus(roh) {
  if (!roh || !istISO(roh.datum) || !EINHEITEN.some((e) => e.id === roh.art)) return null;
  const springSek = zahlOder(roh.springSek, NaN);
  const dauerSek = zahlOder(roh.dauerSek, NaN);
  if (!(springSek >= 0) || !(dauerSek >= springSek)) return null;
  return {
    id: String(roh.id || `${roh.datum}-${Math.random().toString(36).slice(2, 8)}`),
    datum: roh.datum,
    zeit: String(roh.zeit || `${roh.datum}T12:00:00`),
    art: roh.art,
    runden: zahlOder(roh.runden, 0),
    springen: zahlOder(roh.springen, 0),
    pause: zahlOder(roh.pause, 0),
    rundenFertig: zahlOder(roh.rundenFertig, 0),
    vollstaendig: Boolean(roh.vollstaendig),
    springSek,
    dauerSek,
    tempo: TEMPO[roh.tempo] ? roh.tempo : 'mittel',
    gezaehlt: Boolean(roh.gezaehlt),
    spruenge: zahlOder(roh.spruenge, 0),
    kg: zahlOder(roh.kg, null),
    kcal: zahlOder(roh.kcal, null),
    gefuehl: ['leicht', 'passend', 'hart'].includes(roh.gefuehl) ? roh.gefuehl : null,
  };
}

function gewichtAus(roh) {
  const kg = zahlOder(roh && roh.kg, NaN);
  if (!roh || !istISO(roh.datum) || !(kg >= 30 && kg <= 300)) return null;
  return { datum: roh.datum, kg };
}

const nachZeit = (a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0);
const nachDatum = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);

/* ── Lesen und Schreiben ─────────────────────────────────── */

export const ladeEinstellungen = () => einstellungenAus(lies(SCHLUESSEL.einstellungen, {}));
export const speichereEinstellungen = (e) => schreib(SCHLUESSEL.einstellungen, einstellungenAus(e));

export const ladeEinheiten = () =>
  (lies(SCHLUESSEL.einheiten, []) || []).map(einheitAus).filter(Boolean).sort(nachZeit);
export const speichereEinheiten = (liste) => schreib(SCHLUESSEL.einheiten, liste);

/** Ein Eintrag je Tag: Wer zweimal wiegt, meint den zweiten Wert. */
export function ladeGewichte() {
  const proTag = new Map();
  for (const g of (lies(SCHLUESSEL.gewichte, []) || []).map(gewichtAus).filter(Boolean)) proTag.set(g.datum, g);
  return [...proTag.values()].sort(nachDatum);
}
export const speichereGewichte = (liste) => schreib(SCHLUESSEL.gewichte, liste);

export function speicherBytes() {
  try {
    return Object.values(SCHLUESSEL).reduce((s, k) => s + (localStorage.getItem(k) || '').length, 0);
  } catch {
    return 0;
  }
}

export function allesLoeschen() {
  try {
    Object.values(SCHLUESSEL).forEach((k) => localStorage.removeItem(k));
  } catch { /* gesperrter Speicher: dann gibt es auch nichts zu löschen */ }
}

/* ── Sicherung ───────────────────────────────────────────── */

export function alsSicherung({ einstellungen, einheiten, gewichte }, fassung) {
  return JSON.stringify({
    app: 'sprungseil',
    fassung,
    erstellt: new Date().toISOString(),
    einstellungen,
    einheiten,
    gewichte,
  }, null, 2);
}

/** Liest eine Sicherung. Wirft mit einem Satz, der sagt, was nicht stimmt. */
export function ausSicherung(text) {
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein JSON.');
  }
  if (!daten || daten.app !== 'sprungseil') throw new Error('Die Datei ist keine Sicherung dieser App.');
  const rohEinheiten = Array.isArray(daten.einheiten) ? daten.einheiten : [];
  const rohGewichte = Array.isArray(daten.gewichte) ? daten.gewichte : [];
  const einheiten = rohEinheiten.map(einheitAus).filter(Boolean).sort(nachZeit);
  const gewichte = rohGewichte.map(gewichtAus).filter(Boolean);
  const proTag = new Map();
  for (const g of gewichte) proTag.set(g.datum, g);
  return {
    einstellungen: einstellungenAus(daten.einstellungen || {}),
    einheiten,
    gewichte: [...proTag.values()].sort(nachDatum),
    verworfen: rohEinheiten.length - einheiten.length + rohGewichte.length - gewichte.length,
  };
}
