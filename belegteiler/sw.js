/* Service Worker: hält die App-Hülle offline verfügbar.
   Die Erkennung selbst braucht natürlich eine Verbindung.

   Bei Änderungen an den Dateien unten CACHE hochzählen. */

/* Muss zu BUILD in assets/js/app.js passen — test13 prüft das. */
const CACHE = 'belegteiler-v22';

// Getrenntes Fach für fertige Erkennungen, die noch niemand abgeholt hat.
const ERGEBNISSE = 'belegteiler-ergebnisse';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/app.css',
  'assets/js/app.js',
  'assets/js/util.js',
  'assets/js/store.js',
  'assets/js/image.js',
  'assets/js/scan.js',
  'assets/js/providers.js',
  'assets/js/receipt.js',
  'assets/js/summary.js',
  'assets/js/canvas.js',
  'assets/js/categories.js',
  'assets/js/feedback.js',
  'assets/js/wav.js',
  'assets/js/netz.js',
  'assets/js/warteschlange.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // ERGEBNISSE muss stehenbleiben: dort liegt womöglich gerade die
      // Antwort auf eine Erkennung, die noch niemand abgeholt hat.
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE && key !== ERGEBNISSE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* ── Anfragen, die den Standby überstehen ────────────────────

   Die Seite wird eingefroren, sobald das Display ausgeht oder sie in
   den Hintergrund wandert — eine Erkennung, die von dort aus läuft,
   steht dann still. Dieser Worker gehört nicht zur Seite. `waitUntil`
   hält ihn für die Dauer der Anfrage am Leben, und das Ergebnis wird
   haltbar abgelegt, bevor es gemeldet wird. So findet die Seite es
   selbst dann noch, wenn sie zwischendurch verworfen wurde. */

const laufend = new Set();

self.addEventListener('message', (event) => {
  const daten = event.data;
  if (daten?.type === 'anfrage') event.waitUntil(ausfuehren(daten));
  else if (daten?.type === 'abholen') event.waitUntil(abholen(daten.id, event.source));
});

async function ausfuehren({ id, url, method, headers, body }) {
  laufend.add(id);
  let ergebnis;
  try {
    const antwort = await fetch(url, { method: method || 'POST', headers, body });
    ergebnis = {
      id,
      ok: antwort.ok,
      status: antwort.status,
      retryAfter: Number(antwort.headers.get('retry-after')) || 0,
      text: await antwort.text(),
    };
  } catch (error) {
    /* Den Grund mitnehmen. Hier stand ein nacktes catch, und damit war
       an der einzigen Stelle, an der etwas über den Fehlschlag zu
       erfahren gewesen wäre, nichts mehr übrig — die Diagnose zeigte
       dann nur "Keine Verbindung" ohne jeden Anhaltspunkt. */
    ergebnis = {
      id, fehler: true, ok: false, status: 0, retryAfter: 0, text: '',
      grund: `${error?.name || 'Fehler'}: ${error?.message || error}`,
    };
  }
  laufend.delete(id);

  // Erst ablegen, dann melden — in dieser Reihenfolge, damit zwischen
  // beidem nichts verlorengehen kann.
  const cache = await caches.open(ERGEBNISSE);
  await cache.put(schluessel(id), new Response(JSON.stringify({ ...ergebnis, abgelegtAm: Date.now() })));
  await aufraeumen(cache);
  await melden({ type: 'antwort', ...ergebnis });
}

/* Abgeholte Ergebnisse werden gelöscht — abgeholt wird aber nicht immer.
   Wurde die Seite verworfen, fragt niemand mehr nach, und der Eintrag
   bliebe für immer liegen. Alles, was älter als eine Stunde ist, ist
   ohnehin niemandem mehr von Nutzen. */
const HALTBAR = 60 * 60 * 1000;

async function aufraeumen(cache) {
  const jetzt = Date.now();
  for (const anfrage of await cache.keys()) {
    const treffer = await cache.match(anfrage);
    const alter = jetzt - ((await treffer?.json().catch(() => null))?.abgelegtAm ?? 0);
    if (alter > HALTBAR) await cache.delete(anfrage);
  }
}

async function abholen(id, quelle) {
  const cache = await caches.open(ERGEBNISSE);
  const treffer = await cache.match(schluessel(id));
  if (treffer) {
    const ergebnis = await treffer.json();
    await cache.delete(schluessel(id));
    quelle?.postMessage({ type: 'antwort', ...ergebnis });
    return;
  }
  // Läuft noch — die Meldung kommt von selbst.
  if (laufend.has(id)) return;
  // Weder fertig noch laufend: Der Worker wurde zwischendurch beendet.
  quelle?.postMessage({ type: 'antwort', id, unbekannt: true });
}

const schluessel = (id) => new Request(`${self.location.origin}/__erkennung/${encodeURIComponent(id)}`);

async function melden(nachricht) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage(nachricht);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;  // API-Aufrufe nie abfangen

  /* Netz zuerst, Cache als Rückfalllinie.
     Vorher stand es andersherum, und das war ein Fehler: Wer aus dem
     Cache bedient wird, sieht nach einer Änderung noch einmal den alten
     Stand — die neue Fassung landet nur im Cache und wird erst beim
     übernächsten Start sichtbar. Genau so wirkte es, als käme der Code
     gar nicht an. Offline funktioniert weiterhin alles, nur eben aus
     dem Cache. */
  /* `cache: 'reload'` umgeht zusätzlich den HTTP-Zwischenspeicher des
     Browsers. GitHub Pages setzt `Cache-Control: max-age=600`, der
     Service Worker könnte also „vom Netz geholt" haben und doch eine bis
     zu zehn Minuten alte Datei bekommen. Im Test hier war es allein
     nicht nötig — den Ausschlag gibt die Reihenfolge oben. Es bleibt
     trotzdem stehen: es kostet nichts und schliesst den Fall. */
  event.respondWith(
    fetch(request, { cache: 'reload' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
  );
});
