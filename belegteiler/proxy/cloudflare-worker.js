/* Ausweichweg für die Erkennung — ein Cloudflare Worker.
 *
 * Wofür das gut ist
 * -----------------
 * Ein VPN mit Inhaltsfilter (NordVPN Threat Protection und Verwandte)
 * kann einzelne Adressen sperren. Dann scheitert die Anfrage an
 * openrouter.ai nicht unterwegs, sondern sofort — auf dem Gerät
 * gemessen nach 0,3 Sekunden. Dagegen hilft aus der App heraus nichts:
 * Die Sperre greift, bevor der Browser losläuft.
 *
 * Was hilft, ist eine andere Adresse. Dieser Worker läuft unter deiner
 * eigenen *.workers.dev-Adresse, die auf keiner Sperrliste steht, und
 * reicht die Anfrage weiter.
 *
 * Nebenbei wird es dadurch sicherer, nicht unsicherer: Der Schlüssel
 * liegt dann hier und nicht mehr im Browser. Die App schickt nur noch,
 * WAS gefragt werden soll — nicht, womit.
 *
 * Aufsetzen (fünf Minuten, kostenlos)
 * -----------------------------------
 * 1. dash.cloudflare.com → Workers & Pages → Create → Worker
 * 2. Diese Datei vollständig in den Editor kopieren, Deploy
 * 3. Settings → Variables → Secret anlegen:
 *      OPENROUTER_KEY = dein Schlüssel von openrouter.ai/keys
 *      (für Claude zusätzlich ANTHROPIC_KEY)
 * 4. Die Adresse des Workers (https://….workers.dev) in der App unter
 *    Einstellungen → Proxy-URL eintragen.
 *
 * Danach versucht die App zuerst den direkten Weg und nimmt diesen hier
 * nur, wenn der gesperrt ist. Wer den Proxy immer nutzen will, stellt
 * unter Verbindung auf „Über eigenen Server".
 *
 * Wer darf fragen?
 * ----------------
 * Ohne HERKUNFT antwortet der Worker jedem, der die Adresse kennt —
 * und verbraucht dann dein Guthaben. Trag deine App-Adresse ein, dann
 * bedient er nur sie.
 */

const HERKUNFT = 'https://borian69.github.io';   // leer lassen = jede

const ZIELE = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  anthropic:  'https://api.anthropic.com/v1/messages',
};

const kopf = (herkunft) => ({
  'access-control-allow-origin': herkunft || '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-max-age': '86400',
});

export default {
  async fetch(anfrage, umgebung) {
    const herkunft = HERKUNFT || anfrage.headers.get('origin') || '*';

    // Vorabfrage des Browsers.
    if (anfrage.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: kopf(herkunft) });
    }
    if (anfrage.method !== 'POST') {
      return antwortJson({ error: { message: 'Nur POST.' } }, 405, herkunft);
    }
    if (HERKUNFT && anfrage.headers.get('origin') !== HERKUNFT) {
      return antwortJson({ error: { message: 'Diese Adresse darf hier nicht fragen.' } }, 403, herkunft);
    }

    let nutzlast;
    try {
      nutzlast = await anfrage.json();
    } catch {
      return antwortJson({ error: { message: 'Kein lesbares JSON.' } }, 400, herkunft);
    }

    const { provider = 'openrouter', body } = nutzlast || {};
    const ziel = ZIELE[provider];
    if (!ziel || !body) {
      return antwortJson({ error: { message: 'Unbekannter Anbieter oder leere Anfrage.' } }, 400, herkunft);
    }

    const schluessel = provider === 'anthropic' ? umgebung.ANTHROPIC_KEY : umgebung.OPENROUTER_KEY;
    if (!schluessel) {
      return antwortJson({
        error: { message: `Im Worker fehlt das Secret ${provider === 'anthropic' ? 'ANTHROPIC_KEY' : 'OPENROUTER_KEY'}.` },
      }, 500, herkunft);
    }

    const kopfzeilen = provider === 'anthropic'
      ? {
        'content-type': 'application/json',
        'x-api-key': schluessel,
        'anthropic-version': '2023-06-01',
      }
      : {
        'content-type': 'application/json',
        authorization: `Bearer ${schluessel}`,
        'x-title': 'Belegteiler',
      };

    /* Die Antwort wird durchgereicht, wie sie kommt — samt Statuscode.
       Die App kennt die Fehlermeldungen der Anbieter und macht daraus
       verständliche Sätze; hier etwas eigenes zu erfinden, würde ihr
       diese Möglichkeit nehmen. */
    let antwort;
    try {
      antwort = await fetch(ziel, {
        method: 'POST',
        headers: kopfzeilen,
        body: JSON.stringify(body),
      });
    } catch (fehler) {
      return antwortJson({ error: { message: `Der Worker kam nicht zum Anbieter durch: ${fehler}` } }, 502, herkunft);
    }

    return new Response(antwort.body, {
      status: antwort.status,
      headers: {
        ...kopf(herkunft),
        'content-type': antwort.headers.get('content-type') || 'application/json',
      },
    });
  },
};

const antwortJson = (daten, status, herkunft) => new Response(JSON.stringify(daten), {
  status,
  headers: { ...kopf(herkunft), 'content-type': 'application/json' },
});
