/* Text aus einem PDF holen.

   Ein digital erzeugter Beleg — Online-Bestellung, Tankquittung,
   Rechnung per Mail — trägt seinen Text bereits in sich. Ihn als Bild
   durch eine Texterkennung zu schicken, heisst: etwas mühsam erraten,
   das schon dasteht. Das kostet Zeit, Geld und Genauigkeit, und es ist
   der Schritt, an dem am meisten schiefgehen kann.

   Also wird der Text direkt gelesen. Ohne Fremdbibliothek: Ein PDF ist
   eine Folge von Objekten, die Textabschnitte stecken in Strömen, und
   die sind fast immer mit Deflate gepackt — dafür bringt der Browser
   seit einiger Zeit DecompressionStream mit. Mehr braucht es für den
   Fall nicht, um den es hier geht.

   Was dieser Leser NICHT kann, und das ist Absicht: eingescannte PDFs
   (dort steht ein Bild, kein Text), exotische Zeichensatz-Abbildungen,
   verschlüsselte Dateien. In all diesen Fällen gibt er null zurück und
   die App macht mit der Bilderkennung weiter — lieber der lange Weg als
   ein falsches Ergebnis. */

/** Wie viel lesbarer Text mindestens herauskommen muss, damit es zählt. */
const MINDESTZEICHEN = 40;

/* PDF-Ströme sind binär. Für die Suche nach Schlüsselwörtern wird die
   Datei als Latin-1 gelesen: Dort entspricht jedes Byte genau einem
   Zeichen, es geht also nichts verloren und nichts wird umgedeutet. */
const alsText = (bytes) => {
  let s = '';
  const stueck = 0x8000;   // in Häppchen, sonst sprengt es den Aufrufstapel
  for (let i = 0; i < bytes.length; i += stueck) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + stueck));
  }
  return s;
};

const zuBytes = (text) => {
  const b = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) b[i] = text.charCodeAt(i) & 0xff;
  return b;
};

/** Einen Deflate-Strom auspacken. Geht es nicht, war es keiner.

    Gelesen wird von Hand statt über `new Response(strom)`: Letzteres
    behandelt den Strom wie einen Netzabruf und scheitert hier mit
    „Failed to fetch", obwohl gar nichts über das Netz geht. */
async function auspacken(bytes) {
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      const leser = strom.getReader();
      const stuecke = [];
      let laenge = 0;
      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        stuecke.push(value);
        laenge += value.length;
      }
      const alles = new Uint8Array(laenge);
      let ziel = 0;
      for (const stueck of stuecke) { alles.set(stueck, ziel); ziel += stueck.length; }
      return alles;
    } catch { /* nächstes Format */ }
  }
  return null;
}

/* Die Inhaltsströme einsammeln.

   Gesucht wird schlicht nach "stream" … "endstream". Das ist grob, aber
   für diesen Zweck richtig: Es interessiert nicht, welches Objekt wozu
   gehört, sondern nur, wo Text stehen könnte. Ströme ohne FlateDecode
   werden mitgenommen, wie sie sind — manche Erzeuger packen gar nicht. */
async function stroeme(roh) {
  const text = alsText(roh);
  const gefunden = [];
  let pos = 0;

  while (gefunden.length < 200) {
    const start = text.indexOf('stream', pos);
    if (start === -1) break;
    const ende = text.indexOf('endstream', start);
    if (ende === -1) break;

    // Nach "stream" folgt CRLF oder LF, dann erst die Nutzdaten.
    let von = start + 'stream'.length;
    if (text[von] === '\r') von += 1;
    if (text[von] === '\n') von += 1;

    const kopf = text.slice(Math.max(0, start - 400), start);

    /* Wo der Strom endet, steht im Wörterbuch als /Length. Nur auf
       "endstream" zu schneiden nimmt den Zeilenumbruch davor mit, und
       daran scheitert das Auspacken mit „Junk found after end of
       compressed data" — ein Byte zu viel, und nichts geht mehr.
       Steht dort ein Verweis statt einer Zahl (/Length 6 0 R), wird
       stattdessen der Leerraum am Ende abgeschnitten. */
    const laenge = Number((/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(kopf) || [])[1]);
    let bis = Number.isFinite(laenge) && laenge > 0 && von + laenge <= ende
      ? von + laenge
      : ende;
    while (bis > von && (roh[bis - 1] === 0x0a || roh[bis - 1] === 0x0d)) bis -= 1;
    const rohStrom = roh.subarray(von, bis);

    if (/FlateDecode/.test(kopf)) {
      const klar = await auspacken(rohStrom);
      if (klar) gefunden.push(alsText(klar));
    } else if (!/\/Image|DCTDecode|JPXDecode/.test(kopf)) {
      gefunden.push(alsText(rohStrom));
    }
    pos = ende + 'endstream'.length;
  }
  return gefunden;
}

