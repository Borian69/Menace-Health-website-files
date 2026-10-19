/* DOM-Helfer. Nutzerdaten gehen nur über textContent ins Dokument. */

export const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
export const $$ = (sel, wurzel = document) => [...wurzel.querySelectorAll(sel)];

export function el(tag, eigenschaften = {}, ...kinder) {
  const knoten = document.createElement(tag);
  for (const [k, v] of Object.entries(eigenschaften)) {
    if (k === 'class') knoten.className = v;
    else if (k === 'text') knoten.textContent = v;
    else if (k.startsWith('on')) knoten.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) knoten.setAttribute(k, v);
  }
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    knoten.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
  }
  return knoten;
}

/** Jede Ziffer im Systemsatz: monospaced, tabellarisch (Signatur). */
export const zahl = (inhalt, tag = 'b') => el(tag, { class: 'n', text: String(inhalt) });

/** Eine Datenzeile: [[Label, Wert, Einheit?], …] → Spans mit Zahl in .n */
export function datenzeile(ziel, felder) {
  ziel.replaceChildren(...felder.filter(Boolean).map(([label, wert, einheit]) =>
    el('span', {}, label ? `${label} ` : '', zahl(wert), einheit ? ` ${einheit}` : '')));
}

/** Meldung unter einem Feld. .field-msg ist im System ein Flex-Container
    (Statusstrich + Text) — mehrere Knoten liefen dort als Spalten
    nebeneinander. Deshalb alles in einen Span. */
export function meldung(ziel, ...teile) {
  ziel.replaceChildren(el('span', {}, ...teile));
}

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function speichereDatei(name, inhalt, typ = 'application/json') {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
