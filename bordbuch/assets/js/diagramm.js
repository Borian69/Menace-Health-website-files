/* Zwei Diagramme, von Hand als SVG gebaut — keine Bibliothek.

   Bewusst zwei getrennte Bilder statt eines mit zwei Achsen: Kilometer je
   Monat und aufsummierte Kilometer sind zwei verschiedene Größen, und
   zwei Skalen in einem Bild lassen sich nicht ehrlich ablesen. Sie teilen
   sich dieselbe X-Achse und stehen untereinander.

   Farben stehen ausschließlich im Stylesheet (Klassen dg-*). Hier wird
   nur Geometrie gerechnet. */

import { el, km, MONATE_KURZ, alsDate, formatDatum } from './util.js';
import { log, aktiv } from './debug.js';

const NS = 'http://www.w3.org/2000/svg';

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, wert] of Object.entries(attrs)) node.setAttribute(key, wert);
  return node;
};

/* Nicht die Obergrenze wird gerundet, sondern der Schritt: Sonst stünde
   an der Achse 1.333, und gekürzt gelesen wären zwei verschiedene Werte
   beide „1k“. So sind alle Beschriftungen runde Zahlen. */
function skala(max, wunschLinien = 3) {
  if (max <= 0) return { obergrenze: 100, schritt: 50, linien: 2 };
  const roh = max / wunschLinien;
  const stufe = 10 ** Math.floor(Math.log10(roh));
  const faktor = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((wert) => stufe * wert >= roh) || 10;
  const schritt = stufe * faktor;
  const linien = Math.max(1, Math.ceil(max / schritt));
  return { obergrenze: schritt * linien, schritt, linien };
}

/* Erst ab zehntausend wird gekürzt. Darunter stünde für 2.250 sonst
   „2,3k“ — eine gerundete Achse, die den Balken darunter widerspricht. */
const tausender = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const achsenText = (wert) => (wert >= 10000 ? `${tausender.format(wert / 1000)}k` : km(wert));

const RAND = { oben: 22, unten: 26, links: 46, rechts: 10 };

