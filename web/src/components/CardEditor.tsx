import { useState } from 'react'
import type { Card, Direction, Step } from '../store/cards'
import { SutraAutocomplete } from './SutraAutocomplete'
import { SutraChip } from './SutraChip'
import { RichEditor } from './RichEditor'
import { TagInput } from './TagInput'
import { suggestLinkedIds } from '../data/sutras'

// Authoring form. Mutates a local copy and calls onSave with the result.
export function CardEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Card
  onSave: (c: Card) => void
  onCancel?: () => void
}) {
  const [card, setCard] = useState<Card>(structuredClone(initial))

  function patch(p: Partial<Card>) {
    setCard((c) => ({ ...c, ...p }))
  }
  function patchStep(i: number, p: Partial<Step>) {
    setCard((c) => {
      const steps = c.steps.slice()
      steps[i] = { ...steps[i], ...p }
      return { ...c, steps }
    })
  }
  function addStep() {
    patch({
      steps: [...card.steps, { expr: '', vidhiSutraIds: [], linkedSutraIds: [], note: '' }],
    })
  }
  function removeStep(i: number) {
    patch({ steps: card.steps.filter((_, j) => j !== i) })
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= card.steps.length) return
    const steps = card.steps.slice()
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    patch({ steps })
  }

  // When a vidhi sūtra is added, auto-suggest its anuvṛtti-linked S/P sūtras.
  function addVidhi(i: number, id: string) {
    setCard((c) => {
      const steps = c.steps.slice()
      const st = steps[i]
      if (st.vidhiSutraIds.includes(id)) return c
      const vidhiSutraIds = [...st.vidhiSutraIds, id]
      const suggested = suggestLinkedIds([id])
      const linkedSutraIds = Array.from(new Set([...st.linkedSutraIds, ...suggested]))
      steps[i] = { ...st, vidhiSutraIds, linkedSutraIds }
      return { ...c, steps }
    })
  }
  function addLinked(i: number, id: string) {
    const st = card.steps[i]
    if (st.linkedSutraIds.includes(id)) return
    patchStep(i, { linkedSutraIds: [...st.linkedSutraIds, id] })
  }

  function submit() {
    onSave(card)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <Field label="दिशा (Direction)">
          <div className="flex gap-2">
            {(['forward', 'reverse'] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => patch({ direction: d })}
                className={`rounded px-3 py-1.5 text-sm ${
                  card.direction === d ? 'bg-sky-600' : 'bg-slate-800'
                }`}
              >
                {d === 'forward' ? 'Forward — derive form' : 'Reverse — decipher base'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="प्रश्नः (Question / front)">
          <RichEditor value={card.question} onChange={(v) => patch({ question: v })} />
        </Field>
        <Field label="फलम् (Final result)">
          <RichEditor value={card.finalResult} onChange={(v) => patch({ finalResult: v })} />
        </Field>
        <Field label="फल-टिप्पणी (Result note — click-to-reveal)">
          <RichEditor
            value={card.finalResultNote}
            onChange={(v) => patch({ finalResultNote: v })}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            सिद्धि-क्रमः (Steps)
          </h2>
          <button onClick={addStep} className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600">
            + step
          </button>
        </div>
        {card.steps.map((st, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Step {i + 1}</span>
              <div className="flex gap-1 text-xs">
                <IconBtn onClick={() => moveStep(i, -1)}>↑</IconBtn>
                <IconBtn onClick={() => moveStep(i, 1)}>↓</IconBtn>
                <IconBtn onClick={() => removeStep(i)} danger>
                  ✕
                </IconBtn>
              </div>
            </div>
            <Field label="रूपम् (expression at this step)">
              <RichEditor value={st.expr} onChange={(v) => patchStep(i, { expr: v })} />
            </Field>
            <Field label="विधि-सूत्राणि (vidhi — shown on front of step)">
              <SutraAutocomplete onSelect={(id) => addVidhi(i, id)} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {st.vidhiSutraIds.map((id) => (
                  <SutraChip
                    key={id}
                    id={id}
                    onRemove={() =>
                      patchStep(i, {
                        vidhiSutraIds: st.vidhiSutraIds.filter((x) => x !== id),
                      })
                    }
                  />
                ))}
              </div>
            </Field>
            <Field label="टिप्पणी (note — below main sūtras)">
              <RichEditor value={st.note} onChange={(v) => patchStep(i, { note: v })} />
            </Field>
            <Field label="सम्बद्ध-सूत्राणि (paribhāṣā / sañjñā — revealed on click)">
              <SutraAutocomplete
                placeholder="link a paribhāṣā / sañjñā sūtra…"
                onSelect={(id) => addLinked(i, id)}
              />
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                {st.linkedSutraIds.map((id) => (
                  <li key={id}>
                    <SutraChip
                      id={id}
                      showGloss
                      onRemove={() =>
                        patchStep(i, {
                          linkedSutraIds: st.linkedSutraIds.filter((x) => x !== id),
                        })
                      }
                    />
                  </li>
                ))}
              </ol>
            </Field>
            <Field label="सम्बद्ध-टिप्पणी (note — for secondary sūtras)">
              <RichEditor
                value={st.linkedNote ?? ''}
                onChange={(v) => patchStep(i, { linkedNote: v })}
              />
            </Field>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <Field label="अन्तिम-टिप्पणी (Card note — bottom)">
          <RichEditor value={card.cardNote} onChange={(v) => patch({ cardNote: v })} />
        </Field>
        <Field label="Tags (Enter to add a badge)">
          <TagInput value={card.tags} onChange={(tags) => patch({ tags })} />
        </Field>
      </section>

      <div className="flex gap-3">
        <button onClick={submit} className="rounded bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500">
          Save card
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded bg-slate-700 px-5 py-2 hover:bg-slate-600">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // A <div>, not a <label>: wrapping a contenteditable rich editor in a <label>
  // hijacks clicks (focus bounce, double-click selects the label, shortcuts break).
  return (
    <div className="block">
      <span className="dev mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </div>
  )
}
function IconBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 ${
        danger ? 'hover:bg-rose-900/50 hover:text-rose-300' : 'hover:bg-slate-700'
      } bg-slate-800`}
    >
      {children}
    </button>
  )
}
