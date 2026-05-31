#!/usr/bin/env python3
"""
Dhatu JSON → Anki .apkg converter
Generates cards for:
  1. Basic dhatu identity   (front: dhatu + aupadeshik | back: meanings + meta)
  2. ātmanepada lat roop     (front: "alat table of X?" | back: full 3×3 table)
  3. parasmaipadī lat roop   (front: "plat table of X?" | back: full 3×3 table)
  + one card per additional lakāra present in the roopa data
"""

import json, sys, re, hashlib, argparse, os
import genanki

# ─── Metadata maps ────────────────────────────────────────────────────────────

GANA_NAMES = {
    "1": "भ्वादि (1st)",  "2": "अदादि (2nd)",  "3": "जुहोत्यादि (3rd)",
    "4": "दिवादि (4th)",  "5": "स्वादि (5th)",  "6": "तुदादि (6th)",
    "7": "रुधादि (7th)",  "8": "तनादि (8th)",   "9": "क्र्यादि (9th)",
    "10": "चुरादि (10th)"
}

PADA_NAMES = {
    "P": "परस्मैपदी", "A": "आत्मनेपदी", "U": "उभयपदी"
}

SETTVA_NAMES = {
    "S": "सेट् (takes इट्)", "A": "अनिट् (no इट्)", "V": "वेट् (optional इट्)"
}

KARMA_NAMES = {
    "S": "सकर्मक (transitive)", "A": "अकर्मक (intransitive)",
    "U": "उभय (both)", "": ""
}

# Lakara keys → (display name, category prefix)
# prefix: a = ātmanepada form, p = parasmaipada form
LAKARA_META = {
    # ātmanepada / parasmaipada lat (present)
    "alat":  ("लट् – आत्मनेपद (present)",        "a", "लट्"),
    "plat":  ("लट् – परस्मैपद (present)",         "p", "लट्"),
    # lit (perfect)
    "alit":  ("लिट् – आत्मनेपद (perfect)",        "a", "लिट्"),
    "plit":  ("लिट् – परस्मैपद (perfect)",         "p", "लिट्"),
    # lut (periphrastic future)
    "alut":  ("लुट् – आत्मनेपद (1st future)",     "a", "लुट्"),
    "plut":  ("लुट् – परस्मैपद (1st future)",      "p", "लुट्"),
    # lrut (simple future)
    "alrut": ("लृट् – आत्मनेपद (2nd future)",     "a", "लृट्"),
    "plrut": ("लृट् – परस्मैपद (2nd future)",      "p", "लृट्"),
    # lot (imperative)
    "alot":  ("लोट् – आत्मनेपद (imperative)",      "a", "लोट्"),
    "plot":  ("लोट् – परस्मैपद (imperative)",       "p", "लोट्"),
    # lang (imperfect)
    "alang": ("लङ् – आत्मनेपद (imperfect)",        "a", "लङ्"),
    "plang": ("लङ् – परस्मैपद (imperfect)",         "p", "लङ्"),
    # vidhiling (optative/potential)
    "avidhiling": ("विधिलिङ् – आत्मनेपद (optative)",   "a", "विधिलिङ्"),
    "pvidhiling": ("विधिलिङ् – परस्मैपद (optative)",    "p", "विधिलिङ्"),
    # ashirling (benedictive)
    "aashirling": ("आशीर्लिङ् – आत्मनेपद (benedictive)", "a", "आशीर्लिङ्"),
    "pashirling": ("आशीर्लिङ् – परस्मैपद (benedictive)", "p", "आशीर्लिङ्"),
    # lung (aorist)
    "alung": ("लुङ् – आत्मनेपद (aorist)",          "a", "लुङ्"),
    "plung": ("लुङ् – परस्मैपद (aorist)",           "p", "लुङ्"),
    # lrung (conditional)
    "alrung": ("लृङ् – आत्मनेपद (conditional)",    "a", "लृङ्"),
    "plrung": ("लृङ् – परस्मैपद (conditional)",     "p", "लृङ्"),
}

