import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, searchSutras, type Sutra } from "../data/sutras";
import { SCHEMES, transliterate } from "../lib/translit";
import { patchSettings, useSettings } from "../store/settings";

// Debounced sūtra search box. Uses the global input scheme; shows a live preview
// of the query in the global output scheme on the right, with the input-scheme
// dropdown directly below that preview.
export function SutraAutocomplete({
  placeholder = "सूत्र खोजें — translit / Devanagari / 1.1.1",
  onSelect,
}: {
  placeholder?: string;
  onSelect: (id: string) => void;
}) {
  const { inputScheme, outputScheme } = useSettings();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Sutra[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setResults(searchSutras(q, inputScheme));
      setActive(0);
    }, 120);
    return () => clearTimeout(t);
  }, [q, inputScheme]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(s: Sutra) {
    onSelect(s.id);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const preview = transliterate(q, inputScheme, outputScheme);

  return (
    <div ref={boxRef} className="flex items-end gap-2 -mt-6">
      <div className="relative flex-1">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="dev w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
            {results.map((s, i) => {
              const meta = CATEGORY_META[s.category];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(s)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      i === active ? "bg-slate-800" : ""
                    }`}
                  >
                    <span
                      className={`rounded px-1 text-[10px] font-semibold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                    <span className="dev font-medium text-slate-100">
                      {s.s}
                    </span>
                    <span className="text-xs text-slate-500">{s.ref}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* side: output-scheme preview of the query, with the input-scheme dropdown below */}
      <div className="w-64 shrink-0">
        <select
          value={inputScheme}
          onChange={(e) => patchSettings({ inputScheme: e.target.value })}
          title="Input transliteration scheme (global)"
          className="mb-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none focus:border-sky-500"
        >
          {SCHEMES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="dev min-h-[2.25rem] rounded border border-slate-700 bg-slate-800/40 px-2 py-1.5 text-sm text-emerald-200">
          {q.trim() ? (
            preview
          ) : (
            <span className="text-slate-600">{outputScheme}</span>
          )}
        </div>
      </div>
    </div>
  );
}
