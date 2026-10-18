/* Belegerkennung in zwei Durchgängen.

   1. Sehen      – Foto → strukturierte Positionen (Bildmodell)
   2. Klären     – unklare Position → Produkt bestimmen und eine
                   Suchanfrage formulieren (Textmodell, sehr billig)

   Der zweite Durchgang läuft nur, wenn der erste Positionen als unsicher
   markiert hat. Er sieht kein Bild, sondern nur die Kassenzeilen — das
   macht ihn um Größenordnungen günstiger als der erste.

   Für welchen Anbieter das Ganze spricht, entscheidet providers.js. */

import { categoryIds } from './categories.js';
import { provider } from './providers.js';
import { anfrage } from './netz.js';

/* Zurück auf den Wert, mit dem es früher flott lief. 16000 war
   Angst vor abgeschnittenen Antworten, nicht Rechnung: Ein Bon mit
   vierzig Positionen braucht in diesem Schema rund 2500 Token, also
   liegt 8000 mit dreifachem Sicherheitsabstand darüber. Zu hoch
   angesetzt ist nicht folgenlos — bei den Gratis-Modellen ist
   max_tokens eine Reservierung, und wer viel reserviert, wartet
   länger. Und trunkiert wird ohnehin abgefangen: reparieren() rettet,
   was vollständig ankam. */
const MAX_TOKENS = 8000;

/* ── Anweisung für den Bild-Durchgang ────────────────────── */

const SYSTEM_PROMPT = `Du liest Kassenbons aus dem deutschsprachigen Einzelhandel (Supermarkt, Discounter, Drogerie, Bäckerei, Getränkemarkt) und überträgst sie in strukturierte Daten.

Arbeitsweise
- Gib das Ergebnis über die Funktion "beleg_erfassen" zurück. Schreibe keinen Fließtext.
- Erfasse jede gekaufte Position genau einmal, in der Reihenfolge des Belegs.
- Bekommst du mehrere Bilder, sind das aufeinanderfolgende, sich leicht überlappende Abschnitte EINES FOTOS, von oben nach unten. Positionen im Überlappungsbereich tauchen auf zwei Bildern auf – erfasse sie trotzdem nur einmal.

Mehrere Bons auf einem Foto
- Auf dem Foto können mehrere getrennte Kassenbons liegen, nebeneinander oder untereinander. Lege für jeden einzelnen Bon einen eigenen Eintrag in "receipts" an, mit eigenem Händler, Datum und eigener Endsumme.
- Woran du einen neuen Bon erkennst: eigener Kopf mit Händlername, eigene Endsumme, sichtbare Papierkante, andere Breite oder Schrifttype.
- Ein einzelner langer Bon über mehrere Bildabschnitte ist EIN Eintrag. Im Zweifel lieber einen Bon zu wenig trennen als einen zu viel.

Bezeichnungen — der wichtigste Teil deiner Arbeit
- Auf dem Bon stehen keine Produktnamen, sondern verstümmelte Kassentexte mit fester Zeichenbegrenzung. Gib NICHT diesen Text zurück. Finde heraus, welches Produkt dahintersteckt, und benenne dieses.
- Zieh dafür alles heran: den Händler und sein Sortiment, seine Eigenmarken, das Abkürzungsmuster seines Kassensystems, die Höhe des Preises, die Mehrwertsteuerkennung (ermäßigt = meist Lebensmittel) und die Nachbarzeilen.
- Zahlen am Zeilenende sind fast immer Größe, Menge oder Artikelnummer — kein Teil des Namens. "XYZ VANILLA 12" heißt nicht, dass das Produkt "12" heißt.
- Guter Name = Marke + was es ist + Menge, so dass jemand das Produkt im Regal wiedererkennt.
  "JA! H-MILCH 3,5%" → "Ja! H-Milch 3,5 %"
  "ZWIEB.ROT 500G" → "Rote Zwiebeln, 500 g"
  "PROKUD ZAHNC COMPL" → "Prokudent Zahncreme Complete"
  "DOMOL WC AKTIV" → "domol WC-Reiniger Aktiv"
- Unsicherheit ist erlaubt: Nimm die wahrscheinlichste Deutung und setze "uncertain" auf true. Nur wenn die Zeile wirklich unlesbar ist, übernimm den Rohtext und setze "uncertain".
- "raw_text" enthält immer die Originalzeile, wie sie gedruckt ist.

Warengruppen
- "sonstiges" ist die letzte Wahl, nicht die bequeme. Der Händler ist der stärkste Hinweis: Drogerien (Rossmann, dm, Müller) → meist "drogerie" oder "haushalt", Bäckereien → "brot", Getränkemärkte → "getraenke" und "pfand".

Preise
- "total_price" ist der Betrag, der für diese Zeile in die Summe eingeht, in Euro als Zahl (1.99).
- Gewichtsware ("0,732 kg x 2,99 EUR/kg"): quantity 0.732, unit "kg", unit_price 2.99, total_price 2.19.
- Mehrfachmengen ("2 x 1,49"): quantity 2, unit "Stk", unit_price 1.49, total_price 2.98.
- Pfand: eigene Position, positiver Betrag, Kategorie "pfand".
- Leergut, Rabatte, Coupons, Treuevorteile: NEGATIVER Betrag – Leergut in "pfand", der Rest in "rabatt".

Jede Zeile einzeln — das ist der häufigste Fehler
- Vier Zeilen ergeben vier Positionen, auch wenn sie sich nur in einem Wort unterscheiden. "UM RIEG SALT CAR", "UM RIEG VANILLA", "UM RIEG BLA&WHI", "UM RIEG WHITE CA" sind vier verschiedene Artikel, nicht einer.
- Fasse niemals ähnliche Zeilen zusammen und überspringe keine, weil sie der vorherigen gleicht.
- Zähle vor dem Antworten die Artikelzeilen auf dem Bon und vergleiche mit der Zahl deiner Positionen. Weicht sie ab, fehlt etwas.

Nicht übernehmen
- Zwischensummen, "SUMME", "zu zahlen", Mehrwertsteuertabellen, Zahlungszeilen (EC-Cash, Gegeben, Rückgeld), Punktestände, TSE-Daten, Werbetexte.

Kopfdaten
- "store" ist der Händlername ("REWE", "EDEKA", "ALDI SÜD", "dm", "ROSSMANN").
- "date" als JJJJ-MM-TT, "time" als HH:MM. Nicht erkennbar: null.
- "receipt_total" ist die gedruckte Endsumme.

Abgleich zum Schluss — bevor du antwortest
- Addiere deine erfassten Beträge und vergleiche mit der gedruckten Endsumme.
- Weicht es ab, geh den Bon noch einmal durch: übersprungene Zeile, übersehener Pfand- oder Rabattposten, falsch gelesene Ziffer (0/8, 1/7, 3/9, 5/6), Position über zwei Zeilen. Korrigiere, was du findest.
- Bleibt eine Differenz, schreib sie mit Betrag und Fundstelle in "notes".`;

