// Shared builder for the two full-Aṣṭādhyāyī reference decks
// (gen-sutra-front-deck.mjs / gen-sutra-number-front-deck.mjs).
//
// One `generic`-type, `sync:false` card per sūtra in sutraani_data.json.
// Front differs per mode; the back is identical in both:
//
//   finalResult — the counterpart of the front (ref ↔ sūtra) + category badge
//   steps[]     — one collapsible section each, in this order:
//                 pc (पदच्छेदः), an (अनुवृत्तिः), ad (अधिकारः),
//                 ss (अनुवृत्तिसहितं सूत्रम्), LSK, SK, sa (सूत्रार्थः),
//                 English (Vasu). Empty sections are dropped.
//
// Long section bodies (LSK/SK commentary) go into `step.note` so they render
// click-to-reveal in the app and as a <details> in Anki; short ones sit in
// `step.head` and are visible as soon as the back is shown.
//
// Styling rides on `sd-*` classes that exist in both web/src/index.css and the
// Anki MODEL_CSS in web/src/anki/template.ts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
/** source datasets (read-only inputs) */
export const DATA_DIR = join(repoRoot, "data_files");
/** generated decks land next to the .apkg builds, in their own json/ folder */
export const DECKS_DIR = join(repoRoot, "decks", "json");

// Card markup uses the `sd-*` classes defined in BOTH web/src/index.css (app)
// and web/src/anki/template.ts MODEL_CSS (Anki) — inline styles would repeat
// per section per sūtra and triple the deck's size. Keep the two CSS blocks in
// sync when adding a class here.
const CAT_LABEL = {
  vidhi: "विधि",
  sanjna: "संज्ञा",
  paribhasha: "परिभाषा",
  atidesha: "अतिदेश",
  adhikara: "अधिकार",
  other: "सूत्र",
};

// Section bodies longer than this collapse behind a click instead of showing
// with the rest of the back.
const REVEAL_THRESHOLD = 400;

const TYPE_PREFIX = {
  V: "vidhi",
  S: "sanjna",
  P: "paribhasha",
  AT: "atidesha",
  AD: "adhikara",
};

const VIBHAKTI = [
  "",
  "प्रथमा",
  "द्वितीया",
  "तृतीया",
  "चतुर्थी",
  "पञ्चमी",
  "षष्ठी",
  "सप्तमी",
];
const VACANA = ["", "एकवचनम्", "द्विवचनम्", "बहुवचनम्"];

// ─── loading ────────────────────────────────────────────────────────────────

export function loadJson(name, { required = true } = {}) {
  const p = join(DATA_DIR, name);
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    if (required) {
      console.error(`[sutra-deck] cannot read required ${p}: ${e.message}`);
      process.exit(1);
    }
    console.warn(`[sutra-deck] optional ${name} not loaded (${e.code ?? e.message})`);
    return null;
  }
}

// prakaraṇa names: lsk_chapters_name.json / sk_chapters_name.json are ordered
// arrays of { badge, title } — one entry per chapter, so the chapter number in
// sutraani_data.json (lsk_chapter / sk_chapter) is the 1-based index. Returns a
// number → title map; a missing file or entry leaves the bare number printed.
function loadChapterNames(path) {
  try {
    const arr = JSON.parse(readFileSync(resolve(path), "utf8"));
    if (!Array.isArray(arr)) throw new Error("expected an array of {badge,title}");
    return Object.fromEntries(
      arr.map((entry, i) => [String(i + 1), entry?.title ?? ""]).filter(([, t]) => t),
    );
  } catch (e) {
    console.warn(
      `[sutra-deck] no prakaraṇa names from ${path} (${e.code ?? e.message}) — ` +
        `those chapters print as numbers only`,
    );
    return {};
  }
}

export function loadChapters({ lskPath, skPath }) {
  return { lsk: loadChapterNames(lskPath), sk: loadChapterNames(skPath) };
}

