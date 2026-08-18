// Generates a Śabda-Siddhi deck (importable via Decklist → Import JSON) covering
// every sūtra that belongs to the Laghusiddhāntakaumudī (LSK) ordering — i.e.
// every entry in ../../data_files/sutraani_data.json with a non-zero `lskn`.
//
// Each sūtra becomes one `generic`-type, `sync:false` card (reference material —
// kept out of Anki sync by default; flip the switch per-card in the app, or
// re-run with --sync to generate them pre-enabled):
//   question        — Devanagari sūtra + reference + LSK number
//   finalResult     — basic English description (vasu_english_summary.json)
//   finalResultNote — sūtrārtha, short (sutrartha.json[id].sa)
//   step.expr       — sūtra reconstructed with its anuvṛtti words (sutraani `ss`)
//   step.head       — anuvṛtti word list, each resolved to its source ref
//   step.note       — sūtrārtha, detailed (sutrartha.json[id].sd, HTML-sanitized)
//
// Usage (from web/):  node scripts/gen-lsk-deck.mjs [--deck "Name"] [--out path] [--sync]
// Output defaults to ../decks/json/lsk_deck.json

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "data_files");
const decksDir = join(here, "..", "..", "decks", "json"); // generated decks

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const DECK_NAME = arg("--deck", "लघुसिद्धान्तकौमुदी");
const OUT_PATH = resolve(arg("--out", join(decksDir, "lsk_deck.json")));
const SYNC_DEFAULT = process.argv.includes("--sync");

function loadJson(name, required = true) {
  const p = join(dataDir, name);
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    if (required) {
      console.error(`[gen-lsk-deck] cannot read required ${p}: ${e.message}`);
      process.exit(1);
    }
    return {};
  }
}

const sutraani = loadJson("sutraani_data.json").data;
const englishSummary = loadJson("vasu_english_summary.json", false); // id -> string
const sutrartha = loadJson("sutrartha.json", false); // id -> {sa, sd}

// ---- shared parsing, mirrors web/src/data/sutras.ts ----

const TYPE_PREFIX = { V: "vidhi", S: "sanjna", P: "paribhasha", AT: "atidesha", AD: "adhikara" };

function parseType(type) {
  if (!type) return { category: "other", label: "" };
  const parts = type.split("$");
  return { category: TYPE_PREFIX[parts[0]] ?? "other", label: parts[1] ?? "" };
}

function parseAnuvritti(an) {
  if (!an) return [];
  return an
    .split("##")
    .map((chunk) => {
      const [word, id] = chunk.split("$");
      return { word: word ?? "", id: id ?? "" };
    })
    .filter((x) => x.id);
}

function refOf(raw) {
  return `${raw.a}.${raw.p}.${raw.n}`;
}

// id -> {ref, s} for resolving anuvṛtti targets, built from the FULL dataset
// (a target sūtra is not guaranteed to itself carry an lskn).
const byId = new Map(sutraani.map((raw) => [raw.i, { ref: refOf(raw), s: raw.s }]));

// ---- minimal HTML sanitizer for sutrartha.json's custom markup (<qt>, <title>, …) ----

const TAG_MAP = { qt: "b", qtex: "i", ex: "i", nex: "i", karika: "i", hl: "b", hlb: "b", HL: "b", e: "i", list: "ul" };
const KEEP = new Set(["b", "i", "u", "br", "p", "ul", "ol", "li", "sup", "table", "tr", "td", "th", "em", "strong"]);

function sanitizeHtml(html) {
  if (!html) return "";
  return html.replace(/<(\/)?(\w+)[^>]*>/g, (_m, closing, name) => {
    if (name === "title") return closing ? "</b><br/>" : "<br/><b>";
    const mapped = TAG_MAP[name];
    if (mapped) return closing ? `</${mapped}>` : `<${mapped}>`;
    if (KEEP.has(name)) return closing ? `</${name}>` : `<${name}>`;
    return ""; // unknown tag: unwrap, keep inner text
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

// ---- build cards ----

const lskSutras = sutraani
  .filter((raw) => raw.lskn && raw.lskn !== "0")
  .sort((a, b) => Number(a.lskn) - Number(b.lskn));

const now = Date.now();

function anuvrittiHead(an) {
  const items = parseAnuvritti(an);
  if (!items.length) return "";
  const parts = items.map(({ word, id }) => {
    const target = byId.get(id);
    const ref = target ? target.ref : id;
    return `<li>${esc(word)} <span style="opacity:.6">(${esc(ref)})</span></li>`;
  });
  return `<ul>${parts.join("")}</ul>`;
}

const cards = lskSutras.map((raw) => {
  const ref = refOf(raw);
  const { category, label } = parseType(raw.type);
  const english = englishSummary[raw.i] ?? "";
  const artha = sutrartha[raw.i] ?? {};

  const question =
    `<p style="font-size:1.35em"><b>${esc(raw.s)}</b></p>` +
    `<p style="font-size:.85em;opacity:.7">${esc(ref)} · LSK ${esc(raw.lskn)} · ${esc(raw.e ?? "")}</p>`;

  const finalResult = english ? `<p>${esc(english)}</p>` : "";
  const finalResultNote = artha.sa ? `<p class="dev">${esc(artha.sa)}</p>` : "";

  const step = {
    expr: raw.ss ? `<p class="dev">${esc(raw.ss)}</p>` : "",
    vidhiSutraIds: [],
    linkedSutraIds: [],
    head: anuvrittiHead(raw.an),
    note: artha.sd ? `<div>${sanitizeHtml(artha.sd)}</div>` : "",
    linkedNote: "",
  };

  const cardNote = label ? `<p class="dev">${esc(label)}</p>` : "";

  return {
    id: `lsk-${raw.i}`,
    type: "generic",
    deck: DECK_NAME,
    sync: SYNC_DEFAULT,
    direction: "forward",
    question,
    finalResult,
    finalResultNote,
    steps: [step],
    cardNote,
    tags: ["lsk", category],
    createdAt: now,
    updatedAt: now,
  };
});

const out = {
  format: "shabdasiddhi",
  decks: [{ name: DECK_NAME, type: "default" }],
  cards,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`[gen-lsk-deck] wrote ${cards.length} cards to ${OUT_PATH}`);
console.log(`[gen-lsk-deck] deck "${DECK_NAME}", sync=${SYNC_DEFAULT} — import via Decklist → Import JSON.`);
