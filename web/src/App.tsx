import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { loadSutras } from "./data/sutras";
import { loadGlosses } from "./data/glosses";
import {
  useSettings,
  patchSettings,
  setDeckMeta,
  loadSettings,
  type DeckType,
} from "./store/settings";
import { FONT_FACES } from "./anki/template";
import { TranslitPalette } from "./components/TranslitPalette";
import { initBackupHandle, startAutoBackup, stopAutoBackup, backupNow } from "./lib/folderBackup";

export function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { baseFontSize, theme, backupEnabled, backupIntervalMinutes } = useSettings();

  useEffect(() => {
    // Glosses are optional — never block the app on them.
    loadSutras()
      .then(() => loadGlosses().catch(() => {}))
      .then(() => setReady(true))
      .catch((e) => setErr(String(e)));
  }, []);

  // Base font size drives every rem-based size across the app.
  useEffect(() => {
    document.documentElement.style.fontSize = `${baseFontSize}px`;
  }, [baseFontSize]);

  // Theme toggles a class on <html>; index.css remaps the slate palette under it.
  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light");
  }, [theme]);

  // Local-folder auto-backup (Settings → "Local folder backup"). Re-hydrates
  // the granted folder handle from IndexedDB, then starts/stops the interval
  // timer as the setting changes; skips silently (no re-prompt) if the
  // browser doesn't support it or permission hasn't been (re-)granted yet.
  useEffect(() => {
    let cancelled = false;
    initBackupHandle().then(({ state }) => {
      if (cancelled || !backupEnabled) return;
      if (state === "granted") backupNow().then(() => patchSettings({ lastBackupAt: Date.now() })).catch(() => {});
      startAutoBackup(backupIntervalMinutes, (r) => {
        if (r.ok) patchSettings({ lastBackupAt: Date.now() });
      });
    });
    if (!backupEnabled) stopAutoBackup();
    return () => {
      cancelled = true;
      stopAutoBackup();
    };
  }, [backupEnabled, backupIntervalMinutes]);

  // Inject Adishila Vedic @font-face with base-aware URLs (works on GitHub Pages).
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const css = FONT_FACES.map(
      (f) =>
        `@font-face{font-family:'Adishila Vedic';src:url('${base}fonts/AdishilaVedic/${f.src}') format('truetype');font-weight:${f.weight};font-style:${f.style};font-display:swap}`,
    ).join("\n");
    const el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
    return () => {
      document.head.removeChild(el);
    };
  }, []);

  return (
    <div className="min-h-full">
      <TranslitPalette />
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="dev text-lg font-semibold text-sky-300">
            ज्ञान-सिद्धि
          </span>
          <nav className="flex gap-1 text-sm">
            <Tab to="/" label="Cards" end />
            <Tab to="/settings" label="Settings" />
          </nav>
          <NewCardMenu />
          <span className="flex-1" />
          <DeckPicker />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {err && (
          <div className="rounded border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">
            Failed to load sūtra data: {err}
          </div>
        )}
        {!ready && !err ? (
          <div className="text-slate-400">Loading sūtra data…</div>
        ) : (
          ready && <Outlet />
        )}
      </main>
    </div>
  );
}

function NewCardMenu() {
  const nav = useNavigate();
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value)
          nav(`/author?type=${e.target.value}`, { replace: true });
        if (window) window?.location?.reload();
      }}
      title="Create a new card"
      className="rounded border border-slate-700 bg-sky-600 px-2 py-1 text-sm font-medium text-white outline-none hover:bg-sky-500"
    >
      <option value="">＋ New card…</option>
      <option value="astadhyayi">Aṣṭādhyāyī (śabda-siddhi)</option>
      <option value="generic">Generic (book)</option>
    </select>
  );
}

function DeckPicker() {
  const { deckName, decks, deckMeta } = useSettings();
  const [creating, setCreating] = useState(false);
  const NEW = "__new__";

  // Display order: top-level decks (default/composite/orphaned subs), each
  // composite immediately followed by its sub decks.
  const subsOf = (p: string) =>
    decks.filter((d) => deckMeta[d]?.type === "sub" && deckMeta[d]?.parent === p);
  const ordered = decks
    .filter((d) => {
      const m = deckMeta[d];
      return m?.type !== "sub" || !m.parent || !decks.includes(m.parent);
    })
    .flatMap((d) => [d, ...subsOf(d)]);

  function label(d: string) {
    const m = deckMeta[d];
    if (m?.type === "sub" && m.parent && decks.includes(m.parent))
      return `  ↳ ${d}`;
    if (m?.type === "composite") return `${d} (composite)`;
    return d;
  }

  function onChange(v: string) {
    if (v === NEW) setCreating(true);
    else patchSettings({ deckName: v });
  }

  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="hidden sm:inline">Deck</span>
        <select
          value={deckName}
          onChange={(e) => onChange(e.target.value)}
          title="Active deck"
          className="dev rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
        >
          {ordered.map((d) => (
            <option key={d} value={d}>
              {label(d)}
            </option>
          ))}
          <option value={NEW}>＋ New deck…</option>
        </select>
      </label>
      {creating && <NewDeckDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function NewDeckDialog({ onClose }: { onClose: () => void }) {
  const { decks, deckMeta } = useSettings();
  const composites = decks.filter((d) => deckMeta[d]?.type === "composite");
  const [name, setName] = useState("");
  const [type, setType] = useState<DeckType>("default");
  const [parent, setParent] = useState(composites[0] ?? "");

  function create() {
    const n = name.trim();
    if (!n) return;
    const s = loadSettings();
    if (type === "sub" && parent) setDeckMeta(n, { type: "sub", parent });
    else setDeckMeta(n, { type });
    const decksNext = s.decks.includes(n) ? s.decks : [...s.decks, n];
    patchSettings({ decks: decksNext, deckName: n });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-80 space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-slate-200">New deck</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Deck name"
          className="dev w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
        />
        <div className="space-y-1">
          <span className="block text-xs text-slate-400">Deck type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DeckType)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
          >
            <option value="default">Independent (default)</option>
            <option value="composite">Composite (can hold sub decks)</option>
            <option value="sub" disabled={composites.length === 0}>
              Sub deck of a composite
              {composites.length === 0 ? " — no composite decks yet" : ""}
            </option>
          </select>
        </div>
        {type === "sub" && composites.length > 0 && (
          <div className="space-y-1">
            <span className="block text-xs text-slate-400">
              Parent composite deck (syncs to Anki as “parent::name”)
            </span>
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className="dev w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
            >
              {composites.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!name.trim()}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function Tab({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 ${isActive ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`
      }
    >
      {label}
    </NavLink>
  );
}