export function loadAll(chapterPaths) {
  const sutraani = loadJson("sutraani_data.json").data;
  return {
    sutraani,
    byId: new Map(sutraani.map((raw) => [raw.i, raw])),
    english: loadJson("vasu_english_summary.json", { required: false }) ?? {},
    sutrartha: loadJson("sutrartha.json", { required: false }) ?? {},
    lskText: loadJson("laghukaumudi.json", { required: false }) ?? {},
    skText: loadJson("kaumudi.json", { required: false }) ?? {},
    chapters: loadChapters(chapterPaths),
  };
}

// ─── text helpers ───────────────────────────────────────────────────────────

export function esc(s) {
  return String(s ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
}

export function refOf(raw) {
  return `${raw.a}.${raw.p}.${raw.n}`;
}

function parseType(type) {
  // "S$वृद्धिसंज्ञा$##S$गतिसंज्ञा$" — a sūtra can carry more than one type.
  if (!type) return [];
  return type
    .split("##")
    .map((chunk) => {
      const parts = chunk.split("$");
      return {
        category: TYPE_PREFIX[parts[0]] ?? "other",
        label: parts[1] ?? "",
      };
    })
    .filter((t) => t.category !== "other" || t.label);
}

// The commentary files (kaumudi/laghukaumudi) and sutrartha use a private
// markup: <<sūtra text>> [[1.2.3]] citations, <!vārtika!>, <{SK354}> /
// <{1.1.1}> cross-references, plus a handful of formatting tags.
const TAG_MAP = {
  qt: "b",
  qtex: "i",
  ex: "i",
  nex: "i",
  karika: "i",
  hl: "b",
  hlb: "b",
  e: "i",
  list: "ul",
  pr: "div",
};
const KEEP = new Set([
  "b",
  "i",
  "u",
  "br",
  "p",
  "ul",
  "ol",
  "li",
  "sup",
  "table",
  "tr",
  "td",
  "th",
  "em",
  "strong",
  "div",
]);

// Tags this function emits are built with sentinels instead of < >, so the
// final "drop the brackets the source left half-formed" pass cannot damage
// them (the data is Devanagari, so no `>`-followed-by-ASCII rule can tell the
// two apart). Sentinels become real brackets on the last line.
const LT = "\u0001";
const GT = "\u0002";
const tag = (inner) => `${LT}${inner}${GT}`;

function refChip(text) {
  return tag('span class="sd-x"') + `[${text}]` + tag("/span");
}

function wrap(name, body) {
  return tag(name) + body + tag(`/${name}`);
}

export function markup(raw) {
  if (!raw) return "";
  let h = String(raw);

  // {! 1290 ओलजी !} dhātu entry inside a {$ … $} dhātupāṭha citation
  h = h.replace(/\{!([\s\S]*?)!\}/g, (_m, body) => wrap("b", body.trim()));
  h = h.replace(/\{\$([\s\S]*?)\$\}/g, (_m, body) => wrap("i", body.trim()));
  // <!vārtika!> → labelled italic, before the generic tag pass eats the <!…
  h = h.replace(
    /<!([\s\S]*?)!>/g,
    (_m, body) =>
      wrap("i", body.trim()) +
      " " +
      tag('span class="sd-x"') +
      "(वा०)" +
      tag("/span"),
  );
  // <{SK354}> / <{1.1.1}> cross-reference
  h = h.replace(/<\{([^}]*)\}>/g, (_m, body) => refChip(body.trim()));
  // <<sūtra>> quotation (both the closed and the unclosed form seen in data)
  h = h.replace(/<<([^<>]*?)>>/g, (_m, body) => wrap("b", body.trim()));
  h = h.replace(/<<([^<>]*?)>/g, (_m, body) => wrap("b", body.trim()));
  // [[1.2.3]] sūtra reference
  h = h.replace(/\[\[([^\]]*)\]\]/g, (_m, body) => refChip(body.trim()));

  // remaining real tags: map, keep, or unwrap
  h = h.replace(/<(\/)?([A-Za-z][\w-]*)[^>]*>/g, (_m, closing, name) => {
    const n = name.toLowerCase();
    if (n === "title") return closing ? tag("/span") : tag('span class="sd-h"');
    const mapped = TAG_MAP[n] ?? (KEEP.has(n) ? n : "");
    if (!mapped) return "";
    return tag(closing ? `/${mapped}` : mapped);
  });

  // Everything still holding a real bracket is source text the markup left
  // dangling (a few entries have unbalanced {$ … $} / {! … !}): drop those,
  // escape the rest, then restore the emitted tags.
  h = h
    .replace(/[<>]/g, "")
    .replace(/\{\$|\$\}|\{!|!\}/g, "")
    .replace(/&/g, "&amp;")
    .replace(/\n/g, tag("br/"));
  return h.replaceAll(LT, "<").replaceAll(GT, ">");
}

