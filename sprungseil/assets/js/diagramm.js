/* Zwei Diagramme, von Hand als SVG — keine Bibliothek.

   Minuten je Woche als Balken, das Gewicht als Kurve. Je eine Größe, je
   eine Achse. Farben stehen ausschließlich im Stylesheet (Klassen dg-*);
   hier wird nur Geometrie gerechnet. */

import { datumKurz, tageZwischen } from './datum.js';
import { dez, ganz } from './zahl.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const knoten = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) knoten.setAttribute(k, v);
  return knoten;
}

function text(klasse, x, y, inhalt, anker = 'middle') {
  const t = svgEl('text', { class: klasse, x, y, 'text-anchor': anker });
  t.textContent = inhalt;
  return t;
}

/* Gerundet wird der Schritt, nicht die Obergrenze: So stehen an der
   Achse nur runde Zahlen (wie im Bordbuch). */
function skala(max, wunschLinien = 3) {
  if (max <= 0) return { obergrenze: 30, schritt: 10, linien: 3 };
  const roh = max / wunschLinien;
  const stufe = 10 ** Math.floor(Math.log10(roh));
  const faktor = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((f) => stufe * f >= roh) || 10;
  const schritt = stufe * faktor;
  const linien = Math.max(1, Math.ceil(max / schritt));
  return { obergrenze: schritt * linien, schritt, linien };
}

function leinwand(breite, hoehe, rand) {
  const svg = svgEl('svg', { viewBox: `0 0 ${breite} ${hoehe}`, width: '100%', height: hoehe, role: 'img' });
  const flaeche = {
    x: rand.links,
    y: rand.oben,
    breite: breite - rand.links - rand.rechts,
    hoehe: hoehe - rand.oben - rand.unten,
  };
  return { svg, flaeche };
}

/** Balken mit 4 px runder Kappe, gerade an der Grundlinie. */
function balkenPfad(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  const unten = y + h;
  return `M${x},${unten}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${unten}Z`;
}

/* ── Minuten je Woche ────────────────────────────────────── */

export function wochenBalken(wochen, ziel, breite, { beiAuswahl } = {}) {
  const hoehe = 176;
  const { svg, flaeche } = leinwand(breite, hoehe, { oben: 22, unten: 26, links: 34, rechts: 6 });
  const masstab = skala(Math.max(ziel, ...wochen.map((w) => w.minuten)));
  const yVon = (wert) => flaeche.y + flaeche.hoehe - (wert / masstab.obergrenze) * flaeche.hoehe;
  svg.setAttribute('aria-label', `Trainingsminuten der letzten ${wochen.length} Wochen, Wochenziel ${ziel} Minuten`);

  for (let i = 0; i <= masstab.linien; i += 1) {
    const wert = masstab.schritt * i;
    const y = yVon(wert);
    svg.append(svgEl('line', { class: i ? 'dg-gitter' : 'dg-achse', x1: flaeche.x, y1: y, x2: flaeche.x + flaeche.breite, y2: y }));
    svg.append(text('dg-tick', flaeche.x - 8, y + 3.5, ganz(wert), 'end'));
  }

  const spalte = flaeche.breite / wochen.length;
  const dick = Math.min(24, spalte * 0.62);
  const jedes = spalte >= 40 ? 1 : 2;
  const balken = [];

  wochen.forEach((woche, i) => {
    const x = flaeche.x + spalte * i + (spalte - dick) / 2;
    const y = yVon(woche.minuten);
    const h = flaeche.y + flaeche.hoehe - y;
    const treffer = svgEl('rect', { class: 'dg-treffer', x: flaeche.x + spalte * i, y: flaeche.y, width: spalte, height: flaeche.hoehe + 20 });
    treffer.addEventListener('pointerenter', () => waehle(i));
    treffer.addEventListener('click', () => waehle(i));
    svg.append(treffer);
    const pfad = woche.minuten > 0 ? svgEl('path', { class: 'dg-balken', d: balkenPfad(x, y, dick, Math.max(1.5, h)) }) : null;
    if (pfad) svg.append(pfad);
    balken.push(pfad);
    if ((wochen.length - 1 - i) % jedes === 0) {
      svg.append(text('dg-tick', flaeche.x + spalte * (i + 0.5), hoehe - 8, datumKurz(woche.start).slice(0, 5)));
    }
  });

  /* Das Ziel als stille Linie über die ganze Breite, über den Balken —
     man sieht sofort, welche Woche darüber lag. */
  const zielY = yVon(ziel);
  svg.append(svgEl('line', { class: 'dg-ziel', x1: flaeche.x, y1: zielY, x2: flaeche.x + flaeche.breite, y2: zielY }));

  /* Genau eine Zahl im Bild: die laufende Woche. */
  const letzte = wochen[wochen.length - 1];
  if (letzte.minuten > 0) {
    svg.append(text('dg-wert', flaeche.x + spalte * (wochen.length - 0.5), yVon(letzte.minuten) - 7, ganz(letzte.minuten)));
  }

  function waehle(i) {
    balken.forEach((b, j) => b && b.classList.toggle('an', j === i));
    if (beiAuswahl) beiAuswahl(i);
  }
  /* Mit dem Finger bleibt die Auswahl stehen: Beim Abheben verlässt der
     Zeiger die Fläche, und die Zahl wäre weg, bevor sie gelesen ist. */
  svg.addEventListener('pointerleave', (ereignis) => {
    if (ereignis.pointerType === 'touch') return;
    balken.forEach((b) => b && b.classList.remove('an'));
    if (beiAuswahl) beiAuswahl(null);
  });
  return svg;
}