const JSON_FALLBACK = `

Falls du keine Funktionen aufrufen kannst: gib stattdessen NUR das JSON-Objekt aus, das die Funktion erwartet — ohne Erklärung, ohne Code-Zaun.`;

/* ── Schema für den Bild-Durchgang ───────────────────────── */

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name:        { type: 'string',  description: 'Das identifizierte Produkt als Marke + Art + Menge, nicht der Kassentext.' },
    raw_text:    { type: 'string',  description: 'Die Originalzeile, wie sie auf dem Beleg gedruckt ist.' },
    quantity:    { type: 'number',  description: 'Menge. Einzelartikel: 1. Gewichtsware: das Gewicht.' },
    unit:        { type: 'string',  description: 'Einheit, z. B. "Stk", "kg", "l".' },
    unit_price:  { type: ['number', 'null'], description: 'Preis je Einheit in Euro, sonst null.' },
    total_price: { type: 'number',  description: 'Zeilenbetrag in Euro. Negativ bei Rabatt oder Leergut.' },
    category:    { type: 'string', enum: categoryIds, description: 'Warengruppe der Position.' },
    uncertain:   { type: 'boolean', description: 'true, wenn die Deutung des Produkts oder der Preis unsicher ist.' },
  },
  required: ['name', 'raw_text', 'quantity', 'unit', 'unit_price', 'total_price', 'category', 'uncertain'],
  additionalProperties: false,
};

