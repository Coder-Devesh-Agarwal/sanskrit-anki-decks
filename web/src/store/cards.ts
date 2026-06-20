// localStorage-backed CRUD for śabda-siddhi cards + JSON export/import.
// The static site has no backend; this is the source of truth, and AnkiConnect
// sync (anki/ankiConnect.ts) pushes from here.

import { loadSettings, DEFAULT_DECK } from './settings'

export type Direction = 'forward' | 'reverse'

// 'astadhyayi' = the śabda-siddhi derivation card (steps + sūtras).
// 'generic'    = a plain book-study Q&A card (front/back + source + note).
export type CardType = 'astadhyayi' | 'generic'

export function deckOf(c: Card): string {
  return c.deck || DEFAULT_DECK
}

export function cardType(c: Card): CardType {
  return c.type || 'astadhyayi'
}

export interface Step {
  expr: string // expression / intermediate form at this step
  vidhiSutraIds: string[] // (astadhyayi) shown on the step (front of reveal)
  linkedSutraIds: string[] // (astadhyayi) paribhāṣā/sañjñā etc, revealed on click
  head?: string // (generic) free-text head notes shown on the step, in place of sūtras
  note: string // note for the main sūtras / head
  linkedNote?: string // separate note for the secondary (linked) sūtras
}

export interface Card {
  id: string
  /** card type (defaults to 'astadhyayi' when absent) */
  type?: CardType
  /** deck this card belongs to (defaults to DEFAULT_DECK when absent) */
  deck?: string
  direction: Direction
  question: string
  finalResult: string
  finalResultNote: string
  steps: Step[]
  cardNote: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

const KEY = 'shabdasiddhi.cards'
const TAGS_KEY = 'shabdasiddhi.tags'

// Persistent union of every tag ever used (survives card deletion), so the tag
// input can suggest previously-made tags.
export function knownTags(): string[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY)
    const hist = raw ? (JSON.parse(raw) as string[]) : []
    const live = listCards().flatMap((c) => c.tags)
    return Array.from(new Set([...hist, ...live])).sort()
  } catch {
    return []
  }
}

function recordTags(tags: string[]): void {
  if (!tags.length) return
  const merged = Array.from(new Set([...knownTags(), ...tags])).sort()
  localStorage.setItem(TAGS_KEY, JSON.stringify(merged))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function emptyCard(type: CardType = 'astadhyayi'): Card {
  const now = Date.now()
  return {
    id: uid(),
    type,
    deck: loadSettings().deckName,
    direction: 'forward',
    question: '',
    finalResult: '',
    finalResultNote: '',
    steps: [
      { expr: '', vidhiSutraIds: [], linkedSutraIds: [], head: '', note: '', linkedNote: '' },
    ],
    cardNote: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function listCards(): Card[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Card[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function getCard(id: string): Card | undefined {
  return listCards().find((c) => c.id === id)
}

function writeAll(cards: Card[]): void {
  localStorage.setItem(KEY, JSON.stringify(cards))
}

export function saveCard(card: Card): void {
  const cards = listCards()
  const idx = cards.findIndex((c) => c.id === card.id)
  card.updatedAt = Date.now()
  if (idx >= 0) cards[idx] = card
  else cards.push(card)
  writeAll(cards)
  recordTags(card.tags)
}

export function deleteCard(id: string): void {
  writeAll(listCards().filter((c) => c.id !== id))
}

// Clone a card under a fresh id, save it, and return the copy.
export function duplicateCard(id: string): Card | undefined {
  const src = getCard(id)
  if (!src) return undefined
  const now = Date.now()
  const copy: Card = {
    ...structuredClone(src),
    id: uid(),
    createdAt: now,
    updatedAt: now,
  }
  saveCard(copy)
  return copy
}

export function exportJson(): string {
  return JSON.stringify(listCards(), null, 2)
}

// Import merges by id (imported wins). Returns count imported.
export function importJson(text: string): number {
  const incoming = JSON.parse(text) as Card[]
  if (!Array.isArray(incoming)) throw new Error('Expected a JSON array of cards')
  const byId = new Map(listCards().map((c) => [c.id, c]))
  for (const c of incoming) {
    if (c && typeof c.id === 'string') byId.set(c.id, c)
  }
  writeAll([...byId.values()])
  return incoming.length
}

export function downloadJson(filename = 'shabdasiddhi-cards.json'): void {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
