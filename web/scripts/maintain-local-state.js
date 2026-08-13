// ==UserScript==
// @name         Storage Sync → local folder (File System Access)
// @namespace    local.storage-sync
// @version      2.0.1
// @description  Periodically snapshot localStorage, sessionStorage, cookies and IndexedDB straight into a folder you choose — no download prompts. Falls back to GM_download if no folder is granted.
// @author       you
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_cookie
// ==/UserScript==

/* eslint-disable no-console */
(function () {
  "use strict";

  /* =======================================================================
   * 1. CONFIGURATION
   * ===================================================================== */

  const CONFIG = {
    // Sub-folder created inside the folder you pick.
    // Final path: <your folder>/<root>/<website>/...
    root: "chrome-store",

    defaults: {
      intervalMinutes: 10,
      syncOnStart: true,
      keepHistory: true, // true -> timestamped files; false -> single file, overwritten in place
      splitFiles: false,
      onlyIfChanged: true,
      quiet: true,
      maxEntriesPerStore: 5000,
      maxBlobBytes: 1024 * 1024,
      capture: {
        localStorage: true,
        sessionStorage: true,
        cookies: true,
        indexedDB: true,
        cacheStorage: false,
      },
    },

    sites: [
      {
        match: (loc) =>
          loc.hostname === "coder-devesh-agarwal.github.io" &&
          loc.pathname.startsWith("/sanskrit-anki-decks"),
        folder: "sanskrit-anki-decks", // overrides the hostname as folder name
        intervalMinutes: 15,
        splitFiles: true,
        quiet: false,
      },

      // Catch-all (noisy):
      // { match: () => true },
    ],
  };

  /* =======================================================================
   * 2. SITE RESOLUTION
   * ===================================================================== */

  const SCRIPT_VERSION =
    (typeof GM_info !== "undefined" &&
      GM_info.script &&
      GM_info.script.version) ||
    "2.0.0";
  const HOST = location.hostname;
  const SITE = resolveSite();
  if (!SITE) return;

  function resolveSite() {
    for (const site of CONFIG.sites) {
      if (matches(site.match)) {
        return {
          ...CONFIG.defaults,
          ...site,
          capture: { ...CONFIG.defaults.capture, ...(site.capture || {}) },
        };
      }
    }
    return null;
  }

  function matches(m) {
    try {
      if (typeof m === "function") return !!m(location);
      if (m instanceof RegExp) return m.test(HOST);
      if (typeof m === "string") return HOST === m || HOST.endsWith("." + m);
    } catch (_) {}
    return false;
  }

  /* =======================================================================
   * 3. UTILITIES
   * ===================================================================== */

  // Our own IndexedDB database, used to persist the folder handle.
  // Excluded from snapshots so it never pollutes the dump.
  const HANDLE_DB = "__storage_sync_handles__";
  const HANDLE_STORE = "handles";

  const FOLDER = sanitize(SITE.folder || location.host);
  const KEY_LAST_HASH = "lasthash::" + FOLDER;
  const KEY_LAST_SYNC = "lastsync::" + FOLDER;
  const KEY_ENABLED = "enabled::" + FOLDER;

  function sanitize(s) {
    return (
      String(s)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\.+$/, "") || "unknown"
    );
  }

  function stamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++)
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16) + ":" + str.length;
  }

  function log(...a) {
    console.log("%c[storage-sync]", "color:#7c5cff", ...a);
  }

  function notify(text) {
    if (SITE.quiet) return;
    try {
      GM_notification({ title: "Storage Sync", text, timeout: 4000 });
    } catch (_) {}
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout: " + label)), ms),
      ),
    ]);
  }

  function reqp(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("IDB request failed"));
    });
  }

  /* =======================================================================
   * 4. FOLDER HANDLE STORAGE + PERMISSIONS
   * ===================================================================== */

  const FSA_SUPPORTED = typeof window.showDirectoryPicker === "function";
  let dirHandle = null;

  function openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
          req.result.createObjectStore(HANDLE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadHandle() {
    try {
      const db = await openHandleDB();
      try {
        const tx = db.transaction(HANDLE_STORE, "readonly");
        return await reqp(tx.objectStore(HANDLE_STORE).get(location.origin));
      } finally {
        db.close();
      }
    } catch (e) {
      log("could not load saved handle:", e);
      return null;
    }
  }

  async function saveHandle(handle) {
    const db = await openHandleDB();
    try {
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      await reqp(tx.objectStore(HANDLE_STORE).put(handle, location.origin));
    } finally {
      db.close();
    }
  }

  async function clearHandle() {
    const db = await openHandleDB();
    try {
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      await reqp(tx.objectStore(HANDLE_STORE).delete(location.origin));
    } finally {
      db.close();
    }
    dirHandle = null;
  }

  // 'granted' | 'prompt' | 'denied' | 'none'
  async function handleState(handle) {
    if (!handle) return "none";
    try {
      return await handle.queryPermission({ mode: "readwrite" });
    } catch (_) {
      return "denied";
    }
  }

  // Must be called from a user gesture.
  async function pickFolder() {
    if (!FSA_SUPPORTED) {
      alert(
        "This browser does not support the File System Access API.\nThe script will fall back to normal downloads.",
      );
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "storage-sync-root",
        mode: "readwrite",
        startIn: "downloads",
      });
      await saveHandle(handle);
      dirHandle = handle;
      hideBanner();
      log("folder granted:", handle.name);
      alert(
        `Folder "${handle.name}" is now the sync target for ${location.host}.\n\nSnapshots will be written to:\n${handle.name}/${CONFIG.root}/${FOLDER}/`,
      );
      sync("after-grant");
      return handle;
    } catch (e) {
      if (e && e.name === "AbortError") return null; // user cancelled
      console.error("[storage-sync] folder pick failed:", e);
      return null;
    }
  }

  // Re-requesting permission also needs a gesture.
  async function ensurePermission(handle) {
    const state = await handleState(handle);
    if (state === "granted") return true;
    if (state === "prompt") {
      try {
        return (
          (await handle.requestPermission({ mode: "readwrite" })) === "granted"
        );
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  /* =======================================================================
   * 5. ONE-TIME GRANT BANNER
   *    showDirectoryPicker() requires a user gesture, so on first run we
   *    show a small button instead of failing silently.
   * ===================================================================== */

  let banner = null;

  function showBanner(message, label) {
    if (banner || !FSA_SUPPORTED) return;
    banner = document.createElement("div");
    Object.assign(banner.style, {
      position: "fixed",
      zIndex: 2147483647,
      right: "16px",
      bottom: "16px",
      background: "#1c1b22",
      color: "#f2f2f5",
      font: "13px/1.45 system-ui, sans-serif",
      padding: "14px 16px",
      borderRadius: "10px",
      maxWidth: "300px",
      boxShadow: "0 8px 28px rgba(0,0,0,.45)",
      border: "1px solid #3a3945",
    });

    const text = document.createElement("div");
    text.textContent = message;
    text.style.marginBottom = "10px";

    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      background: "#7c5cff",
      color: "#fff",
      border: 0,
      borderRadius: "6px",
      padding: "7px 12px",
      cursor: "pointer",
      font: "inherit",
      fontWeight: 600,
    });
    btn.addEventListener("click", async () => {
      if (dirHandle && (await handleState(dirHandle)) === "prompt") {
        if (await ensurePermission(dirHandle)) {
          hideBanner();
          sync("after-grant");
          return;
        }
      }
      pickFolder();
    });

    const dismiss = document.createElement("button");
    dismiss.textContent = "Not now";
    Object.assign(dismiss.style, {
      background: "transparent",
      color: "#a5a4b0",
      border: 0,
      padding: "7px 10px",
      cursor: "pointer",
      font: "inherit",
    });
    dismiss.addEventListener("click", hideBanner);

    banner.append(text, btn, dismiss);
    document.body.appendChild(banner);
  }

  function hideBanner() {
    if (banner) {
      banner.remove();
      banner = null;
    }
  }

  /* =======================================================================
   * 6. VALUE ENCODER
   * ===================================================================== */

  async function encode(value, depth = 0, seen = new WeakSet()) {
    if (value === undefined) return { __t: "undefined" };
    if (value === null) return null;

    const t = typeof value;
    if (t === "string" || t === "boolean") return value;
    if (t === "number")
      return Number.isFinite(value)
        ? value
        : { __t: "Number", v: String(value) };
    if (t === "bigint") return { __t: "BigInt", v: value.toString() };
    if (t === "function")
      return { __t: "Function", v: value.name || "(anonymous)" };
    if (t === "symbol") return { __t: "Symbol", v: String(value) };
    if (depth > 12) return { __t: "MaxDepth" };

    if (value instanceof Date)
      return { __t: "Date", v: isNaN(value) ? null : value.toISOString() };
    if (value instanceof RegExp) return { __t: "RegExp", v: value.toString() };
    if (value instanceof Error)
      return {
        __t: "Error",
        name: value.name,
        message: value.message,
        stack: value.stack,
      };

    if (typeof Blob !== "undefined" && value instanceof Blob) {
      const meta = {
        __t:
          typeof File !== "undefined" && value instanceof File
            ? "File"
            : "Blob",
        name: value.name || undefined,
        type: value.type,
        size: value.size,
      };
      if (value.size > SITE.maxBlobBytes) {
        meta.skipped = "exceeds maxBlobBytes";
        return meta;
      }
      try {
        meta.base64 = await blobToBase64(value);
      } catch (e) {
        meta.error = String(e);
      }
      return meta;
    }

    if (value instanceof ArrayBuffer)
      return bufferOut("ArrayBuffer", value, value.byteLength);
    if (ArrayBuffer.isView(value)) {
      return bufferOut(
        value.constructor.name,
        value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ),
        value.byteLength,
      );
    }

    if (seen.has(value)) return { __t: "Circular" };
    seen.add(value);
    try {
      if (value instanceof Map) {
        const out = [];
        for (const [k, v] of value)
          out.push([
            await encode(k, depth + 1, seen),
            await encode(v, depth + 1, seen),
          ]);
        return { __t: "Map", v: out };
      }
      if (value instanceof Set) {
        const out = [];
        for (const v of value) out.push(await encode(v, depth + 1, seen));
        return { __t: "Set", v: out };
      }
      if (Array.isArray(value)) {
        const out = [];
        for (const v of value) out.push(await encode(v, depth + 1, seen));
        return out;
      }
      const out = {};
      for (const k of Object.keys(value)) {
        try {
          out[k] = await encode(value[k], depth + 1, seen);
        } catch (e) {
          out[k] = { __t: "EncodeError", v: String(e) };
        }
      }
      return out;
    } finally {
      seen.delete(value);
    }

    function bufferOut(kind, buf, len) {
      const meta = { __t: kind, byteLength: len };
      if (len > SITE.maxBlobBytes) {
        meta.skipped = "exceeds maxBlobBytes";
        return meta;
      }
      meta.base64 = bytesToBase64(new Uint8Array(buf));
      return meta;
    }
  }

  function bytesToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(r.error || new Error("FileReader failed"));
      r.readAsDataURL(blob);
    });
  }

  /* =======================================================================
   * 7. COLLECTORS
   * ===================================================================== */

  function dumpWebStorage(store) {
    const out = {};
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        out[k] = store.getItem(k);
      }
    } catch (e) {
      return { __error: String(e) };
    }
    return out;
  }

  function cookiesFromDocument() {
    const out = [];
    if (!document.cookie) return out;
    for (const part of document.cookie.split("; ")) {
      const i = part.indexOf("=");
      out.push({
        name: i === -1 ? part : part.slice(0, i),
        value: i === -1 ? "" : safeDecode(part.slice(i + 1)),
        source: "document.cookie",
      });
    }
    return out;
  }

  function safeDecode(v) {
    try {
      return decodeURIComponent(v);
    } catch (_) {
      return v;
    }
  }

  function cookiesViaGM() {
    return new Promise((resolve) => {
      if (
        typeof GM_cookie === "undefined" ||
        typeof GM_cookie.list !== "function"
      )
        return resolve(null);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 5000);
      try {
        GM_cookie.list({ url: location.href }, (cookies, error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(
            error
              ? null
              : (cookies || []).map((c) => ({ ...c, source: "GM_cookie" })),
          );
        });
      } catch (_) {
        clearTimeout(timer);
        settled = true;
        resolve(null);
      }
    });
  }

  async function dumpCookies() {
    const viaGM = await cookiesViaGM();
    if (viaGM)
      return { method: "GM_cookie (includes HttpOnly)", cookies: viaGM };
    return {
      method: "document.cookie (HttpOnly cookies NOT included)",
      cookies: cookiesFromDocument(),
    };
  }

  async function dumpIndexedDB() {
    if (!("indexedDB" in window)) return { __error: "indexedDB unavailable" };
    if (typeof indexedDB.databases !== "function")
      return { __error: "indexedDB.databases() unsupported" };

    let list;
    try {
      list = await withTimeout(
        indexedDB.databases(),
        10000,
        "indexedDB.databases",
      );
    } catch (e) {
      return { __error: String(e) };
    }

    const out = {};
    for (const info of list) {
      if (!info || !info.name) continue;
      if (info.name === HANDLE_DB) continue; // never dump our own bookkeeping DB
      try {
        out[info.name] = await withTimeout(
          dumpDatabase(info.name),
          60000,
          "db:" + info.name,
        );
      } catch (e) {
        out[info.name] = { __error: String(e) };
      }
    }
    return out;
  }

  async function dumpDatabase(name) {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("open failed"));
      req.onblocked = () => reject(new Error("open blocked"));
      req.onupgradeneeded = () => {
        try {
          req.transaction.abort();
        } catch (_) {}
        reject(new Error("database did not exist"));
      };
    });

    try {
      const result = { version: db.version, stores: {} };
      for (const storeName of Array.from(db.objectStoreNames)) {
        try {
          result.stores[storeName] = await dumpStore(db, storeName);
        } catch (e) {
          result.stores[storeName] = { __error: String(e) };
        }
      }
      return result;
    } finally {
      try {
        db.close();
      } catch (_) {}
    }
  }

  async function dumpStore(db, storeName) {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const meta = {
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      indexes: Array.from(store.indexNames).map((n) => {
        const ix = store.index(n);
        return {
          name: ix.name,
          keyPath: ix.keyPath,
          unique: ix.unique,
          multiEntry: ix.multiEntry,
        };
      }),
    };

    const limit = SITE.maxEntriesPerStore;
    const [keys, values] = await Promise.all([
      reqp(store.getAllKeys(null, limit)),
      reqp(store.getAll(null, limit)),
    ]);

    const records = [];
    for (let i = 0; i < keys.length; i++) {
      records.push({
        key: await encode(keys[i]),
        value: await encode(values[i]),
      });
    }
    return {
      ...meta,
      count: records.length,
      truncated: records.length >= limit,
      records,
    };
  }

  async function dumpCacheStorage() {
    if (!("caches" in window)) return { __error: "CacheStorage unavailable" };
    try {
      const out = {};
      for (const n of await caches.keys()) {
        const cache = await caches.open(n);
        const reqs = await cache.keys();
        out[n] = reqs
          .slice(0, 2000)
          .map((r) => ({ url: r.url, method: r.method }));
      }
      return out;
    } catch (e) {
      return { __error: String(e) };
    }
  }

  /* =======================================================================
   * 8. WRITERS
   * ===================================================================== */

  // Walks/creates a nested path inside the granted folder.
  async function resolveDir(root, segments) {
    let dir = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(sanitize(seg), { create: true });
    }
    return dir;
  }

  async function writeViaFSA(relativePath, text) {
    const parts = relativePath.split("/");
    const filename = parts.pop();
    const dir = await resolveDir(dirHandle, parts);
    const fileHandle = await dir.getFileHandle(sanitize(filename), {
      create: true,
    });
    const writable = await fileHandle.createWritable(); // truncates -> real overwrite
    try {
      await writable.write(text);
    } finally {
      await writable.close();
    }
  }

  function writeViaDownload(relativePath, text) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const done = (fn) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
        fn();
      };
      try {
        GM_download({
          url,
          name: relativePath,
          saveAs: false,
          onload: () => done(resolve),
          onerror: (e) =>
            done(() => reject(new Error("GM_download: " + JSON.stringify(e)))),
          ontimeout: () => done(() => reject(new Error("GM_download timeout"))),
        });
      } catch (e) {
        done(() => reject(e));
      }
    });
  }

  async function writeFile(relativePath, text) {
    if (dirHandle && (await handleState(dirHandle)) === "granted") {
      await writeViaFSA(relativePath, text);
      return "filesystem";
    }
    await writeViaDownload(relativePath, text);
    return "download";
  }

  /* =======================================================================
   * 9. SNAPSHOT ORCHESTRATION
   * ===================================================================== */

  let running = false;

  async function buildSnapshot() {
    const cap = SITE.capture;
    const data = {};
    if (cap.localStorage)
      data.localStorage = dumpWebStorage(window.localStorage);
    if (cap.sessionStorage)
      data.sessionStorage = dumpWebStorage(window.sessionStorage);
    if (cap.cookies) data.cookies = await dumpCookies();
    if (cap.indexedDB) data.indexedDB = await dumpIndexedDB();
    if (cap.cacheStorage) data.cacheStorage = await dumpCacheStorage();
    return data;
  }

  async function sync(reason) {
    if (running) {
      log("sync in progress, skipping");
      return;
    }
    if (GM_getValue(KEY_ENABLED, true) === false) {
      log("disabled for this site");
      return;
    }

    // If the folder isn't usable yet, prompt once instead of silently downloading.
    if (FSA_SUPPORTED) {
      const state = await handleState(dirHandle);
      if (state !== "granted") {
        showBanner(
          state === "prompt"
            ? "Storage Sync needs you to re-confirm access to the sync folder."
            : "Storage Sync needs a folder to save snapshots into.",
          state === "prompt" ? "Re-allow folder" : "Choose folder",
        );
        if (state === "prompt" || state === "none") return; // wait for the click
      }
    }

    const last = Number(GM_getValue(KEY_LAST_SYNC, 0));
    const minGap = SITE.intervalMinutes * 60000 * 0.9;
    if (reason === "interval" && last && Date.now() - last < minGap) {
      log("another tab synced recently, skipping");
      return;
    }

    running = true;
    const t0 = performance.now();
    try {
      const data = await buildSnapshot();
      const body = JSON.stringify(data);
      const digest = hash(body);

      if (SITE.onlyIfChanged && GM_getValue(KEY_LAST_HASH, "") === digest) {
        log("unchanged since last snapshot — nothing written");
        GM_setValue(KEY_LAST_SYNC, Date.now());
        return;
      }

      const now = new Date();
      const meta = {
        capturedAt: now.toISOString(),
        url: location.href,
        origin: location.origin,
        host: location.host,
        title: document.title,
        userAgent: navigator.userAgent,
        reason,
        scriptVersion: SCRIPT_VERSION,
        contentHash: digest,
      };

      const base = `${CONFIG.root}/${FOLDER}`;
      const ts = stamp(now);
      let via = "download";

      if (SITE.splitFiles) {
        const dir = SITE.keepHistory ? `${base}/${ts}` : base;
        via = await writeFile(
          `${dir}/_meta.json`,
          JSON.stringify(meta, null, 2),
        );
        for (const [name, value] of Object.entries(data)) {
          await writeFile(
            `${dir}/${name}.json`,
            JSON.stringify(value, null, 2),
          );
        }
      } else {
        const file = SITE.keepHistory
          ? `${base}/${ts}_snapshot.json`
          : `${base}/snapshot.json`;
        via = await writeFile(file, JSON.stringify({ meta, data }, null, 2));
      }

      GM_setValue(KEY_LAST_HASH, digest);
      GM_setValue(KEY_LAST_SYNC, Date.now());

      const ms = Math.round(performance.now() - t0);
      log(
        `snapshot written via ${via} → ${base}/ (${(body.length / 1024).toFixed(1)} KB, ${ms}ms)`,
      );
      notify(
        `${FOLDER}: saved ${(body.length / 1024).toFixed(1)} KB via ${via}`,
      );
    } catch (e) {
      console.error("[storage-sync] failed:", e);
      notify("Snapshot failed: " + e.message);
    } finally {
      running = false;
    }
  }

  /* =======================================================================
   * 10. STARTUP + MENU
   * ===================================================================== */

  (async function init() {
    if (FSA_SUPPORTED) {
      dirHandle = await loadHandle();
      const state = await handleState(dirHandle);
      log(
        `folder handle: ${dirHandle ? dirHandle.name : "(none)"} — permission: ${state}`,
      );
    } else {
      log("File System Access API unavailable — using downloads");
    }

    if (SITE.syncOnStart) setTimeout(() => sync("startup"), 3000);
    setInterval(
      () => sync("interval"),
      Math.max(1, SITE.intervalMinutes) * 60000,
    );
  })();

  try {
    GM_registerMenuCommand("📁 Choose / change sync folder", () =>
      pickFolder(),
    );
    GM_registerMenuCommand("📥 Sync storage now", () => sync("manual"));
    GM_registerMenuCommand("🔁 Force sync (ignore change check)", () => {
      GM_setValue(KEY_LAST_HASH, "");
      GM_setValue(KEY_LAST_SYNC, 0);
      sync("manual-force");
    });
    GM_registerMenuCommand("⏯️ Toggle sync for this site", () => {
      const next = GM_getValue(KEY_ENABLED, true) === false;
      GM_setValue(KEY_ENABLED, next);
      alert(
        `Storage Sync is now ${next ? "ENABLED" : "DISABLED"} for ${location.host}`,
      );
    });
    GM_registerMenuCommand("🗑️ Forget sync folder", async () => {
      await clearHandle();
      alert("Folder forgotten. Pick a new one from the menu.");
    });
    GM_registerMenuCommand("ℹ️ Status", async () => {
      const last = Number(GM_getValue(KEY_LAST_SYNC, 0));
      const state = await handleState(dirHandle);
      alert(
        `Site:       ${location.host}\n` +
          `Folder:     ${dirHandle ? dirHandle.name : "(not chosen)"}/${CONFIG.root}/${FOLDER}/\n` +
          `Permission: ${state}\n` +
          `Mode:       ${state === "granted" ? "direct file write (no prompts)" : "download fallback"}\n` +
          `Enabled:    ${GM_getValue(KEY_ENABLED, true) !== false}\n` +
          `Interval:   every ${SITE.intervalMinutes} min\n` +
          `Capturing:  ${
            Object.entries(SITE.capture)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "nothing"
          }\n` +
          `Last sync:  ${last ? new Date(last).toLocaleString() : "never"}`,
      );
    });
  } catch (_) {}

  log(
    `active on ${location.host} → ${CONFIG.root}/${FOLDER}/ every ${SITE.intervalMinutes} min`,
  );
})();
