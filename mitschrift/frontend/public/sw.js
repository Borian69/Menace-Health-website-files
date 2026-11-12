/* Mitschrift · Service Worker
   - Oberfläche startet auch ohne Netz (Aufnahmen liegen dann in IndexedDB).
   - /api/* geht immer ans Netz und wird nie zwischengespeichert.
   - Android: „Teilen“ aus einer anderen App (share_target) legt die Dateien in
     IndexedDB ab und öffnet den Import. */

const VERSION = 'mitschrift-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('mitschrift', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true }).createIndex('bySession', 'sessionId');
      }
      if (!db.objectStoreNames.contains('shared')) db.createObjectStore('shared', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function empfangeGeteilt(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('audio').filter((f) => f && typeof f === 'object' && 'size' in f);
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction('shared', 'readwrite');
      for (const f of files) t.objectStore('shared').add({ name: f.name || 'geteilt', type: f.type, blob: f, at: Date.now() });
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch (err) {
    console.warn('Teilen fehlgeschlagen', err);
  }
  return Response.redirect('/#/import', 303);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/teilen') {
    e.respondWith(empfangeGeteilt(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;

  // Schriften von Google Fonts: einmal laden, dann aus dem Cache.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;  // nie cachen

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const k = r.clone(); caches.open(VERSION).then((c) => c.put('/', k)); return r; })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Gehashte Bundles ändern sich nie: Cache zuerst.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
    return;
  }

  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => {
      if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
