// App settings, persisted through store/persist.ts (IndexedDB). Changes are
// broadcast so all components (transliteration previews, autocomplete) react
// live.

import { useSyncExternalStore } from 'react'
import { readValue, writeValue } from './persist'

// 'default'   = independent deck (also assumed when no meta exists)
// 'composite' = parent deck; syncing it also syncs its sub decks (Parent::Sub)
// 'sub'       = child of a composite deck; syncs to "<parent>::<name>" in Anki
export type DeckType = 'default' | 'composite' | 'sub'

export interface DeckMeta {
  type: DeckType
  /** composite deck this deck belongs to (only for type 'sub') */
  parent?: string
}

export interface Settings {
  ankiUrl: string
  /** the active deck (sync target + new-card assignment + list filter) */
  deckName: string
  /** all known deck names */
  decks: string[]
  /** per-deck type/parent info, keyed by deck name (absent = 'default') */
  deckMeta: Record<string, DeckMeta>
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
  /** auto-backup every deck to a local folder (File System Access API) */
  backupEnabled: boolean
  /** minutes between auto-backups */
  backupIntervalMinutes: number
  /** ms epoch of the last successful backup (status display only) */
  lastBackupAt: number
}

const KEY = 'shabdasiddhi.settings'
const EVENT = 'ss-settings-changed'

export const DEFAULT_DECK = 'Śabda-Siddhi'

export const DEFAULT_SETTINGS: Settings = {
  ankiUrl: 'http://127.0.0.1:8765',
  deckName: DEFAULT_DECK,
  decks: [DEFAULT_DECK],
  deckMeta: {},
  inputScheme: 'hk',
  outputScheme: 'devanagari',
  baseFontSize: 16,
  ankiFontSize: 20,
  theme: 'dark',
  backupEnabled: false,
  backupIntervalMinutes: 15,
  lastBackupAt: 0,
}

let _cache: Settings | null = null

export function loadSettings(): Settings {
  if (_cache) return _cache
  try {
    const raw = readValue(KEY)
    _cache = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
      : { ...DEFAULT_SETTINGS }
  } catch {
    _cache = { ...DEFAULT_SETTINGS }
  }
  // guarantee the active deck is always part of the deck list
  if (!_cache.decks?.length) _cache.decks = [DEFAULT_DECK]
  if (!_cache.decks.includes(_cache.deckName)) _cache.decks = [..._cache.decks, _cache.deckName]
  if (!_cache.deckMeta) _cache.deckMeta = {}
  return _cache
}

// ---- deck type helpers (absent meta = independent 'default' deck) ----

export function deckMetaOf(name: string): DeckMeta {
  return loadSettings().deckMeta[name] ?? { type: 'default' }
}

export function deckTypeOf(name: string): DeckType {
  return deckMetaOf(name).type
}

/** sub decks belonging to a composite deck */
export function subDecksOf(parent: string): string[] {
  const s = loadSettings()
  return s.decks.filter((d) => {
    const m = s.deckMeta[d]
    return m?.type === 'sub' && m.parent === parent
  })
}

/** name of the deck in Anki: sub decks nest under their composite parent */
export function ankiDeckName(name: string): string {
  const m = deckMetaOf(name)
  return m.type === 'sub' && m.parent ? `${m.parent}::${name}` : name
}

/** register/overwrite a deck's meta ('default' clears the entry) */
export function setDeckMeta(name: string, meta: DeckMeta): void {
  const s = loadSettings()
  const deckMeta = { ...s.deckMeta }
  if (meta.type === 'default') delete deckMeta[name]
  else deckMeta[name] = meta
  saveSettings({ ...s, deckMeta })
}

/** keep deckMeta consistent when a deck is renamed */
export function renameDeckMeta(oldName: string, newName: string): void {
  const s = loadSettings()
  const deckMeta: Record<string, DeckMeta> = {}
  for (const [k, m] of Object.entries(s.deckMeta)) {
    const key = k === oldName ? newName : k
    deckMeta[key] = m.parent === oldName ? { ...m, parent: newName } : m
  }
  saveSettings({ ...s, deckMeta })
}

export function saveSettings(s: Settings): void {
  _cache = s
  writeValue(KEY, JSON.stringify(s))
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