/** Gemeinsames Gerüst: Fläche, Gitter, Achsenbeschriftung. */
function geruest(breite, hoehe, { obergrenze, schritt, linien }, { monate = true, formatiere = achsenText } = {}) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${breite} ${hoehe}`,
    width: '100%',
    height: hoehe,
    role: 'img',
  });

  const flaeche = {
    x: RAND.links,
    y: RAND.oben,
    breite: breite - RAND.links - RAND.rechts,
    hoehe: hoehe - RAND.oben - RAND.unten,
  };

  const yVon = (wert) => flaeche.y + flaeche.hoehe - (wert / obergrenze) * flaeche.hoehe;

  // Gitter: Haarlinien, bewusst zurückhaltend. Die Werte stehen links.
  for (let i = 0; i <= linien; i += 1) {
    const wert = schritt * i;
    const y = yVon(wert);
    svg.append(svgEl('line', {
      class: i === 0 ? 'dg-achse' : 'dg-gitter',
      x1: flaeche.x, y1: y, x2: flaeche.x + flaeche.breite, y2: y,
    }));
    const beschriftung = svgEl('text', { class: 'dg-tick', x: flaeche.x - 8, y: y + 3.5, 'text-anchor': 'end' });
    beschriftung.textContent = formatiere(wert);
    svg.append(beschriftung);
  }

  // Monatsbuchstaben unten — nur die Jahresdiagramme haben ein Monatsraster.
  const spalte = flaeche.breite / 12;
  for (let monat = 0; monate && monat < 12; monat += 1) {
    const text = svgEl('text', {
      class: 'dg-tick',
      x: flaeche.x + spalte * (monat + 0.5),
      y: hoehe - 9,
      'text-anchor': 'middle',
    });
    text.textContent = MONATE_KURZ[monat].slice(0, 1);
    svg.append(text);
  }

  return { svg, flaeche, yVon, schritt: spalte };
}

/* ── Balken: Kilometer je Monat ──────────────────────────── */

export function balken(daten, breite, { beiAuswahl } = {}) {
  const hoehe = 190;
  const masstab = skala(daten.max);
  const { svg, flaeche, yVon, schritt } = geruest(breite, hoehe, masstab);
  svg.setAttribute('aria-label', `Gefahrene Kilometer je Monat im Jahr ${daten.jahr}`);

  const luecke = Math.min(10, schritt * 0.28);
  const balkenBreite = Math.max(4, schritt - luecke);

  daten.monate.forEach((wert, monat) => {
    const x = flaeche.x + schritt * monat + (schritt - balkenBreite) / 2;
    const y = yVon(wert);
    const h = flaeche.y + flaeche.hoehe - y;

    // Auch der Nullbalken bekommt eine Trefferfläche — sonst lässt sich
    // ein leerer Monat nicht antippen, obwohl er etwas aussagt.
    const treffer = svgEl('rect', {
      class: 'dg-treffer',
      x: flaeche.x + schritt * monat,
      y: flaeche.y,
      width: schritt,
      height: flaeche.hoehe,
      'data-monat': monat,
    });
    svg.append(treffer);

    if (wert > 0) {
      svg.append(svgEl('rect', {
        class: 'dg-balken',
        x, y, width: balkenBreite, height: Math.max(1.5, h),
        rx: 2,
        'data-monat': monat,
      }));
    }
  });

  // Genau eine Zahl im Bild: der stärkste Monat. Alles andere steht in
  // der Tabelle darunter und in der Sprechblase beim Antippen.
  const spitze = daten.monate.indexOf(daten.max);
  if (daten.max > 0 && spitze >= 0) {
    const text = svgEl('text', {
      class: 'dg-wert',
      x: flaeche.x + schritt * (spitze + 0.5),
      y: yVon(daten.max) - 7,
      'text-anchor': 'middle',
    });
    text.textContent = km(daten.max);
    svg.append(text);
  }

  if (aktiv('diagramm')) {
    log('diagramm', 'Balken gezeichnet', { jahr: daten.jahr, ...masstab, breite, max: daten.max });
    zeigeRohwerte(svg, daten.monate, flaeche, schritt, yVon);
  }

  verdrahte(svg, schritt, flaeche, beiAuswahl);
  return svg;
}

/* ── Kurve: kumuliert über das Jahr ──────────────────────── */

export function kurve(daten, breite, { beiAuswahl } = {}) {
  const hoehe = 190;
  const masstab = skala(daten.gesamt);
  const { svg, flaeche, yVon, schritt } = geruest(breite, hoehe, masstab);
  svg.setAttribute('aria-label', `Aufsummierte Kilometer im Jahresverlauf ${daten.jahr}`);

  // Die Kurve beginnt am 1. Januar bei null und erreicht jeden Monatswert
  // an dessen Ende. Nach dem letzten Monat mit Daten hört sie auf —
  // eine waagerechte Linie bis Dezember würde Stillstand behaupten, den
  // niemand gemessen hat.
  const bis = daten.letzterMonat >= 0 ? daten.letzterMonat : -1;
  const punkte = [{ x: flaeche.x, y: yVon(0), wert: 0, monat: -1 }];
  for (let monat = 0; monat <= bis; monat += 1) {
    punkte.push({
      x: flaeche.x + schritt * (monat + 1),
      y: yVon(daten.kumuliert[monat]),
      wert: daten.kumuliert[monat],
      monat,
    });
  }

  if (punkte.length > 1) {
    const pfad = punkte.map((punkt, i) => `${i === 0 ? 'M' : 'L'}${punkt.x.toFixed(1)} ${punkt.y.toFixed(1)}`).join(' ');
    const letzter = punkte[punkte.length - 1];

    /* Bewusst ohne Flächenfüllung: Die Kurve ist eine Linie und trägt
       deshalb Messing. Eine gefüllte Fläche darunter wäre ein zweiter
       lauter Block in einer Ansicht, die mit den Balken schon einen hat. */
    svg.append(svgEl('path', { class: 'dg-linie', d: pfad }));

    svg.append(svgEl('circle', { class: 'dg-punkt', cx: letzter.x, cy: letzter.y, r: 4 }));
    const text = svgEl('text', {
      class: 'dg-wert',
      x: Math.min(letzter.x, flaeche.x + flaeche.breite - 4),
      y: Math.max(letzter.y - 10, 12),
      'text-anchor': letzter.x > flaeche.x + flaeche.breite * 0.75 ? 'end' : 'middle',
    });
    text.textContent = km(letzter.wert);
    svg.append(text);
  }

  // Trefferflächen für alle zwölf Monate, damit auch der leere Rest
  // antippbar bleibt und die Sprechblase überall etwas sagt.
  for (let monat = 0; monat < 12; monat += 1) {
    svg.append(svgEl('rect', {
      class: 'dg-treffer',
      x: flaeche.x + schritt * monat,
      y: flaeche.y,
      width: schritt,
      height: flaeche.hoehe,
      'data-monat': monat,
    }));
  }

  if (aktiv('diagramm')) {
    log('diagramm', 'Kurve gezeichnet', { jahr: daten.jahr, ...masstab, punkte: punkte.length, letzterMonat: bis });
  }

  verdrahte(svg, schritt, flaeche, beiAuswahl);
  return svg;
}

/* ── Bedienung ───────────────────────────────────────────── */

function verdrahte(svg, schritt, flaeche, beiAuswahl) {
  if (!beiAuswahl) return;

  const monatUnter = (event) => {
    const kasten = svg.getBoundingClientRect();
    // Der Kasten kann skaliert sein (viewBox ≠ CSS-Breite), deshalb wird
    // die Zeigerposition erst in Diagramm-Koordinaten umgerechnet.
    const skala = svg.viewBox.baseVal.width / kasten.width || 1;
    const x = (event.clientX - kasten.left) * skala;
    const monat = Math.floor((x - flaeche.x) / schritt);
    return monat >= 0 && monat < 12 ? monat : null;
  };

  const zeige = (event) => {
    const monat = monatUnter(event);
    hebeHervor(svg, monat);
    beiAuswahl(monat, event);
  };

  svg.addEventListener('pointermove', zeige);
  svg.addEventListener('pointerdown', zeige);
  svg.addEventListener('pointerleave', () => {
    hebeHervor(svg, null);
    beiAuswahl(null, null);
  });
}

function hebeHervor(svg, monat) {
  for (const balkenEl of svg.querySelectorAll('.dg-balken')) {
    balkenEl.classList.toggle('an', Number(balkenEl.dataset.monat) === monat);
  }
}

/* Nur im Debug-Modus: die gerundeten Rohwerte direkt im Bild. */
function zeigeRohwerte(svg, werte, flaeche, schritt, yVon) {
  werte.forEach((wert, monat) => {
    const text = svgEl('text', {
      class: 'dg-roh',
      x: flaeche.x + schritt * (monat + 0.5),
      y: flaeche.y + flaeche.hoehe + 12,
      'text-anchor': 'middle',
    });
    text.textContent = wert;
    svg.append(text);
  });
}

/** Die Tabelle unter den Diagrammen. Sie ist kein Beiwerk: Wer die Kurve
    nicht ablesen kann oder will, bekommt hier dieselben Zahlen. */
export function tabelle(daten) {
  const koerper = el('tbody');
  daten.monate.forEach((wert, monat) => {
    if (wert === 0 && daten.kumuliert[monat] === 0) return;
    koerper.append(el('tr', {},
      el('td', { text: MONATE_KURZ[monat] }),
      el('td', { class: 'zahl', text: km(wert) }),
      el('td', { class: 'zahl leise', text: km(daten.kumuliert[monat]) }),
    ));
  });

  if (!koerper.children.length) {
    koerper.append(el('tr', {}, el('td', { colspan: '3', class: 'leise', text: 'Für dieses Jahr liegen keine Strecken vor.' })));
  }

  return el('table', { class: 'dg-tabelle' },
    el('thead', {}, el('tr', {},
      el('th', { text: 'Monat' }),
      el('th', { class: 'zahl', text: 'km' }),
      el('th', { class: 'zahl', text: 'kumuliert' }),
    )),
    koerper,
  );
}

/* ── Zeitreihe: ein Wert je Messung über die Zeit ────────────
   Für den Verbrauch taugt das Monatsraster der beiden Jahresdiagramme
   nicht: Getankt wird unregelmäßig, und jede Messung gehört an ihren Tag.
   Die X-Achse ist deshalb der echte Zeitstrahl zwischen erster und
   letzter Messung, nicht eine Reihe gleich breiter Fächer. */

export function zeitreihe(punkte, breite, {
  formatiere = (wert) => km(wert),
  beiAuswahl,
  hoehe = 190,
  beschriftung = '',
} = {}) {
  const werte = punkte.map((punkt) => punkt.wert);
  const masstab = skala(Math.max(...werte, 0));
  const { svg, flaeche, yVon } = geruest(breite, hoehe, masstab, { monate: false, formatiere });
  svg.setAttribute('aria-label', beschriftung);

  const zeiten = punkte.map((punkt) => alsDate(punkt.datum).getTime());
  const von = Math.min(...zeiten);
  const bis = Math.max(...zeiten);
  const spanne = bis - von;

  // Eine einzelne Messung hat keine Strecke — sie steht in der Mitte.
  const xVon = (zeit) => (spanne > 0
    ? flaeche.x + ((zeit - von) / spanne) * flaeche.breite
    : flaeche.x + flaeche.breite / 2);

  const orte = punkte.map((punkt, i) => ({
    ...punkt,
    x: xVon(zeiten[i]),
    y: yVon(punkt.wert),
    index: i,
  }));

  if (orte.length > 1) {
    const pfad = orte.map((ort, i) => `${i === 0 ? 'M' : 'L'}${ort.x.toFixed(1)} ${ort.y.toFixed(1)}`).join(' ');
    svg.append(svgEl('path', { class: 'dg-linie', d: pfad }));
  }

  for (const ort of orte) {
    svg.append(svgEl('circle', { class: 'dg-punkt', cx: ort.x, cy: ort.y, r: orte.length > 24 ? 2.5 : 4 }));
  }

  // Der jüngste Wert steht als Zahl im Bild — er ist der, auf den es ankommt.
  const letzter = orte[orte.length - 1];
  if (letzter) {
    const text = svgEl('text', {
      class: 'dg-wert',
      x: Math.min(letzter.x, flaeche.x + flaeche.breite),
      y: Math.max(letzter.y - 11, 12),
      'text-anchor': letzter.x > flaeche.x + flaeche.breite * 0.7 ? 'end' : 'middle',
    });
    text.textContent = formatiere(letzter.wert);
    svg.append(text);
  }

  // Zeitmarken: erste und letzte Messung, bei genug Platz eine in der Mitte.
  const marken = orte.length > 2 ? [orte[0], orte[Math.floor(orte.length / 2)], letzter] : [orte[0], letzter];
  const gesehen = new Set();
  for (const [i, ort] of marken.filter(Boolean).entries()) {
    if (!ort || gesehen.has(ort.index)) continue;
    gesehen.add(ort.index);
    const text = svgEl('text', {
      class: 'dg-tick',
      x: ort.x,
      y: hoehe - 9,
      'text-anchor': i === 0 ? 'start' : i === marken.length - 1 ? 'end' : 'middle',
    });
    text.textContent = formatDatum(ort.datum, { kurz: true }).slice(3);   // MM.JJJJ
    svg.append(text);
  }

  if (beiAuswahl) verdrahteReihe(svg, orte, flaeche, beiAuswahl);
  log('diagramm', 'Zeitreihe gezeichnet', { punkte: orte.length, ...masstab });
  return svg;
}

function verdrahteReihe(svg, orte, flaeche, beiAuswahl) {
  const zeiger = svgEl('line', {
    class: 'dg-fadenkreuz',
    x1: 0, y1: flaeche.y, x2: 0, y2: flaeche.y + flaeche.hoehe,
    opacity: '0',
  });
  svg.append(zeiger);

  const naechster = (event) => {
    const kasten = svg.getBoundingClientRect();
    const massstab = svg.viewBox.baseVal.width / kasten.width || 1;
    const x = (event.clientX - kasten.left) * massstab;
    let treffer = null;
    let abstand = Infinity;
    for (const ort of orte) {
      const weite = Math.abs(ort.x - x);
      if (weite < abstand) { abstand = weite; treffer = ort; }
    }
    return treffer;
  };

  const zeige = (event) => {
    const ort = naechster(event);
    if (!ort) return;
    zeiger.setAttribute('x1', ort.x);
    zeiger.setAttribute('x2', ort.x);
    zeiger.setAttribute('opacity', '1');
    beiAuswahl(ort);
  };

  svg.addEventListener('pointermove', zeige);
  svg.addEventListener('pointerdown', zeige);
  svg.addEventListener('pointerleave', () => {
    zeiger.setAttribute('opacity', '0');
    beiAuswahl(null);
  });
}