const SCAN_TOOL = {
  name: 'beleg_erfassen',
  description: 'Übergibt alle auf dem Foto erfassten Kassenbons.',
  schema: {
    type: 'object',
    properties: {
      currency: { type: 'string', description: 'Währungscode, in der Regel "EUR".' },
      receipts: {
        type: 'array',
        description: 'Ein Eintrag je eigenständigem Kassenbon auf dem Foto.',
        items: {
          type: 'object',
          properties: {
            store:         { type: ['string', 'null'], description: 'Name des Händlers.' },
            date:          { type: ['string', 'null'], description: 'Einkaufsdatum als JJJJ-MM-TT.' },
            time:          { type: ['string', 'null'], description: 'Uhrzeit als HH:MM.' },
            receipt_total: { type: ['number', 'null'], description: 'Gedruckte Endsumme in Euro.' },
            items:         { type: 'array', items: ITEM_SCHEMA, description: 'Alle Positionen dieses Belegs.' },
          },
          required: ['store', 'date', 'time', 'receipt_total', 'items'],
          additionalProperties: false,
        },
      },
      notes: { type: ['string', 'null'], description: 'Kurzer Hinweis für den Nutzer, sonst null.' },
    },
    required: ['currency', 'receipts', 'notes'],
    additionalProperties: false,
  },
};

/* ── Anweisung und Schema für den Klär-Durchgang ─────────── */

const CLARIFY_PROMPT = `Du kennst das Sortiment des deutschen Einzelhandels, besonders die Eigenmarken der großen Ketten (REWE „ja!“ und „Beste Wahl“, EDEKA „Gut&Günstig“, Aldi, Lidl, Rossmann „isana“, „domol“, „Prokudent“, „Alterra“, „facelle“, dm „Balea“, „alverde“, „dmBio“).

Du bekommst Kassenzeilen, bei denen die Bilderkennung sich nicht sicher war. Bestimme zu jeder Zeile das wahrscheinlichste Produkt.

- Kassentexte sind auf eine feste Zeichenzahl gekürzt und lassen Vokale, Endungen und Leerzeichen weg. Setz sie wieder zusammen.
- Zahlen am Zeilenende sind Größe, Menge oder Artikelnummer, kein Namensbestandteil.
- Der Preis ist ein starker Hinweis auf die Produktart und die Größe.
- "name": Marke + was es ist + Menge, so dass man es im Regal wiedererkennt.
- "confident": true nur, wenn du dir wirklich sicher bist. Sonst false — die Position bleibt dann markiert.
- "search_query": eine kurze Suchanfrage, mit der man das Produkt im Netz findet. Händler und Marke gehören hinein, Füllwörter nicht. Beispiel: "Rossmann Prokudent Zahncreme Complete". Diese Anfrage bekommt der Nutzer als Knopf zum Nachschlagen — sie muss auch dann brauchbar sein, wenn du das Produkt nicht bestimmen konntest.
- Kannst du eine Zeile gar nicht deuten, lass "name" wie er ist, setze "confident" auf false und gib trotzdem eine sinnvolle Suchanfrage aus Händler und Rohtext an.`;

const CLARIFY_TOOL = {
  name: 'positionen_klaeren',
  description: 'Gibt für jede unklare Kassenzeile das bestimmte Produkt und eine Suchanfrage zurück.',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:           { type: 'string',  description: 'Die mitgelieferte Kennung der Zeile, unverändert.' },
            name:         { type: 'string',  description: 'Das bestimmte Produkt als Marke + Art + Menge.' },
            category:     { type: 'string', enum: categoryIds, description: 'Warengruppe der Position.' },
            confident:    { type: 'boolean', description: 'true, wenn die Deutung sicher ist.' },
            search_query: { type: 'string',  description: 'Kurze Suchanfrage zum Nachschlagen des Produkts.' },
          },
          required: ['id', 'name', 'category', 'confident', 'search_query'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

/* ── Aufruf ──────────────────────────────────────────────── */

/** Ein Fehler in drei Worten — mehr passt nicht in eine Zeile. */
const kurz = (fehler) => {
  const grund = fehler?.diagnose?.grund || fehler?.message || 'Fehler';
  if (/Zeit abgelaufen/.test(grund)) return 'Zeit abgelaufen';
  if (fehler?.status) return `HTTP ${fehler.status}`;
  if (/Verbindung|fetch|network/i.test(grund)) return 'keine Verbindung';
  return grund.slice(0, 24);
};

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('abgebrochen', 'AbortError')); }, { once: true });
});

