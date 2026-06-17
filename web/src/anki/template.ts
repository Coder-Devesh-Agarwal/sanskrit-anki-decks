// Anki Note Type + server-side HTML renderer.
//
// The full card HTML is generated HERE (at sync time) and written into the
// Front/Back fields. The Anki card templates are just `{{Front}}` / `{{Back}}`
// — no template JS, no runtime JSON parsing. Interactivity (step reveal, result
// note, sūtra gloss) is pure HTML/CSS via <details> and :hover/:focus-within.

import type { Card } from "../store/cards";
import { CATEGORY_META, getSutra } from "../data/sutras";
import { getGloss } from "../data/glosses";
import { loadSettings } from "../store/settings";

// Opening tag for the card root, carrying the Anki font size (all em units scale
// from it) and the theme class.
function cardOpen(): string {
  const s = loadSettings();
  const themeClass = s.theme === "light" ? " ss-light" : "";
  return `<div class="ss-card${themeClass}" style="font-size:${s.ankiFontSize}px">`;
}

export const MODEL_NAME = "Śabda-Siddhi";
// Granular fields (separation of concern) for inspection/editing in Anki Browse,
// plus the pre-rendered Front/Back the templates actually display. Splitting the
// data out does not change what the card renders — templates stay {{Front}}/{{Back}}.
export const MODEL_FIELDS = [
  "CardId",
  "Direction",
  "Question",
  "FinalResult",
  "FinalResultNote",
  "Steps",
  "CardNote",
  "Front",
  "Back",
  "Json", // exact card JSON — enables lossless fetch-back from Anki
];

const NOTE_LABEL: Record<string, string> = {
  lsk: "लघुसिद्धान्तकौमुदी",
  sk: "सिद्धान्तकौमुदी",
};

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A sūtra chip with a CSS-only gloss popover (hover or keyboard/tap focus).
function chipHtml(id: string): string {
  const s = getSutra(id);
  if (!s) return `<span class="ss-chip">?${esc(id)}</span>`;
  const meta = CATEGORY_META[s.category];
  const g = getGloss(id);
  let box = "";
  if (g.english || g.note) {
    box =
      `<span class="ss-glossbox">` +
      (g.english ? `<span class="ss-en">${esc(g.english)}</span>` : "") +
      (g.note
        ? `<span class="ss-nlbl">${esc(NOTE_LABEL[g.noteSource] ?? "टिप्पणी")}</span>` +
          `<span class="ss-ntxt">${esc(g.note)}</span>`
        : "") +
      `</span>`;
  }
  return (
    `<span class="ss-chip" tabindex="0">` +
    `<span class="ss-badge bcat-${s.category}">${esc(meta.label)}</span>` +
    `<span>${esc(s.s)}</span><span class="ss-ref">${esc(s.ref)}</span>` +
    (s.ss ? `<span class="ss-gloss">— ${esc(s.ss)}</span>` : "") +
    box +
    `</span>`
  );
}

function promptText(card: Card): string {
  return card.direction === "forward"
    ? "सिद्धिं कुरु (Derive the final form)"
    : "मूलं विश्लेषय (Identify the base)";
}

// Card text fields hold rich HTML (from RichEditor) — inserted verbatim. Only
// app-generated plain text (prompt label, sūtra chip text) is escaped.
export function renderFront(card: Card): string {
  return (
    `${cardOpen()}<div class="ss-prompt">${esc(promptText(card))}</div>` +
    `<div class="ss-q rich-html">${card.question}</div></div>`
  );
}

export function renderBack(card: Card): string {
  let h = `${cardOpen()}<div class="ss-prompt">${esc(promptText(card))}</div>`;
  h += `<div class="ss-q rich-html">${card.question}</div>`;

  // result + optional click-to-reveal note
  h += `<div class="ss-result"><div class="lbl">फलम् (Result)</div><div class="val rich-html">${card.finalResult}</div>`;
  if (card.finalResultNote) {
    h +=
      `<details class="ss-inline"><summary>टिप्पणी देखें (note)</summary>` +
      `<div class="ss-note rich-html">${card.finalResultNote}</div></details>`;
  }
  h += `</div>`;

  // steps
  h += `<div class="ss-steps"><div class="lbl">सिद्धि-क्रमः (Steps)</div>`;
  card.steps.forEach((st, i) => {
    const vidhi = st.vidhiSutraIds.map(chipHtml).join("");
    let reveal = "";
    // main note, directly below the vidhi sūtras
    if (st.note) reveal += `<div class="ss-note rich-html">${st.note}</div>`;
    // secondary sūtras as a numbered list
    if (st.linkedSutraIds.length) {
      reveal +=
        `<div class="ss-rlbl">सम्बद्ध-सूत्राणि</div>` +
        `<ol class="ss-linked">` +
        st.linkedSutraIds.map((id) => `<li>${chipHtml(id)}</li>`).join("") +
        `</ol>`;
    }
    // separate note for the secondary sūtras
    if (st.linkedNote)
      reveal += `<div class="ss-note rich-html">${st.linkedNote}</div>`;
    const hasReveal = reveal !== "";
    const head =
      `<span class="ss-num">${i + 1}</span>` +
      `<div class="ss-body">` +
      `<div class="expr rich-html">${st.expr}</div>` +
      `<div class="ss-chips">${vidhi}</div>` +
      `</div>`;
    h += hasReveal
      ? `<details class="ss-step"><summary>${head}</summary><div class="ss-reveal">${reveal}</div></details>`
      : `<div class="ss-step ss-static">${head}</div>`;
  });
  h += `</div>`;

  if (card.cardNote) {
    h += `<div class="ss-cardnote"><div class="lbl">टिप्पणी (Card note)</div><div class="val rich-html">${card.cardNote}</div></div>`;
  }
  h += `</div>`;
  return h;
}

