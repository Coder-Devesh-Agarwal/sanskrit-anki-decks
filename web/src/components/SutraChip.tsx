import { useState } from 'react'
import { CATEGORY_META, getSutra } from '../data/sutras'
import { getGloss } from '../data/glosses'

const NOTE_LABEL: Record<string, string> = {
  lsk: 'लघुसिद्धान्तकौमुदी',
  sk: 'सिद्धान्तकौमुदी',
}

export function SutraChip({
  id,
  onRemove,
  showGloss,
}: {
  id: string
  onRemove?: () => void
  showGloss?: boolean
}) {
  const [open, setOpen] = useState(false)
  const s = getSutra(id)

  if (!s) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-xs">
        ?{id}
        {onRemove && <RemoveBtn onRemove={onRemove} />}
      </span>
    )
  }

  const meta = CATEGORY_META[s.category]

  return (
    <span
      className="relative inline-flex max-w-full items-center gap-1.5 rounded bg-slate-800 px-2 py-1 align-top text-sm ring-1 ring-slate-700"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-left"
      >
        <span className={`rounded px-1 text-[10px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
        <span className="dev font-medium text-slate-100">{s.s}</span>
        <span className="text-xs text-slate-400">{s.ref}</span>
        {showGloss && s.ss && <span className="dev text-xs text-slate-400">— {s.ss}</span>}
      </button>
      {onRemove && <RemoveBtn onRemove={onRemove} />}
      {open && <GlossPopover id={id} />}
    </span>
  )
}

function GlossPopover({ id }: { id: string }) {
  const s = getSutra(id)!
  const g = getGloss(id)
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[90vw] rounded-lg border border-slate-600 bg-slate-950 p-3 text-left shadow-xl">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="dev text-base font-semibold text-slate-100">{s.s}</span>
        <span className="text-xs text-slate-500">{s.ref}</span>
      </div>
      {g.english && <p className="mb-2 text-xs text-slate-300">{g.english}</p>}
      {g.note ? (
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-sky-400">
            {NOTE_LABEL[g.noteSource] ?? 'टिप्पणी'}
          </div>
          <p className="dev max-h-48 overflow-auto text-xs leading-relaxed text-slate-200">
            {g.note}
          </p>
        </div>
      ) : (
        !g.english && <p className="text-xs text-slate-500">No gloss available.</p>
      )}
    </div>
  )
}

function RemoveBtn({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="ml-0.5 rounded px-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
      aria-label="remove"
    >
      ×
    </button>
  )
}
