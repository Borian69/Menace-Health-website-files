/* Erzeugt eine echte PDF-Datei — ohne Bibliothek, ohne Server.

   Warum von Hand: Das Bordbuch soll offline funktionieren und beim
   Verkauf des Wagens ein Dokument liefern, das man ausdrucken und
   hinlegen kann. Ein Screenshot ist das nicht, und eine 300-KB-Bibliothek
   für vier Textspalten wäre unverhältnismäßig.

   Gestaltung: Elfenbein-Theme. Was gelesen, unterschrieben oder gedruckt
   wird, ist hell — so steht es im Leitfaden. Schrift ist Helvetica: die
   vorgesehene Ersatzschrift, wo die Hausschriften nicht eingebettet
   werden können. Ihre Ziffern sind alle gleich breit, Zahlenspalten
   stehen also von selbst in einer Flucht. */

import { euro, km, liter, verbrauchZahl, spritZahl, formatDatum } from './util.js';
import { artVon } from './eintraege.js';
import { log, fehler } from './debug.js';

/* ── Farben (Elfenbein-Theme) ────────────────────────────── */

const FARBE = {
  grund:   [0.957, 0.933, 0.890],  // #F4EEE3 Elfenbein
  flaeche: [0.988, 0.980, 0.957],  // #FCFAF4 Pergament
  linie:   [0.812, 0.749, 0.651],  // #CFBFA6 Sand
  messing: [0.831, 0.675, 0.322],  // #D4AC52 Messing
  text:    [0.086, 0.067, 0.055],  // #16110E Tinte
  leise:   [0.369, 0.322, 0.271],  // #5E5245 Asche
  walnuss: [0.353, 0.243, 0.153],  // #5A3E27 Walnuss Tief
  oxblood: [0.369, 0.133, 0.149],  // #5E2226 Oxblood Tief
};

const FORMATE = {
  a4:     { breite: 595.28, hoehe: 841.89 },
  letter: { breite: 612,    hoehe: 792 },
};

const RAND = 48;   // 6 × 8 — die Achterskala gilt auch auf Papier.

/* ── Zeichenbreiten der Standardschriften ────────────────────
   Zeichen 32…126 in 1/1000 der Schriftgröße. Ohne diese Tabelle ließe
   sich kein Text umbrechen und nichts rechtsbündig setzen. */

const BREITEN_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const BREITEN_FETT = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/* Umlaute sind so breit wie ihr Grundbuchstabe. */
const ERSATZ_BREITE = { 196: 'A', 214: 'O', 220: 'U', 228: 'a', 246: 'o', 252: 'u', 223: 'a', 128: '0' };

function zeichenBreite(code, fett) {
  const tabelle = fett ? BREITEN_FETT : BREITEN_NORMAL;
  if (code >= 32 && code <= 126) return tabelle[code - 32];
  const ersatz = ERSATZ_BREITE[code];
  if (ersatz) return tabelle[ersatz.charCodeAt(0) - 32];
  return tabelle[('n').charCodeAt(0) - 32];
}

/** Textbreite in Punkt. `sperrung` ist der Zusatzabstand je Zeichen. */
function breiteVon(text, groesse, { fett = false, sperrung = 0 } = {}) {
  const bytes = winAnsi(text);
  let summe = 0;
  for (let i = 0; i < bytes.length; i += 1) summe += zeichenBreite(bytes.charCodeAt(i), fett);
  return (summe / 1000) * groesse + Math.max(0, bytes.length - 1) * sperrung;
}

/* ── Zeichenkodierung ────────────────────────────────────────
   PDF-Standardschriften sprechen WinAnsi: ein Byte je Zeichen. Umlaute
   passen dort hinein, typografische Anführungszeichen und das Eurozeichen
   liegen auf eigenen Plätzen. Alles Unbekannte wird zu einem Fragezeichen
   — lieber sichtbar falsch als eine kaputte Datei. */

