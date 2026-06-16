// Minimal AnkiConnect (v6) client. Upserts cards into a deck, keyed by the
// CardId field so re-syncing an edited card updates the existing note instead
// of duplicating it (analogous to the genanki guid scheme in the repo).

import type { Card } from '../store/cards'
import {
  MODEL_NAME,
  MODEL_FIELDS,
  MODEL_TEMPLATES,
  MODEL_CSS,
  renderFields,
} from './template'

async function invoke<T>(url: string, action: string, params: object = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  })
  if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`)
  const json = (await res.json()) as { result: T; error: string | null }
  if (json.error) throw new Error(json.error)
  return json.result
}

export async function testConnection(url: string): Promise<number> {
  return invoke<number>(url, 'version')
}

async function ensureModel(url: string): Promise<void> {
  const names = await invoke<string[]>(url, 'modelNames')
  if (names.includes(MODEL_NAME)) return
  await invoke(url, 'createModel', {
    modelName: MODEL_NAME,
    inOrderFields: MODEL_FIELDS,
    css: MODEL_CSS,
    isCloze: false,
    cardTemplates: MODEL_TEMPLATES,
  })
}

async function ensureDeck(url: string, deckName: string): Promise<void> {
  await invoke(url, 'createDeck', { deck: deckName })
}

function fieldsFor(card: Card): Record<string, string> {
  return renderFields(card)
}

export interface SyncResult {
  added: number
  updated: number
}

// Push the given cards into Anki, creating model+deck as needed.
export async function syncCards(
  url: string,
  deckName: string,
  cards: Card[],
): Promise<SyncResult> {
  await ensureModel(url)
  await ensureDeck(url, deckName)
  let added = 0
  let updated = 0
  for (const card of cards) {
    const fields = fieldsFor(card)
    const found = await invoke<number[]>(url, 'findNotes', {
      query: `note:"${MODEL_NAME}" CardId:"${card.id}"`,
    })
    if (found.length > 0) {
      await invoke(url, 'updateNoteFields', {
        note: { id: found[0], fields },
      })
      if (card.tags.length) {
        await invoke(url, 'addTags', { notes: [found[0]], tags: card.tags.join(' ') })
      }
      updated++
    } else {
      await invoke(url, 'addNote', {
        note: {
          deckName,
          modelName: MODEL_NAME,
          fields,
          tags: card.tags,
          options: { allowDuplicate: false },
        },
      })
      added++
    }
  }
  return { added, updated }
}
