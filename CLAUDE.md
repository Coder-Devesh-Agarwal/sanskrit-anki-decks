# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single Python script that converts Sanskrit grammar datasets (Pāṇinian dhātus / verbal roots) into an Anki flashcard deck (`.apkg`) using the `genanki` library. The output deck has two card types per root: an **identity card** (root → meanings, gaṇa, pada, iṭ class) and one **roop-table card per lakāra** (tense/mood → full 3×3 conjugation table of puruṣa × vacana).

## Commands

```bash
pip install genanki                              # only dependency

# Default run — all lakāras, both card types:
python3 dhatu_identity_to_anki.py --output dhatu_deck.apkg

# Identity cards only (skip conjugation tables):
python3 dhatu_identity_to_anki.py --identity-only --output decks/dhatu_identity_deck.apkg

# Subset of lakāras only (keys are roop-data field names, see LAKARA_META):
python3 dhatu_identity_to_anki.py --lakara alat plat alang plang
```

Defaults: `--dhatu ./data_files/dhatu.json`, `--roopa ./data_files/dhatuforms_vidyut_shuddha_kartari.json`, `--deck "Dhātu Identity Deck"`. No tests/lint/build config.

## Architecture

`dhatu_identity_to_anki.py` is one ETL pipeline:

1. **Load + normalize** two JSON inputs (`main()`). Both accept either a `{"name":..,"data":..}` wrapper, a bare array/dict, or a single object — the loader unwraps each.
2. **Join** the two datasets on the `baseindex` key (e.g. `"01.0001"`): each dhātu record in `dhatu.json` is matched to its conjugation entry in the roopa file via `roopa_map[baseindex]`.
3. **Render** HTML cards (`front_*`/`back_*` builders + `render_table_html`) styled by inline `CARD_CSS` (Devanagari fonts, colored badges, table). Parasmaipada cards are blue-themed, ātmanepada purple.
4. **Emit** notes into a `genanki.Deck` (`convert()`), package, `write_to_file()`.

### Key conventions
- **Stable IDs:** model and deck IDs come from `stable_id(seed)` = first 8 hex of md5(seed). Reusing the same seed string keeps the same Anki ID across runs (deck stays the same deck on re-import). Change the seed to fork a new deck.
- **Idempotent re-import:** each note's `guid = guid_for(f"{baseindex}_{key}")`. Re-running and re-importing updates existing cards instead of duplicating. Don't change the guid scheme casually — it breaks the link to already-studied cards.
- **Roop string format:** a lakāra value is 9 cells separated by `;` (prathama-eka → uttama-bahu, row-major), with `,` separating alternate forms inside a cell. `parse_roopa_row` / `all_first_forms` decode this; pads short strings with `—`.
- **Tags:** `build_tags()` derives Anki tags from metadata (gana-N, pada-*, it-*, antargana-*) plus raw `tags` from the data; spaces → underscores, deduped.

### Data files (`data_files/`)
- `dhatu.json` — root metadata (`baseindex`, `dhatu`, `aupadeshik`, `gana`, `pada`, `settva`, `karma`, `artha*`, `tags`, `upasargas`). Primary input.
- `dhatuforms_vidyut_shuddha_kartari.json` — conjugation tables keyed by `baseindex`; fields are lakāra keys (`plat`, `alat`, `plit`, …). Roopa input.
- `dhatuprayogas.json` — scriptural usage citations keyed by baseindex. **Not consumed by the script yet** — available for an "examples" card type.
- `pratyahara.json` — pratyāhāra data (`name`, `list`, `sutra`, `sutranum`). Different schema; **not handled by this script** — would need its own model/builders.

## Gotchas

- **Duplicate `first_form` definition:** defined at module top (~line 83) and again later (~line 253). The second definition wins (different semantics — keeps comma alternates). Edit the live one, or remove the dead one.
- **`--roopa` missing is non-fatal:** the script warns and emits identity cards only. A wrong path silently degrades output rather than erroring.
- Adding a new card type (prayogas, pratyahara) means a new `genanki.Model` with its own `stable_id` seed and front/back builders — don't overload the existing Dhātu Model.
