import { useState } from 'react'
import type { Card } from '../store/cards'
import { SutraChip } from './SutraChip'

// Canonical study layout. The Anki note template (anki/template.ts) reproduces
// this same structure/behaviour. Card text fields hold rich HTML produced by the
// RichEditor, so they are rendered as HTML.

function Rich({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`rich-html ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function CardView({ card }: { card: Card }) {
  const [showBack, setShowBack] = useState(false)
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <Front card={card} />
      {!showBack ? (
        <button
          onClick={() => setShowBack(true)}
          className="mt-5 w-full rounded bg-sky-600 py-2 font-medium hover:bg-sky-500"
        >
          उत्तरम् दर्शय (Show answer)
        </button>
      ) : (
        <Back card={card} />
      )}
    </div>
  )
}

function Front({ card }: { card: Card }) {
  const prompt =
    card.direction === 'forward'
      ? 'सिद्धिं कुरु (Derive the final form)'
      : 'मूलं विश्लेषय (Identify the base of derivation)'
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{prompt}</div>
      <Rich className="dev text-xl text-slate-100" html={card.question} />
    </div>
  )
}

function Back({ card }: { card: Card }) {
  return (
    <div className="mt-5 space-y-5">
      <FinalResult card={card} />
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
          सिद्धि-क्रमः (Steps)
        </div>
        <ol className="space-y-2">
          {card.steps.map((s, i) => (
            <StepRow key={i} index={i} step={s} />
          ))}
        </ol>
      </div>
      {card.cardNote && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
            टिप्पणी (Card note)
          </div>
          <Rich className="dev text-sm text-amber-100" html={card.cardNote} />
        </div>
      )}
    </div>
  )
}

function FinalResult({ card }: { card: Card }) {
  const [showNote, setShowNote] = useState(false)
  return (
    <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
        फलम् (Result)
      </div>
      <Rich className="dev text-2xl font-semibold text-emerald-100" html={card.finalResult} />
      {card.finalResultNote && (
        <>
          <button
            onClick={() => setShowNote((v) => !v)}
            className="mt-2 text-xs text-emerald-300 underline"
          >
            {showNote ? 'टिप्पणी छिपाएं' : 'टिप्पणी देखें (note)'}
          </button>
          {showNote && (
            <Rich className="dev mt-1 text-sm text-emerald-100/90" html={card.finalResultNote} />
          )}
        </>
      )}
    </div>
  )
}

function StepRow({ index, step }: { index: number; step: import('../store/cards').Step }) {
  const [open, setOpen] = useState(false)
  const hasMore = step.linkedSutraIds.length > 0 || step.note.length > 0
  return (
    <li className="rounded-lg border border-slate-700 bg-slate-800/40">
      <button
        type="button"
        onClick={() => hasMore && setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs">
          {index + 1}
        </span>
        <span className="flex-1">
          <Rich className="dev block text-lg text-slate-100" html={step.expr} />
          <span className="mt-1 flex flex-wrap gap-1.5">
            {step.vidhiSutraIds.map((id) => (
              <SutraChip key={id} id={id} />
            ))}
          </span>
        </span>
        {hasMore && <span className="text-slate-500">{open ? '▾' : '▸'}</span>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-700 px-3 py-3">
          {step.linkedSutraIds.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                सम्बद्ध-सूत्राणि (linked paribhāṣā / sañjñā)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {step.linkedSutraIds.map((id) => (
                  <SutraChip key={id} id={id} showGloss />
                ))}
              </div>
            </div>
          )}
          {step.note && (
            <Rich className="dev text-sm text-slate-300" html={step.note} />
          )}
        </div>
      )}
    </li>
  )
}
