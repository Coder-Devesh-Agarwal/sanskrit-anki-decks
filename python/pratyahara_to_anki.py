#!/usr/bin/env python3
"""
Pratyāhāra JSON → Anki .apkg converter
Front: pratyāhāra name (e.g. अण्)
Back : the sounds it stands for + defining sūtra + sūtra number
"""

import json, re, hashlib, argparse, os
import genanki

# ─── Helpers ──────────────────────────────────────────────────────────────────

def stable_id(seed: str) -> int:
    """Stable int model/deck ID from a string seed."""
    return int(hashlib.md5(seed.encode()).hexdigest()[:8], 16)


def clean_sutra(raw: str) -> str:
    """Strip <<...>> wrapper from the sūtra text."""
    return re.sub(r"^<<|>>$", "", raw.strip()).strip()


def clean_sutranum(raw: str) -> str:
    """Strip [[...]] wrapper from the sūtra number (e.g. 6.3.111)."""
    return re.sub(r"^\[\[|\]\]$", "", raw.strip()).strip()


def split_sounds(raw: str) -> list[str]:
    """Split the comma-separated sound list into clean tokens."""
    return [s.strip() for s in raw.split(",") if s.strip()]


# ─── Card HTML ────────────────────────────────────────────────────────────────

CARD_CSS = """
body { font-family: 'Noto Sans Devanagari', 'Lohit Devanagari', sans-serif;
       margin: 0; padding: 16px; background: #fff; color: #111; text-align: center; }
.pratyahara  { font-size: 44px; font-weight: 700; color: #1a3a5c; margin: 6px 0; }
.prompt      { font-size: 13px; color: #888; margin-top: 10px; }
.sounds      { margin: 8px 0 14px; }
.sound       { display:inline-block; background:#d6eaf8; color:#1a5276;
               font-size:22px; font-weight:600; border-radius:8px;
               padding:6px 14px; margin:4px; }
.label       { font-size:11px; color:#888; letter-spacing:1px; text-transform:uppercase;
               margin: 12px 0 4px; }
.sutra       { font-size:18px; color:#4a235a; font-weight:600; }
.sutranum    { display:inline-block; background:#e8daef; color:#4a235a;
               border-radius:999px; padding:3px 12px; font-size:14px;
               font-weight:600; margin-top:6px; }
hr           { border:none; border-top:1px solid #e0e0e0; margin: 12px 0; }
"""


def front_html(name: str) -> str:
    return f"""
<div class="pratyahara">{name}</div>
<div class="prompt">Which sounds does this pratyāhāra denote? Name its defining sūtra.</div>
"""


def back_html(item: dict) -> str:
    sounds = split_sounds(item.get("list", ""))
    sounds_html = "".join(f'<span class="sound">{s}</span>' for s in sounds) or "—"
    sutra    = clean_sutra(item.get("sutra", ""))
    sutranum = clean_sutranum(item.get("sutranum", ""))

    sutra_block = ""
    if sutra:
        sutra_block += f'<div class="label">Sūtra</div><div class="sutra">{sutra}</div>'
    if sutranum:
        sutra_block += f'<div class="sutranum">{sutranum}</div>'

    return f"""
<div class="label">Sounds</div>
<div class="sounds">{sounds_html}</div>
<hr>
{sutra_block}
"""


# ─── Anki model & deck ────────────────────────────────────────────────────────

def make_model() -> genanki.Model:
    return genanki.Model(
        stable_id("pratyahara_model_v1"),
        "Pratyāhāra Model",
        fields=[
            {"name": "Front"},
            {"name": "Back"},
            {"name": "Key"},   # for stable guid / dedup
        ],
        templates=[{
            "name": "Pratyāhāra Card",
            "qfmt": "{{Front}}",
            "afmt": "{{Front}}<hr id=answer>{{Back}}",
        }],
        css=CARD_CSS,
    )


# ─── Main converter ───────────────────────────────────────────────────────────

def convert(items: list[dict], deck_name: str) -> genanki.Deck:
    model = make_model()
    deck  = genanki.Deck(stable_id(deck_name), deck_name)
    seen  = set()
    added = 0

    for item in items:
        name = item.get("name", "").strip()
        if not name:
            continue
        # Dedup on name + sutranum (data has repeated entries)
        key = f"{name}_{clean_sutranum(item.get('sutranum',''))}"
        if key in seen:
            continue
        seen.add(key)

        note = genanki.Note(
            model=model,
            fields=[front_html(name), back_html(item), key],
            tags=["pratyahara"],
            guid=genanki.guid_for(f"pratyahara_{key}"),
        )
        deck.add_note(note)
        added += 1

    print(f"  ✓ {added} notes added to deck '{deck_name}'")
    return deck


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convert pratyahara JSON → Anki .apkg"
    )
    parser.add_argument("--input",  default="./data_files/pratyahara.json",
                        help="Path to pratyahara JSON")
    parser.add_argument("--output", default="decks/pratyahara_deck.apkg",
                        help="Output .apkg path")
    parser.add_argument("--deck",   default="Pratyāhāra Deck", help="Deck name")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict) and "data" in raw:
        items = raw["data"]
    elif isinstance(raw, list):
        items = raw
    else:
        items = [raw]

    print(f"Loaded {len(items)} pratyāhāra entries.")

    deck = convert(items, args.deck)

    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    genanki.Package(deck).write_to_file(args.output)
    print(f"  ✓ Written: {args.output}")


if __name__ == "__main__":
    main()
