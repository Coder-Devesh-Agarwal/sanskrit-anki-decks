// localStorage-backed CRUD for śabda-siddhi cards + JSON export/import.
// The static site has no backend; this is the source of truth, and AnkiConnect
// sync (anki/ankiConnect.ts) pushes from here.

export type Direction = 'forward' | 'reverse'

export interface Step {
  expr: string // expression / intermediate form at this step
  vidhiSutraIds: string[] // shown on the step (front of reveal)
  linkedSutraIds: string[] // paribhāṣā/sañjñā etc, revealed on click
  note: string
}

export interface Card {
  id: string
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

export function emptyCard(): Card {
  const now = Date.now()
  return {
    id: uid(),
    direction: 'forward',
    question: '',
    finalResult: '',
    finalResultNote: '',
    steps: [{ expr: '', vidhiSutraIds: [], linkedSutraIds: [], note: '' }],
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