# Row/col labels for 3×3 table
# Parasmaipada: rows = purusha (prathama/madhyama/uttama), cols = vachana (eka/dvi/bahu)
PURUSHA_ROWS = ["प्रथमपुरुष", "मध्यमपुरुष", "उत्तमपुरुष"]
VACHANA_COLS = ["एकवचन", "द्विवचन", "बहुवचन"]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def stable_id(seed: str) -> int:
    """Produce a stable int model/deck ID from a string seed."""
    return int(hashlib.md5(seed.encode()).hexdigest()[:8], 16)


def first_form(raw: str) -> str:
    """Return the prathama-purusha ekavachana — first cell, first alternate form."""
    if not raw:
        return ""
    cell = raw.strip().split(";")[0]
    return cell.split(",")[0].strip()


def parse_roopa_row(raw: str) -> list[list[str]]:
    """
    Parse a lakara string into 3×3 list[list[str]].
    Semicolons separate the 9 cells (prathama-eka … uttama-bahu).
    Commas within a cell = alternate forms.
    Returns [[p1e, p1d, p1b], [p2e, p2d, p2b], [p3e, p3d, p3b]]
    """
    cells = raw.strip().split(";")
    # Pad to 9 if fewer
    while len(cells) < 9:
        cells.append("—")
    table = []
    for row_i in range(3):
        row = []
        for col_i in range(3):
            idx = row_i * 3 + col_i
            cell = cells[idx].strip() if idx < len(cells) else "—"
            row.append(cell if cell else "—")
        table.append(row)
    return table


def render_table_html(table: list[list[str]], pada_prefix: str) -> str:
    """Render 3×3 roop table as styled HTML."""
    color = "#1a5276" if pada_prefix == "p" else "#4a235a"
    header_bg = "#d6eaf8" if pada_prefix == "p" else "#e8daef"
    rows_html = ""
    for r_i, row in enumerate(table):
        cells = ""
        for c_i, cell in enumerate(row):
            # Alternate forms: split by comma, show stacked
            forms = [f.strip() for f in cell.split(",") if f.strip()]
            cell_content = "<br>".join(
                f'<span style="font-size:15px;">{f}</span>' for f in forms
            ) if forms else "—"
            cells += f'<td style="padding:8px 12px; text-align:center; border:1px solid #ccc;">{cell_content}</td>'
        rows_html += f"<tr><td style='padding:8px 10px; font-size:12px; color:#555; font-weight:600; background:#f8f8f8; border:1px solid #ccc; white-space:nowrap;'>{PURUSHA_ROWS[r_i]}</td>{cells}</tr>"

    col_headers = "".join(
        f'<th style="padding:8px 12px; background:{header_bg}; border:1px solid #ccc; font-size:12px; color:{color};">{v}</th>'
        for v in VACHANA_COLS
    )

    return f"""
<table style="border-collapse:collapse; width:100%; margin-top:6px; font-family: sans-serif;">
  <thead>
    <tr>
      <th style="padding:8px 10px; background:{header_bg}; border:1px solid #ccc; font-size:12px; color:{color};"></th>
      {col_headers}
    </tr>
  </thead>
  <tbody>
    {rows_html}
  </tbody>
</table>"""