/* ── Gewicht ─────────────────────────────────────────────── */

/** punkte: Einträge mit Trend (gleitend()), aufsteigend. Messungen als
    Punkte in der stillen Farbe, der 7-Tage-Schnitt als Linie in der
    Hauptfarbe — der Trend ist die Aussage, die Messung der Beleg. */
export function gewichtKurve(punkte, ziel, breite, { beiAuswahl } = {}) {
  const hoehe = 190;
  const { svg, flaeche } = leinwand(breite, hoehe, { oben: 14, unten: 26, links: 40, rechts: 10 });
  const erster = punkte[0].datum;
  const spanne = tageZwischen(erster, punkte[punkte.length - 1].datum);
  const xVon = (datum) => flaeche.x + (spanne ? tageZwischen(erster, datum) / spanne : 0.5) * flaeche.breite;

  const werte = punkte.flatMap((p) => [p.kg, p.trend]);
  let tief = Math.min(...werte);
  let hoch = Math.max(...werte);
  /* Das Ziel kommt ins Bild, wenn es nah ist. Liegt es zehn Kilo
     entfernt, würde es den Verlauf zu einer flachen Linie stauchen. */
  const zielImBild = ziel > 0 && ziel >= tief - 3 && ziel <= hoch + 3;
  if (zielImBild) { tief = Math.min(tief, ziel); hoch = Math.max(hoch, ziel); }
  if (hoch - tief < 2) { const mitte = (hoch + tief) / 2; tief = mitte - 1; hoch = mitte + 1; }
  const schritt = [0.5, 1, 2, 5, 10, 20].find((s) => (hoch - tief) / s <= 4) || 20;
  let unten = Math.floor(tief / schritt) * schritt;
  let oben = Math.ceil(hoch / schritt) * schritt;
  /* Fiele das Ziel genau auf die Achse, sähe man es nicht: eine Stufe Luft. */
  if (zielImBild && Math.abs(ziel - unten) < 1e-9) unten -= schritt;
  if (zielImBild && Math.abs(ziel - oben) < 1e-9) oben += schritt;
  const yVon = (kg) => flaeche.y + flaeche.hoehe - ((kg - unten) / (oben - unten)) * flaeche.hoehe;
  svg.setAttribute('aria-label', `Körpergewicht: ${punkte.length} Messungen und Ø 7 Tage`);

  for (let wert = unten; wert <= oben + 1e-9; wert += schritt) {
    const y = yVon(wert);
    svg.append(svgEl('line', { class: wert === unten ? 'dg-achse' : 'dg-gitter', x1: flaeche.x, y1: y, x2: flaeche.x + flaeche.breite, y2: y }));
    svg.append(text('dg-tick', flaeche.x - 8, y + 3.5, dez(wert, schritt < 1 ? 1 : 0), 'end'));
  }

  if (zielImBild) {
    const y = yVon(ziel);
    svg.append(svgEl('line', { class: 'dg-ziel', x1: flaeche.x, y1: y, x2: flaeche.x + flaeche.breite, y2: y }));
  }

  svg.append(text('dg-tick', flaeche.x, hoehe - 8, datumKurz(erster), 'start'));
  if (spanne) svg.append(text('dg-tick', flaeche.x + flaeche.breite, hoehe - 8, datumKurz(punkte[punkte.length - 1].datum), 'end'));

  const faden = svgEl('line', { class: 'dg-fadenkreuz', x1: 0, y1: flaeche.y, x2: 0, y2: flaeche.y + flaeche.hoehe, visibility: 'hidden' });
  svg.append(faden);

  if (punkte.length > 1) {
    const d = punkte.map((p, i) => `${i ? 'L' : 'M'}${xVon(p.datum).toFixed(1)},${yVon(p.trend).toFixed(1)}`).join('');
    svg.append(svgEl('path', { class: 'dg-linie', d }));
  }
  const kreise = punkte.map((p) => {
    const kreis = svgEl('circle', { class: 'dg-messung', cx: xVon(p.datum), cy: yVon(p.kg), r: 4 });
    svg.append(kreis);
    return kreis;
  });

  /* Zeigen statt treffen: Der nächste Punkt zur Fingerposition zählt,
     ein Tipp irgendwo in die Fläche genügt. */
  function folge(ereignis) {
    const rahmen = svg.getBoundingClientRect();
    const x = ((ereignis.clientX - rahmen.left) / rahmen.width) * breite;
    let beste = 0;
    punkte.forEach((p, i) => { if (Math.abs(xVon(p.datum) - x) < Math.abs(xVon(punkte[beste].datum) - x)) beste = i; });
    const px = xVon(punkte[beste].datum);
    faden.setAttribute('x1', px);
    faden.setAttribute('x2', px);
    faden.setAttribute('visibility', 'visible');
    kreise.forEach((k, i) => k.classList.toggle('an', i === beste));
    if (beiAuswahl) beiAuswahl(beste);
  }
  svg.addEventListener('pointermove', folge);
  svg.addEventListener('pointerdown', folge);
  svg.addEventListener('pointerleave', (ereignis) => {
    if (ereignis.pointerType === 'touch') return;
    faden.setAttribute('visibility', 'hidden');
    kreise.forEach((k) => k.classList.remove('an'));
    if (beiAuswahl) beiAuswahl(null);
  });
  return svg;
}
