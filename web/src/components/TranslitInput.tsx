import { useSettings } from '../store/settings'
import { transliterate } from '../lib/translit'

// Text field with a live transliteration preview shown ABOVE the box: the typed
// value (inputScheme) rendered in the global outputScheme. The preview's "apply"
// button replaces the field content with the converted text (explicit, lossless
// — nothing is converted silently).

interface Props {
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
}

export function TranslitInput({ value, onChange, multiline, placeholder }: Props) {
  const { inputScheme, outputScheme } = useSettings()
  const converted = transliterate(value, inputScheme, outputScheme)
  const showPreview = value.trim() !== '' && converted !== value

  const cls =
    'dev w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500'

  return (
    <div>
      {showPreview && (
        <div className="mb-1 flex items-center gap-2 rounded bg-slate-800/60 px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            {outputScheme}
          </span>
          <span className="dev flex-1 text-sm text-emerald-200">{converted}</span>
          <button
            type="button"
            onClick={() => onChange(converted)}
            title="Replace field with this transliteration"
            className="rounded bg-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-600"
          >
            apply ↧
          </button>
        </div>
      )}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className={cls}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  )
}