def build_tags(dhatu: dict, extra_tags: list[str] = None) -> list[str]:
    """Build a clean Anki tag list from dhatu metadata."""
    tags = []

    # Gana
    g = str(dhatu.get("gana", "")).strip()
    if g:
        tags.append(f"gana-{g}")
        name_clean = GANA_NAMES.get(g, "").split("(")[0].strip().replace(" ", "_")
        if name_clean:
            tags.append(name_clean)

    # Pada
    p = dhatu.get("pada", "").strip()
    if p:
        tags.append(f"pada-{p}")
        if p == "P": tags.append("parasmaipadi")
        elif p == "A": tags.append("atmanepadi")
        elif p == "U": tags.append("ubhayapadi")

    # Settva
    s = dhatu.get("settva", "").strip()
    if s:
        tags.append(f"it-{s}")
        if s == "S": tags.append("setu")
        elif s == "A": tags.append("anitu")
        elif s == "V": tags.append("vetu")

    # Karma
    k = dhatu.get("karma", "").strip()
    if k:
        if k == "S": tags.append("sakarmaka")
        elif k == "A": tags.append("akarmaka")
        elif k == "U": tags.append("ubhaya-karma")

    # Antargana
    ag = dhatu.get("antarganas", "").strip()
    if ag:
        for a in re.split(r"[,\s]+", ag):
            a = a.strip()
            if a:
                tags.append(f"antargana-{a}")

    # Source tags from data (e.g. "उदात्तोपदेशः,mspsetu,common")
    raw_tags = dhatu.get("tags", "")
    if raw_tags:
        for t in re.split(r"[,\s]+", raw_tags):
            t = t.strip()
            if t and t not in tags:
                tags.append(t)

    # Extras (e.g. lakara name)
    if extra_tags:
        tags.extend(extra_tags)

    # Deduplicate preserving order, Anki-safe (no spaces → underscores)
    seen = set()
    clean = []
    for t in tags:
        t2 = t.replace(" ", "_")
        if t2 and t2 not in seen:
            seen.add(t2)
            clean.append(t2)
    return clean


# ─── Card HTML builders ───────────────────────────────────────────────────────

CARD_CSS = """
body { font-family: 'Noto Sans Devanagari', 'Lohit Devanagari', sans-serif;
       margin: 0; padding: 14px; background: #fff; color: #111; }
.dhatu-title { font-size: 36px; font-weight: 700; color: #1a3a5c; margin-bottom:2px; }
.aupadeshik  { font-size: 18px; color: #7f8c8d; margin-bottom: 10px; }
.artha       { font-size: 15px; color: #2c3e50; margin-bottom: 6px; }
.meta-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px;
               margin: 10px 0; font-size: 13px; }
.meta-item   { background: #f4f6f7; border-radius: 6px; padding: 5px 9px; }
.meta-label  { color: #888; font-size: 11px; margin-bottom: 1px; }
.meta-value  { color: #2c3e50; font-weight: 600; }
.badge       { display:inline-block; padding:2px 9px; border-radius:999px;
               font-size:11px; font-weight:600; margin: 2px 2px; }
.badge-blue  { background:#d6eaf8; color:#1a5276; }
.badge-green { background:#d5f5e3; color:#1e8449; }
.badge-amber { background:#fef9e7; color:#b7770d; border:1px solid #f0c040; }
.badge-purple{ background:#e8daef; color:#4a235a; }
.badge-coral { background:#fde8e4; color:#922b21; }
.lakara-name { font-size:17px; font-weight:700; color:#4a235a; margin-bottom:8px; }
.question    { font-size:22px; font-weight:600; color:#1a3a5c; margin-bottom:4px; }
.q-sub       { font-size:13px; color:#7f8c8d; margin-bottom:10px; }
.upasarga-row{ font-size:13px; margin: 3px 0; }
.up-name     { font-weight:700; color:#1a5276; }
.note-box    { margin-top:12px; font-size:12px; color:#666; border-left:3px solid #bbb;
               padding-left:8px; font-style:italic; }
hr           { border:none; border-top:1px solid #e0e0e0; margin: 10px 0; }
"""


def front_identity(dhatu: dict) -> str:
    aud = dhatu.get("aupadeshik", "") or dhatu.get("dhatu", "?")
    return f"""
<div class="dhatu-title">{aud}</div>
<div style="font-size:13px; color:#888; margin-top:10px;">What is this dhātu? Give its meanings, gaṇa, pada, and iṭ classification.</div>
"""


def first_form(raw: str) -> str:
    """First cell of a lakara string (semicolon-separated). Commas = alternate forms, kept as-is."""
    if not raw:
        return ""
    return raw.strip().split(";")[0].strip()


