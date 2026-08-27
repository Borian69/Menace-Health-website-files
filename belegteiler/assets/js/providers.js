/* Anbieter der Erkennung.

   Die App spricht zwei APIs: die Messages API von Anthropic und die
   OpenAI-kompatible API von OpenRouter. Beide bekommen dieselbe neutrale
   Anfragebeschreibung und liefern dasselbe Ergebnis zurück:

     { args, usage: { cents } }

   Beide erlauben Aufrufe direkt aus dem Browser (OpenRouter über
   `access-control-allow-origin: *`, Anthropic über den Header
   `anthropic-dangerous-direct-browser-access`). */

const USD_TO_EUR = 0.92;   // grobe Umrechnung, nur für die Anzeige

/** Kosten je Million Token in US-Dollar (Eingabe, Ausgabe). */
const ANTHROPIC_PRICES = {
  'claude-opus-5':    [5, 25],
  'claude-sonnet-5':  [2, 10],
  'claude-haiku-4-5': [1, 5],
};

/* ── Anthropic ───────────────────────────────────────────── */

const anthropic = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  endpoint: 'https://api.anthropic.com/v1/messages',
  keyLabel: 'Anthropic API-Key',
  keyPlaceholder: 'sk-ant-…',
  keyHint: 'Key auf console.anthropic.com erstellen. Guthaben nötig, eine kostenlose Stufe gibt es dort nicht.',
  needsJsonFallback: false,

  defaultModel: 'claude-sonnet-5',
  models: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 · ~1 Cent', note: 'nur einfache Bons' },
    { id: 'claude-sonnet-5',  label: 'Claude Sonnet 5 · ~3 Cent' },
    { id: 'claude-opus-5',    label: 'Claude Opus 5 · ~7 Cent', note: 'schwierige Bons' },
  ],

  headers(key) {
    return {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  },

  body({ model, system, text, images, tool, maxTokens }) {
    const content = [{ type: 'text', text }];
    for (const data of images) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    }
    return {
      model,
      max_tokens: maxTokens,
      system,
      ...(tool ? { tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }] } : {}),
      messages: [{ role: 'user', content }],
    };
  },

  parse(payload, tool) {
    if (payload?.stop_reason === 'refusal') {
      throw new Error('Die Erkennung hat dieses Bild abgelehnt. Bitte nur den Kassenbon fotografieren.');
    }
    const call = (payload?.content || []).find((block) => block.type === 'tool_use' && block.name === tool.name);
    const text = (payload?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    const args = call ? asObject(call.input) : extractJson(text);

    const usage = payload?.usage || {};
    const input = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
    const [inPrice, outPrice] = ANTHROPIC_PRICES[payload?.model] || ANTHROPIC_PRICES['claude-sonnet-5'];
    const dollars = (input * inPrice + (usage.output_tokens || 0) * outPrice) / 1_000_000;

    return { args, text, usage: { cents: dollars * USD_TO_EUR * 100 } };
  },

  error(status, payload) {
    const detail = payload?.error?.message || '';
    if (status === 401) return 'Der Anthropic-Key wurde nicht akzeptiert. Bitte in den Einstellungen prüfen.';
    if (status === 403) return 'Dieser Key darf das gewählte Modell nicht nutzen.';
    if (status === 404) return 'Das gewählte Modell ist für diesen Zugang nicht verfügbar.';
    if (status === 429) return 'Zu viele Anfragen oder Guthaben aufgebraucht. Kurz warten und erneut versuchen.';
    return detail;
  },
};

/* ── OpenRouter ──────────────────────────────────────────── */