// ─── back-section renderers ─────────────────────────────────────────────────

// pc: "वृद्धिः$S$1$1$##आत्-ऐच्$S$1$1$" — word, S(ubanta)/T(iṅanta), vibhakti,
// vacana. 0/0 marks an avyaya; empty vibhakti means unanalysed.
function padacchedaHtml(pc) {
  const items = (pc ?? "")
    .split("##")
    .map((tok) => tok.split("$"))
    .filter((f) => f[0]);
  if (!items.length) return "";
  const chips = items.map(([word, kind, vib, vac]) => {
    let tag = "";
    if (kind === "T") tag = "तिङन्तम्";
    else if (vib === "0") tag = "अव्ययम्";
    else if (VIBHAKTI[Number(vib)])
      tag = `${VIBHAKTI[Number(vib)]} ${VACANA[Number(vac)] ?? ""}`.trim();
    return (
      `<span class="sd-chip"><b>${esc(word)}</b>` +
      (tag ? `<span class="sd-t"> ${esc(tag)}</span>` : "") +
      `</span>`
    );
  });
  return `<div class="dev">${chips.join("")}</div>`;
}

// an: "षष्ठी$11049##स्थाने$11049" — word + id of the sūtra it carries down from.
function anuvrittiHtml(an, byId) {
  const items = (an ?? "")
    .split("##")
    .map((chunk) => {
      const [word, id] = chunk.split("$");
      return { word: word ?? "", id: id ?? "" };
    })
    .filter((x) => x.word);
  if (!items.length) return "";
  const rows = items.map(({ word, id }) => {
    const src = byId.get(id);
    const tail = src
      ? `<span class="sd-src"> ← ${esc(refOf(src))} ${esc(src.s)}</span>`
      : id
        ? `<span class="sd-src"> ← ${esc(id)}</span>`
        : "";
    return `<li><b>${esc(word)}</b>${tail}</li>`;
  });
  return `<ul class="dev sd-ul">${rows.join("")}</ul>`;
}

// ad: "आकडारात् एका संज्ञा$1$4$1##…" — adhikāra text + its own a.p.n.
function adhikaraHtml(ad) {
  const items = (ad ?? "")
    .split("##")
    .map((chunk) => chunk.split("$"))
    .filter((f) => f[0]);
  if (!items.length) return "";
  const rows = items.map(([text, a, p, n]) => {
    const ref = a && p && n ? ` <span class="sd-src">(${a}.${p}.${n})</span>` : "";
    return `<li><b>${esc(text)}</b>${ref}</li>`;
  });
  return `<ul class="dev sd-ul">${rows.join("")}</ul>`;
}

// ss is plain text, except for a stray entry (6.2.143) carrying the adhikāra
// form "word$a$p$n" — render that tail as a reference instead of printing it.
function ssHtml(ss) {
  if (!ss) return "";
  const [word, a, p, n] = ss.split("$");
  const ref =
    a && p && n ? ` <span class="sd-src">(${esc(a)}.${esc(p)}.${esc(n)})</span>` : "";
  return `<div class="dev">${esc(word)}${ref}</div>`;
}

function chapterSuffix(num, names) {
  if (!num || num === "0") return "";
  const name = names?.[String(num)];
  return name ? ` · प्रकरण ${num} ${name}` : ` · प्रकरण ${num}`;
}

function sectionLabel(title, meta) {
  return `<span class="sd-l">${esc(title)}${meta ? ` · ${esc(meta)}` : ""}</span>`;
}