// Strip tags for the plain-text granular summary fields.
function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Human-readable label for a sūtra, e.g. "वृद्धिरादैच् (1.1.1)".
function sutraLabel(id: string): string {
  const s = getSutra(id);
  return s ? `${s.s} (${s.ref})` : id;
}

// Plain-text summary of the steps for the granular `Steps` field — one step per
// line: "1. expr — vidhi: … | linked: … | note: …".
function stepsText(card: Card): string {
  return card.steps
    .map((st, i) => {
      const parts: string[] = [];
      if (st.vidhiSutraIds.length)
        parts.push(`vidhi: ${st.vidhiSutraIds.map(sutraLabel).join("; ")}`);
      if (st.linkedSutraIds.length)
        parts.push(`linked: ${st.linkedSutraIds.map(sutraLabel).join("; ")}`);
      if (st.note) parts.push(`note: ${stripHtml(st.note)}`);
      if (st.linkedNote) parts.push(`linked-note: ${stripHtml(st.linkedNote)}`);
      const tail = parts.length ? ` — ${parts.join(" | ")}` : "";
      return `${i + 1}. ${stripHtml(st.expr)}${tail}`;
    })
    .join("\n");
}

export function renderFields(card: Card): Record<string, string> {
  return {
    CardId: card.id,
    Direction: card.direction,
    Question: stripHtml(card.question),
    FinalResult: stripHtml(card.finalResult),
    FinalResultNote: stripHtml(card.finalResultNote),
    Steps: stepsText(card),
    CardNote: stripHtml(card.cardNote),
    Front: renderFront(card),
    Back: renderBack(card),
    Json: JSON.stringify(card),
  };
}

// Font sizes are em (relative to .ss-card, whose px size is baked per card from
// the base-font-size setting). 'Adishila Vedic' leads the Devanagari font stack.
// Adishila Vedic faces. `src` is the file shipped under public/fonts/AdishilaVedic/;
// `media` is the name uploaded to Anki's collection during sync (leading underscore
// stops Anki "check media" from deleting it as unused).
export const FONT_FACES = [
  {
    src: "AdishilaVedic.ttf",
    media: "_adishila_vedic.ttf",
    weight: 400,
    style: "normal",
  },
  {
    src: "AdishilaVedicBold.ttf",
    media: "_adishila_vedic_bold.ttf",
    weight: 700,
    style: "normal",
  },
  {
    src: "AdishilaVedicItalic.ttf",
    media: "_adishila_vedic_italic.ttf",
    weight: 400,
    style: "italic",
  },
  {
    src: "AdishilaVedicBoldItalic.ttf",
    media: "_adishila_vedic_bolditalic.ttf",
    weight: 700,
    style: "italic",
  },
] as const;

const FONT_FACE_CSS = FONT_FACES.map(
  (f) =>
    `@font-face{font-family:'Adishila Vedic';src:url('${f.media}');font-weight:${f.weight};font-style:${f.style};font-display:swap}`,
).join("\n");

