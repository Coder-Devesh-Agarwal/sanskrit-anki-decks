import { useState } from 'react'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../store/settings'
import { testConnection } from '../anki/ankiConnect'
import { SCHEMES, transliterate } from '../lib/translit'

export function Settings() {
  const [s, setS] = useState(() => loadSettings())
  const [status, setStatus] = useState<string | null>(null)
  const origin = window.location.origin

  function save() {
    saveSettings(s)
    setStatus('Saved.')
  }

  async function test() {
    setStatus('Testing…')
    try {
      const v = await testConnection(s.ankiUrl)
      setStatus(`Connected. AnkiConnect version ${v}.`)
    } catch (e) {
      setStatus(`Failed: ${String(e)}`)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-lg font-semibold text-slate-200">Settings</h1>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">AnkiConnect URL</span>
        <input
          value={s.ankiUrl}
          onChange={(e) => setS({ ...s, ankiUrl: e.target.value })}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
      </label>

      <label className="block">
        <span className="dev mb-1 block text-xs text-slate-400">Deck name</span>
        <input
          value={s.deckName}
          onChange={(e) => setS({ ...s, deckName: e.target.value })}
          className="dev w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Input scheme (you type)</span>
          <select
            value={s.inputScheme}
            onChange={(e) => setS({ ...s, inputScheme: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {SCHEMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Output scheme (preview/convert)</span>
          <select
            value={s.outputScheme}
            onChange={(e) => setS({ ...s, outputScheme: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {SCHEMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm">
        <span className="text-xs text-slate-500">preview: </span>
        <span className="dev text-slate-300">{transliterate('vfdDiH', 'slp1', s.inputScheme)}</span>
        <span className="px-2 text-slate-600">→</span>
        <span className="dev text-emerald-200">
          {transliterate(transliterate('vfdDiH', 'slp1', s.inputScheme), s.inputScheme, s.outputScheme)}
        </span>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">
          Web base font size — {s.baseFontSize}px (web app scales from this)
        </span>
        <input
          type="range"
          min={12}
          max={28}
          step={1}
          value={s.baseFontSize}
          onChange={(e) => setS({ ...s, baseFontSize: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">
          Anki card font size — {s.ankiFontSize}px (rendered Anki card scales from this)
        </span>
        <input
          type="range"
          min={12}
          max={40}
          step={1}
          value={s.ankiFontSize}
          onChange={(e) => setS({ ...s, ankiFontSize: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <div className="block">
        <span className="mb-1 block text-xs text-slate-400">Theme (web + Anki card)</span>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setS({ ...s, theme: t })}
              className={`rounded px-3 py-1.5 text-sm ${
                s.theme === t ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} className="rounded bg-emerald-600 px-4 py-2 hover:bg-emerald-500">
          Save
        </button>
        <button onClick={test} className="rounded bg-sky-600 px-4 py-2 hover:bg-sky-500">
          Test connection
        </button>
        <button
          onClick={() => setS({ ...DEFAULT_SETTINGS })}
          className="rounded bg-slate-700 px-4 py-2 hover:bg-slate-600"
        >
          Reset defaults
        </button>
      </div>

      {status && (
        <div className="rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
          {status}
        </div>
      )}

      <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-100/90">
        <p className="mb-2 font-semibold text-amber-300">Connecting to Anki</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Install the AnkiConnect add-on (code <code>2055492159</code>) and keep Anki open.</li>
          <li>
            Anki → Tools → Add-ons → AnkiConnect → Config. Add this site's origin to{' '}
            <code>webCorsOriginList</code>:
            <pre className="mt-1 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-200">{`"webCorsOriginList": ["${origin}", "http://localhost:5173"]`}</pre>
          </li>
          <li>Restart Anki, then use “Test connection”.</li>
        </ol>
        <p className="mt-2 text-xs text-amber-200/70">
          Note: AnkiConnect is HTTP-only on localhost. If this site is opened over HTTPS (GitHub
          Pages), some browsers block the request as mixed content. Fallbacks: run the app locally
          over HTTP, or use Export/Import JSON. Current origin: <code>{origin}</code>
        </p>
      </div>
    </div>
  )
}
