/* Belegerkennung über die Claude Messages API.

   Zwei Betriebsarten:
   • direct – der API-Key liegt auf dem Gerät, der Aufruf geht direkt an
     api.anthropic.com (dafür ist der Header
     `anthropic-dangerous-direct-browser-access` nötig).
   • proxy  – der Aufruf geht an einen eigenen Endpunkt, der den Key
     serverseitig hält und die Anfrage unverändert weiterreicht.
     Referenz-Implementierung: api/scan.js im Projekt. */

import { categoryIds } from './categories.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const SYSTEM_PROMPT = `Du liest Kassenbons aus dem deutschsprachigen Einzelhandel (Supermarkt, Discounter, Drogerie, Bäckerei, Getränkemarkt) und überträgst sie in strukturierte Daten.

Arbeitsweise
- Gib das Ergebnis ausschließlich über das Werkzeug "beleg_erfassen" zurück. Schreibe keinen Fließtext.
- Erfasse jede gekaufte Position genau einmal, in der Reihenfolge des Belegs.
- Bekommst du mehrere Bilder, sind das aufeinanderfolgende, sich leicht überlappende Abschnitte EINES FOTOS, von oben nach unten. Positionen im Überlappungsbereich tauchen auf zwei Bildern auf – erfasse sie trotzdem nur einmal.

Mehrere Bons auf einem Foto
- Auf dem Foto können mehrere getrennte Kassenbons liegen, nebeneinander oder untereinander. Lege für jeden einzelnen Bon einen eigenen Eintrag in "receipts" an, mit seinem eigenen Händler, Datum und seiner eigenen Endsumme.
- Woran du einen neuen Bon erkennst: eigener Kopf mit Händlername und Anschrift, eigene Endsumme, sichtbarer Rand oder Papierkante, andere Papierbreite oder Schrifttype.
- Ein einzelner, sehr langer Bon, der über mehrere Bildabschnitte läuft, ist EIN Eintrag – nicht mehrere. Im Zweifel lieber einen Bon zu wenig trennen als einen zu viel.
- Liegt nur ein Bon auf dem Foto, enthält "receipts" genau einen Eintrag.

Bezeichnungen — der wichtigste Teil deiner Arbeit
- Auf dem Bon stehen keine Produktnamen, sondern verstümmelte Kassentexte mit fester Zeichenbegrenzung. Gib NICHT diesen Text zurück. Finde heraus, welches Produkt dahintersteckt, und benenne dieses.
- Zieh dafür alles heran, was du hast: den Händler und sein Sortiment, die Eigenmarken dieses Händlers, das übliche Abkürzungsmuster seines Kassensystems, die Höhe des Preises, die Mehrwertsteuerkennung (ermäßigt = meist Lebensmittel) und die Nachbarzeilen.
- Zahlen am Zeilenende sind fast immer Größe, Menge oder eine Artikelnummer — kein Teil des Namens. "XYZ VANILLA 12" heißt nicht, dass das Produkt "12" heißt; die 12 ist Größe oder Artikelnummer und gehört nur dann in den Namen, wenn sie erkennbar eine Menge ist (ml, g, Stück).
- Zerlegte oder zusammengezogene Markennamen wieder zusammensetzen: Kassen trennen und kürzen Marken oft mitten im Wort.
- So sieht ein guter Name aus: Marke + was es ist + Menge, so dass jemand, der nicht dabei war, das Produkt im Regal wiedererkennt.
  "JA! H-MILCH 3,5%" → "Ja! H-Milch 3,5 %"
  "ZWIEB.ROT 500G" → "Rote Zwiebeln, 500 g"
  "PROKUD ZAHNC COMPL" → "Prokudent Zahncreme Complete"
  "DOMOL WC AKTIV" → "domol WC-Reiniger Aktiv"
- Unsicherheit ist erlaubt und erwünscht: Nimm die wahrscheinlichste Deutung und setze "uncertain" auf true. Ein plausibler Name mit Warnmarkierung hilft dem Nutzer mehr als abgetippter Kassensalat. Nur wenn die Zeile wirklich unlesbar ist, übernimm den Rohtext und setze "uncertain".
- "raw_text" enthält immer die Originalzeile, wie sie gedruckt ist — daran prüft der Nutzer deine Deutung nach.

Warengruppen
- Ordne jede Position einer Warengruppe zu. "sonstiges" ist die letzte Wahl, nicht die bequeme.
- Der Händler ist der stärkste Hinweis: Bei Drogerien (Rossmann, dm, Müller) gehören die meisten Positionen zu "drogerie" oder "haushalt", bei Bäckereien zu "brot", bei Getränkemärkten zu "getraenke" und "pfand".
- Auch wenn du beim Namen unsicher bist, ist die Warengruppe meist trotzdem erkennbar — ordne sie dann nach bestem Wissen zu.