function step(labelHtml, body) {
  // Bodies past the threshold live in `note` → collapsed until clicked.
  const long = body.length > REVEAL_THRESHOLD;
  return {
    expr: labelHtml,
    vidhiSutraIds: [],
    linkedSutraIds: [],
    head: long ? "" : body,
    note: long ? body : "",
    linkedNote: "",
  };
}

function buildSteps(raw, d) {
  const steps = [];
  const push = (title, meta, body) => {
    if (body) steps.push(step(sectionLabel(title, meta), body));
  };

  push("पदच्छेदः · pada-cheda", "", padacchedaHtml(raw.pc));
  push("अनुवृत्तिः · anuvṛtti", "", anuvrittiHtml(raw.an, d.byId));
  push("अधिकारः · adhikāra", "", adhikaraHtml(raw.ad));
  push("अनुवृत्तिसहितं सूत्रम्", "", ssHtml(raw.ss));

  const lsk = d.lskText[raw.i]?.trim();
  if (lsk || (raw.lskn && raw.lskn !== "0")) {
    const meta =
      (raw.lskn && raw.lskn !== "0" ? `LSK ${raw.lskn}` : "LSK —") +
      chapterSuffix(raw.lsk_chapter, d.chapters.lsk);
    push(
      "लघुसिद्धान्तकौमुदी",
      meta,
      lsk ? `<div class="dev">${markup(lsk)}</div>` : "",
    );
  }

  const sk = d.skText[raw.i]?.trim();
  if (sk || (raw.skn && raw.skn !== "0")) {
    const meta =
      (raw.skn && raw.skn !== "0" ? `SK ${raw.skn}` : "SK —") +
      chapterSuffix(raw.sk_chapter, d.chapters.sk);
    push("सिद्धान्तकौमुदी", meta, sk ? `<div class="dev">${markup(sk)}</div>` : "");
  }

  const sa = d.sutrartha[raw.i]?.sa?.trim();
  push(
    "सूत्रार्थः · sūtrārtha",
    "NB",
    sa ? `<div class="dev">${markup(sa)}</div>` : "",
  );

  const en = d.english[raw.i]?.trim();
  push(
    "English",
    "Vasu",
    en ? `<div>${markup(en)}</div>` : "",
  );

  // The app and the Anki template both iterate steps; an empty array renders an
  // empty "Steps" block, so keep at least one placeholder.
  if (!steps.length)
    steps.push(step(sectionLabel("विवरणम्", ""), `<span class="sd-m">—</span>`));
  return steps;
}

function badgesHtml(types) {
  if (!types.length) return "";
  const chips = types.map(
    ({ category, label }) =>
      `<span class="sd-b ${category}">${esc(CAT_LABEL[category])}` +
      `${label ? ` · ${esc(label)}` : ""}</span>`,
  );
  return `<div>${chips.join("")}</div>`;
}

function tagsOf(raw, types) {
  const tags = ["ashtadhyayi", `adhyaya-${raw.a}`, `pada-${raw.a}.${raw.p}`];
  for (const t of types) tags.push(t.category);
  if (raw.lskn && raw.lskn !== "0") tags.push("lsk");
  if (raw.skn && raw.skn !== "0") tags.push("sk");
  return Array.from(new Set(tags));
}

// ─── card + deck assembly ───────────────────────────────────────────────────

