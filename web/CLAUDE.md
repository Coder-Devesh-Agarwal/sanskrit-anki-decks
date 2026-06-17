# CLAUDE.md — Śabda-Siddhi web app

React + Tailwind app to **author and study Pāṇinian śabda-siddhi (word-derivation) cards**, with
sūtra autocomplete, transliteration, rich text, and Anki sync (AnkiConnect). Static site, no backend —
deployed to GitHub Pages. Lives in `web/` inside the `sanskrit-anki-decks` repo (rest of repo is a
separate Python/genanki pipeline; do not touch it for web work).

## Stack
- Vite + React 18 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), React Router v6 (HashRouter).
- TipTap v3 (ProseMirror) for rich text. Fuse.js for fuzzy search. `@indic-transliteration/sanscript`
  for transliteration.
- No backend/state server. Source of truth = browser **localStorage**; Anki sync is the bridge out.

## Commands (run inside `web/`)
- `npm run dev` — `predev` copies data, then Vite dev server (http://localhost:5173).
- `npm run build` — `prebuild` copies data, then `vite build` → `dist/`. (Chunk-size warning from TipTap is expected/benign.)
- `npm run typecheck` — `tsc --noEmit`. Run this + build after changes.
- `scripts/copy-data.mjs` (`predev`/`prebuild`) copies `../data_files/*.json` → `public/data/`.

## Lockfile / CI gotcha (important)
- CI (`.github/workflows/deploy.yml`) runs `npm ci` on **Node 20 = npm 10**. Local dev is Node 24 = npm 11.
- TipTap pulls **optional** deps (`@tiptap/extension-bubble-menu/floating-menu`) needing `@floating-ui/dom`.
  npm 11 omits that optional node from the lock; npm 10 demands it → `npm ci` fails "Missing @floating-ui/dom".
- **Fix when the lock drifts**: regenerate with npm 10 — `rm -rf node_modules package-lock.json && npx -y npm@10 install`,
  verify `npx -y npm@10 ci` exits 0, commit `package-lock.json`. (Alternative: bump CI to node 24, but the
  workflow file needs a PAT with `workflow` scope to push — currently edited via GitHub web UI only.)

## Deployment (GitHub Pages)
- `.github/workflows/deploy.yml` builds `web/` and publishes `dist`. It sets Vite `base` to `/<repo>/`
  via `BASE_PATH` env (default in `vite.config.ts`: `/sanskrit-anki-decks/`).
- The workflow file is **untracked in git** (the repo PAT lacks `workflow` scope, so pushes touching
  `.github/workflows/**` are rejected). It exists on disk and is added on GitHub via the web UI.
- Pages must be enabled once: repo Settings → Pages → Source = **GitHub Actions** (else deploy 404s).
- Because of HashRouter + Vite `base`, all asset/data/font URLs must go through `import.meta.env.BASE_URL`
  (never hardcode `/foo`). CSS `url()` does NOT get the base rebased — see font handling below.

## Data files (`public/data/`, fetched at runtime via BASE_URL)
- `sutraani_data.json` — **required**. `{name, data:[…]}`, ~3983 sūtras. Per sūtra: `i` id (e.g. `"11001"`),
  `a/p/n` (→ ref `1.1.1`), `s` Devanagari, `e` transliteration, `ss` simple gloss, `an` anuvṛtti links
  (`word$id##word$id`), `type` = `"<PREFIX>$label$extra"`. Prefix → category: **V** vidhi, **S** sañjñā,
  **P** paribhāṣā, **AT** atideśa, **AD** adhikāra.
- `vasu_english_summary.json`, `laghukaumudi.json`, `kaumudi.json` — optional gloss maps keyed by sūtra id.
- `dhatu*.json`, `pratyahara.json` exist in `../data_files` but are NOT used by the web app.

## Source map (`web/src/`)
- `main.tsx` — HashRouter + routes: `/` Decklist, `/author[/:id]` Author, `/study/:id` Study, `/settings`.
- `App.tsx` — loads sūtras (blocking) + glosses (non-blocking); applies base font size (root font-size),
  theme class (`html.theme-light`), and injects Adishila `@font-face` at runtime with BASE_URL.
- `data/sutras.ts` — loads/indexes sūtras. `getSutra`, `searchSutras(query, scheme)` (Fuse.js fuzzy over
  SLP1 + transliteration + Devanagari + ref; query converted to SLP1 via sanscript), `suggestLinkedIds`
  (auto-suggest S/P/AT/AD from a vidhi's `an`), `parseType`/category meta. `slp` field precomputed per sūtra.
- `data/glosses.ts` — lazy gloss maps; `getGloss(id)` → `{english, note, noteSource}` (LSK preferred, SK fallback).
- `lib/translit.ts` — `transliterate(text, from, to)` (sanscript wrapper) + `SCHEMES` list.
- `store/cards.ts` — Card model + localStorage CRUD (`shabdasiddhi.cards`), `duplicateCard`, JSON
  export/import, persistent tag history (`knownTags`, `shabdasiddhi.tags`).
- `store/settings.ts` — settings + reactive `useSettings()` (useSyncExternalStore) + `loadSettings`/
  `patchSettings`. Keys: ankiUrl, deckName, inputScheme, outputScheme, baseFontSize (web), ankiFontSize
  (Anki card), theme (`dark|light`).
- `components/`
  - `RichEditor.tsx` — TipTap editor (B/I/U/S, lists). `apply ↧` transliterates each text node in place,
    preserving marks. **Do not wrap in a `<label>`** (breaks contenteditable focus/shortcuts) — `Field` is a `<div>`.
  - `CardView.tsx` — web study layout; renders card HTML via `Rich` (dangerouslySetInnerHTML).
  - `CardEditor.tsx` — authoring form; per-step vidhi + linked sūtra autocompletes, two notes, tags.
  - `SutraAutocomplete.tsx` — fuzzy sūtra search; global scheme dropdown + output-scheme preview on the side.
  - `SutraChip.tsx` — chip with hover/click gloss popover (English + LSK/SK note).
  - `TagInput.tsx` — badge tag input (Enter/comma), Fuse-fuzzy suggestions from `knownTags`.
  - `TranslitInput.tsx` — **LEGACY/unused** (superseded by RichEditor). Safe to delete.
- `pages/` — Decklist (search via Fuse + AND tag filter + sync/fetch/export/import/duplicate), Author,
  Study, Settings.
- `anki/template.ts` — Anki note type + **server-side HTML renderer**.
- `anki/ankiConnect.ts` — AnkiConnect v6 client.

## Card model (`store/cards.ts`)
```ts
Card { id, direction: 'forward'|'reverse', question, finalResult, finalResultNote,
       steps: Step[], cardNote, tags[], createdAt, updatedAt }
Step { expr, vidhiSutraIds[], linkedSutraIds[], note /* below main sūtras */, linkedNote? /* for secondary */ }
```
All text fields hold **rich HTML** (from RichEditor), not plain text. Render with HTML, not `{text}`.

## Card layout (both web CardView and Anki)
- Front: prompt (by direction) + question.
- Back: result (+ click-to-reveal note) → steps. Each step: number + expr + vidhi chips; expand reveals
  **main note → secondary sūtras as a numbered list → secondary note**. Card note at bottom.

## Anki integration
- **HTML is generated in `template.ts` at sync time** and written to `Front`/`Back` fields. Card templates
  are just `{{Front}}`/`{{Back}}` — **no template JS**. Interactivity is pure HTML/CSS: `<details>` for
  step/result reveal, `:hover`/`:focus-within` for chip gloss popovers.
- Model fields: `CardId, Direction, Question, FinalResult, FinalResultNote, Steps, CardNote, Front, Back, Json`.
  Granular fields are plain-text (`stripHtml`) for Browse inspection; `Json` is exact `JSON.stringify(card)`
  for **lossless fetch-back**; `Front/Back` carry rich HTML.
- Upsert keyed by `CardId` (`findNotes` → `updateNoteFields` else `addNote`) so re-sync updates, no dupes.
- `fetchCards` reconstructs Cards from notes (prefers `Json`, falls back to granular fields).
- Font: `FONT_FACES` (4 Adishila Vedic faces) uploaded to Anki media as `_adishila_vedic*.ttf` via
  `storeMediaFile` on each sync; `@font-face` in model CSS references those media names.
- Card CSS uses `em` sizes scaled from `.ss-card{font-size}` (baked per card from `ankiFontSize`) and CSS
  vars for colors with a `.ss-light` override for light theme (class baked per card from `theme`).
- **Model CSS/templates/fields are only set on model CREATION** (`ensureModel` skips existing). After
  changing model fields/CSS/templates, **delete the `Śabda-Siddhi` note type in Anki once, then re-sync.**
  Per-card things baked into HTML (font size, theme class, content) apply on a normal re-sync.

## AnkiConnect connectivity
- Default URL `http://127.0.0.1:8765`, configurable in Settings. AnkiConnect add-on must run.
- The site's origin must be in AnkiConnect `webCorsOriginList` (Settings page shows the exact snippet).
- HTTPS (Pages) → HTTP-localhost is mixed content; some browsers block it. Fallbacks: run app locally over
  HTTP, or Export/Import JSON. Settings "Test connection" surfaces failures.

## Transliteration
- Global `inputScheme` (you type) → `outputScheme` (preview/convert), persisted, reactive via `useSettings`.
- Sūtra search converts the query to SLP1 in the chosen scheme (or from Devanagari if already in it) then
  fuzzy-matches. RichEditor `apply ↧` converts node text input→output preserving formatting (never silent).

## Theming & fonts
- Theme = `html.theme-light` class; light mode **reverses the Tailwind slate ramp** by overriding
  `--color-slate-*` tokens in `index.css` (Tailwind v4 utilities reference these vars, so all
  `bg-/text-/border-slate-*` flip with zero component edits). Accent colors stay.
- Adishila Vedic family lives at `public/fonts/AdishilaVedic/` (Regular/Bold/Italic/BoldItalic `.ttf`).
  Web `@font-face` is injected at runtime (App.tsx) with BASE_URL — do NOT put it in `index.css` (CSS
  `url()` won't respect the Pages base path). Anki gets the faces via media upload (above).

## Conventions / gotchas
- Always route runtime asset/data/font URLs through `import.meta.env.BASE_URL`.
- After edits, run `npm run typecheck && npm run build`. Keep `tsc` clean (strict, noUnusedLocals).
- A linter normalizes this project to double quotes + semicolons; match the file you're editing.
- Card text is HTML — escape app-generated plain text in Anki output (`esc`), insert card fields verbatim;
  strip tags (`stripHtml`) for plain-text/search projections.
- Commit `package.json` AND `package-lock.json` together; regenerate the lock with npm 10 (see CI gotcha).
