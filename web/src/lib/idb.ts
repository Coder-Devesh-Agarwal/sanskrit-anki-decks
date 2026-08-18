// Minimal IndexedDB key→string store. No dependency, no schema beyond one
// object store: the app's persistence needs are plain JSON blobs (one per
// deck, plus settings and the tag history), just far past what localStorage's
// ~5 MB origin budget can hold.
//
// The folder-backup handle lives in its OWN database (lib/folderBackup.ts) —
// handles are not JSON, and mixing them here would drag that store into every
// hydration read.

const DB_NAME = "shabdasiddhi";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open must not be cached as a permanent "no database" verdict:
  // private-mode / storage-pressure failures can clear on a later attempt.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Every stored entry, as one map — the whole hydration read. */
export async function idbGetAll(): Promise<Map<string, string>> {
  const db = await openDb();
  return new Promise<Map<string, string>>((resolve, reject) => {
    const out = new Map<string, string>();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      if (typeof cursor.value === "string") out.set(String(cursor.key), cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function idbSet(key: string, value: string): Promise<unknown> {
  return run("readwrite", (store) => store.put(value, key));
}

export function idbDelete(key: string): Promise<unknown> {
  return run("readwrite", (store) => store.delete(key));
}
