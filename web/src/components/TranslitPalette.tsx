import { useEffect, useRef, useState } from "react";
import { SCHEMES, transliterate } from "../lib/translit";
import { loadSettings } from "../store/settings";

// Global transliteration scratchpad. Cmd/Ctrl+K opens it; type/paste text and it
// converts between schemes live. Pressing Cmd/Ctrl+K again converts + copies the
// result to the clipboard and closes. "apply" rewrites the box with the converted
// text (so you can chain conversions); "save" copies to clipboard and closes.
export function TranslitPalette() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const s0 = loadSettings();
  const [from, setFrom] = useState(s0.inputScheme);
  const [to, setTo] = useState(s0.outputScheme);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const converted = transliterate(text, from, to);

  async function copyAndClose() {
    try {
      await navigator.clipboard.writeText(converted);
    } catch {
      /* clipboard may be blocked; ignore */
    }
    setOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) void copyAndClose();
        else {
          const s = loadSettings();
          setFrom(s.inputScheme);
          setTo(s.outputScheme);
          setOpen(true);
        }
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, converted]);

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const selCls =
    "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none focus:border-sky-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-500">Transliterate</span>
          <span className="flex-1" />
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={selCls}>
            {SCHEMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            title="Swap"
          >
            ⇄
          </button>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={selCls}>
            {SCHEMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="type or paste text…"
          className="dev w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-base outline-none focus:border-sky-500"
        />

        <div className="dev mt-2 min-h-9 rounded border border-slate-700 bg-slate-800/40 px-3 py-2 text-base text-emerald-200">
          {converted || <span className="text-slate-600">{to}</span>}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] text-slate-500">⌘K again → copy & close · Esc to close</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setText(converted)}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            apply ↧
          </button>
          <button
            type="button"
            onClick={copyAndClose}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
          >
            save (copy)
          </button>
        </div>
      </div>
    </div>
  );
}
