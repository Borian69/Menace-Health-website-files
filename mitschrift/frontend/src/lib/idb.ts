// IndexedDB ohne Bibliothek.
// - sessions/chunks: laufende Aufnahmen, Block für Block gesichert
// - shared: von einer anderen App geteilte Dateien (Android, Service Worker)
// - projekte/aufnahmen/audio/tparts/llmcache/llmcalls: Projektdaten im
//   Gerätebetrieb (ohne eigenen Server)

export type SessionState =
  | 'aufnahme'      // läuft (oder lief, als die App zuletzt geschlossen wurde)
  | 'pausiert'
  | 'unterbrochen'  // Mikrofon wurde vom System beendet
  | 'beendet'       // gestoppt, wartet aufs Speichern
  | 'upload';       // Speichern läuft oder ist fehlgeschlagen

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  state: SessionState;
  mime: string;
  durationMs: number;   // tatsächlich aufgenommene Zeit
  segments: number;     // Zahl der Teilstücke
  segDur?: number[];    // Dauer je Teilstück in ms
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
const VERSION = 2;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      const neu = (name: string, opts: IDBObjectStoreParameters, index?: [string, string]) => {
        if (db.objectStoreNames.contains(name)) return;
        const s = db.createObjectStore(name, opts);
        if (index) s.createIndex(index[0], index[1]);
      };
      neu('sessions', { keyPath: 'id' });
      neu('chunks', { keyPath: 'id', autoIncrement: true }, ['bySession', 'sessionId']);
      neu('shared', { keyPath: 'id', autoIncrement: true });
      neu('projekte', { keyPath: 'id' });
      neu('aufnahmen', { keyPath: 'id' }, ['byProjekt', 'project_id']);
      neu('audio', { keyPath: 'key' }, ['byAufnahme', 'recId']);
      neu('tparts', { keyPath: 'key' }, ['byAufnahme', 'recId']);
      neu('llmcache', { keyPath: 'key' });
      neu('llmcalls', { keyPath: 'id', autoIncrement: true }, ['byProjekt', 'project_id']);
    };
    r.onblocked = () => console.warn('IndexedDB: ein anderer Tab blockiert das Update');
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => { dbPromise = null; reject(r.error); };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result: T;
    const req = fn(t.objectStore(store));
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('IndexedDB abgebrochen'));
  }));
}

/** Allgemeine Zugriffe für die Projektdaten. */
export const store = {
  get: <T>(s: string, key: IDBValidKey) => tx<T | undefined>(s, 'readonly', (st) => st.get(key)),
  put: (s: string, value: unknown) => tx(s, 'readwrite', (st) => st.put(value)),
  add: (s: string, value: unknown) => tx(s, 'readwrite', (st) => st.add(value)),
  del: (s: string, key: IDBValidKey) => tx(s, 'readwrite', (st) => st.delete(key)),
  all: <T>(s: string) => tx<T[]>(s, 'readonly', (st) => st.getAll()),
  byIndex: <T>(s: string, index: string, value: IDBValidKey) =>
    tx<T[]>(s, 'readonly', (st) => st.index(index).getAll(IDBKeyRange.only(value))),
  async delByIndex(s: string, index: string, value: IDBValidKey) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(s, 'readwrite');
      const cur = t.objectStore(s).index(index).openKeyCursor(IDBKeyRange.only(value));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { t.objectStore(s).delete(c.primaryKey); c.continue(); }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

export const idb = {
  putSession: (s: Session) => tx('sessions', 'readwrite', (st) => st.put({ ...s, updatedAt: Date.now() })),
  getSession: (id: string) => tx<Session | undefined>('sessions', 'readonly', (st) => st.get(id)),
  sessions: () => tx<Session[]>('sessions', 'readonly', (st) => st.getAll()),

  addChunk: (c: Chunk) => tx('chunks', 'readwrite', (st) => st.add(c)),
  chunks: (sessionId: string) =>
    tx<Chunk[]>('chunks', 'readonly', (st) => st.index('bySession').getAll(IDBKeyRange.only(sessionId))),

  async deleteSession(id: string) {
    await store.delByIndex('chunks', 'bySession', id);
    await store.del('sessions', id);
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