const SONDER = new Map([
  ['€', 0x80], ['‚', 0x82], ['„', 0x84], ['…', 0x85], ['†', 0x86],
  ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['–', 0x96], ['—', 0x97], ['™', 0x99],
]);

function winAnsi(text) {
  let raus = '';
  for (const zeichen of String(text)) {
    const code = zeichen.codePointAt(0);
    if (code >= 32 && code <= 126) raus += zeichen;
    else if (SONDER.has(zeichen)) raus += String.fromCharCode(SONDER.get(zeichen));
    else if (code >= 160 && code <= 255) raus += zeichen;
    else if (zeichen === '\t') raus += ' ';
    else if (code < 32) raus += ' ';
    else raus += '?';
  }
  return raus;
}

/** Klammern und Rückstriche haben in PDF-Zeichenketten eine Bedeutung. */
const maskiere = (text) => winAnsi(text).replace(/[\\()]/g, (treffer) => `\\${treffer}`);

/* ── Seite ───────────────────────────────────────────────── */

class Seite {
  constructor(dokument) {
    this.dok = dokument;
    this.ops = [];
    this.y = dokument.hoehe - RAND;
    // In der Druckfassung ist Weiß keine Farbe, sondern die Abwesenheit
    // von Farbauftrag — dort bleibt die Grundfläche unbedruckt.
    if (!dokument.druck) this.flaeche(0, 0, dokument.breite, dokument.hoehe, FARBE.grund);
  }

  farbeFuellen([r, g, b]) { this.ops.push(`${r} ${g} ${b} rg`); return this; }
  farbeLinie([r, g, b])   { this.ops.push(`${r} ${g} ${b} RG`); return this; }

  flaeche(x, y, breite, hoehe, farbe) {
    this.farbeFuellen(farbe);
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${breite.toFixed(2)} ${hoehe.toFixed(2)} re f`);
    return this;
  }

  /** Haarlinie. Stärke bleibt bei 1 — das System kennt keine dickeren. */
  linie(x1, y1, x2, y2, farbe = FARBE.linie, staerke = 1) {
    this.farbeLinie(farbe);
    this.ops.push(`${staerke} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }

  /** Text setzen. `x` ist links, bei align 'rechts' rechts. */
  text(inhalt, x, y, {
    groesse = 10, fett = false, farbe = FARBE.text, sperrung = 0, align = 'links', versal = false,
  } = {}) {
    const geschrieben = versal ? String(inhalt).toUpperCase() : String(inhalt);
    if (!geschrieben) return this;

    let links = x;
    if (align !== 'links') {
      const breite = breiteVon(geschrieben, groesse, { fett, sperrung });
      links = align === 'rechts' ? x - breite : x - breite / 2;
    }

    this.farbeFuellen(farbe);
    this.ops.push('BT');
    this.ops.push(`/${fett ? 'F2' : 'F1'} ${groesse} Tf`);
    if (sperrung) this.ops.push(`${sperrung} Tc`);
    this.ops.push(`1 0 0 1 ${links.toFixed(2)} ${y.toFixed(2)} Tm`);
    this.ops.push(`(${maskiere(geschrieben)}) Tj`);
    if (sperrung) this.ops.push('0 Tc');
    this.ops.push('ET');
    return this;
  }

  /** Ein eingebettetes Bild platzieren. Die Maße kommen aus der
      Belegablage — ein JPEG verrät sie nur über seine Marker. */
  bild(name, x, y, breite, hoehe) {
    this.ops.push('q');
    this.ops.push(`${breite.toFixed(2)} 0 0 ${hoehe.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`);
    this.ops.push(`/${name} Do`);
    this.ops.push('Q');
    return this;
  }

  /** Versal-Label im Stil der Mono-Beschriftungen der Oberfläche. */
  label(inhalt, x, y, { farbe = FARBE.leise, align = 'links', groesse = 7.5 } = {}) {
    return this.text(inhalt, x, y, { groesse, farbe, sperrung: groesse * 0.14, align, versal: true, fett: true });
  }

  inhalt() { return this.ops.join('\n'); }
}

