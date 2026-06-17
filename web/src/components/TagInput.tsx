import { useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { knownTags } from '../store/cards'

// Tag input: type + Enter (or comma) to add a badge; Backspace on empty removes
// the last; suggestions are drawn from all previously-made tags (knownTags).
export function TagInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const norm = (t: string) => t.trim().replace(/\s+/g, '_')

  function add(tag: string) {
    const t = norm(tag)
    if (t && !value.includes(t)) onChange([...value, t])
    setQ('')
  }
  function removeAt(i: number) {
    onChange(value.filter((_, j) => j !== i))
  }

  const suggestions = useMemo(() => {
    const pool = knownTags().filter((t) => !value.includes(t))
    const ql = q.trim()
    if (!ql) return pool.slice(0, 12)
    const fuse = new Fuse(pool, { threshold: 0.4, ignoreLocation: true })
    return fuse.search(ql).slice(0, 12).map((r) => r.item)
  }, [q, value])

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (q.trim()) add(q)
    } else if (e.key === 'Backspace' && !q && value.length) {
      removeAt(value.length - 1)
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t, i) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded bg-sky-700/70 px-2 py-0.5 text-xs text-sky-50"
          >
            {t}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-sky-200 hover:text-rose-200"
              aria-label={`remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          placeholder={value.length ? '' : 'add tag, Enter to confirm'}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-700 bg-slate-900 py-2 shadow-xl">
          {suggestions.map((t) => (
            <li key={t}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(t)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-800"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
