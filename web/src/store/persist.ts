// Durable storage behind the card + settings stores.
//
// IndexedDB is the persistent layer; a synchronous in-memory mirror sits in
// front of it so the store API (listCards, loadSettings, …) stays synchronous
// and every existing call site keeps working. Reads hit the mirror; writes
// update the mirror immediately and are flushed to IndexedDB on a serialized
// promise chain.
//
// Why not localStorage: it caps an origin at roughly 5 MB, which the generated
// Aṣṭādhyāyī reference decks (~14 MB each) blow past on import. IndexedDB has
// no such practical ceiling.
//
// hydrate() MUST resolve before the app renders (main.tsx awaits it), else the
// first synchronous read would see an empty mirror.

import { idbAvailable, idbDelete, idbGetAll, idbSet } from "../lib/idb";

/** every key this app owns starts with it — the migration scan relies on that */
const APP_PREFIX = "shabdasiddhi.";
/** set once the localStorage → IndexedDB copy has run, so it never repeats */
const MIGRATED_KEY = "shabdasiddhi.migrated-to-idb";

const mirror = new Map<string, string>();
let hydrated = false;
/** IndexedDB unusable (private mode, blocked storage) → keep using localStorage */
let fallbackToLocalStorage = false;
let queue: Promise<unknown> = Promise.resolve();

function warn(what: string, e: unknown): void {
  console.warn(`[persist] ${what} failed:`, e);
}

// Writes are fire-and-forget for callers but strictly ordered between
// themselves, so two saves of the same key can't land out of order.
function enqueue(op: () => Promise<unknown>): void {
  queue = queue.then(op).catch((e) => warn("write", e));
}

function localStorageEntries(): [string, string][] {
  const out: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(APP_PREFIX)) continue;
      const v = localStorage.getItem(k);
      if (v !== null) out.push([k, v]);
    }
  } catch (e) {
    warn("localStorage scan", e);
  }
  return out;
}

// One-time copy of a pre-IndexedDB profile. The localStorage copy is left in
// place (harmless, and a safety net if this build is rolled back) — it is
// simply never written to again.
function migrateFromLocalStorage(): void {
  const entries = localStorageEntries();
  for (const [k, v] of entries) if (!mirror.has(k)) mirror.set(k, v);
  mirror.set(MIGRATED_KEY, String(Date.now()));
  if (!fallbackToLocalStorage) {
    for (const [k] of entries) enqueue(() => idbSet(k, mirror.get(k) ?? ""));
    enqueue(() => idbSet(MIGRATED_KEY, mirror.get(MIGRATED_KEY) ?? ""));
  }
  if (entries.length) console.info(`[persist] migrated ${entries.length} keys to IndexedDB`);
}

/** Load everything into the mirror. Idempotent; call once, before render. */
export async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (idbAvailable()) {
    try {
      for (const [k, v] of await idbGetAll()) mirror.set(k, v);
    } catch (e) {
      warn("hydrate", e);
      fallbackToLocalStorage = true;
    }
  } else {
    fallbackToLocalStorage = true;
  }
  if (fallbackToLocalStorage) {
    for (const [k, v] of localStorageEntries()) mirror.set(k, v);
  } else if (!mirror.has(MIGRATED_KEY)) {
    migrateFromLocalStorage();
  }
  hydrated = true;

  // Best-effort: ask the browser not to evict this origin under pressure. No
  // prompt in Chrome/Edge (granted on engagement), ignored elsewhere.
  navigator.storage?.persist?.().catch(() => {});
}

export function isHydrated(): boolean {
  return hydrated;
}

export function readValue(key: string): string | null {
  return mirror.get(key) ?? null;
}

export function writeValue(key: string, value: string): void {
  mirror.set(key, value);
  if (fallbackToLocalStorage) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      warn("localStorage write", e);
    }
    return;
  }
  enqueue(() => idbSet(key, value));
}

export function removeValue(key: string): void {
  mirror.delete(key);
  if (fallbackToLocalStorage) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      warn("localStorage remove", e);
    }
    return;
  }
  enqueue(() => idbDelete(key));
}

/** Keys currently held, for prefix scans (deck discovery). */
export function keys(): string[] {
  return [...mirror.keys()];
}

/** Resolves once every queued write has landed (tests, "safe to close" checks). */
export function flush(): Promise<void> {
  return queue.then(
    () => undefined,
    () => undefined,
  );
}