def all_first_forms(raw: str) -> list:
    """
    For each of the 9 cells (;-separated), return the first alternate (, separated).
    Handles cases like 'अर्हति,अर्हयति;अर्हतः,अर्हयतः;...'
    Returns list of 9 strings.
    """
    if not raw:
        return ["—"] * 9
    cells = raw.strip().split(";")
    result = []
    for c in cells[:9]:
        first = c.split(",")[0].strip()
        result.append(first if first else "—")
    while len(result) < 9:
        result.append("—")
    return result


def back_identity(dhatu: dict, roopa: dict = None) -> str:
    d    = dhatu.get("dhatu", "?")
    aud  = dhatu.get("aupadeshik", "") or d
    artha= dhatu.get("artha", "")
    g    = str(dhatu.get("gana",""))
    pada = dhatu.get("pada","")
    sett = dhatu.get("settva","")
    karm = dhatu.get("karma","")
    eng  = dhatu.get("artha_english","")
    hin  = dhatu.get("artha_hindi","")
    ag   = dhatu.get("antarganas","").strip()
    note = dhatu.get("dhaturoopnandini_note","").strip()
    bi   = dhatu.get("baseindex","")

    roopa = roopa or {}

    # ── Quick-look bar: dhatu — artha — plat(1st) / alat(1st) ───────────────
    plat_form = first_form(roopa.get("plat",""))
    alat_form = first_form(roopa.get("alat",""))
    lat_chips = []
    if plat_form:
        lat_chips.append(
            f'<span style="background:#d6eaf8;color:#1a5276;padding:3px 10px;'
            f'border-radius:999px;font-size:13px;font-weight:600;"'
            f' title="लट् परस्मैपद प्रथमपुरुष एकवचन">'
            f'{plat_form}<sup style="font-size:9px;font-weight:700;'
            f'vertical-align:super;line-height:0;margin-left:2px;">PP</sup></span>'
    )
    if alat_form:
        lat_chips.append(
            f'<span style="background:#e8daef;color:#4a235a;padding:3px 10px;'
            f'border-radius:999px;font-size:13px;font-weight:600;"'
            f' title="लट् आत्मनेपद प्रथमपुरुष एकवचन">'
            f'{alat_form}<sup style="font-size:9px;font-weight:700;'
            f'vertical-align:super;line-height:0;margin-left:2px;">AP</sup></span>'
    )
    lat_str = " / ".join(lat_chips) if lat_chips else ""

    quicklook = (
        f'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;'
        f'padding:8px 12px;background:#f4f6f7;border-radius:8px;margin-bottom:12px;'
        f'border-left:3px solid #1a5276;">'
        f'<span style="font-size:17px;font-weight:700;color:#1a3a5c;">{d}</span>'
        f'<span style="color:#bbb;">—</span>'
        f'<span style="font-size:13px;color:#555;">{artha}</span>'
        + (f'<span style="color:#bbb;">·</span>{lat_str}' if lat_str else "")
        + f'</div>'
    )

    # ── Meta grid ────────────────────────────────────────────────────────────
    meta_items = [
        ("Gaṇa", f"{g} — {GANA_NAMES.get(g,'')}"),
        ("Pada", f"{pada} — {PADA_NAMES.get(pada,'')}"),
        ("Iṭ",   f"{sett} — {SETTVA_NAMES.get(sett,'')}"),
        ("Karma", KARMA_NAMES.get(karm, karm)),
    ]
    if ag:
        meta_items.append(("Antargaṇa", ag))
    if bi:
        meta_items.append(("Index", bi))

    meta_html = "".join(
        f'<div class="meta-item"><div class="meta-label">{k}</div>'
        f'<div class="meta-value">{v}</div></div>'
        for k, v in meta_items if v.strip()
    )

    upasargas = dhatu.get("upasargas", [])
    up_html = ""
    if upasargas:
        rows = "".join(
            f'<div class="upasarga-row"><span class="up-name">{u["name"]}</span>'
            f' — {u.get("artha_hindi","")}</div>'
            for u in upasargas
        )
        up_html = f'<div style="margin-top:10px;"><div style="font-size:11px;color:#888;margin-bottom:4px;">UPASARGAS</div>{rows}</div>'

    note_html = f'<div class="note-box">{note}</div>' if note else ""

    # ── Roop accordions: plat + alat full 3×3 tables ─────────────────────────
    accordions = ""
    for lk in ("plat", "alat"):
        raw = roopa.get(lk, "").strip()
        if not raw:
            continue
        lmeta    = LAKARA_META.get(lk, (lk, "?", lk))
        lak_name = lmeta[0]
        pada_pfx = lmeta[1]
        tbl_html = render_table_html(parse_roopa_row(raw), pada_pfx)
        accordions += (
            f'<details style="margin-top:8px; border:1px solid #e0e0e0; border-radius:6px; padding:4px 8px;">'
            f'<summary style="cursor:pointer; font-weight:600; color:#1a3a5c;">{lak_name}</summary>'
            f'{tbl_html}'
            f'</details>'
        )
    accordions_html = (
        f'<hr><div style="font-size:14px; font-weight:600; color:#1a3a5c; margin-bottom:4px;">लट् roop</div>{accordions}'
        if accordions else ""
    )

    return f"""
{quicklook}
<div style="font-size:14px; font-weight:600; color:#1a3a5c; margin-bottom:4px;">Meanings</div>
<div style="margin-bottom:4px;">{eng}</div>
<div style="font-size:13px; color:#555; margin-bottom:10px;">{hin}</div>
<hr>
<div class="meta-grid">{meta_html}</div>
{up_html}
{note_html}
{accordions_html}
"""


