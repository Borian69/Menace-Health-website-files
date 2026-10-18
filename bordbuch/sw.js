/* Service Worker: hält die App offline verfügbar. Ein Bordbuch, das in
   der Tiefgarage nicht startet, ist keines.

   Bei Änderungen an einer Datei aus SHELL den Cache-Namen hochzählen —
   und BUILD in assets/js/fassung.js mit; der Selbsttest prüft, dass
   beide zusammenpassen.

   Zwei Strategien, nach Art der Datei:

   **Code zuerst aus dem Netz** (HTML, CSS, JS). Die Shell entscheidet,
   welche Module geladen werden — sie muss aktuell sein, sobald eine
   Verbindung da ist. Bis zur Fassung v7 lief alles cache-zuerst; eine
   neue Fassung erschien dadurch frühestens beim übernächsten Start,
   und wer die App nur kurz öffnet, sah sie nie. Offline greift nach
   FRIST Millisekunden der Cache, die Tiefgarage bleibt also bedient.

   **Alles andere zuerst aus dem Cache** (Icons, Schriften). Die ändern
   sich praktisch nie und sollen den Start nicht aufhalten. */

const CACHE = 'bordbuch-v8';

/* Wie lange die App auf das Netz wartet, bevor der Cache einspringt.
   Länger wartet niemand auf ein Serviceheft. */
const FRIST = 2500;

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
  'assets/js/verbrauch.js',
  'assets/js/belege.js',
  'assets/js/selbsttest.js',
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

  /* Den Worker selbst nie beantworten: Sonst könnte sich eine Fassung
     einnisten, die ihre eigene Ablösung aus dem Cache ausliefert. */
  if (adresse.pathname.endsWith('/sw.js')) return;

  const istCode = anfrage.mode === 'navigate'
    || /\.(html|css|js)$/.test(adresse.pathname)
    || adresse.pathname.endsWith('/');

  event.respondWith(istCode ? netzZuerst(anfrage) : cacheZuerst(anfrage));
});

/** Legt eine Antwort im Cache ab, ohne den Aufrufer warten zu lassen. */
function lege(anfrage, antwort) {
  if (!antwort || !antwort.ok) return antwort;
  const kopie = antwort.clone();
  caches.open(CACHE).then((cache) => cache.put(anfrage, kopie)).catch(() => {});
  return antwort;
}

/* Netz zuerst, Cache als Rückfall — und zwar auch dann, wenn das Netz
   zwar da ist, aber nichts liefert. Ohne die Frist stünde die App in
   einem Funkloch mit Empfangsbalken minutenlang auf Weiß. */
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

/* Cache zuerst, im Hintergrund auffrischen. Für Icons und Schriften:
   Sie ändern sich praktisch nie und sollen den Start nicht aufhalten. */
function cacheZuerst(anfrage) {
  return caches.match(anfrage).then((treffer) => {
    const ausDemNetz = fetch(anfrage)
      .then((antwort) => lege(anfrage, antwort))
      .catch(() => treffer);
    return treffer || ausDemNetz;
  });
}
