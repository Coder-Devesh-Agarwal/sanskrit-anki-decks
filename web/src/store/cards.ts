// localStorage-backed CRUD for śabda-siddhi cards + JSON export/import.
// The static site has no backend; this is the source of truth, and AnkiConnect
// sync (anki/ankiConnect.ts) pushes from here.

import { loadSettings, DEFAULT_DECK } from "./settings";

export type Direction = "forward" | "reverse";

// 'astadhyayi' = the śabda-siddhi derivation card (steps + sūtras).
// 'generic'    = a plain book-study Q&A card (front/back + source + note).
export type CardType = "astadhyayi" | "generic";

export function deckOf(c: Card): string {
  return c.deck || DEFAULT_DECK;
}

export function cardType(c: Card): CardType {
  return c.type || "astadhyayi";
}

export interface Step {
  expr: string; // expression / intermediate form at this step
  vidhiSutraIds: string[]; // (astadhyayi) shown on the step (front of reveal)
  linkedSutraIds: string[]; // (astadhyayi) paribhāṣā/sañjñā etc, revealed on click
  head?: string; // (generic) free-text head notes shown on the step, in place of sūtras
  note: string; // note for the main sūtras / head
  linkedNote?: string; // separate note for the secondary (linked) sūtras
}

export interface Card {
  id: string;
  /** card type (defaults to 'astadhyayi' when absent) */
  type?: CardType;
  /** deck this card belongs to (defaults to DEFAULT_DECK when absent) */
  deck?: string;
  direction: Direction;
  question: string;
  finalResult: string;
  finalResultNote: string;
  steps: Step[];
  cardNote: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const PREFIX = "shabdasiddhi.cards::"; // one localStorage key per deck
const LEGACY_KEY = "shabdasiddhi.cards"; // pre-multi-deck single array
const TAGS_KEY = "shabdasiddhi.tags";

function deckKey(deck: string): string {
  return PREFIX + deck.trim().replaceAll(" ", "-").toLocaleLowerCase();
}

function readDeck(deck: string): Card[] {
  try {
    const raw = localStorage.getItem(deckKey(deck));
    const arr = raw ? (JSON.parse(raw) as Card[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeDeck(deck: string, cards: Card[]): void {
  localStorage.setItem(deckKey(deck), JSON.stringify(cards));
}

// One-time migration: split the old single array into per-deck keys.
let _migrated = false;
function migrate(): void {
  if (_migrated) return;
  _migrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as Card[];
    if (Array.isArray(arr)) {
      const byDeck = new Map<string, Card[]>();
      for (const c of arr) {
        const d = deckOf(c);
        const list = byDeck.get(d) ?? readDeck(d);
        list.push(c);
        byDeck.set(d, list);
      }
      for (const [d, list] of byDeck) writeDeck(d, list);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function allDeckNames(): string[] {
  const names = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) names.add(k.slice(PREFIX.length));
  }
  return [...names];
}

// Persistent union of every tag ever used (survives card deletion), so the tag
// input can suggest previously-made tags.
export function knownTags(): string[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    const hist = raw ? (JSON.parse(raw) as string[]) : [];
    const live = listAllCards().flatMap((c) => c.tags);
    return Array.from(new Set([...hist, ...live])).sort();
  } catch {
    return [];
  }
}

function recordTags(tags: string[]): void {
  if (!tags.length) return;
  const merged = Array.from(new Set([...knownTags(), ...tags])).sort();
  localStorage.setItem(TAGS_KEY, JSON.stringify(merged));
}

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyCard(type: CardType = "astadhyayi"): Card {
  const now = Date.now();
  return {
    id: uid(),
    type,
    deck: loadSettings().deckName,
    direction: "forward",
    question: "",
    finalResult: "",
    finalResultNote: "",
    steps: [
      {
        expr: "",
        vidhiSutraIds: [],
        linkedSutraIds: [],
        head: "",
        note: "",
        linkedNote: "",
      },
    ],
    cardNote: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

// Cards of one deck (defaults to the active deck).
export function listCards(deck: string = loadSettings().deckName): Card[] {
  migrate();
  return readDeck(deck);
}

// Cards across every deck.
export function listAllCards(): Card[] {
  migrate();
  return allDeckNames().flatMap((d) => readDeck(d));
}

export function getCard(id: string): Card | undefined {
  return listAllCards().find((c) => c.id === id);
}

export function saveCard(card: Card): void {
  migrate();
  const deck = deckOf(card);
  card.deck = deck;
  card.updatedAt = Date.now();
  const cards = readDeck(deck);
  const idx = cards.findIndex((c) => c.id === card.id);
  if (idx >= 0) cards[idx] = card;
  else cards.push(card);
  writeDeck(deck, cards);
  recordTags(card.tags);
}

export function deleteCard(id: string): void {
  migrate();
  for (const d of allDeckNames()) {
    const cards = readDeck(d);
    if (cards.some((c) => c.id === id)) {
      writeDeck(
        d,
        cards.filter((c) => c.id !== id),
      );
      return;
    }
  }
}

// Clone a card under a fresh id, save it, and return the copy.
export function duplicateCard(id: string): Card | undefined {
  const src = getCard(id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: Card = {
    ...structuredClone(src),
    id: uid(),
    createdAt: now,
    updatedAt: now,
  };
  saveCard(copy);
  return copy;
}

// Rename a deck: move its cards' storage key and update each card's deck field.
export function renameDeck(oldName: string, newName: string): void {
  if (oldName === newName) return;
  migrate();
  const cards = readDeck(oldName).map((c) => ({ ...c, deck: newName }));
  const merged = [...readDeck(newName), ...cards];
  writeDeck(newName, merged);
  localStorage.removeItem(deckKey(oldName));
}

// Export the active deck's cards.
export function exportJson(deck: string = loadSettings().deckName): string {
  return JSON.stringify(listCards(deck), null, 2);
}

// Import cards (merge by id). Cards without a deck go to the active deck.
export function importJson(text: string): number {
  const incoming = JSON.parse(text) as Card[];
  if (!Array.isArray(incoming))
    throw new Error("Expected a JSON array of cards");
  const current = loadSettings().deckName;
  for (const c of incoming) {
    if (c && typeof c.id === "string")
      saveCard({ ...c, deck: c.deck || current });
  }
  return incoming.length;
}

export function downloadJson(filename = "shabdasiddhi-cards.json"): void {
  const blob = new Blob([exportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
