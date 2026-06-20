import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import {
  listCards,
  deleteCard,
  duplicateCard,
  downloadJson,
  importJson,
  deckOf,
  type Card,
} from "../store/cards";
import { loadSettings, patchSettings, useSettings } from "../store/settings";
import { syncCards, fetchCards } from "../anki/ankiConnect";

// Canonical study layout. The Anki note template (anki/template.ts) reproduces
// this same structure/behaviour. Card text fields hold rich HTML produced by the
// RichEditor, so they are rendered as HTML.

function Rich({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`rich-html ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function plain(html: string): string {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function Decklist() {
  const nav = useNavigate();
  const { deckName } = useSettings();
  const [allCards, setAllCards] = useState<Card[]>(() => listCards());
  const cards = useMemo(
    () => allCards.filter((c) => deckOf(c) === deckName),
    [allCards, deckName],
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<
    "updated" | "created" | "question" | "direction"
  >("updated");
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setAllCards(listCards());
  }

  // tags present on the current cards, for the filter row
  const allTags = useMemo(
    () => Array.from(new Set(cards.flatMap((c) => c.tags))).sort(),
    [cards],
  );

  function toggleTag(t: string) {
    setActiveTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  // tag filter first (must have ALL active tags), then fuzzy search via Fuse
  const tagFiltered = useMemo(
    () =>
      activeTags.length
        ? cards.filter((c) => activeTags.every((t) => c.tags.includes(t)))
        : cards,
    [cards, activeTags],
  );

  const fuse = useMemo(
    () =>
      new Fuse(
        tagFiltered.map((c) => ({
          card: c,
          question: plain(c.question),
          finalResult: plain(c.finalResult),
          tags: c.tags.join(" "),
          steps: c.steps.map((s) => plain(s.expr)).join(" "),
        })),
        {
          keys: ["question", "finalResult", "tags", "steps"],
          threshold: 0.4,
          ignoreLocation: true,
        },
      ),
    [tagFiltered],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return tagFiltered;
    return fuse.search(q).map((r) => r.item.card);
  }, [query, tagFiltered, fuse]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortBy) {
        case "created":
          return b.createdAt - a.createdAt;
        case "question":
          return plain(a.question).localeCompare(plain(b.question));
        case "direction":
          return a.direction.localeCompare(b.direction);
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
    return arr;
  }, [filtered, sortBy]);

  async function syncAll() {
    const s = loadSettings();
    setMsg("Syncing…");
    try {
      const deckCards = listCards().filter((c) => deckOf(c) === s.deckName);
      const r = await syncCards(s.ankiUrl, s.deckName, deckCards);
      setMsg(
        `Synced — ${r.added} added, ${r.updated} updated into “${s.deckName}”.`,
      );
    } catch (e) {
      setMsg(`Sync failed: ${String(e)} — check Settings / AnkiConnect.`);
    }
  }

  async function fetchFromAnki() {
    const s = loadSettings();
    setMsg("Fetching from Anki…");
    try {
      const fetched = await fetchCards(s.ankiUrl);
      if (fetched.length === 0) {
        setMsg("No Śabda-Siddhi notes found in Anki.");
        return;
      }
      const n = importJson(JSON.stringify(fetched)); // merge by id (Anki wins)
      // register any decks the fetched cards belong to
      const cur = loadSettings();
      const merged = Array.from(
        new Set([...cur.decks, ...fetched.map((c) => deckOf(c))]),
      );
      if (merged.length !== cur.decks.length) patchSettings({ decks: merged });
      refresh();
      setMsg(`Fetched ${n} card(s) from Anki.`);
    } catch (e) {
      setMsg(`Fetch failed: ${String(e)} — check Settings / AnkiConnect.`);
    }
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const n = importJson(t);
        refresh();
        setMsg(`Imported ${n} card(s).`);
      } catch (err) {
        setMsg(`Import failed: ${String(err)}`);
      }
    });
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/author"
          className="rounded bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500"
        >
          + New card
        </Link>
        <button
          onClick={syncAll}
          className="rounded bg-emerald-600 px-4 py-2 hover:bg-emerald-500"
        >
          Sync to Anki
        </button>
        <button
          onClick={fetchFromAnki}
          className="rounded bg-indigo-600 px-4 py-2 hover:bg-indigo-500"
        >
          Fetch from Anki
        </button>
        <button
          onClick={() => downloadJson()}
          className="rounded bg-slate-700 px-4 py-2 hover:bg-slate-600"
        >
          Export JSON
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded bg-slate-700 px-4 py-2 hover:bg-slate-600"
        >
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={onImport}
        />
      </div>

      {msg && (
        <div className="rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
          {msg}
        </div>
      )}

      {cards.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search question / result / steps / tags…"
              className="dev w-full flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              title="Sort cards"
              className="shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-300 outline-none focus:border-sky-500"
            >
              <option value="updated">Sort: updated</option>
              <option value="created">Sort: created</option>
              <option value="question">Sort: question A–Z</option>
              <option value="direction">Sort: direction</option>
            </select>
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`rounded px-2 py-0.5 text-xs ${
                    activeTags.includes(t)
                      ? "bg-sky-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {t}
                </button>
              ))}
              {activeTags.length > 0 && (
                <button
                  onClick={() => setActiveTags([])}
                  className="rounded px-2 py-0.5 text-xs text-slate-400 underline"
                >
                  clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="rounded border border-dashed border-slate-700 p-8 text-center text-slate-500">
          No cards yet. Create one.
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded border border-dashed border-slate-700 p-8 text-center text-slate-500">
          No cards match.
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3"
            >
              <span
                className={`rounded px-2 py-0.5 text-[11px] ${
                  c.direction === "forward" ? "bg-sky-700" : "bg-purple-700"
                }`}
              >
                {c.direction}
              </span>
              <button
                onClick={() => nav(`/study/${c.id}`)}
                className="dev flex-1 truncate text-left text-slate-100 hover:text-sky-300"
              >
                <Rich
                  className="dev text-xl text-slate-100"
                  html={c.question || c.finalResult || "(untitled)"}
                />
              </button>
              <span className="text-xs text-slate-500">
                {c.steps.length} steps
              </span>
              <Link
                to={`/author/${c.id}`}
                className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
              >
                edit
              </Link>
              <button
                onClick={() => {
                  const copy = duplicateCard(c.id);
                  refresh();
                  if (copy) nav(`/author/${copy.id}`);
                }}
                className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
              >
                dup
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this card?")) {
                    deleteCard(c.id);
                    refresh();
                  }
                }}
                className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-rose-900/60 hover:text-rose-300"
              >
                del
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