export function buildCards({ mode, deckName, sync = false, data }) {
  const isNumberFront = mode === "number";
  const idPrefix = isNumberFront ? "sutranum" : "sutra";
  const now = Date.now();

  return data.sutraani.map((raw) => {
    const ref = refOf(raw);
    const types = parseType(raw.type);

    const sutraBlock =
      `<p class="dev sd-big">${esc(raw.s)}</p>` +
      (raw.e ? `<p class="sd-sub">${esc(raw.e)}</p>` : "");
    const refBlock =
      `<p class="sd-ref">${esc(ref)}</p>` +
      `<p class="sd-sub">अध्यायः ${esc(raw.a)} · पादः ${esc(raw.p)} · ` +
      `सूत्रम् ${esc(raw.n)}</p>`;

    const question = isNumberFront ? refBlock : sutraBlock;
    const finalResult = (isNumberFront ? sutraBlock : refBlock) + badgesHtml(types);

    return {
      id: `${idPrefix}-${raw.i}`,
      type: "generic",
      deck: deckName,
      sync,
      direction: "forward",
      question,
      finalResult,
      finalResultNote: "",
      steps: buildSteps(raw, data),
      cardNote: "",
      tags: tagsOf(raw, types),
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function writeDeck(outPath, decks, cards) {
  const json = JSON.stringify({ format: "shabdasiddhi", decks, cards });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, "utf8");
  const bytes = Buffer.byteLength(json);
  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(`[sutra-deck] ${cards.length} cards → ${outPath} (${mb} MB)`);
  if (bytes > 4 * 1024 * 1024) {
    console.warn(
      `[sutra-deck] warning: ${mb} MB is past the ~5 MB localStorage budget the ` +
        `app used to store decks in — harmless now that storage is IndexedDB, ` +
        `but --split --files still lets you import adhyāya by adhyāya.`,
    );
  }
}

// Shared CLI plumbing: --deck, --out, --lsk-chapters, --sk-chapters,
// --adhyaya N, --split (sub deck per adhyāya), --files (split across files),
// --sync.
export function parseArgs(defaults) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  return {
    deckName: arg("--deck", defaults.deckName),
    outPath: resolve(arg("--out", join(DECKS_DIR, defaults.outFile))),
    chapterPaths: {
      lskPath: arg("--lsk-chapters", join(DATA_DIR, "lsk_chapters_name.json")),
      skPath: arg("--sk-chapters", join(DATA_DIR, "sk_chapters_name.json")),
    },
    adhyaya: arg("--adhyaya", ""),
    split: argv.includes("--split"),
    files: argv.includes("--files"),
    sync: argv.includes("--sync"),
  };
}

// Sub-deck name for one adhyāya. In the app this is its own deck under the
// composite parent; on sync it becomes the Anki sub deck "Parent::Sub".
function subDeckName(base, adhyaya) {
  return `${base} · अध्यायः ${adhyaya}`;
}

function cardsForAdhyaya({ mode, opts, data, adhyaya }) {
  return buildCards({
    mode,
    deckName: subDeckName(opts.deckName, adhyaya),
    sync: opts.sync,
    data: {
      ...data,
      sutraani: data.sutraani.filter((raw) => raw.a === String(adhyaya)),
    },
  });
}

// Entry point both scripts call.
//
//   (default)        one plain deck, one file
//   --split          composite parent + one sub deck per adhyāya, one file
//   --split --files  same decks, but one file per adhyāya (import piecemeal)
//   --adhyaya N      just that adhyāya, as a sub deck of the composite parent
export function generate({ mode, defaults }) {
  const opts = parseArgs(defaults);
  const data = loadAll(opts.chapterPaths);
  const adhyayas = [...new Set(data.sutraani.map((raw) => raw.a))].sort();
  const parentDeck = { name: opts.deckName, type: "composite" };
  const subDeck = (a) => ({
    name: subDeckName(opts.deckName, a),
    type: "sub",
    parent: opts.deckName,
  });

  if (opts.adhyaya) {
    writeDeck(
      opts.outPath.replace(/\.json$/, `-a${opts.adhyaya}.json`),
      [parentDeck, subDeck(opts.adhyaya)],
      cardsForAdhyaya({ mode, opts, data, adhyaya: opts.adhyaya }),
    );
    return;
  }

  if (opts.split && opts.files) {
    for (const a of adhyayas) {
      writeDeck(
        opts.outPath.replace(/\.json$/, `-a${a}.json`),
        [parentDeck, subDeck(a)],
        cardsForAdhyaya({ mode, opts, data, adhyaya: a }),
      );
    }
    return;
  }

  if (opts.split) {
    writeDeck(
      opts.outPath,
      [parentDeck, ...adhyayas.map(subDeck)],
      adhyayas.flatMap((a) => cardsForAdhyaya({ mode, opts, data, adhyaya: a })),
    );
    return;
  }

  const cards = buildCards({ mode, deckName: opts.deckName, sync: opts.sync, data });
  writeDeck(opts.outPath, [{ name: opts.deckName, type: "default" }], cards);
}
