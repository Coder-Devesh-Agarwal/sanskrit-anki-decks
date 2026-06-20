import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { loadSutras } from "./data/sutras";
import { loadGlosses } from "./data/glosses";
import { useSettings, patchSettings } from "./store/settings";
import { FONT_FACES } from "./anki/template";
import { TranslitPalette } from "./components/TranslitPalette";

export function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { baseFontSize, theme } = useSettings();

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
  const { deckName, decks } = useSettings();
  const NEW = "__new__";
  function onChange(v: string) {
    if (v === NEW) {
      const name = prompt("New deck name")?.trim();
      if (!name) return;
      const decksNext = decks.includes(name) ? decks : [...decks, name];
      patchSettings({ decks: decksNext, deckName: name });
    } else {
      patchSettings({ deckName: v });
    }
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className="hidden sm:inline">Deck</span>
      <select
        value={deckName}
        onChange={(e) => onChange(e.target.value)}
        title="Active deck"
        className="dev rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
      >
        {decks.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
        <option value={NEW}>＋ New deck…</option>
      </select>
    </label>
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