const openrouter = {
  id: 'openrouter',
  label: 'OpenRouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  keyLabel: 'OpenRouter API-Key',
  keyPlaceholder: 'sk-or-v1-…',
  keyHint: 'Key auf openrouter.ai/keys erstellen. Die Gratis-Modelle laufen ohne Guthaben — 20 Anfragen pro Minute, 50 pro Tag.',
  needsJsonFallback: true,

  // Alle hier gelisteten Modelle können Bilder lesen und Funktionen
  // aufrufen. Centangaben sind Schätzungen für einen üblichen Bon;
  // abgerechnet wird, was OpenRouter je Anfrage zurückmeldet.
  defaultModel: 'google/gemma-4-31b-it:free',
  models: [
    { id: 'google/gemma-4-31b-it:free',               label: 'Gemma 4 31B · gratis' },
    { id: 'google/gemma-4-26b-a4b-it:free',           label: 'Gemma 4 26B · gratis' },
    { id: 'minimax/minimax-m3:free',                  label: 'MiniMax M3 · gratis' },
    { id: 'openrouter/free',                          label: 'Gratis · automatische Auswahl', note: 'Modell wechselt, Ergebnis schwankt' },
    { id: 'qwen/qwen3.7-flash',                       label: 'Qwen3.7 Flash · ~0,03 Cent' },
    { id: 'mistralai/mistral-small-3.2-24b-instruct', label: 'Mistral Small 3.2 · ~0,05 Cent' },
    { id: 'openai/gpt-5-nano',                        label: 'GPT-5 nano · ~0,06 Cent' },
    { id: 'google/gemini-2.5-flash-lite',             label: 'Gemini 2.5 Flash Lite · ~0,08 Cent' },
    { id: 'google/gemini-2.5-flash',                  label: 'Gemini 2.5 Flash · ~0,4 Cent', note: 'am gründlichsten' },
  ],

  headers(key) {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      // Nur zur Zuordnung in der OpenRouter-Statistik.
      'x-title': 'Belegteiler',
    };
  },

  body({ model, system, text, images, tool, maxTokens }) {
    const content = [{ type: 'text', text }];
    for (const data of images) {
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } });
    }
    return {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      // Nicht erzwungen: nicht jedes Modell auf OpenRouter beherrscht
      // tool_choice. Kommt kein Funktionsaufruf, greift der JSON-Notweg.
      ...(tool ? {
        tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.schema } }],
        tool_choice: 'auto',
      } : {}),
    };
  },

  parse(payload, tool) {
    const message = payload?.choices?.[0]?.message;
    const call = (message?.tool_calls || []).find((c) => c.function?.name === tool.name) || message?.tool_calls?.[0];
    const text = typeof message?.content === 'string' ? message.content : '';
    const args = call ? asObject(call.function.arguments) : extractJson(text);

    // OpenRouter liefert die tatsächlichen Kosten in jeder Antwort mit.
    const dollars = Number(payload?.usage?.cost) || 0;
    return { args, text, usage: { cents: dollars * USD_TO_EUR * 100 } };
  },

  error(status, payload) {
    const detail = payload?.error?.message || '';
    if (status === 401) return 'Der OpenRouter-Key wurde nicht akzeptiert. Bitte in den Einstellungen prüfen.';
    if (status === 402) return 'Das Guthaben bei OpenRouter reicht nicht. Ein Modell mit „gratis“ im Namen kommt ohne aus.';
    if (status === 403) return `OpenRouter hat die Anfrage abgelehnt. ${detail}`.trim();
    if (status === 404) return 'Dieses Modell gibt es bei OpenRouter nicht (mehr). Bitte in den Einstellungen ein anderes wählen.';
    if (status === 429) return 'Grenze erreicht: Gratis-Modelle erlauben 20 Anfragen pro Minute und 50 pro Tag. Später erneut versuchen oder ein bezahltes Modell wählen.';
    return detail;
  },
};

/* ── Gemeinsames ─────────────────────────────────────────── */

export const PROVIDERS = { anthropic, openrouter };

export const provider = (id) => PROVIDERS[id] || PROVIDERS.openrouter;

/** Erkennt am Präfix, zu welchem Anbieter ein Schlüssel gehört. */
export function detectProvider(key) {
  const value = (key || '').trim();
  if (/^sk-or-/i.test(value)) return 'openrouter';
  if (/^sk-ant-/i.test(value)) return 'anthropic';
  return null;
}

const asObject = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

/** Holt ein JSON-Objekt aus einer Textantwort — Notweg ohne Funktionsaufruf. */
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
