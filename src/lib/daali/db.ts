// ─── IndexedDB wrapper — lightweight, promise-based, zero dependencies ──────

const DB_NAME = 'daali-register';
const DB_VERSION = 1;
export const STORE_EVENTS = 'events';
export const STORE_ENTRIES = 'entries';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        store.createIndex('eventId', 'eventId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        let request: IDBRequest<T> | void;
        try {
          request = run(store);
        } catch {
          // ignore synchronous run errors, transaction will abort
        }
        t.oncomplete = () => resolve(request && 'result' in request ? (request.result as T) : undefined);
        t.onerror = () => reject(t.error ?? new Error('IDB transaction failed'));
        t.onabort = () => reject(t.error ?? new Error('IDB transaction aborted'));
      })
  );
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const res = await tx<T[]>(storeName, 'readonly', (s) => s.getAll());
    return res ?? [];
  } catch {
    return [];
  }
}

export async function idbGetAllByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
  try {
    return await openDB().then(
      (db) =>
        new Promise<T[]>((resolve, reject) => {
          const t = db.transaction(storeName, 'readonly');
          const idx = t.objectStore(storeName).index(indexName);
          const req = idx.getAll(value);
          t.oncomplete = () => resolve((req.result as T[]) ?? []);
          t.onerror = () => reject(t.error);
        })
    );
  } catch {
    return [];
  }
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  await tx(storeName, 'readwrite', (s) => s.put(value as unknown as Record<string, unknown>));
}

export async function idbPutMany<T>(storeName: string, values: T[]): Promise<void> {
  if (!values.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(storeName, 'readwrite');
        const store = t.objectStore(storeName);
        for (const v of values) store.put(v as unknown as Record<string, unknown>);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      })
  );
}

export async function idbDelete(storeName: string, key: string): Promise<void> {
  await tx(storeName, 'readwrite', (s) => s.delete(key));
}

export async function idbClear(storeName: string): Promise<void> {
  await tx(storeName, 'readwrite', (s) => s.clear());
}

// Fallback flag — if IndexedDB is unavailable we still let the app run in-memory
export async function checkIdbAvailable(): Promise<boolean> {
  try {
    await openDB();
    return true;
  } catch {
    return false;
  }
}