Preise
- "total_price" ist der Betrag, der auf dem Beleg für diese Zeile in die Summe eingeht, in Euro als Zahl (1.99).
- Gewichtsware ("0,732 kg x 2,99 EUR/kg"): quantity 0.732, unit "kg", unit_price 2.99, total_price 2.19.
- Mehrfachmengen ("2 x 1,49"): quantity 2, unit "Stk", unit_price 1.49, total_price 2.98.
- Pfand ist eine eigene Position mit positivem Betrag, Kategorie "pfand".
- Leergutrückgabe, Rabatte, Coupons und Treuevorteile bekommen einen NEGATIVEN Betrag – Leergut in Kategorie "pfand", alles andere in "rabatt".

Nicht übernehmen
- Zwischensummen, "SUMME", "zu zahlen", Mehrwertsteuertabellen (A/B, MwSt, Netto), Zahlungszeilen (EC-Cash, Gegeben, Rückgeld, Kartennummer), Punktestände, TSE-/Signaturdaten, Werbetexte.

Kopfdaten
- "store" ist der Händlername (z. B. "REWE", "EDEKA", "ALDI SÜD", "dm", "ROSSMANN").
- "date" im Format JJJJ-MM-TT, "time" als HH:MM. Nicht erkennbar: null.
- "receipt_total" ist die gedruckte Endsumme, die bezahlt wurde.