/* Ein überlastetes Modell und eine kurze Sperre sind vorübergehend —
   dafür soll niemand den Beleg noch einmal fotografieren müssen. */
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_WAIT_SECONDS = 25;

/* Wenn das gewählte Modell klemmt — überlastet, nicht verfügbar oder
   Gratis-Kontingent leer —, ist ein anderes Modell die Abhilfe, nicht
   eine Fehlermeldung. Bei diesen Codes wird auf das Ausweichmodell
   umgeschaltet, sofern eines hinterlegt ist. */
const FALLBACK_STATUS = new Set([402, 404, 429, 502, 503, 504]);

async function call({ settings, model, system, text, images, tool, signal, attempt = 1, allowFallback = true, melden = () => {} }) {
  const api = provider(settings.provider);
  const key = settings.provider === 'anthropic' ? settings.apiKey : settings.openrouterKey;

  const body = api.body({
    model,
    system: system + (api.needsJsonFallback ? JSON_FALLBACK : ''),
    text,
    images,
    tool,
    maxTokens: MAX_TOKENS,
  });

  /* Zwei Wege zum selben Ziel — der zweite für den Fall, dass der erste
     gesperrt ist.

     Ein VPN mit Inhaltsfilter (NordVPN Threat Protection und
     Verwandte) kann einzelne Adressen sperren. Dann scheitert die
     Anfrage nicht unterwegs, sondern sofort: auf dem Gerät gemessen
     nach 0,3 Sekunden. Dagegen hilft von innen nichts — die Sperre
     greift, bevor der Browser überhaupt losläuft.

     Was hilft, ist eine andere Adresse. Wer einen eigenen Proxy
     hinterlegt (proxy/cloudflare-worker.js liegt fertig im Ordner),
     bekommt ihn jetzt als Ausweichweg: Der direkte Weg wird zuerst
     versucht, und nur wenn er gar nicht erst zustande kommt, geht
     dieselbe Anfrage über den Proxy. Vorher war das ein
     Entweder-oder in den Einstellungen — entweder immer direkt oder
     immer über den Proxy.

     Der Schlüssel geht dabei nicht mit: Über den Proxy wird nur
     beschrieben, was gefragt werden soll; der Schlüssel liegt dort. */
  const proxy = (settings.proxyUrl || '').trim();
  const proxyZuerst = settings.mode === 'proxy' && Boolean(proxy);

  const direkterWeg = {
    ziel: api.endpoint,
    init: { method: 'POST', headers: api.headers(key.trim()), body: JSON.stringify(body) },
    name: 'direkt',
  };
  const proxyWeg = {
    ziel: proxy,
    init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: api.id, body }) },
    name: 'über den Proxy',
  };

  const wege = proxyZuerst
    ? [proxyWeg, direkterWeg]
    : [direkterWeg, ...(proxy ? [proxyWeg] : [])];

  const megabyte = (wege[0].init.body.length / 1024 / 1024).toFixed(1);
  melden({ phase: 'senden', model, megabyte, abschnitte: images.length });

  let antwort = null;
  let sperre = null;
  for (const [nummer, weg] of wege.entries()) {
    if (nummer > 0) melden({ phase: 'ausweichweg', weg: weg.name });
    try {
      // Läuft ein Service Worker, stellt der die Anfrage — siehe netz.js.
      antwort = await anfrage(weg.ziel, weg.init, signal);
      break;
    } catch (fehler) {
      /* anfrage() wirft nur, wenn die Anfrage gar nicht zustande kam —
         eine abgelehnte Antwort käme als {ok:false} zurück. Genau das
         ist der Fall, für den der zweite Weg da ist. */
      if (fehler.name === 'AbortError') throw fehler;
      sperre = fehler;
      if (nummer === wege.length - 1) throw fehler;
    }
  }
  if (sperre && antwort) melden({ phase: 'ausweichweg-geholfen' });

  const { ok, status, retryAfter, payload } = antwort;
  melden({ phase: 'gelesen', model });

  if (!ok) {
    const ownLimit = payload?.error?.metadata?.error_type === 'rate_limit_exceeded';

    // Einmal nachfassen — aber nicht, wenn wirklich das eigene
    // Kontingent erschöpft ist; da hilft Warten in Sekunden nicht.
    if (attempt === 1 && RETRY_STATUS.has(status) && !ownLimit && retryAfter <= MAX_WAIT_SECONDS) {
      const wartet = Math.max(1200, retryAfter * 1000);
      melden({ phase: 'warten', sekunden: Math.round(wartet / 1000) });
      await sleep(wartet, signal);
      return call({ settings, model, system, text, images, tool, signal, attempt: 2, allowFallback, melden });
    }

    // Zweite Rettungsleine: ein anderes Modell.
    const fallback = (settings.fallbackModel || '').trim();
    if (allowFallback && fallback && fallback !== model && FALLBACK_STATUS.has(status)) {
      melden({ phase: 'ausweichen', model: fallback });
      const result = await call({
        settings, model: fallback, system, text, images, tool, signal, allowFallback: false, melden,
      });
      return { ...result, switchedFrom: model };
    }

    const message = api.error(status, payload, { retryAfter })
      || (status >= 500
        ? 'Der Dienst ist gerade nicht erreichbar. Bitte in einem Moment nochmal versuchen.'
        : `Unerwartete Antwort (HTTP ${status}).`);
    const failure = new Error(message);
    failure.status = status;
    /* Vorübergehend oder dauerhaft? Ein überlastetes Modell, eine kurze
       Sperre oder ein Serverfehler geben sich von selbst — dafür lohnt
       ein späterer Anlauf. Ein abgelehnter Schlüssel oder ein Modell,
       das es nicht gibt, ändert sich durch Warten nicht. */
    failure.wiederholbar = status === 0 || status >= 500 || RETRY_STATUS.has(status);
    throw failure;
  }

  // Beim Probeaufruf zählt nur, dass die Antwort ankam.
  if (!tool) return { args: null, text: '', usage: { cents: 0 } };
  return api.parse(payload, tool);
}

