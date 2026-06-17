import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listCards,
  deleteCard,
  downloadJson,
  importJson,
  type Card,
} from "../store/cards";
import { loadSettings } from "../store/settings";
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

export function Decklist() {
  const nav = useNavigate();
  const [cards, setCards] = useState<Card[]>(() => listCards());
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setCards(listCards());
  }

  async function syncAll() {
    const s = loadSettings();
    setMsg("Syncing…");
    try {
      const r = await syncCards(s.ankiUrl, s.deckName, listCards());
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

      {cards.length === 0 ? (
        <div className="rounded border border-dashed border-slate-700 p-8 text-center text-slate-500">
          No cards yet. Create one.
        </div>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
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