Abgleich zum Schluss — bevor du antwortest
- Addiere die Beträge, die du erfasst hast, und vergleiche die Summe mit der gedruckten Endsumme des Bons.
- Weichen sie ab, geh den Bon noch einmal durch. Die häufigsten Ursachen: eine übersprungene Zeile, ein übersehener Pfand- oder Rabattposten, eine falsch gelesene Ziffer (0/8, 1/7, 3/9, 5/6), oder eine Position, die über zwei Zeilen läuft. Korrigiere, was du findest.
- Bleibt danach eine Differenz, schreib sie in "notes" mit dem Betrag und dem Bereich des Bons, an dem es hakt — der Nutzer ergänzt das dann von Hand.
- Sonstige Auffälligkeiten (unscharfer Bereich, abgeschnittener Beleg) gehören ebenfalls in "notes".`;

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name:        { type: 'string',  description: 'Das identifizierte Produkt als Marke + Art + Menge, nicht der Kassentext.' },
    raw_text:    { type: 'string',  description: 'Die Originalzeile, wie sie auf dem Beleg gedruckt ist.' },
    quantity:    { type: 'number',  description: 'Menge. Einzelartikel: 1. Gewichtsware: das Gewicht.' },
    unit:        { type: 'string',  description: 'Einheit der Menge, z. B. "Stk", "kg", "l".' },
    unit_price:  { type: ['number', 'null'], description: 'Preis je Einheit in Euro, sonst null.' },
    total_price: { type: 'number',  description: 'Zeilenbetrag in Euro. Negativ bei Rabatt oder Leergut.' },
    category:    { type: 'string', enum: categoryIds, description: 'Warengruppe der Position.' },
    uncertain:   { type: 'boolean', description: 'true, wenn die Deutung des Produkts oder der Preis unsicher ist.' },
  },
  required: ['name', 'raw_text', 'quantity', 'unit', 'unit_price', 'total_price', 'category', 'uncertain'],
  additionalProperties: false,
};

const RECEIPT_SCHEMA = {
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
};

const TOOL = {
  name: 'beleg_erfassen',
  description: 'Übergibt alle auf dem Foto erfassten Kassenbons.',
  input_schema: {
    type: 'object',
    properties: {
      currency: { type: 'string', description: 'Währungscode, in der Regel "EUR".' },
      receipts: { type: 'array', items: RECEIPT_SCHEMA, description: 'Ein Eintrag je eigenständigem Kassenbon auf dem Foto.' },
      notes:    { type: ['string', 'null'], description: 'Kurzer Hinweis für den Nutzer, sonst null.' },
    },
    required: ['currency', 'receipts', 'notes'],
    additionalProperties: false,
  },
};

function buildBody({ parts, model, withFallbacks }) {
  const content = [
    {
      type: 'text',
      text: parts.length > 1
        ? `Hier ist ein Foto in ${parts.length} aufeinanderfolgenden, leicht überlappenden Abschnitten (von oben nach unten). Erfasse jeden Kassenbon darauf vollständig.`
        : 'Hier ist ein Foto. Erfasse jeden Kassenbon darauf vollständig.',
    },
    ...parts.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    })),
  ];

  const body = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    messages: [{ role: 'user', content }],
  };

  // Bei einer Sicherheits-Ablehnung übernimmt automatisch ein anderes
  // Modell, statt dass die Anfrage einfach abbricht.
  if (withFallbacks) body.fallbacks = 'default';
  return body;
}

function requestInit(body, settings, withFallbacks) {
  const headers = { 'content-type': 'application/json' };
  if (settings.mode === 'proxy') {
    return { url: settings.proxyUrl.trim(), init: { method: 'POST', headers, body: JSON.stringify(body) } };
  }
  headers['x-api-key'] = settings.apiKey.trim();
  headers['anthropic-version'] = API_VERSION;
  headers['anthropic-dangerous-direct-browser-access'] = 'true';
  if (withFallbacks) headers['anthropic-beta'] = FALLBACK_BETA;
  return { url: API_URL, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

function friendlyError(status, payload) {
  const detail = payload?.error?.message || payload?.message || '';
  switch (status) {
    case 400: return `Die Anfrage wurde abgelehnt. ${detail}`.trim();
    case 401: return 'Der API-Key wurde nicht akzeptiert. Bitte in den Einstellungen prüfen.';
    case 403: return 'Dieser API-Key darf das gewählte Modell nicht nutzen.';
    case 404: return 'Das gewählte Modell ist für diesen Zugang nicht verfügbar.';
    case 413: return 'Das Bild ist zu groß. Bitte den Beleg näher und in zwei Aufnahmen fotografieren.';
    case 429: return 'Zu viele Anfragen oder Guthaben aufgebraucht. Bitte kurz warten und erneut versuchen.';
    default:
      if (status >= 500) return 'Der Dienst ist gerade nicht erreichbar. Bitte in einem Moment nochmal versuchen.';
      return detail || `Unerwartete Antwort (HTTP ${status}).`;
  }
}

async function callOnce(parts, settings, withFallbacks, signal) {
  const body = buildBody({ parts, model: settings.model, withFallbacks });
  const { url, init } = requestInit(body, settings, withFallbacks);

  let response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Keine Verbindung zur Erkennung. Ist das Handy online?');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = new Error(friendlyError(response.status, payload));
    failure.status = response.status;
    failure.detail = payload?.error?.message || '';
    throw failure;
  }
  return payload;
}

/**
 * Liest einen Beleg aus vorbereiteten Bildabschnitten.
 * @param {string[]} parts  Base64-JPEGs
 * @param {object}   settings
 * @param {AbortSignal} [signal]
 */
export async function scanReceipt(parts, settings, signal) {
  const useFallbacks = settings.mode === 'direct' && settings.model === 'claude-opus-5';

  let message;
  try {
    message = await callOnce(parts, settings, useFallbacks, signal);
  } catch (error) {
    // Kennt der Zugang die Fallback-Option nicht, kommt ein 400 zurück.
    // Dann ein zweites Mal ohne — schlägt es erneut fehl, lag es an etwas
    // anderem und die Meldung von dort ist die aussagekräftigere.
    if (!useFallbacks || error.status !== 400) throw error;
    message = await callOnce(parts, settings, false, signal);
  }

  if (message?.stop_reason === 'refusal') {
    throw new Error('Die Erkennung hat die Verarbeitung dieses Bildes abgelehnt. Bitte nur den Kassenbon fotografieren.');
  }

  const toolCall = (message?.content || []).find((block) => block.type === 'tool_use');
  if (!toolCall) {
    const text = (message?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    throw new Error(text
      ? `Auf dem Bild wurde kein Kassenbon erkannt. ${text.slice(0, 220)}`
      : 'Auf dem Bild wurde kein Kassenbon erkannt.');
  }

  // Tool-Eingaben immer als JSON behandeln, nie per Textvergleich auswerten.
  const parsed = typeof toolCall.input === 'string' ? JSON.parse(toolCall.input) : toolCall.input;
  const receipts = (parsed?.receipts || []).filter((receipt) => receipt?.items?.length);
  if (!receipts.length) {
    throw new Error('Es konnten keine Positionen gelesen werden. Vielleicht hilft ein schärferes Foto bei mehr Licht.');
  }

  return {
    receipts,
    notes: parsed.notes || '',
    usage: usageCost(message.usage, message.model || settings.model),
  };
}

/* ── Kosten einer Anfrage ────────────────────────────────── */

// US-Dollar je Million Token (Eingabe/Ausgabe), Stand der Preisliste.
const PRICES = {
  'claude-opus-5':    [5, 25],
  'claude-sonnet-5':  [2, 10],
  'claude-haiku-4-5': [1, 5],
};
const USD_TO_EUR = 0.92;   // grobe Umrechnung, nur zur Anzeige

export const modelPrice = (model) => PRICES[model] || PRICES['claude-sonnet-5'];

/** @returns {{inputTokens:number, outputTokens:number, cents:number}} */
function usageCost(usage, model) {
  const inputTokens = (usage?.input_tokens || 0)
    + (usage?.cache_read_input_tokens || 0)
    + (usage?.cache_creation_input_tokens || 0);
  const outputTokens = usage?.output_tokens || 0;
  const [inPrice, outPrice] = modelPrice(model);
  const dollars = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
  return { inputTokens, outputTokens, cents: dollars * USD_TO_EUR * 100 };
}
