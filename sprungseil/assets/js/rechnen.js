/* Sprungseil — alles, was gerechnet wird. Ohne DOM und ohne Speicher:
   tools/pruefe.mjs prüft diese Datei unter Node.

   Woher die Zahlen kommen
   - MET-Werte: Compendium of Physical Activities (Ainsworth u. a.),
     Seilspringen langsam (unter 100 / min) 8,8 · mittel (100–120) 11,8 ·
     schnell (120–160) 12,3. Die Pausen zwischen den Runden: Stehen bei
     leichter Bewegung, 2,5 MET.
   - kcal je Minute = MET · 3,5 · kg / 200 (ACSM).
   - Gezählt wird netto: Der Ruheumsatz (1 MET) ist abgezogen. Was der
     Körper ohnehin verbrannt hätte, macht niemanden leichter.
   - 1 kg Körperfett speichert rund 7.700 kcal.
   - WHO: 75 Minuten intensive Bewegung pro Woche. Seilspringen ist mit
     mehr als 6 MET intensiv. */

import { plusTage, tageZwischen, wochenStart } from './datum.js';

/* proMinute ist die Mitte der Spanne — die Schätzung, solange niemand zählt. */
export const TEMPO = {
  ruhig:   { id: 'ruhig',   name: 'Ruhig',   met: 8.8,  proMinute: 90,  von: null, bis: 100 },
  mittel:  { id: 'mittel',  name: 'Mittel',  met: 11.8, proMinute: 110, von: 100,  bis: 120 },
  schnell: { id: 'schnell', name: 'Schnell', met: 12.3, proMinute: 140, von: 120,  bis: 160 },
};
export const TEMPI = Object.values(TEMPO);

export const MET_PAUSE = 2.5;
export const MET_RUHE = 1;
export const KCAL_JE_KG_FETT = 7700;
export const WHO_MINUTEN = 75;

/* Fünf Stufen führen von 5 auf 15 Minuten reine Springzeit. Die Runden
   werden erst länger, dann die Pausen kürzer — Ausdauer vor Dichte. */
export const EINHEITEN = [
  { id: 'einstieg',  name: 'Einstieg',  stufe: 1, runden: 10, springen: 30,  pause: 30 },
  { id: 'aufbau',    name: 'Aufbau',    stufe: 2, runden: 10, springen: 45,  pause: 30 },
  { id: 'ausdauer',  name: 'Ausdauer',  stufe: 3, runden: 8,  springen: 60,  pause: 30 },
  { id: 'intervall', name: 'Intervall', stufe: 4, runden: 15, springen: 40,  pause: 20 },
  { id: 'lang',      name: 'Lang',      stufe: 5, runden: 5,  springen: 180, pause: 60 },
  { id: 'tabata',    name: 'Tabata',    stufe: 0, runden: 8,  springen: 20,  pause: 10 },
  { id: 'eigene',    name: 'Eigene',    stufe: 0, runden: 8,  springen: 40,  pause: 20 },
];
export const STUFEN = EINHEITEN.filter((einheit) => einheit.stufe > 0);

export const GRENZEN = {
  runden:   { min: 1, max: 40,  wort: 'Runden' },
  springen: { min: 5, max: 600, wort: 'Springzeit' },
  pause:    { min: 0, max: 300, wort: 'Pause' },
};

/** Prüft die Werte der eigenen Einheit. Liefert je Feld eine Meldung
    oder nichts — und die bereinigten Werte. */
export function pruefeEigene(werte) {
  const fehler = {};
  const sauber = {};
  for (const [feld, grenze] of Object.entries(GRENZEN)) {
    const wert = Number(werte[feld]);
    if (!Number.isInteger(wert) || wert < grenze.min || wert > grenze.max) {
      fehler[feld] = `${grenze.wort}: ${grenze.min} bis ${grenze.max}.`;
    } else {
      sauber[feld] = wert;
    }
  }
  return { ok: Object.keys(fehler).length === 0, fehler, werte: sauber };
}

export function einheitVon(id, eigene) {
  const vorlage = EINHEITEN.find((einheit) => einheit.id === id) || EINHEITEN[0];
  if (vorlage.id !== 'eigene' || !eigene) return { ...vorlage };
  return { ...vorlage, ...pruefeEigene(eigene).werte };
}

export const springzeit = (einheit) => einheit.runden * einheit.springen;
/* Nach der letzten Runde kommt keine Pause mehr — dann ist Schluss. */
export const pausenzeit = (einheit) => Math.max(0, einheit.runden - 1) * einheit.pause;
export const dauer = (einheit) => springzeit(einheit) + pausenzeit(einheit);

/* ── Energie ─────────────────────────────────────────────── */

/** Netto-kcal einer Belastung: über dem Ruheumsatz. Ohne Gewicht keine Zahl. */
export function kcalNetto(met, kg, sekunden) {
  if (!(kg > 0)) return null;
  return ((Math.max(0, met - MET_RUHE) * 3.5 * kg) / 200) * (sekunden / 60);
}

