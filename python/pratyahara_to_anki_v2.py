#!/usr/bin/env python3
"""
Pratyāhāra JSON → Anki .apkg converter
Front: pratyāhāra name (e.g. अण्)
Back : the sounds it stands for + the full Māheśvara Sūtra varṇa chart
       with the member sounds highlighted + defining sūtra & number
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


# ─── Varṇa chart data (Māheśvara Sūtras, laid out as in मातृकापाठः) ───────────
# Each place-of-articulation gets one color, reused across every section so the
# whole chart reads as one system (mirrors the reference image).

PLACE_COLOR = {
    "kantha":        ("#f8d0cd", "#a93226", "#5b1a13"),  # bg, border, text
    "taalu":         ("#cfe2f3", "#2874a6", "#1b4f72"),
    "murdha":        ("#d5f5e3", "#1e8449", "#145a32"),
    "danta":         ("#fdf2b0", "#b7950b", "#7d6608"),
    "oshtha":        ("#e4d4ee", "#7d3c98", "#4a235a"),
    "dantoshtha":    ("#fde3cf", "#ba6b1d", "#6e3e0e"),
    "kantha-taalu":  ("#eae2f2", "#333333", "#222222"),
    "kantha-oshtha": ("#f3e3e6", "#333333", "#222222"),
    "nasika":        ("#cdf1f0", "#17a2a2", "#0b5354"),
}

# स्वराः — vowels, grouped by place exactly as in the reference chart.
# Rendered as two rows: single-place vowels, then the कण्ठ+तालु/ओष्ठ combos.
VOWELS = [
    ("अ", "kantha", "कण्ठः"),
    ("इ", "taalu", "तालु"),
    ("उ", "oshtha", "ओष्ठौ"),
    ("ऋ", "murdha", "मूर्धा"),
    ("ऌ", "danta", "दन्ताः"),
    ("ए", "kantha-taalu", "कण्ठ+तालु"),
    ("ऐ", "kantha-taalu", "कण्ठ+तालु"),
    ("ओ", "kantha-oshtha", "कण्ठ+ओष्ठौ"),
    ("औ", "kantha-oshtha", "कण्ठ+ओष्ठौ"),
]

# व्यञ्जनानि — the 5x5 sparśa grid. Columns C1-C5 = अल्पप्राण-अघोष,
# महाप्राण-अघोष, अल्पप्राण-घोष, महाप्राण-घोष, अनुनासिक (nasal, column 5).
COL_LABELS = ["C1", "C2", "C3", "C4", "C5"]
CONSONANT_ROWS = [
    ("kantha", "कण्ठः", ["क्", "ख्", "ग्", "घ्", "ङ्"]),
    ("taalu", "तालु", ["च्", "छ्", "ज्", "झ्", "ञ्"]),
    ("murdha", "मूर्धा", ["ट्", "ठ्", "ड्", "ढ्", "ण्"]),
    ("danta", "दन्ताः", ["त्", "थ्", "द्", "ध्", "न्"]),
    ("oshtha", "ओष्ठौ", ["प्", "फ्", "ब्", "भ्", "म्"]),
]

# अन्तःस्थाः — semivowels
ANTAHSTHA = [
    ("य्", "taalu", "तालु"),
    ("र्", "murdha", "मूर्धा"),
    ("ल्", "danta", "दन्ताः"),
    ("व्", "dantoshtha", "दन्तोष्ठौ"),
]

# ऊष्माणः — sibilants + ह्
USHMAN = [
    ("श्", "taalu", "तालु"),
    ("ष्", "murdha", "मूर्धा"),
    ("स्", "danta", "दन्ताः"),
    ("ह्", "kantha", "कण्ठः"),
]

# अयोगवाहाः — anusvāra / visarga (jihvāmūlīya, upadhmānīya omitted: no
# pratyāhāra in this dataset ever includes them, and they need special glyphs)
AYOGAVAHA = [
    ("अं", "nasika", "नासिका"),
    ("अः", "kantha", "कण्ठः"),
]

ALL_PHONEMES = (
    {v[0] for v in VOWELS}
    | {c for _, _, row in CONSONANT_ROWS for c in row}
    | {a[0] for a in ANTAHSTHA}
    | {u[0] for u in USHMAN}
    | {a[0] for a in AYOGAVAHA}
)


def _cell(symbol: str, place: str, active: bool) -> str:
    cls = "vcell on" if active else "vcell off"
    return f'<div class="{cls} place-{place}">{symbol}</div>'


def render_varna_chart(sounds: list[str]) -> str:
    """Render the full Māheśvara Sūtra chart with `sounds` highlighted."""
    active = set(sounds)

    # स्वराः — 2 rows: single-place vowels, then the कण्ठ+तालु/ओष्ठ combos
    vowel_row1 = "".join(_cell(sym, place, sym in active) for sym, place, _ in VOWELS[:5])
    vowel_row2 = "".join(_cell(sym, place, sym in active) for sym, place, _ in VOWELS[5:])
    vowel_section = f"""