/**
 * Kurzer Probeaufruf: prüft Schlüssel, Modell und Verbindung, bevor der
 * erste Beleg dafür herhalten muss. Reiner Text, kostet praktisch nichts.
 */
export async function testConnection(settings, signal) {
  await call({
    settings,
    model: settings.model,
    system: 'Antworte ausschließlich mit dem Wort OK.',
    text: 'Bereit?',
    images: [],
    tool: null,
    signal,
    allowFallback: false,
  });
  return true;
}

/* Zwei Cent Spielraum: Rundungen bei Mehrwertsteuer und Pfand. */
const TOLERANZ = 2;

/**
 * Wie weit liegen die erfassten Positionen neben der gedruckten Summe?
 * @returns {{cent: number, geprueft: boolean, je: {store: string, differenz: number}[]}}
 */
function fehlbetrag(receipts) {
  let summe = 0;
  let geprueft = false;
  const je = [];

  for (const receipt of receipts) {
    /* Nicht Number(...) allein prüfen: Number(null) ist 0, nicht NaN.
       Ein Beleg, dessen Endsumme nicht zu lesen war, galt damit als
       „Endsumme 0 €" — und die Prüfsumme schlug zwangsläufig fehl.
       Jeder solche Scan hat still sämtliche Zusatzanläufe ausgelöst,
       obwohl es gar nichts zu prüfen gab. */
    const roh = receipt.receipt_total;
    if (roh === null || roh === undefined || roh === '') continue;
    const gedruckt = Number(roh);
    if (!Number.isFinite(gedruckt)) continue;      // ohne Endsumme nichts zu prüfen
    geprueft = true;
    const erfasst = receipt.items.reduce((s, item) => s + (Number(item.total_price) || 0), 0);
    const differenz = Math.round((erfasst - gedruckt) * 100);
    summe += Math.abs(differenz);
    if (Math.abs(differenz) > TOLERANZ) je.push({ store: receipt.store || 'Beleg', differenz });
  }

  // Ohne gedruckte Summe gibt es kein Urteil — dann gilt der Versuch als in Ordnung.
  return { cent: geprueft ? summe : 0, geprueft, je };
}

