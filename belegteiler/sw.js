/* Service Worker: hält die App-Hülle offline verfügbar.
   Die Erkennung selbst braucht natürlich eine Verbindung.

   Bei Änderungen an den Dateien unten CACHE hochzählen. */

/* Muss zu BUILD in assets/js/app.js passen — test13 prüft das. */
const CACHE = 'belegteiler-v13';

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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

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
