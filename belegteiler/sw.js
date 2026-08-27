/* Service Worker: hält die App-Hülle offline verfügbar.
   Die Erkennung selbst braucht natürlich eine Verbindung.

   Bei Änderungen an den Dateien unten CACHE hochzählen. */

const CACHE = 'belegteiler-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/app.css',
  'assets/js/app.js',
  'assets/js/util.js',
  'assets/js/store.js',
  'assets/js/image.js',
  'assets/js/claude.js',
  'assets/js/receipt.js',
  'assets/js/summary.js',
  'assets/js/canvas.js',
  'assets/js/categories.js',
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

  event.respondWith(
    caches.match(request).then((cached) => {
      // Im Hintergrund aktualisieren, damit neue Versionen ankommen.
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
