/* Service Worker: hält das Rezeptbuch offline verfügbar. Wer im Supermarkt ohne
   Netz steht, braucht die Zutatenliste trotzdem.

   Erzeugt von tools/bauen.py — nicht von Hand ändern. Der Cache-Name hängt am
   Inhalt von index.html; nach jedem Bau holt sich die App die neue Fassung,
   sobald das Handy einmal online ist. */

const CACHE = 'rezeptbuch-f6f4d1d7ed';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Einzeln, damit eine fehlende Datei nicht die ganze Offline-Fassung verhindert.
      .then((cache) => Promise.all(SHELL.map((pfad) => cache.add(pfad).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith('rezeptbuch-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET') return;
  const adresse = new URL(anfrage.url);

  // Schriften von Google: einmal geholt, bleiben sie liegen.
  if (adresse.hostname.endsWith('googleapis.com') || adresse.hostname.endsWith('gstatic.com')) {
    event.respondWith(
      caches.match(anfrage).then((treffer) => treffer || fetch(anfrage).then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE).then((cache) => cache.put(anfrage, kopie));
        return antwort;
      }).catch(() => treffer)),
    );
    return;
  }

  if (adresse.origin !== self.location.origin) return;

  // Zuerst der Cache, im Hintergrund auffrischen.
  event.respondWith(
    caches.match(anfrage, { ignoreSearch: true }).then((treffer) => {
      const ausDemNetz = fetch(anfrage).then((antwort) => {
        if (antwort && antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((cache) => cache.put(anfrage, kopie));
        }
        return antwort;
      }).catch(() => treffer);
      return treffer || ausDemNetz;
    }),
  );
});