/* ── Dokument ────────────────────────────────────────────── */

class Dokument {
  constructor(format = 'a4', { druck = false } = {}) {
    const masse = FORMATE[format] || FORMATE.a4;
    this.breite = masse.breite;
    this.hoehe = masse.hoehe;
    this.druck = druck;
    this.seiten = [];
    this.bilder = [];
  }

  /* Ein JPEG wandert unverändert in die Datei: /DCTDecode heißt „das ist
     schon ein JPEG, entpacke es beim Anzeigen“. Neu kodiert wird nichts,
     die Datei bleibt so groß wie das Foto. */
  bildEinfuegen(bytes, breite, hoehe) {
    const name = `Im${this.bilder.length + 1}`;
    this.bilder.push({ name, bytes, breite, hoehe });
    return name;
  }

  neueSeite() {
    const seite = new Seite(this);
    this.seiten.push(seite);
    return seite;
  }

  get inhaltsbreite() { return this.breite - RAND * 2; }

  /** Fußzeile auf jede Seite — erst am Ende, weil vorher niemand weiß,
      wie viele Seiten es geworden sind. */
  fussNoten(text) {
    this.seiten.forEach((seite, index) => {
      const y = RAND - 16;
      seite.linie(RAND, RAND - 6, this.breite - RAND, RAND - 6);
      seite.label(text, RAND, y, { groesse: 7 });
      seite.label(`Seite ${index + 1} von ${this.seiten.length}`, this.breite - RAND, y, { align: 'rechts', groesse: 7 });
    });
  }