def front_roopa(dhatu: dict, lakara_key: str) -> str:
    aud      = dhatu.get("aupadeshik","") or dhatu.get("dhatu","?")
    lmeta    = LAKARA_META.get(lakara_key, (lakara_key, "?", lakara_key))
    lak_name = lmeta[0]
    return f"""
<div class="dhatu-title">{aud}</div>
<div class="q-sub" style="margin-top:6px;">{lak_name}</div>
<div style="font-size:13px; color:#888; margin-top:6px;">Write the complete dhāturoopa table.</div>
"""


def back_roopa(dhatu: dict, lakara_key: str, roopa_raw: str) -> str:
    lmeta    = LAKARA_META.get(lakara_key, (lakara_key, "?", lakara_key))
    lak_name = lmeta[0]
    pada_pfx = lmeta[1]
    table    = parse_roopa_row(roopa_raw)
    tbl_html = render_table_html(table, pada_pfx)
    eng      = dhatu.get("artha_english","")
    return f"""
<div class="lakara-name">{lak_name}</div>
<div style="font-size:12px; color:#888; margin-bottom:8px;">{eng}</div>
{tbl_html}
"""


# ─── Anki model & deck ────────────────────────────────────────────────────────

def make_model() -> genanki.Model:
    return genanki.Model(
        stable_id("dhatu_model_v3"),
        "Dhātu Model",
        fields=[
            {"name": "Front"},
            {"name": "Back"},
            {"name": "DhatuKey"},   # for deduplication
        ],
        templates=[{
            "name": "Dhātu Card",
            "qfmt": "{{Front}}",
            "afmt": "{{Front}}<hr id=answer>{{Back}}",
        }],
        css=CARD_CSS,
    )


# ─── Main converter ───────────────────────────────────────────────────────────

