/* Optionaler Proxy für den Betriebsmodus „Über eigenen Server“.

   Er hält den API-Key serverseitig, damit er nicht auf dem Handy liegen
   muss. Das ist ein Web-Standard-Handler und läuft unverändert auf
   Cloudflare Workers, Deno Deploy, Vercel Edge Functions und Netlify
   Edge Functions.

   Nötige Umgebungsvariablen:
     ANTHROPIC_API_KEY  – der Key
     ALLOWED_ORIGIN     – Herkunft der App, z. B. https://name.github.io
                          (fehlt sie, ist jede Herkunft erlaubt)

   Die veröffentlichte URL dieses Endpunkts trägst Du in der App unter
   Einstellungen → Proxy-URL ein. */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const ALLOWED_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']);
const MAX_BODY_BYTES = 24 * 1024 * 1024;

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

const json = (payload, status, env) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json', ...corsHeaders(env) },
});

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== 'POST') {
      return json({ error: { message: 'Nur POST.' } }, 405, env);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: { message: 'Auf dem Server ist kein API-Key hinterlegt.' } }, 500, env);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: { message: 'Das Bild ist zu groß.' } }, 413, env);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: { message: 'Ungültige Anfrage.' } }, 400, env);
    }

    // Nur das durchlassen, was die App tatsächlich braucht.
    if (!ALLOWED_MODELS.has(body.model)) {
      return json({ error: { message: 'Dieses Modell ist nicht freigegeben.' } }, 400, env);
    }
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: { message: 'Ungültige Anfrage.' } }, 400, env);
    }

    const headers = {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION,
    };

    if (body.model === 'claude-opus-5') {
      body.fallbacks = 'default';
      headers['anthropic-beta'] = FALLBACK_BETA;
    }

    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', ...corsHeaders(env) },
    });
  },
};