  /** Alles zu einer Datei zusammensetzen. Ergebnis ist ein Blob. */
  alsBlob() {
    /* Die Nummern werden vorab vergeben: Ein Seitenobjekt muss auf
       Schriften und Bilder zeigen, die im Datenstrom erst später
       kommen. Vorher wurde das nachträglich hineingeflickt — mit
       Bildern in der Datei ist das zu wackelig. */
    const objekte = [];
    const platzhalter = () => { objekte.push(null); return objekte.length; };
    const setze = (nummer, inhalt) => { objekte[nummer - 1] = inhalt; };

    const katalogNr = platzhalter();
    const baumNr = platzhalter();
    const schriftNormalNr = platzhalter();
    const schriftFettNr = platzhalter();

    const bildNummern = this.bilder.map(() => platzhalter());
    this.bilder.forEach((bild, i) => {
      setze(bildNummern[i],
        `<< /Type /XObject /Subtype /Image /Width ${bild.breite} /Height ${bild.hoehe}`
        + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'
        + ` /Length ${bild.bytes.length} >>\nstream\n${alsZeichen(bild.bytes)}\nendstream`);
    });

    const xobjekte = this.bilder.length
      ? ` /XObject << ${this.bilder.map((bild, i) => `/${bild.name} ${bildNummern[i]} 0 R`).join(' ')} >>`
      : '';

    const seitenNummern = [];
    for (const seite of this.seiten) {
      const inhalt = seite.inhalt();
      const stromNr = platzhalter();
      setze(stromNr, `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`);

      const seitenNr = platzhalter();
      setze(seitenNr,
        `<< /Type /Page /Parent ${baumNr} 0 R /MediaBox [0 0 ${this.breite.toFixed(2)} ${this.hoehe.toFixed(2)}]`
        + ` /Resources << /Font << /F1 ${schriftNormalNr} 0 R /F2 ${schriftFettNr} 0 R >>${xobjekte} >>`
        + ` /Contents ${stromNr} 0 R >>`);
      seitenNummern.push(seitenNr);
    }

    setze(schriftNormalNr, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    setze(schriftFettNr, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    setze(katalogNr, `<< /Type /Catalog /Pages ${baumNr} 0 R >>`);
    setze(baumNr, `<< /Type /Pages /Count ${seitenNummern.length}`
      + ` /Kids [${seitenNummern.map((nummer) => `${nummer} 0 R`).join(' ')}] >>`);

    const infoNr = platzhalter();
    setze(infoNr, `<< /Title (Bordbuch) /Creator (Bordbuch) /Producer (Bordbuch) /CreationDate (${pdfDatum(new Date())}) >>`);

    let datei = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const versaetze = [];
    objekte.forEach((inhalt, index) => {
      versaetze.push(datei.length);
      datei += `${index + 1} 0 obj\n${inhalt}\nendobj\n`;
    });

    const xrefStart = datei.length;
    datei += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
    for (const versatz of versaetze) datei += `${String(versatz).padStart(10, '0')} 00000 n \n`;
    datei += `trailer\n<< /Size ${objekte.length + 1} /Root ${katalogNr} 0 R /Info ${infoNr} 0 R >>\n`;
    datei += `startxref\n${xrefStart}\n%%EOF\n`;

    // Jedes Zeichen der Zeichenkette ist genau ein Byte — dafür sorgen
    // winAnsi() und alsZeichen() weiter oben.
    const bytes = new Uint8Array(datei.length);
    for (let i = 0; i < datei.length; i += 1) bytes[i] = datei.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

/* Bytes als Zeichenkette, ein Zeichen je Byte. In Häppchen, weil
   String.fromCharCode mit einem ganzen Foto auf einmal den Stapel
   sprengt. */
function alsZeichen(bytes) {
  let raus = '';
  const schritt = 8192;
  for (let i = 0; i < bytes.length; i += schritt) {
    raus += String.fromCharCode.apply(null, bytes.subarray(i, i + schritt));
  }
  return raus;
}

const pdfDatum = (datum) => {
  const zwei = (zahl) => String(zahl).padStart(2, '0');
  return `D:${datum.getFullYear()}${zwei(datum.getMonth() + 1)}${zwei(datum.getDate())}`
    + `${zwei(datum.getHours())}${zwei(datum.getMinutes())}${zwei(datum.getSeconds())}`;
};

/** Text auf eine Breite umbrechen. Ein zu langes Einzelwort wird hart
    getrennt, damit nichts über den Rand läuft. */
function umbrich(text, groesse, maxBreite, { fett = false } = {}) {
  const woerter = String(text).split(/\s+/).filter(Boolean);
  const zeilen = [];
  let aktuell = '';

  for (const wort of woerter) {
    const versuch = aktuell ? `${aktuell} ${wort}` : wort;
    if (breiteVon(versuch, groesse, { fett }) <= maxBreite) {
      aktuell = versuch;
      continue;
    }
    if (aktuell) zeilen.push(aktuell);

    let rest = wort;
    while (breiteVon(rest, groesse, { fett }) > maxBreite && rest.length > 1) {
      let schnitt = rest.length - 1;
      while (schnitt > 1 && breiteVon(`${rest.slice(0, schnitt)}-`, groesse, { fett }) > maxBreite) schnitt -= 1;
      zeilen.push(`${rest.slice(0, schnitt)}-`);
      rest = rest.slice(schnitt);
    }
    aktuell = rest;
  }

  if (aktuell) zeilen.push(aktuell);
  return zeilen.length ? zeilen : [''];
}

/* ── Das Bordbuch als Dokument ───────────────────────────── */

export function erzeugePDF({ eintraege, einstellungen, statistik, bilanz = null, belege = [], druck = false }) {
  const dok = new Dokument(einstellungen.pdfFormat, { druck });
  const mitKosten = einstellungen.pdfKosten !== false;
  const mitNotizen = einstellungen.pdfNotizen !== false;

  /* Spalten. Die Arbeit bekommt, was übrig bleibt. */
  const spalte = {
    datum: RAND,
    km: RAND + 92,
    arbeit: RAND + 168,
    kosten: dok.breite - RAND,
  };
  const arbeitBreite = (mitKosten ? spalte.kosten - 70 : spalte.kosten) - spalte.arbeit - 10;

  let seite = dok.neueSeite();
  kopfzeile(seite, dok, einstellungen);
  seite.y = kennzahlen(seite, dok, statistik, einstellungen, bilanz);
  seite.y = tabellenKopf(seite, dok, spalte, mitKosten);

  const unterkante = RAND + 26;

  for (const eintrag of eintraege) {
    const art = artVon(eintrag.art);
    const beschreibung = eintrag.text || art.standard || art.label;
    const zeilen = umbrich(beschreibung, 9.5, arbeitBreite);

    const zusatz = [];
    /* Die Tankangaben stehen immer dabei — sie sind der Beleg für die
       Verbrauchsrechnung und gehören damit ins Dokument, nicht in die
       abschaltbaren Notizen. */
    if (eintrag.art === 'tanken' && eintrag.liter) {
      const teile = [liter(eintrag.liter), eintrag.voll ? 'vollgetankt' : 'Teilbetankung'];
      if (eintrag.kosten) teile.push(`${spritZahl((eintrag.kosten / (eintrag.liter / 1000)))} €/L`);
      zusatz.push(...umbrich(teile.join(' · '), 8, arbeitBreite));
    }
    if (mitNotizen) {
      if (eintrag.werkstatt) zusatz.push(...umbrich(eintrag.werkstatt, 8, arbeitBreite));
      if (eintrag.notiz) zusatz.push(...umbrich(eintrag.notiz, 8, arbeitBreite));
    }

    const hoehe = 14 + zeilen.length * 12 + zusatz.length * 10;

    if (seite.y - hoehe < unterkante) {
      seite = dok.neueSeite();
      seite.y = dok.hoehe - RAND;
      seite.y = tabellenKopf(seite, dok, spalte, mitKosten);
    }

    let y = seite.y - 12;

    seite.text(formatDatum(eintrag.datum, { kurz: true }), spalte.datum, y, { groesse: 9.5, farbe: FARBE.text });
    seite.text(`${km(eintrag.km)}`, spalte.km + 60, y, { groesse: 9.5, align: 'rechts', farbe: FARBE.text });

    seite.label(art.label, spalte.arbeit, y + 0.5, { groesse: 6.5, farbe: FARBE.walnuss });
    let textY = y - 11;
    for (const zeile of zeilen) {
      seite.text(zeile, spalte.arbeit, textY, { groesse: 9.5, farbe: FARBE.text });
      textY -= 12;
    }
    for (const zeile of zusatz) {
      seite.text(zeile, spalte.arbeit, textY + 2, { groesse: 8, farbe: FARBE.leise });
      textY -= 10;
    }

    if (mitKosten && eintrag.kosten) {
      seite.text(euro(eintrag.kosten), spalte.kosten, y, { groesse: 9.5, align: 'rechts', farbe: FARBE.text });
    }

    seite.y -= hoehe;
    seite.linie(RAND, seite.y + 4, dok.breite - RAND, seite.y + 4);
  }

  schlussNotiz(seite, dok, statistik, eintraege.length);
  belegAnhang(dok, eintraege, belege);
  dok.fussNoten(`Moch \xB7 Studios \xB7 Bordbuch`);

  const blob = dok.alsBlob();
  log('pdf', 'PDF erzeugt', { fassung: druck ? 'Druck' : 'Versand', seiten: dok.seiten.length, eintraege: eintraege.length, bytes: blob.size });
  return { blob, seiten: dok.seiten.length, bytes: blob.size };
}

function kopfzeile(seite, dok, einstellungen) {
  const oben = dok.hoehe - RAND;

  seite.label('Moch \xB7 Studios', RAND, oben - 10, { farbe: FARBE.text, groesse: 9 });
  seite.label(`Stand ${formatDatum(new Date().toISOString().slice(0, 10), { kurz: true })}`,
    dok.breite - RAND, oben - 10, { align: 'rechts', groesse: 7.5 });

  // Die einzige Messinglinie im Dokument. Mehr braucht es nicht.
  seite.linie(RAND, oben - 20, dok.breite - RAND, oben - 20, FARBE.messing);

  seite.text('Bordbuch', RAND, oben - 54, { groesse: 26, farbe: FARBE.text });

  const fahrzeug = [einstellungen.fahrzeug, einstellungen.kennzeichen, einstellungen.baujahr]
    .map((teil) => (teil || '').trim()).filter(Boolean).join(' \xB7 ');
  seite.text(fahrzeug || 'Fahrzeug ohne Angabe', RAND, oben - 72, { groesse: 11, farbe: FARBE.leise });
  if (einstellungen.fin) {
    seite.text(`FIN ${einstellungen.fin}`, RAND, oben - 87, { groesse: 8.5, farbe: FARBE.leise });
  }

  seite.y = oben - (einstellungen.fin ? 106 : 96);
}

function kennzahlen(seite, dok, statistik, einstellungen, bilanz) {
  const y = seite.y;
  const hoehe = 62;

  if (!dok.druck) seite.flaeche(RAND, y - hoehe, dok.inhaltsbreite, hoehe, FARBE.flaeche);
  rahmen(seite, RAND, y - hoehe, dok.inhaltsbreite, hoehe);

  const werte = [
    ['Kilometerstand', statistik.stand === null ? '—' : `${km(statistik.stand)} km`],
    ['Fahrleistung', `${km(statistik.gefahren)} km`],
    ['Einträge', km(statistik.anzahl)],
    ['Zeitraum', statistik.erster
      ? `${formatDatum(statistik.erster.datum, { kurz: true })} – ${formatDatum(statistik.letzter.datum, { kurz: true })}`
      : '—'],
  ];
  if (bilanz && bilanz.schnitt) {
    werte.push(['Verbrauch', `${verbrauchZahl(bilanz.schnitt)} L/100 km`]);
  }
  if (einstellungen.pdfKosten !== false && statistik.kosten) {
    werte.push(['Kosten gesamt', euro(statistik.kosten)]);
  }

  const spaltenBreite = dok.inhaltsbreite / werte.length;
  werte.forEach(([label, wert], index) => {
    const x = RAND + spaltenBreite * index + 14;
    seite.label(label, x, y - 22);
    seite.text(wert, x, y - 42, { groesse: 12, farbe: FARBE.text });
  });

  return y - hoehe - 26;
}

function rahmen(seite, x, y, breite, hoehe) {
  seite.linie(x, y, x + breite, y);
  seite.linie(x, y + hoehe, x + breite, y + hoehe);
  seite.linie(x, y, x, y + hoehe);
  seite.linie(x + breite, y, x + breite, y + hoehe);
}

function tabellenKopf(seite, dok, spalte, mitKosten) {
  const y = seite.y;
  seite.label('Datum', spalte.datum, y);
  seite.label('km', spalte.km + 60, y, { align: 'rechts' });
  seite.label('Arbeit', spalte.arbeit, y);
  if (mitKosten) seite.label('Kosten', spalte.kosten, y, { align: 'rechts' });
  seite.linie(RAND, y - 8, dok.breite - RAND, y - 8);
  return y - 14;
}

function schlussNotiz(seite, dok, statistik, anzahl) {
  if (seite.y < RAND + 90) return;   // Auf einer vollen Seite fällt sie weg.

  const y = seite.y - 18;
  seite.label('Hinweis', RAND, y);
  const text = statistik.ausreisser.length
    ? `Diese Aufstellung enthält ${km(anzahl)} Einträge. Bei ${km(statistik.ausreisser.length)} `
      + 'Übergang(en) liegt ein niedrigerer Kilometerstand vor als beim Eintrag davor; diese Strecken sind '
      + 'in der Fahrleistung nicht enthalten.'
    : `Diese Aufstellung enthält ${km(anzahl)} Einträge, lückenlos in der Reihenfolge der Kilometerstände.`;

  let textY = y - 14;
  for (const zeile of umbrich(text, 8.5, dok.inhaltsbreite)) {
    seite.text(zeile, RAND, textY, { groesse: 8.5, farbe: FARBE.leise });
    textY -= 11;
  }
}

/* ── Anhang: die Belege ─────────────────────────────────────
   Eine Seite je Beleg, mit der Zeile des zugehörigen Eintrags darüber.
   Genau das macht aus der Liste einen Nachweis: Wer den Wagen kauft,
   sieht die Rechnung neben dem Eintrag und muss nichts glauben. */

function belegAnhang(dok, eintraege, belege) {
  if (!belege.length) return;

  const nachId = new Map(eintraege.map((eintrag) => [eintrag.id, eintrag]));

  for (const beleg of belege) {
    const eintrag = nachId.get(beleg.eintragId);
    if (!eintrag) continue;

    const seite = dok.neueSeite();
    const oben = dok.hoehe - RAND;

    seite.label('Beleg', RAND, oben - 10, { farbe: FARBE.walnuss, groesse: 9 });
    seite.linie(RAND, oben - 20, dok.breite - RAND, oben - 20, FARBE.messing);

    const kopf = `${formatDatum(eintrag.datum)} \xB7 ${km(eintrag.km)} km \xB7 ${artVon(eintrag.art).label}`;
    seite.text(kopf, RAND, oben - 40, { groesse: 11, farbe: FARBE.text });
    if (eintrag.text) {
      seite.text(umbrich(eintrag.text, 9.5, dok.inhaltsbreite)[0], RAND, oben - 56, { groesse: 9.5, farbe: FARBE.leise });
    }

    // Das Bild bekommt den Rest der Seite und behält sein Seitenverhältnis.
    const kastenOben = oben - 74;
    const kastenUnten = RAND + 26;
    const maxBreite = dok.inhaltsbreite;
    const maxHoehe = kastenOben - kastenUnten;
    const faktor = Math.min(maxBreite / beleg.breite, maxHoehe / beleg.hoehe);
    const breite = beleg.breite * faktor;
    const hoehe = beleg.hoehe * faktor;
    const x = RAND + (maxBreite - breite) / 2;
    const y = kastenUnten + (maxHoehe - hoehe) / 2;

    const name = dok.bildEinfuegen(beleg.bytes, beleg.breite, beleg.hoehe);
    seite.bild(name, x, y, breite, hoehe);
    rahmen(seite, x, y, breite, hoehe);
  }

  log('pdf', 'Belege angehängt', { anzahl: belege.length });
}

/** Kurze Testseite für die Einstellungen: prüft Schrift, Umlaute,
    Zahlen und Linien, ohne dass echte Einträge nötig sind. */
export function testSeite() {
  try {
    const dok = new Dokument('a4');
    const seite = dok.neueSeite();
    seite.label('Moch \xB7 Studios', RAND, dok.hoehe - RAND - 10, { farbe: FARBE.text, groesse: 9 });
    seite.linie(RAND, dok.hoehe - RAND - 20, dok.breite - RAND, dok.hoehe - RAND - 20, FARBE.messing);
    seite.text('PDF-Testseite', RAND, dok.hoehe - RAND - 54, { groesse: 26 });
    seite.text('Umlaute: ÄÖÜ äöü ß — Euro: 1.234,56 €', RAND, dok.hoehe - RAND - 84, { groesse: 11, farbe: FARBE.leise });
    seite.text('Ziffernflucht: 0123456789 / 111.111 / 999.999', RAND, dok.hoehe - RAND - 102, { groesse: 11, farbe: FARBE.leise });
    seite.text('Klammern und Rückstrich: (test) \\ (test)', RAND, dok.hoehe - RAND - 120, { groesse: 11, farbe: FARBE.leise });
    dok.fussNoten('Moch \xB7 Studios \xB7 Bordbuch \xB7 Testseite');
    const blob = dok.alsBlob();
    log('pdf', 'Testseite erzeugt', { bytes: blob.size });
    return { blob, seiten: 1, bytes: blob.size };
  } catch (error) {
    fehler('pdf', 'Testseite fehlgeschlagen', error);
    throw error;
  }
}

/* Für den Selbsttest: darf von außen geprüft werden. */
export const _intern = { umbrich, breiteVon, winAnsi, Dokument };