def convert(dhatu_list: list[dict], roopa_map: dict,
            deck_name: str = "Sanskrit Dhātu Deck",
            lakara_filter: list[str] = None,
            identity_only: bool = False) -> genanki.Deck:
    """
    dhatu_list    : list of dhatu objects (your main JSON array)
    roopa_map     : dict keyed by baseindex → lakara data dict
    deck_name     : Anki deck name
    lakara_filter : if given, only include these lakara keys for roop cards
    identity_only : if True, only generate identity cards (no roop tables)
    """
    model  = make_model()
    deck   = genanki.Deck(stable_id(deck_name), deck_name)
    notes_added = 0

    for dhatu in dhatu_list:
        bi   = dhatu.get("baseindex", "")
        d    = dhatu.get("dhatu", "?")
        base_tags = build_tags(dhatu)

        # ── Card 1: Identity card ────────────────────────────────────────────
        roopa = roopa_map.get(bi, {})
        note = genanki.Note(
            model=model,
            fields=[
                front_identity(dhatu),
                back_identity(dhatu, roopa),
                f"{bi}_identity",
            ],
            tags=base_tags,
            guid=genanki.guid_for(f"{bi}_identity"),
        )
        deck.add_note(note)
        notes_added += 1

        # ── Cards 2+: Roop tables ────────────────────────────────────────────
        if identity_only or not roopa:
            continue

        keys_to_process = lakara_filter if lakara_filter else list(LAKARA_META.keys())

        for lk in keys_to_process:
            raw = roopa.get(lk, "").strip()
            if not raw:
                continue

            lmeta    = LAKARA_META[lk]
            lak_disp = lmeta[2]   # short name like लट्, लिट् etc.

            extra = [f"lakara-{lk}", lak_disp.rstrip("्").replace("्","")]
            tags  = build_tags(dhatu, extra_tags=extra)

            note = genanki.Note(
                model=model,
                fields=[
                    front_roopa(dhatu, lk),
                    back_roopa(dhatu, lk, raw),
                    f"{bi}_{lk}",
                ],
                tags=tags,
                guid=genanki.guid_for(f"{bi}_{lk}"),
            )
            deck.add_note(note)
            notes_added += 1

    print(f"  ✓ {notes_added} notes added to deck '{deck_name}'")
    return deck


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convert dhatu JSON + roopa JSON → Anki .apkg"
    )
    parser.add_argument("--dhatu",  default="./data_files/dhatu.json",
                        help="Path to dhatu JSON (default: dhatu.json)")
    parser.add_argument("--roopa",  default="./data_files/dhatuforms_vidyut_shuddha_kartari.json",
                        help="Path to roopa JSON (default: dhatuforms_vidyut_shuddha_kartari.json)")
    parser.add_argument("--output", default="dhatu_deck.apkg", help="Output .apkg path")
    parser.add_argument("--deck",   default="Dhātu Identity Deck", help="Deck name")
    parser.add_argument("--lakara", nargs="*",
                        help="Lakara keys to include (default: all). e.g. alat plat alang plang")
    parser.add_argument("--identity-only", action="store_true",
                        help="Generate only identity cards (no roop tables)")
    args = parser.parse_args()

    # ── Load dhatu data ──────────────────────────────────────────────────────
    # Supports: { "name": "dhatu", "data": [...] }  OR  plain array  OR  single object
    with open(args.dhatu, encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict) and "data" in raw:
        dhatu_list = raw["data"]
    elif isinstance(raw, list):
        dhatu_list = raw
    else:
        dhatu_list = [raw]

    # ── Load roopa data ──────────────────────────────────────────────────────
    # Supports: plain dict keyed by baseindex  OR  { "data": { "01.0001": {...} } }
    roopa_map = {}
    if os.path.exists(args.roopa):
        with open(args.roopa, encoding="utf-8") as f:
            raw_r = json.load(f)
        if isinstance(raw_r, dict) and "data" in raw_r:
            roopa_map = raw_r["data"]
        else:
            roopa_map = raw_r
    else:
        print(f"  ⚠ Roopa file not found: {args.roopa} — skipping roop cards.")

    print(f"Loaded {len(dhatu_list)} dhātus, {len(roopa_map)} roopa entries.")

    deck = convert(dhatu_list, roopa_map,
                   deck_name=args.deck,
                   lakara_filter=args.lakara,
                   identity_only=args.identity_only)

    package = genanki.Package(deck)
    package.write_to_file(args.output)
    print(f"  ✓ Written: {args.output}")


if __name__ == "__main__":
    main()