<div class="chart-title">स्वराः</div>
<div class="vrow">{vowel_row1}</div>
<div class="vrow">{vowel_row2}</div>
"""

    # व्यञ्जनानि grid with C1-C5 header + row labels
    col_header = "".join(f'<div class="colhead">{c}</div>' for c in COL_LABELS)
    rows_html = ""
    for place, label, syms in CONSONANT_ROWS:
        cells = "".join(_cell(s, place, s in active) for s in syms)
        rows_html += f'<div class="crow"><div class="rowlabel place-{place}">{label}</div>{cells}</div>'
    consonant_section = f"""
<div class="chart-title">व्यञ्जनानि (स्पर्शाः)</div>
<div class="cgrid">
  <div class="crow"><div class="rowlabel"></div>{col_header}</div>
  {rows_html}
</div>
"""

    # अन्तःस्थाः, then ऊष्माणः — stacked, same layout as every other section
    antahstha_cells = "".join(_cell(s, place, s in active) for s, place, _ in ANTAHSTHA)
    ushman_cells = "".join(_cell(s, place, s in active) for s, place, _ in USHMAN)
    semi_section = f"""
<div class="chart-title">अन्तःस्थाः</div>
<div class="vrow small">{antahstha_cells}</div>
<div class="chart-title">ऊष्माणः</div>
<div class="vrow small">{ushman_cells}</div>
"""

    ayogavaha_cells = "".join(_cell(s, place, s in active) for s, place, _ in AYOGAVAHA)
    ayogavaha_section = f"""
<div class="chart-title">अयोगवाहाः</div>
<div class="vrow small">{ayogavaha_cells}</div>
"""

    return f"""
<div class="varna-chart">
{vowel_section}{consonant_section}{semi_section}{ayogavaha_section}
</div>
"""


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

/* ── Varṇa chart ── */
.varna-chart { margin-top: 10px; text-align:center; }
.chart-title { font-size: 11px; color:#888; letter-spacing:1px; text-transform:uppercase;
               margin: 14px 0 6px; font-weight:700; }
.vrow        { display:flex; justify-content:center; flex-wrap:wrap; gap:6px; margin:4px 0; }
.vrow.small  { gap:5px; }
.vcell       { display:inline-flex; align-items:center; justify-content:center;
               min-width:34px; height:34px; padding:0 6px; border-radius:8px;
               font-size:18px; font-weight:600; border:2px solid transparent; }
.vcell.off   { opacity:0.30; filter:grayscale(55%); }
.vcell.on    { opacity:1; border-color:#f1c40f; box-shadow:0 0 0 2px #f1c40f55;
               font-weight:800; transform:scale(1.06); }

.place-kantha        { background:#f8d0cd; color:#5b1a13; }
.place-taalu         { background:#cfe2f3; color:#1b4f72; }
.place-murdha        { background:#d5f5e3; color:#145a32; }
.place-danta         { background:#fdf2b0; color:#7d6608; }
.place-oshtha        { background:#e4d4ee; color:#4a235a; }
.place-dantoshtha    { background:#fde3cf; color:#6e3e0e; }
.place-kantha-taalu  { background:#eae2f2; color:#222; border:1px solid #333 !important; }
.place-kantha-oshtha { background:#f3e3e6; color:#222; border:1px solid #333 !important; }
.place-nasika        { background:#cdf1f0; color:#0b5354; }

.cgrid  { display:inline-block; margin-top:4px; }
.crow   { display:flex; align-items:center; justify-content:center; gap:6px; margin:4px 0; }
.colhead{ width:34px; font-size:14px; font-weight:800; color:#666; text-align:center; }
.rowlabel { width:58px; font-size:12px; font-weight:700; text-align:right;
            padding-right:6px; color:#555; }

.affix-note { font-size:13px; color:#888; margin-top:10px; font-style:italic; }

/* ── Compact mode: shrink the sound chips + whole chart when the chart is shown ── */
.compact .sounds     { margin: 4px 0 6px; }
.compact .sound      { font-size:15px; padding:4px 10px; margin:3px; }
.compact .chart-title{ font-size:10px; margin:10px 0 4px; }
.compact .vcell      { min-width:26px; height:26px; padding:0 4px; font-size:14px; border-radius:6px; }
.compact .vrow       { gap:4px; }
.compact .vrow.small { gap:4px; }
.compact .colhead    { width:26px; font-size:12px; }
.compact .rowlabel   { width:46px; font-size:10px; padding-right:4px; }
.compact .cgrid .crow{ gap:4px; margin:3px 0; }
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

    # Only render the Śiva Sūtra varṇa chart for phoneme-based pratyāhāras
    # (अण्, हल्, अच् …). The dataset also has a handful of affix-list
    # pratyāhāras (सुप्, तिङ्, तङ्, आप्, कृञ्, तृन्, सङ्) built from vibhakti/
    # tiṅ suffixes, not from the 14 Sūtras — no chart applies to those.
    has_chart = bool(sounds) and set(sounds) <= ALL_PHONEMES
    if has_chart:
        chart_block = render_varna_chart(sounds)
    else:
        chart_block = '<div class="affix-note">Affix-list pratyāhāra (not part of the Śiva Sūtra varṇa chart).</div>'

    wrapper_class = "compact" if has_chart else ""
    return f"""
<div class="{wrapper_class}">
<div class="label">Sounds</div>
<div class="sounds">{sounds_html}</div>
{chart_block}
</div>
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
