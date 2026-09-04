/* Service Worker: hält die App offline verfügbar. Ein Bordbuch, das in
   der Tiefgarage nicht startet, ist keines.

   Bei Änderungen an einer Datei aus SHELL den Cache-Namen hochzählen —
   und BUILD in assets/js/fassung.js mit; der Selbsttest prüft, dass
   beide zusammenpassen. */

const CACHE = 'bordbuch-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/app.css',
  'assets/js/app.js',
  'assets/js/util.js',
  'assets/js/debug.js',
  'assets/js/store.js',
  'assets/js/eintraege.js',
  'assets/js/kalender.js',
  'assets/js/diagramm.js',
  'assets/js/pdf.js',
  'assets/js/demo.js',
  'assets/js/selbsttest.js',
  'assets/js/fassung.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  // Das Design-System liegt eine Ebene höher und gehört genauso dazu.
  '../design/styles.css',
  '../design/fonts.css',
  '../design/tokens.css',
  '../design/shape.css',
  '../design/bundle.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Einzeln, nicht als Block: Fehlt eine einzige Datei, würde
      // addAll() die ganze Installation abbrechen und die App bliebe
      // ohne Offline-Fassung.
      .then((cache) => Promise.all(SHELL.map((pfad) => cache.add(pfad).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET') return;

  const adresse = new URL(anfrage.url);

  /* Schriften kommen von Google und sind beim ersten Start noch nicht im
     Cache. Einmal geholt, bleiben sie liegen — danach sieht die App auch
     ohne Netz aus wie vorgesehen. */
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

  /* Zuerst der Cache: Die App startet dadurch sofort, auch bei schlechter
     Verbindung. Im Hintergrund wird die Datei aufgefrischt, damit die
     nächste Öffnung aktuell ist. */
  event.respondWith(
    caches.match(anfrage).then((treffer) => {
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
