// App settings, persisted in localStorage. Changes are broadcast so all
// components (transliteration previews, autocomplete) react live.

import { useSyncExternalStore } from 'react'

export interface Settings {
  ankiUrl: string
  deckName: string
  /** scheme the user types in */
  inputScheme: string
  /** scheme previews/conversions are shown in */
  outputScheme: string
  /** base font size (px) for the web app; all sizes are relative (rem) to this */
  baseFontSize: number
  /** base font size (px) for the rendered Anki card */
  ankiFontSize: number
  /** UI + card colour theme */
  theme: 'dark' | 'light'
}

const KEY = 'shabdasiddhi.settings'
const EVENT = 'ss-settings-changed'

export const DEFAULT_SETTINGS: Settings = {
  ankiUrl: 'http://127.0.0.1:8765',
  deckName: 'Śabda-Siddhi',
  inputScheme: 'hk',
  outputScheme: 'devanagari',
  baseFontSize: 16,
  ankiFontSize: 20,
  theme: 'dark',
}

let _cache: Settings | null = null

export function loadSettings(): Settings {
  if (_cache) return _cache
  try {
    const raw = localStorage.getItem(KEY)
    _cache = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
      : { ...DEFAULT_SETTINGS }
  } catch {
    _cache = { ...DEFAULT_SETTINGS }
  }
  return _cache
}

export function saveSettings(s: Settings): void {
  _cache = s
  localStorage.setItem(KEY, JSON.stringify(s))
  window.dispatchEvent(new Event(EVENT))
}

export function patchSettings(p: Partial<Settings>): void {
  saveSettings({ ...loadSettings(), ...p })
}

// Live, reactive read of settings.
export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb)
      return () => window.removeEventListener(EVENT, cb)
    },
    loadSettings,
  )
}
