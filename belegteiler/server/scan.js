/* Optionaler Proxy für den Betriebsmodus „Über eigenen Server“.

   Er hält den API-Key serverseitig, damit er nicht auf dem Handy liegen
   muss. Das ist ein Web-Standard-Handler und läuft unverändert auf
   Cloudflare Workers, Deno Deploy, Vercel Edge Functions und Netlify
   Edge Functions.

   Umgebungsvariablen — der Key des Anbieters, den die App nutzt:
     OPENROUTER_API_KEY – für OpenRouter
     ANTHROPIC_API_KEY  – für Claude
     ALLOWED_ORIGIN     – Herkunft der App, z. B. https://name.github.io
                          (fehlt sie, ist jede Herkunft erlaubt)

   Die veröffentlichte URL dieses Endpunkts trägst Du in der App unter
   Einstellungen → Proxy-URL ein. */

const MAX_BODY_BYTES = 24 * 1024 * 1024;

const UPSTREAM = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    keyVar: 'ANTHROPIC_API_KEY',
    headers: (key) => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyVar: 'OPENROUTER_API_KEY',
    headers: (key) => ({
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'x-title': 'Belegteiler',
    }),
  },
};

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

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: { message: 'Das Bild ist zu groß.' } }, 413, env);
    }

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return json({ error: { message: 'Ungültige Anfrage.' } }, 400, env);
    }

    // Die App schickt { provider, body } — der Proxy reicht body weiter.
    const target = UPSTREAM[envelope.provider];
    const body = envelope.body;
    if (!target) {
      return json({ error: { message: 'Unbekannter Anbieter.' } }, 400, env);
    }
    if (!body || !Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: { message: 'Ungültige Anfrage.' } }, 400, env);
    }

    const key = env[target.keyVar];
    if (!key) {
      return json({ error: { message: `Auf dem Server fehlt ${target.keyVar}.` } }, 500, env);
    }

    const upstream = await fetch(target.url, {
      method: 'POST',
      headers: target.headers(key),
      body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', ...corsHeaders(env) },
    });
  },
};
