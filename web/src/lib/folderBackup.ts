// Local-folder backup via the File System Access API — the in-app equivalent
// of scripts/maintain-local-state.js, scoped to what this app actually has:
// every deck's cards + settings, written straight to a folder the user picks
// (no download prompts, no browser extension). No writes happen until a
// folder is granted from a real user click; auto-backup then runs silently.
//
// Folder handle is cached in this origin's own IndexedDB (not shabdasiddhi's
// localStorage — handles aren't JSON-serializable) so the grant survives
// reloads. Chrome/Edge only (`showDirectoryPicker`) — Firefox/Safari fall
// back to the existing manual Export JSON.

import { exportAllJson } from "../store/cards";

// Minimal ambient shape — the File System Access API isn't in every TS DOM lib yet.
interface FsDirHandle {
  name: string;
  queryPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
}
interface FsFileHandle {
  createWritable(): Promise<FsWritable>;
}
interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
type PermissionState = "granted" | "prompt" | "denied";
export type BackupPermission = PermissionState | "none";

const DB_NAME = "shabdasiddhi-backup";
const STORE = "handles";
const HANDLE_KEY = "dir";
const BACKUP_DIR = "shabdasiddhi-backup";

export const FSA_SUPPORTED =
  typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

let dirHandle: FsDirHandle | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadHandle(): Promise<FsDirHandle | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(HANDLE_KEY);
        req.onsuccess = () => resolve((req.result as FsDirHandle) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function saveHandle(handle: FsDirHandle): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function clearHandleStore(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function stateOf(handle: FsDirHandle | null): Promise<BackupPermission> {
  if (!handle) return "none";
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
}

export interface BackupStatus {
  name: string | null;
  state: BackupPermission;
}

// Restores a previously granted handle from IndexedDB. Call once on startup —
// queryPermission() never needs a user gesture, so this is always safe.
export async function initBackupHandle(): Promise<BackupStatus> {
  if (!FSA_SUPPORTED) return { name: null, state: "none" };
  dirHandle = await loadHandle();
  return { name: dirHandle?.name ?? null, state: await stateOf(dirHandle) };
}

// Must be called from a user gesture (a button click).
export async function pickBackupFolder(): Promise<BackupStatus> {
  if (!FSA_SUPPORTED) throw new Error("This browser can't save straight to a folder — use Export JSON instead.");
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FsDirHandle> }).showDirectoryPicker;
  const handle = await picker({ id: "shabdasiddhi-backup", mode: "readwrite" });
  await saveHandle(handle);
  dirHandle = handle;
  return { name: handle.name, state: await stateOf(handle) };
}

// Re-requesting permission also needs a gesture (e.g. a "Re-allow" click).
export async function reauthorizeBackupFolder(): Promise<BackupPermission> {
  if (!dirHandle) return "none";
  try {
    return await dirHandle.requestPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
}

export async function forgetBackupFolder(): Promise<void> {
  await clearHandleStore();
  dirHandle = null;
}

export async function backupStatus(): Promise<BackupStatus> {
  return { name: dirHandle?.name ?? null, state: await stateOf(dirHandle) };
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Writes the current full snapshot as a timestamped file (history) and as
// `latest.json` (a stable name you can hand straight back to Import JSON).
export async function backupNow(): Promise<{ bytes: number; file: string }> {
  if (!dirHandle) throw new Error("No backup folder chosen.");
  if ((await stateOf(dirHandle)) !== "granted")
    throw new Error("Backup folder permission not granted — re-allow it in Settings.");
  const root = await dirHandle.getDirectoryHandle(BACKUP_DIR, { create: true });
  const text = exportAllJson();
  const file = `${stamp()}.json`;
  for (const name of [file, "latest.json"]) {
    const fh = await root.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try {
      await w.write(text);
    } finally {
      await w.close();
    }
  }
  return { bytes: text.length, file };
}

// ---- interval scheduler ----

let timer: ReturnType<typeof setInterval> | null = null;

export function stopAutoBackup(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// Runs backupNow() every `minutes`. Silently skips a tick if the folder
// isn't currently granted (never re-prompts without a gesture) or a run is
// already in flight; `onResult` fires after every attempted tick.
export function startAutoBackup(
  minutes: number,
  onResult: (r: { ok: true; file: string } | { ok: false; error: string }) => void,
): void {
  stopAutoBackup();
  let running = false;
  const tick = async () => {
    if (running || (await stateOf(dirHandle)) !== "granted") return;
    running = true;
    try {
      const { file } = await backupNow();
      onResult({ ok: true, file });
    } catch (e) {
      onResult({ ok: false, error: String(e) });
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, Math.max(1, minutes) * 60_000);
}
