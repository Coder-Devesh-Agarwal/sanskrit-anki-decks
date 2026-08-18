// Full-Aṣṭādhyāyī reference deck, sūtra *number* on the front.
//
//   front — the reference (a.p.n) + adhyāya/pāda/sūtra breakdown
//   back  — the sūtra in Devanāgarī + IAST + type badges, then pada-cheda,
//           anuvṛtti, adhikāra, anuvṛtti-sahita sūtra, LSK, SK, sūtrārtha,
//           English
//
// Same back as gen-sutra-front-deck.mjs; card ids use a distinct prefix so both
// decks can live in the app side by side.
//
// Usage (from web/):
//   node scripts/gen-sutra-number-front-deck.mjs
//   node scripts/gen-sutra-number-front-deck.mjs --adhyaya 6   # → ../decks/json/
//   node scripts/gen-sutra-number-front-deck.mjs --split           # composite + 8 adhyāya sub decks, one file
//   node scripts/gen-sutra-number-front-deck.mjs --split --files   # same decks, one file per adhyāya
//   node scripts/gen-sutra-number-front-deck.mjs --lsk-chapters ../data_files/lsk_chapters_name.json
//   node scripts/gen-sutra-number-front-deck.mjs --deck "…" --sync

import { generate } from "./lib/sutra-deck.mjs";

generate({
  mode: "number",
  defaults: {
    deckName: "अष्टाध्यायी सूत्राणि (सङ्ख्या→सूत्र)",
    outFile: "sutra_number_front_deck.json",
  },
});
