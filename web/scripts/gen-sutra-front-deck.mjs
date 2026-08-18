// Full-Aṣṭādhyāyī reference deck, sūtra on the front.
//
//   front — the sūtra in Devanāgarī + its IAST transliteration
//   back  — reference (a.p.n) + type badges, then pada-cheda, anuvṛtti,
//           adhikāra, anuvṛtti-sahita sūtra, LSK, SK, sūtrārtha, English
//
// Every card is generated with sync:false (reference material — kept out of the
// Anki push until you flip it per-card in the app, or re-run with --sync).
//
// Usage (from web/):
//   node scripts/gen-sutra-front-deck.mjs
//   node scripts/gen-sutra-front-deck.mjs --adhyaya 1   # → ../decks/json/
//   node scripts/gen-sutra-front-deck.mjs --split           # composite + 8 adhyāya sub decks, one file
//   node scripts/gen-sutra-front-deck.mjs --split --files   # same decks, one file per adhyāya
//   node scripts/gen-sutra-front-deck.mjs --lsk-chapters ../data_files/lsk_chapters_name.json
//   node scripts/gen-sutra-front-deck.mjs --deck "…" --sync
//
// Import the emitted JSON with Decklist → Import JSON.

import { generate } from "./lib/sutra-deck.mjs";

generate({
  mode: "sutra",
  defaults: {
    deckName: "अष्टाध्यायी सूत्राणि (सूत्र→विवरण)",
    outFile: "sutra_front_deck.json",
  },
});