export const MODEL_CSS = `
${FONT_FACE_CSS}
.ss-card{--bg:#272828;--fg:#e2e8f0;--q:#f1f5f9;--muted:#ffffff;--border:#334155;--step-bg:rgba(30,41,59,.4);--chip-bg:#1e293b;--ref:#94a3b8;--num-bg:#334155;--num-fg:#f1f5f9;--note:#cbd5e1;--gloss-bg:#020617;--gloss-border:#475569;--en:#cbd5e1;--nlbl:#38bdf8;--res-border:rgba(5,150,105,.5);--res-bg:rgba(6,78,59,.3);--res-lbl:#34d399;--res-val:#d1fae5;--cn-border:rgba(180,83,9,.5);--cn-bg:rgba(69,26,3,.3);--cn-lbl:#fbbf24;--cn-val:#fef3c7}
.ss-card.ss-light{--bg:#ffffff;--fg:#1e293b;--q:#0f172a;--muted:#64748b;--border:#cbd5e1;--step-bg:#f8fafc;--chip-bg:#f1f5f9;--ref:#475569;--num-bg:#cbd5e1;--num-fg:#0f172a;--note:#334155;--gloss-bg:#ffffff;--gloss-border:#cbd5e1;--en:#334155;--nlbl:#0284c7;--res-border:#6ee7b7;--res-bg:#ecfdf5;--res-lbl:#047857;--res-val:#065f46;--cn-border:#fcd34d;--cn-bg:#fffbeb;--cn-lbl:#b45309;--cn-val:#92400e}
.ss-card{font-family:'Adishila Vedic','Noto Sans Devanagari','Siddhanta',serif;font-size:16px;font-weight:400;background:var(--bg);color:var(--fg);max-width:700px;margin:0 auto;padding:8px;text-align:left}
.ss-card strong{font-weight:700}
.ss-prompt{font-size:.7em;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.ss-q{font-size:1.25em;color:var(--q)}
.rich-html p{margin:0 0 .25em}
.rich-html ul{list-style:disc;margin:.25em 0;padding-left:1.25em}
.rich-html ol{list-style:decimal;margin:.25em 0;padding-left:1.25em}
.rich-html u{text-decoration:underline}
.ss-result{border:1px solid var(--res-border);background:var(--res-bg);border-radius:10px;padding:14px;margin-top:16px}
.ss-result .lbl{font-size:.7em;font-weight:600;text-transform:uppercase;color:var(--res-lbl);margin-bottom:4px}
.ss-result .val{font-size:1.5em;font-weight:600;color:var(--res-val)}
.ss-inline{margin-top:8px}
.ss-inline>summary{cursor:pointer;color:var(--res-lbl);font-size:.75em;text-decoration:underline;list-style:none}
.ss-inline>summary::-webkit-details-marker{display:none}
.ss-steps{margin-top:16px}
.ss-steps .lbl{font-size:.7em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.ss-step{border:1px solid var(--border);background:var(--step-bg);border-radius:10px;margin-bottom:8px;padding:12px}
.ss-step>summary{display:flex;align-items:flex-start;gap:8px;cursor:pointer;list-style:none}
.ss-step>summary::-webkit-details-marker{display:none}
.ss-step>summary::after{content:'▸';margin-left:8px;color:var(--muted);flex-shrink:0}
.ss-step[open]>summary::after{content:'▾'}
.ss-body{flex:1;min-width:0}
.ss-step .expr{font-size:1.125em;color:var(--q)}
.ss-chips{margin-top:4px}
.ss-num{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:1.6em;height:1.6em;border-radius:50%;background:var(--num-bg);color:var(--num-fg);font-size:.85em}
.ss-reveal{border-top:1px solid var(--border);margin-top:10px;padding-top:10px}
.ss-rlbl{font-size:.7em;color:var(--ref);margin-bottom:4px;padding:4px 0}
.ss-linked{list-style:decimal;margin:.25em 0;padding-left:1.5em}
.ss-linked>li{margin:.2em 0}
.ss-chip{position:relative;display:inline-flex;align-items:center;gap:6px;background:var(--chip-bg);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:.8em;margin:3px 4px 0 0;cursor:help;outline:none}
.ss-ref{font-size:.85em;color:var(--ref)}
.ss-gloss{font-size:.85em;color:var(--ref)}
.ss-glossbox{display:none;position:absolute;left:0;top:100%;z-index:30;margin-top:4px;width:300px;max-width:88vw;background:var(--gloss-bg);border:1px solid var(--gloss-border);border-radius:8px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);white-space:normal}
.ss-chip:hover>.ss-glossbox,.ss-chip:focus>.ss-glossbox,.ss-chip:focus-within>.ss-glossbox{display:block}
.ss-en{display:block;font-size:.75em;color:var(--en);margin-bottom:6px}
.ss-nlbl{display:block;font-size:.62em;text-transform:uppercase;letter-spacing:.05em;color:var(--nlbl);margin-bottom:2px}
.ss-ntxt{display:block;font-size:.75em;color:var(--fg);line-height:1.5;max-height:180px;overflow:auto}
.ss-note{font-size:.875em;color:var(--note);margin-top:6px}
.ss-cardnote{border:1px solid var(--cn-border);background:var(--cn-bg);border-radius:10px;padding:12px;margin-top:16px}
.ss-cardnote .lbl{font-size:.7em;font-weight:600;text-transform:uppercase;color:var(--cn-lbl);margin-bottom:4px}
.ss-cardnote .val{font-size:.875em;color:var(--cn-val)}
.bcat-vidhi{background:#0284c7;color:#e0f2fe}
.bcat-sanjna{background:#059669;color:#d1fae5}
.bcat-paribhasha{background:#9333ea;color:#f3e8ff}
.bcat-atidesha{background:#d97706;color:#fef3c7}
.bcat-adhikara{background:#e11d48;color:#ffe4e6}
.bcat-other{background:#475569;color:#f1f5f9}
.ss-badge{border-radius:4px;padding:1px 5px;font-size:.62em;font-weight:600}
`;

export const MODEL_TEMPLATES = [
  {
    Name: "Card 1",
    Front: "{{Front}}",
    Back: "{{Back}}",
  },
];