export const fettGramm = (kcal) => (kcal == null ? null : (kcal / KCAL_JE_KG_FETT) * 1000);

export function tempoAus(proMinute) {
  if (!(proMinute > 0)) return null;
  if (proMinute < 100) return 'ruhig';
  return proMinute <= 120 ? 'mittel' : 'schnell';
}

/** Was eine Einheit gebracht hat. Ohne gezählte Sprünge wird das Tempo
    geschätzt; mit ihnen ist es gemessen — dann bestimmt die Trittfrequenz
    den MET-Wert, nicht die Wahl vor dem Start. */
export function bilanz({ springSek, pauseSek = 0, tempo = 'mittel', kg = null, gezaehlt = null }) {
  let stufe = TEMPO[tempo] || TEMPO.mittel;
  let kadenz = stufe.proMinute;
  let spruenge = Math.round((springSek / 60) * kadenz);
  const gemessen = gezaehlt > 0 && springSek > 0;
  if (gemessen) {
    kadenz = gezaehlt / (springSek / 60);
    stufe = TEMPO[tempoAus(kadenz)];
    spruenge = Math.round(gezaehlt);
  }
  const springKcal = kcalNetto(stufe.met, kg, springSek);
  const kcal = springKcal == null ? null : springKcal + kcalNetto(MET_PAUSE, kg, pauseSek);
  return { tempo: stufe.id, met: stufe.met, kadenz, spruenge, gemessen, kcal, fett: fettGramm(kcal) };
}

/** Mehr als 300 Sprünge pro Minute schafft niemand über eine ganze Einheit. */
export const KADENZ_MAX = 300;

/* ── Wochen und Summen ───────────────────────────────────── */

function summe(liste) {
  const kcal = liste.reduce((s, e) => s + (e.kcal || 0), 0);
  return {
    anzahl: liste.length,
    dauerSek: liste.reduce((s, e) => s + e.dauerSek, 0),
    springSek: liste.reduce((s, e) => s + e.springSek, 0),
    spruenge: liste.reduce((s, e) => s + (e.spruenge || 0), 0),
    kcal,
    fett: fettGramm(kcal),
  };
}

/** Trainingszeit zählt fürs Wochenziel: Springen und die Pausen dazwischen.
    Eine Intervalleinheit ist als Ganzes intensiv — der Puls fällt in
    30 Sekunden nicht auf Ruhe. */
export function wochenSumme(einheiten, start) {
  const ende = plusTage(start, 7);
  const drin = einheiten.filter((e) => e.datum >= start && e.datum < ende);
  const s = summe(drin);
  return { start, ...s, minuten: Math.floor(s.dauerSek / 60) };
}

/** Die letzten n Wochen bis einschließlich der laufenden, älteste zuerst. */
export function letzteWochen(einheiten, heute, n = 8) {
  const diese = wochenStart(heute);
  return Array.from({ length: n }, (_, i) => wochenSumme(einheiten, plusTage(diese, -7 * (n - 1 - i))));
}

export const gesamt = (einheiten) => summe(einheiten);

/* ── Gewicht ─────────────────────────────────────────────── */

const nachDatum = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);
const mittel = (werte) => werte.reduce((s, w) => s + w, 0) / werte.length;

/** Das Gewicht, das an einem Tag galt: der letzte Eintrag bis dahin.
    Vor dem ersten Eintrag gilt der erste — besser als gar keine Zahl. */
export function gewichtAm(gewichte, datum) {
  if (!gewichte.length) return null;
  const liste = [...gewichte].sort(nachDatum);
  const bis = liste.filter((g) => g.datum <= datum);
  return (bis.length ? bis[bis.length - 1] : liste[0]).kg;
}

/** Ø der Einträge aus den sieben Tagen bis zu jedem Eintrag. Eine
    einzelne Messung schwankt mit Wasser und Mahlzeit um bis zu 1 kg;
    der Schnitt zeigt, wohin es geht. */
export function gleitend(gewichte) {
  const liste = [...gewichte].sort(nachDatum);
  return liste.map((g) => {
    const fenster = liste.filter((h) => h.datum <= g.datum && tageZwischen(h.datum, g.datum) < 7);
    return { ...g, trend: mittel(fenster.map((h) => h.kg)) };
  });
}

/** Trend, Tempo und — wenn es stimmt — das Datum, an dem das Ziel
    erreicht wäre. Das Tempo braucht mindestens drei Messungen über
    sieben Tage; darunter wäre es Rauschen. */