/* Aus einem Inhaltsstrom die Zeichen holen.

   Text steht in PDF zwischen BT und ET, ausgegeben mit Tj (eine
   Zeichenkette) oder TJ (eine Reihe aus Ketten und Abständen). Die
   Ketten stehen in Klammern oder als Hexfolge. Td, TD und T* rücken die
   Schreibmarke — das sind die Stellen, an denen eine Zeile endet. */
function zeichenketten(strom) {
  const zeilen = [];
  let zeile = '';

  const literal = (ab) => {
    let tiefe = 1;
    let raus = '';
    let i = ab;
    while (i < strom.length && tiefe > 0) {
      const z = strom[i];
      if (z === '\\') {
        const n = strom[i + 1];
        const flucht = { n: '\n', r: '', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' };
        if (n >= '0' && n <= '7') {              // oktale Angabe
          const okt = strom.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0];
          raus += String.fromCharCode(parseInt(okt, 8));
          i += 1 + okt.length;
          continue;
        }
        raus += flucht[n] ?? n;
        i += 2;
        continue;
      }
      if (z === '(') tiefe += 1;
      else if (z === ')') { tiefe -= 1; if (tiefe === 0) break; }
      raus += z;
      i += 1;
    }
    return { text: raus, ende: i + 1 };
  };

  const hex = (ab) => {
    const schluss = strom.indexOf('>', ab);
    if (schluss === -1) return { text: '', ende: ab + 1 };
    const ziffern = strom.slice(ab, schluss).replace(/[^0-9A-Fa-f]/g, '');
    let raus = '';
    for (let i = 0; i + 1 < ziffern.length; i += 2) {
      raus += String.fromCharCode(parseInt(ziffern.slice(i, i + 2), 16));
    }
    return { text: raus, ende: schluss + 1 };
  };

  let i = 0;
  while (i < strom.length) {
    const z = strom[i];
    if (z === '(') { const r = literal(i + 1); zeile += r.text; i = r.ende; continue; }
    if (z === '<' && strom[i + 1] !== '<') { const r = hex(i + 1); zeile += r.text; i = r.ende; continue; }

    // Zeilenwechsel: Td, TD, T*, ET — und TJ-Abstände als Leerzeichen.
    if (z === 'T' && 'dD*'.includes(strom[i + 1])) {
      if (zeile.trim()) { zeilen.push(zeile.trim()); zeile = ''; }
      i += 2;
      continue;
    }
    if (z === 'E' && strom[i + 1] === 'T') {
      if (zeile.trim()) { zeilen.push(zeile.trim()); zeile = ''; }
      i += 2;
      continue;
    }
    i += 1;
  }
  if (zeile.trim()) zeilen.push(zeile.trim());
  return zeilen;
}

/** Sieht das nach gelesenem Text aus — oder nach Zeichensalat? */
function brauchbar(text) {
  const sauber = text.replace(/\s+/g, ' ').trim();
  if (sauber.length < MINDESTZEICHEN) return false;
  // Ohne passende Zeichensatz-Abbildung kommt Buchstabensalat heraus.
  // Ein Beleg enthält immer Ziffern; fehlen sie, stimmt etwas nicht.
  if (!/\d/.test(sauber)) return false;
  const lesbar = (sauber.match(/[\p{L}\p{N}\p{P}\p{Zs}€]/gu) || []).length;
  return lesbar / sauber.length > 0.85;
}

/**
 * Den Text eines PDF holen.
 * @param {File|Blob} datei
 * @returns {Promise<string|null>} null, wenn nichts Brauchbares drinsteht
 */
export async function pdfText(datei) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const roh = new Uint8Array(await datei.arrayBuffer());
    if (alsText(roh.subarray(0, 5)) !== '%PDF-') return null;

    // Verschlüsselte Dateien geben nur Buchstabensalat — gar nicht erst versuchen.
    if (/\/Encrypt\b/.test(alsText(roh.subarray(0, 4096)))
      || /\/Encrypt\b/.test(alsText(roh.subarray(Math.max(0, roh.length - 4096))))) return null;

    const zeilen = [];
    for (const strom of await stroeme(roh)) zeilen.push(...zeichenketten(strom));

    const text = zeilen.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return brauchbar(text) ? text : null;
  } catch {
    return null;
  }
}

export const istPdf = (datei) =>
  datei?.type === 'application/pdf' || /\.pdf$/i.test(datei?.name || '');