/** Ohne Klär-Durchgang: eine brauchbare Suchanfrage geht auch so. */
const fallbackQuery = (store, item) =>
  [store, item.raw_text || item.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Liest einen oder mehrere Belege aus vorbereiteten Bildabschnitten.
 * @param {string[]} parts Base64-JPEGs
 */
export async function scanReceipt(parts, settings, signal, melden = () => {}, belegText = '') {
  /* Ein digital erzeugter Beleg trägt seinen Text schon in sich (siehe
     pdf.js). Dann gibt es nichts zu erkennen, nur zu ordnen: Der Text
     geht direkt an das Modell, ohne Bild. Das ist schneller, billiger
     und genauer — die Stufe, an der am meisten schiefgehen kann, fällt
     ganz weg. */
  const ausText = Boolean(belegText);
  /* Der zweite Fehlerfall, und der häufigere: Die Anfrage geht durch,
     das Modell antwortet mit 200 — und liefert trotzdem nichts
     Brauchbares. Kleine und kostenlose Modelle vergessen gern den
     Werkzeugaufruf oder brechen mitten in der Liste ab. Das ist keine
     Aussage über das Foto, sondern Streuung: Derselbe Aufruf klappt beim
     nächsten Mal oft. Bisher flog der Scan hier sofort raus und das Foto
     war weg.

     Also: noch einmal dasselbe Modell, dann das Ausweichmodell. Jeder
     Anlauf kostet erneut — bei einem Gratis-Modell nichts, sonst
     Bruchteile eines Cents, und nur im Fehlerfall. */
  const versuche = [settings.model, settings.model];
  const ausweich = (settings.fallbackModel || '').trim();
  if (ausweich && ausweich !== settings.model) versuche.push(ausweich);

  /* Der Bon bringt seine eigene Prüfsumme mit: die gedruckte Endsumme.
     Stimmt sie nicht mit den erfassten Positionen überein, fehlt etwas
     — typischerweise hat das Modell mehrere fast gleiche Zeilen zu
     einer zusammengezogen. Das ist objektiv messbar, also muss darüber
     nicht der Mensch entscheiden: Solange Anläufe übrig sind, wird
     weiterprobiert, und am Ende gewinnt der Versuch mit der kleinsten
     Abweichung. */
  let result = null;
  let receipts = [];
  let genutztesModell = settings.model;
  let bester = null;
  let letzterFehler = null;
  const gruende = [];   // je Anlauf einer, für die Diagnose

  /* Die Anläufe liefen bisher streng nacheinander: erst wenn einer
     aufgegeben hatte, begann der nächste. Auf dem Handy gemessen waren
     das drei Anläufe zu je rund 70 Sekunden — 217 Sekunden, bis
     überhaupt eine Aussage kam, und in der ganzen Zeit lag die Leitung
     zwischen den Anläufen brach.

     Jetzt starten sie versetzt und laufen nebeneinander. Antwortet der
     erste zügig, bleibt es bei einer einzigen Anfrage — der Vorsprung
     sorgt dafür, dass sich das Feld nur auffächert, wenn es hakt. Und
     das Ausweichmodell muss nicht mehr warten, bis zwei Anläufe des
     Gratis-Modells abgelaufen sind; es rennt einfach mit. Damit
     bestimmt der schnellste Anlauf die Wartezeit, nicht die Summe
     aller. */
  /* Ein Modell nach dem anderen, nicht drei gleichzeitig.

     Zwischendurch liefen die Anläufe versetzt nebeneinander, um die
     Wartezeit zu drücken. Das war die Antwort auf ein Problem, das
     woanders lag: Die Anfragen starben im Service Worker, nicht am
     Tempo der Modelle. Seit sie wieder direkt gehen, kostet die
     Gleichzeitigkeit nur — sie schickt dasselbe Foto bis zu dreimal
     los, wo einmal genügt.

     Also der Reihe nach, wie in v8. Ein Anlauf, der scheitert, kostet
     den nächsten nicht mehr den Start: Der Fehler gilt dem Anlauf,
     nicht dem Scan. */
  for (const [nummer, model] of versuche.entries()) {
    if (nummer > 0) await sleep(600, signal);   // kurz Luft holen

    const sagen = (n) => melden({ ...n, anlauf: nummer + 1, model: n.model || model });
    sagen({ phase: 'anlauf', anlauf: nummer + 1, von: versuche.length, model });

    let eigenes;
    try {
      eigenes = await call({
        settings,
        model,
        system: SYSTEM_PROMPT,
        /* Ohne Richtungsangabe: Geteilt wird entlang der langen Kante,
           bei einem Hochformat also quer und bei einem Querformat
           längs. „Aufeinanderfolgend" stimmt in beiden Fällen, „von oben
           nach unten" stimmte nur im einen — und eine falsche Angabe
           bringt kleine Modelle zuverlässig durcheinander. */
        text: ausText
          ? `Das hier ist der Text eines Belegs, direkt aus der Datei gelesen — nichts daran ist geraten. Die Zeilen stehen in der Reihenfolge des Belegs. Erfasse jeden Kassenbon darin vollständig.\n\n${belegText}`
          : (parts.length > 1
            ? `Hier ist ein Foto in ${parts.length} aufeinanderfolgenden, leicht überlappenden Abschnitten. Sie gehören in dieser Reihenfolge zusammen; ein Bon kann über zwei Abschnitte reichen. Die Abschnitte sind für die Lesbarkeit in Graustufen umgewandelt. Erfasse jeden Kassenbon vollständig, aber keinen doppelt.`
            : 'Hier ist ein Foto. Erfasse jeden Kassenbon darauf vollständig.'),
        images: ausText ? [] : parts,
        tool: SCAN_TOOL,
        signal,
        melden: sagen,
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      letzterFehler = error;
      gruende.push(`${nummer + 1}. ${model}: ${error.diagnose?.grund || error.message}`);
      sagen({ phase: 'anlaufEnde', stand: kurz(error) });
      /* Ein abgelehnter Schlüssel oder ein Modell, das es nicht gibt,
         wird auch beim dritten Anlauf nicht besser — und das
         Ausweichmodell hat call() da bereits durchprobiert. */
      if (error.wiederholbar === false) break;
      continue;
    }

    // Für die Fehlermeldung, falls am Ende gar nichts brauchbar ist.
    result = eigenes;
    const gelesen = (eigenes.args?.receipts || []).filter((receipt) => receipt?.items?.length);
    if (!gelesen.length) {
      gruende.push(`${nummer + 1}. ${model}: nichts erfasst`);
      sagen({ phase: 'anlaufEnde', stand: 'nichts erfasst' });
      continue;
    }

    const luecke = fehlbetrag(gelesen);
    if (!bester || luecke.cent < bester.luecke.cent) {
      bester = { result: eigenes, receipts: gelesen, model, luecke };
    }
    sagen({ phase: 'anlaufEnde', stand: 'fertig' });

    // Passt die Summe zur gedruckten Endsumme, ist nichts mehr zu holen.
    if (luecke.cent <= TOLERANZ) break;
  }

  if (bester) {
    ({ result, receipts } = bester);
    genutztesModell = bester.model;
  }

  if (!receipts.length) {
    /* Sind alle Anläufe an der Anfrage selbst gescheitert, ist deren
       Grund die Wahrheit — „das Modell hat nichts erfasst" wäre schlicht
       gelogen und schickt die Fehlersuche in die falsche Richtung. */
    if (letzterFehler) {
      letzterFehler.diagnose = {
        ...(letzterFehler.diagnose || {}),
        versucht: versuche.join(', '),
        anlaeufe: `${gruende.length} von ${versuche.length}`,
        proAnlauf: gruende.join(' | '),
      };
      throw letzterFehler;
    }

    const d = result?.diagnose || {};
    const hint = result?.text?.trim();

    // Sagen, was tatsächlich schiefging, statt pauschal aufs Foto zu zeigen.
    let message;
    if (d.grund === 'length') {
      message = 'Die Antwort der Erkennung wurde abgeschnitten — der Bon ist für dieses Modell zu lang. Ein gründlicheres Modell in den Einstellungen hilft.';
    } else if (!d.werkzeugAufruf) {
      message = hint
        ? `Das Modell hat geantwortet, statt die Positionen zu erfassen: „${hint.slice(0, 160)}“`
        : 'Das Modell hat die Positionen nicht erfasst. Ein anderes Modell in den Einstellungen hilft meist.';
    } else {
      message = ausText
        ? 'Aus dem Text der Datei liessen sich keine Positionen herauslesen. Ist es wirklich ein Kassenbon oder eine Rechnung?'
        : 'Es konnten keine Positionen gelesen werden. Vielleicht hilft ein schärferes Foto bei mehr Licht.';
    }

    const failure = new Error(message);
    failure.wiederholbar = true;   // ein späterer Anlauf kann gelingen
    failure.diagnose = { ...d, versucht: versuche.join(', '), text: hint?.slice(0, 300) || '' };
    throw failure;
  }

  let cents = result.usage.cents;
  let clarified = 0;
  // Ausgewichen wurde entweder wegen eines Fehlercodes (in call) oder
  // weil das gewählte Modell nichts Brauchbares geliefert hat (oben).
  const switchedTo = result.switchedFrom ? settings.fallbackModel
    : (genutztesModell !== settings.model ? genutztesModell : '');

  if (settings.resolveUncertain) {
    try {
      const second = await clarify(receipts, settings, signal, melden);
      cents += second.cents;
      clarified = second.count;
    } catch (error) {
      // Der Klär-Durchgang ist Kür. Scheitert er, bleiben die Positionen
      // eben markiert — der Scan selbst war ja erfolgreich.
      if (error.name === 'AbortError') throw error;
    }
  }

  for (const receipt of receipts) {
    for (const item of receipt.items) {
      if (!item.search_query) item.search_query = fallbackQuery(receipt.store, item);
    }
  }

  /* Aus einer abgeschnittenen Antwort wurde gerettet, was vollständig
     ankam. Das muss dranstehen — sonst fehlen am Ende still Positionen
     und die Summe stimmt scheinbar grundlos nicht. */
  /* Bleibt nach allen Anläufen eine Lücke zur gedruckten Summe, wird
     sie benannt statt verschwiegen. Meist fehlt genau eine Zeile. */
  const luecke = bester?.luecke || fehlbetrag(receipts);
  const notizen = [
    result.args?.notes || '',
    result.diagnose?.abgeschnitten
      ? 'Die Antwort war abgeschnitten — die letzten Positionen können fehlen. Bitte die Summe prüfen.'
      : '',
    luecke.je.length
      ? `Die Positionen ergeben nicht die gedruckte Summe (${luecke.je
        .map((e) => `${e.store}: ${e.differenz > 0 ? '+' : '−'}${(Math.abs(e.differenz) / 100).toFixed(2).replace('.', ',')} €`)
        .join(', ')}). Vermutlich fehlt eine Zeile.`
      : '',
  ].filter(Boolean).join(' ');

  return {
    receipts,
    notes: notizen,
    usage: { cents, clarified, switchedTo },
  };
}

/** Zweiter Durchgang: unklare Zeilen bestimmen, ohne Bild. */
async function clarify(receipts, settings, signal, melden = () => {}) {
  const open = [];
  for (const receipt of receipts) {
    for (const [index, item] of receipt.items.entries()) {
      if (!item.uncertain) continue;
      const id = `${receipts.indexOf(receipt)}-${index}`;
      open.push({ id, item, receipt });
    }
  }
  if (!open.length) return { cents: 0, count: 0 };
  melden({ phase: 'nachschlagen', anzahl: open.length });

  const lines = open.map(({ id, item, receipt }) => ({
    id,
    haendler: receipt.store || 'unbekannt',
    kassenzeile: item.raw_text || item.name,
    bisherige_deutung: item.name,
    betrag_eur: item.total_price,
  }));

  const result = await call({
    settings,
    model: settings.helperModel || settings.model,
    system: CLARIFY_PROMPT,
    text: `Diese Kassenzeilen sind unklar geblieben:\n\n${JSON.stringify(lines, null, 2)}`,
    images: [],
    tool: CLARIFY_TOOL,
    signal,
    melden,
  });

  const byId = new Map(open.map((entry) => [entry.id, entry]));
  let count = 0;

  for (const answer of result.args?.items || []) {
    const entry = byId.get(String(answer.id));
    if (!entry) continue;
    const { item } = entry;

    if (answer.search_query) item.search_query = answer.search_query;
    if (answer.name && answer.name.trim()) {
      item.name = answer.name.trim();
      count += 1;
    }
    if (answer.category) item.category = answer.category;
    if (answer.confident === true) item.uncertain = false;
  }

  return { cents: result.usage.cents, count };
}