export function gewichtTrend(gewichte, ziel = null) {
  if (!gewichte.length) return null;
  const liste = gleitend(gewichte);
  const letzter = liste[liste.length - 1];
  const erster = liste[0];
  const aktuell = letzter.trend;

  const basis = liste.filter((g) => tageZwischen(g.datum, letzter.datum) < 28);
  let proWoche = null;
  if (basis.length >= 3 && tageZwischen(basis[0].datum, letzter.datum) >= 7) {
    const xs = basis.map((g) => tageZwischen(basis[0].datum, g.datum));
    const ys = basis.map((g) => g.kg);
    const mx = mittel(xs);
    const my = mittel(ys);
    const zaehler = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const nenner = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    proWoche = nenner ? (zaehler / nenner) * 7 : null;
  }

  let zielDatum = null;
  if (ziel > 0 && proWoche != null) {
    const abstand = ziel - aktuell;
    if (abstand !== 0 && Math.sign(abstand) === Math.sign(proWoche) && Math.abs(proWoche) >= 0.05) {
      const wochen = abstand / proWoche;
      if (wochen <= 104) zielDatum = plusTage(letzter.datum, Math.ceil(wochen * 7));
    }
  }

  return {
    aktuell,
    letzter,
    erster,
    anzahl: liste.length,
    seitStart: aktuell - erster.kg,
    proWoche,
    zielDatum,
    erreicht: ziel > 0 && (erster.kg >= ziel ? aktuell <= ziel : aktuell >= ziel),
  };
}

/* ── Plan ────────────────────────────────────────────────── */

const nachZeit = (a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0);

/** Welche Stufe als Nächstes? Hoch geht es nach zwei vollständigen
    Einheiten, von denen keine hart war — oder nach einer leichten.
    Eine harte oder abgebrochene Einheit wird wiederholt. Tabata und
    eigene Einheiten zählen nicht zum Plan. */
export function empfehlung(einheiten) {
  const liste = einheiten.filter((e) => STUFEN.some((s) => s.id === e.art)).sort(nachZeit);
  if (!liste.length) return { id: STUFEN[0].id, grund: 'erste' };

  const letzte = liste[liste.length - 1];
  const stufe = STUFEN.findIndex((s) => s.id === letzte.art);
  const naechste = STUFEN[Math.min(stufe + 1, STUFEN.length - 1)].id;

  if (!letzte.vollstaendig) return { id: letzte.art, grund: 'abgebrochen', letzte };
  if (letzte.gefuehl === 'hart') return { id: letzte.art, grund: 'hart', letzte };
  if (stufe === STUFEN.length - 1) return { id: letzte.art, grund: 'oben', letzte };
  if (letzte.gefuehl === 'leicht') return { id: naechste, grund: 'leicht', letzte };

  const davor = liste[liste.length - 2];
  if (davor && davor.art === letzte.art && davor.vollstaendig && davor.gefuehl !== 'hart') {
    return { id: naechste, grund: 'zweimal', letzte };
  }
  return { id: letzte.art, grund: 'nochmal', letzte };
}

/* ── Ablauf einer Einheit ────────────────────────────────── */

/** Die Phasen in Reihenfolge, jede mit Beginn und Ende in Sekunden.
    Der Vorlauf gibt Zeit, das Seil zu greifen; er zählt nicht mit. */
export function phasen(einheit, vorlauf = 0) {
  const liste = [];
  if (vorlauf > 0) liste.push({ art: 'vorlauf', dauer: vorlauf, runde: 1 });
  for (let runde = 1; runde <= einheit.runden; runde += 1) {
    liste.push({ art: 'springen', dauer: einheit.springen, runde });
    if (runde < einheit.runden && einheit.pause > 0) liste.push({ art: 'pause', dauer: einheit.pause, runde });
  }
  let t = 0;
  for (const phase of liste) {
    phase.von = t;
    t += phase.dauer;
    phase.bis = t;
  }
  return liste;
}

/** Wo steht die Einheit nach t Sekunden? Alles wird aus der verstrichenen
    Zeit abgeleitet, nichts mitgezählt: Wer das Telefon kurz wegsteckt und
    der Browser den Takt drosselt, verliert keine Sekunde. */
export function standBei(liste, t) {
  const ende = liste[liste.length - 1].bis;
  const tt = Math.max(0, Math.min(t, ende));
  let index = liste.findIndex((phase) => tt < phase.bis);
  if (index < 0) index = liste.length - 1;
  const phase = liste[index];

  let springSek = 0;
  let pauseSek = 0;
  let runden = 0;
  for (const p of liste) {
    const drin = Math.max(0, Math.min(tt - p.von, p.dauer));
    if (p.art === 'springen') {
      springSek += drin;
      if (tt >= p.bis) runden += 1;
    } else if (p.art === 'pause') {
      pauseSek += drin;
    }
  }

  const vorlauf = liste[0].art === 'vorlauf' ? liste[0].dauer : 0;
  return {
    index,
    phase,
    naechste: liste[index + 1] || null,
    imPhase: tt - phase.von,
    rest: phase.bis - tt,
    fertig: t >= ende,
    springSek,
    pauseSek,
    runden,
    verstrichen: Math.max(0, tt - vorlauf),
    gesamt: ende - vorlauf,
  };
}
