// IndexedDB ohne Bibliothek. Hier liegen Aufnahmen, bis der Server sie hat:
// jeder Block wird gespeichert, sobald der Browser ihn liefert.

export type SessionState =
  | 'aufnahme'      // läuft (oder lief, als die App zuletzt geschlossen wurde)
  | 'pausiert'
  | 'unterbrochen'  // Mikrofon wurde vom System beendet
  | 'beendet'       // gestoppt, wartet aufs Speichern
  | 'upload';       // Upload läuft oder ist fehlgeschlagen

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  state: SessionState;
  mime: string;
  durationMs: number;   // tatsächlich aufgenommene Zeit
  segments: number;     // Zahl der Teilstücke (neues Teilstück nach Unterbrechung)
  bytes: number;
  name?: string;
  projectId?: string;
  projectName?: string;
  lastError?: string;
  gaps: { at: number; ms: number }[];  // erkannte Lücken: Position (ms) und Länge
}

export interface Chunk { id?: number; sessionId: string; segment: number; seq: number; blob: Blob }

export interface SharedFile { id?: number; name: string; type: string; blob: Blob; at: number }

const DB = 'mitschrift';
const VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) {
        const s = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
        s.createIndex('bySession', 'sessionId');
      }
      // Vom Service Worker abgelegt, wenn eine andere App Audio „teilt“ (Android).
      if (!db.objectStoreNames.contains('shared')) db.createObjectStore('shared', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbPromise = null; reject(r.error); };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result: T;
    const req = fn(t.objectStore(store));
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('IndexedDB abgebrochen'));
  }));
}

export const idb = {
  putSession: (s: Session) => tx('sessions', 'readwrite', (st) => st.put({ ...s, updatedAt: Date.now() })),
  getSession: (id: string) => tx<Session | undefined>('sessions', 'readonly', (st) => st.get(id)),
  sessions: () => tx<Session[]>('sessions', 'readonly', (st) => st.getAll()),

  addChunk: (c: Chunk) => tx('chunks', 'readwrite', (st) => st.add(c)),
  chunks: (sessionId: string) =>
    tx<Chunk[]>('chunks', 'readonly', (st) => st.index('bySession').getAll(IDBKeyRange.only(sessionId))),

  async deleteSession(id: string) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['sessions', 'chunks'], 'readwrite');
      t.objectStore('sessions').delete(id);
      const idx = t.objectStore('chunks').index('bySession');
      const cur = idx.openKeyCursor(IDBKeyRange.only(id));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { t.objectStore('chunks').delete(c.primaryKey); c.continue(); }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  sharedFiles: () => tx<SharedFile[]>('shared', 'readonly', (st) => st.getAll()),
  clearShared: () => tx('shared', 'readwrite', (st) => st.clear()),
};

/** Bittet den Browser, die Ablage nicht bei Speicherknappheit zu leeren. */
export async function persistStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch { return false; }
}
