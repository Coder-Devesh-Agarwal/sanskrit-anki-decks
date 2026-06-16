// Anki Note Type + server-side HTML renderer.
//
// The full card HTML is generated HERE (at sync time) and written into the
// Front/Back fields. The Anki card templates are just `{{Front}}` / `{{Back}}`
// — no template JS, no runtime JSON parsing. Interactivity (step reveal, result
// note, sūtra gloss) is pure HTML/CSS via <details> and :hover/:focus-within.

import type { Card } from "../store/cards";
import { CATEGORY_META, getSutra } from "../data/sutras";
import { getGloss } from "../data/glosses";

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

export function renderFront(card: Card): string {
  return (
    `<div class="ss-card"><div class="ss-prompt">${esc(promptText(card))}</div>` +
    `<div class="ss-q">${esc(card.question)}</div></div>`
  );
}

export function renderBack(card: Card): string {
  let h = `<div class="ss-card"><div class="ss-prompt">${esc(promptText(card))}</div>`;
  h += `<div class="ss-q">${esc(card.question)}</div>`;

  // result + optional click-to-reveal note
  h += `<div class="ss-result"><div class="lbl">फलम् (Result)</div><div class="val">${esc(
    card.finalResult,
  )}</div>`;
  if (card.finalResultNote) {
    h +=
      `<details class="ss-inline"><summary>टिप्पणी देखें (note)</summary>` +
      `<div class="ss-note">${esc(card.finalResultNote)}</div></details>`;
  }
  h += `</div>`;

  // steps
  h += `<div class="ss-steps"><div class="lbl">सिद्धि-क्रमः (Steps)</div>`;
  card.steps.forEach((st, i) => {
    const vidhi = st.vidhiSutraIds.map(chipHtml).join("");
    let reveal = "";
    if (st.linkedSutraIds.length) {
      reveal +=
        `<div class="ss-rlbl">सम्बद्ध-सूत्राणि</div>` +
        st.linkedSutraIds.map(chipHtml).join("");
    }
    if (st.note) reveal += `<div class="ss-note">${esc(st.note)}</div>`;
    const hasReveal = reveal !== "";
    const head =
      `<span class="ss-num">${i + 1}</span>` +
      `<span class="expr">${esc(st.expr)}</span>` +
      `<div class="ss-chips">${vidhi}</div>`;
    h += hasReveal
      ? `<details class="ss-step"><summary>${head}</summary><div class="ss-reveal">${reveal}</div></details>`
      : `<div class="ss-step ss-static">${head}</div>`;
  });
  h += `</div>`;

  if (card.cardNote) {
    h += `<div class="ss-cardnote"><div class="lbl">टिप्पणी (Card note)</div><div class="val">${esc(
      card.cardNote,
    )}</div></div>`;
  }
  h += `</div>`;
  return h;
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
      if (st.note) parts.push(`note: ${st.note}`);
      const tail = parts.length ? ` — ${parts.join(" | ")}` : "";
      return `${i + 1}. ${st.expr}${tail}`;
    })
    .join("\n");
}

export function renderFields(card: Card): Record<string, string> {
  return {
    CardId: card.id,
    Direction: card.direction,
    Question: card.question,
    FinalResult: card.finalResult,
    FinalResultNote: card.finalResultNote,
    Steps: stepsText(card),
    CardNote: card.cardNote,
    Front: renderFront(card),
    Back: renderBack(card),
  };
}

export const MODEL_CSS = `
.ss-card{font-family:'Noto Sans Devanagari','Siddhanta',serif;background:#0f172a;color:#e2e8f0;max-width:700px;margin:0 auto;padding:8px;text-align:left}
.ss-prompt{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin-bottom:4px}
.ss-q{font-size:20px;color:#f1f5f9;white-space:pre-wrap}
.ss-result{border:1px solid rgba(5,150,105,.5);background:rgba(6,78,59,.3);border-radius:10px;padding:14px;margin-top:16px}
.ss-result .lbl{font-size:11px;font-weight:600;text-transform:uppercase;color:#34d399;margin-bottom:4px}
.ss-result .val{font-size:24px;font-weight:600;color:#d1fae5}
.ss-inline{margin-top:8px}
.ss-inline>summary{cursor:pointer;color:#34d399;font-size:12px;text-decoration:underline;list-style:none}
.ss-inline>summary::-webkit-details-marker{display:none}
.ss-steps{margin-top:16px}
.ss-steps .lbl{font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:8px}
.ss-step{border:1px solid #334155;background:rgba(30,41,59,.4);border-radius:10px;margin-bottom:8px;padding:12px}
.ss-step>summary{cursor:pointer;list-style:none}
.ss-step>summary::-webkit-details-marker{display:none}
.ss-step>summary::after{content:'▸';float:right;color:#64748b}
.ss-step[open]>summary::after{content:'▾'}
.ss-step .expr{font-size:18px;color:#f1f5f9}
.ss-chips{margin-top:4px}
.ss-num{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#334155;font-size:12px;margin-right:8px}
.ss-reveal{border-top:1px solid #334155;margin-top:10px;padding-top:10px}
.ss-rlbl{font-size:11px;color:#94a3b8;margin-bottom:4px;padding:4px}
.ss-chip{position:relative;display:inline-flex;align-items:center;gap:6px;background:#1e293b;border:1px solid #334155;border-radius:6px;padding:4px 8px;font-size:13px;margin:3px 4px 0 0;cursor:help;outline:none}
.ss-ref{font-size:11px;color:#94a3b8}
.ss-gloss{font-size:11px;color:#94a3b8}
.ss-glossbox{display:none;position:absolute;left:0;top:100%;z-index:30;margin-top:4px;width:300px;max-width:88vw;background:#020617;border:1px solid #475569;border-radius:8px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);white-space:normal}
.ss-chip:hover>.ss-glossbox,.ss-chip:focus>.ss-glossbox,.ss-chip:focus-within>.ss-glossbox{display:block}
.ss-en{display:block;font-size:12px;color:#cbd5e1;margin-bottom:6px}
.ss-nlbl{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#38bdf8;margin-bottom:2px}
.ss-ntxt{display:block;font-size:12px;color:#e2e8f0;line-height:1.5;max-height:180px;overflow:auto}
.ss-note{font-size:14px;color:#cbd5e1;white-space:pre-wrap;margin-top:6px}
.ss-cardnote{border:1px solid rgba(180,83,9,.5);background:rgba(69,26,3,.3);border-radius:10px;padding:12px;margin-top:16px}
.ss-cardnote .lbl{font-size:11px;font-weight:600;text-transform:uppercase;color:#fbbf24;margin-bottom:4px}
.ss-cardnote .val{font-size:14px;color:#fef3c7;white-space:pre-wrap}
.bcat-vidhi{background:#0284c7;color:#e0f2fe}
.bcat-sanjna{background:#059669;color:#d1fae5}
.bcat-paribhasha{background:#9333ea;color:#f3e8ff}
.bcat-atidesha{background:#d97706;color:#fef3c7}
.bcat-adhikara{background:#e11d48;color:#ffe4e6}
.bcat-other{background:#475569;color:#f1f5f9}
.ss-badge{border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600}
`;

export const MODEL_TEMPLATES = [
  {
    Name: "Card 1",
    Front: "{{Front}}",
    Back: "{{Back}}",
  },
];
