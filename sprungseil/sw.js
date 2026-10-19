/* Service Worker: hält die App offline verfügbar. Ein Seil braucht kein
   Netz — die App, die es zählt, auch nicht.

   Bei Änderungen an einer Datei aus SHELL den Cache-Namen hochzählen —
   und BUILD in assets/js/fassung.js mit; tools/pruefe.mjs prüft, dass
   beide zusammenpassen.

   Strategien wie im Bordbuch (dort seit v7 gemessen):
   Code zuerst aus dem Netz, nach FRIST der Cache; Icons und Schriften
   zuerst aus dem Cache. */

const CACHE = 'sprungseil-v1';
const FRIST = 2500;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/app.css',
  'assets/js/app.js',
  'assets/js/datum.js',
  'assets/js/zahl.js',
  'assets/js/rechnen.js',
  'assets/js/store.js',
  'assets/js/util.js',
  'assets/js/walzwerk.js',
  'assets/js/uhr.js',
  'assets/js/signal.js',
  'assets/js/diagramm.js',
  'assets/js/fassung.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  // Das Design-System liegt eine Ebene höher und gehört genauso dazu.
  '../design/moch.css',
  '../design/moch-motion.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Einzeln: Fehlt eine Datei, bricht nicht die ganze Installation ab.
      .then((cache) => Promise.all(SHELL.map((pfad) => cache.add(pfad).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Nur die eigenen alten Caches: Das Bordbuch liegt im selben Ursprung.
      .then((namen) => Promise.all(namen
        .filter((name) => name.startsWith('sprungseil-') && name !== CACHE)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET') return;

  const adresse = new URL(anfrage.url);

  /* Schriften von Google: einmal geholt, bleiben sie liegen. */
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
  if (adresse.pathname.endsWith('/sw.js')) return;

  const istCode = anfrage.mode === 'navigate'
    || /\.(html|css|js|webmanifest)$/.test(adresse.pathname)
    || adresse.pathname.endsWith('/');

  event.respondWith(istCode ? netzZuerst(anfrage) : cacheZuerst(anfrage));
});

function lege(anfrage, antwort) {
  if (!antwort || !antwort.ok) return antwort;
  const kopie = antwort.clone();
  caches.open(CACHE).then((cache) => cache.put(anfrage, kopie)).catch(() => {});
  return antwort;
}

/* Netz zuerst, Cache als Rückfall — auch dann, wenn das Netz zwar da
   ist, aber nichts liefert. */
function netzZuerst(anfrage) {
  return new Promise((fertig) => {
    let erledigt = false;
    const nimm = (antwort) => {
      if (erledigt || !antwort) return;
      erledigt = true;
      fertig(antwort);
    };
    const uhr = setTimeout(() => {
      caches.match(anfrage).then(nimm).catch(() => {});
    }, FRIST);
    fetch(anfrage)
      .then((antwort) => {
        clearTimeout(uhr);
        lege(anfrage, antwort);
        nimm(antwort);
      })
      .catch(() => {
        clearTimeout(uhr);
        caches.match(anfrage)
          .then((treffer) => nimm(treffer || Response.error()))
          .catch(() => nimm(Response.error()));
      });
  });
}

function cacheZuerst(anfrage) {
  return caches.match(anfrage).then((treffer) => {
    const ausDemNetz = fetch(anfrage)
      .then((antwort) => lege(anfrage, antwort))
      .catch(() => treffer);
    return treffer || ausDemNetz;
  });
}
