// Loads + indexes the Aṣṭādhyāyī sūtra dataset (data_files/sutraani_data.json,
// copied into public/data at build). Provides lookup, search and the
// vidhi/paribhāṣā/sañjñā classification used throughout the app.

import Sanscript from '@indic-transliteration/sanscript'

export type SutraCategory =
  | 'vidhi'
  | 'sanjna'
  | 'paribhasha'
  | 'atidesha'
  | 'adhikara'
  | 'other'

export interface RawSutra {
  i: string // id, e.g. "11001"
  a: string // adhyāya
  p: string // pāda
  n: string // number within pāda
  s: string // Devanagari sūtra text
  e: string // transliteration
  ss?: string // simplified gloss
  an?: string // anuvṛtti links: "word$id##word$id"
  type?: string // "<PREFIX>$label$extra"
}

export interface Sutra {
  id: string
  s: string
  e: string
  ss: string
  ref: string // "1.1.1"
  slp: string // SLP1 of `s`, lowercased — script-agnostic search key
  category: SutraCategory
  typeLabel: string
  anuvritti: { word: string; id: string }[]
}

function toSlp(devanagari: string): string {
  try {
    return Sanscript.t(devanagari, 'devanagari', 'slp1').toLowerCase()
  } catch {
    return ''
  }
}

// Convert a user query in the chosen scheme to a lowercased SLP1 key.
function queryToSlp(query: string, scheme: string): string {
  try {
    const dev = scheme === 'devanagari' ? query : Sanscript.t(query, scheme, 'devanagari')
    return Sanscript.t(dev, 'devanagari', 'slp1').toLowerCase()
  } catch {
    return ''
  }
}

const TYPE_PREFIX: Record<string, SutraCategory> = {
  V: 'vidhi',
  S: 'sanjna',
  P: 'paribhasha',
  AT: 'atidesha',
  AD: 'adhikara',
}

export const CATEGORY_META: Record<
  SutraCategory,
  { label: string; badge: string }
> = {
  vidhi: { label: 'विधि', badge: 'bg-sky-600 text-sky-50' },
  sanjna: { label: 'संज्ञा', badge: 'bg-emerald-600 text-emerald-50' },
  paribhasha: { label: 'परिभाषा', badge: 'bg-purple-600 text-purple-50' },
  atidesha: { label: 'अतिदेश', badge: 'bg-amber-600 text-amber-50' },
  adhikara: { label: 'अधिकार', badge: 'bg-rose-600 text-rose-50' },
  other: { label: '—', badge: 'bg-slate-600 text-slate-50' },
}

function parseType(type?: string): { category: SutraCategory; label: string } {
  if (!type) return { category: 'other', label: '' }
  const parts = type.split('$')
  const prefix = parts[0] ?? ''
  const label = parts[1] ?? ''
  return { category: TYPE_PREFIX[prefix] ?? 'other', label }
}

function parseAnuvritti(an?: string): { word: string; id: string }[] {
  if (!an) return []
  return an
    .split('##')
    .map((chunk) => {
      const [word, id] = chunk.split('$')
      return { word: word ?? '', id: id ?? '' }
    })
    .filter((x) => x.id)
}

function normalize(raw: RawSutra): Sutra {
  const { category, label } = parseType(raw.type)
  return {
    id: raw.i,
    s: raw.s ?? '',
    e: raw.e ?? '',
    ss: raw.ss ?? '',
    ref: `${raw.a}.${raw.p}.${raw.n}`,
    slp: toSlp(raw.s ?? ''),
    category,
    typeLabel: label,
    anuvritti: parseAnuvritti(raw.an),
  }
}

let _byId: Map<string, Sutra> | null = null
let _all: Sutra[] = []
let _loading: Promise<void> | null = null

function dataUrl(name: string): string {
  // import.meta.env.BASE_URL respects Vite `base` (e.g. /sanskrit-anki-decks/)
  return `${import.meta.env.BASE_URL}data/${name}`
}

export async function loadSutras(): Promise<void> {
  if (_byId) return
  if (_loading) return _loading
  _loading = (async () => {
    const res = await fetch(dataUrl('sutraani_data.json'))
    if (!res.ok) throw new Error(`Failed to load sutraani_data.json: ${res.status}`)
    const json = await res.json()
    const arr: RawSutra[] = Array.isArray(json) ? json : json.data
    _all = arr.map(normalize)
    _byId = new Map(_all.map((s) => [s.id, s]))
  })()
  return _loading
}

export function getSutra(id: string): Sutra | undefined {
  return _byId?.get(id)
}

export function allSutras(): Sutra[] {
  return _all
}

function hasDevanagari(s: string): boolean {
  return /[ऀ-ॿ]/.test(s)
}

// Ranked, script-agnostic search. The query is matched against, in priority:
// sūtra number (1.1.1 / "1 1 1"), the SLP1 transliteration of the sūtra (query
// converted from `scheme`), raw Devanagari, and the dataset's own `e` field.
export function searchSutras(
  query: string,
  scheme: string = 'hk',
  limit = 30,
): Sutra[] {
  const raw = query.trim()
  if (!raw) return []
  const ql = raw.toLowerCase()
  const refq = raw.replace(/\s+/g, '.') // "1 1 1" → "1.1.1"
  // SLP1 of the query. If the query already contains Devanagari, convert from
  // Devanagari regardless of the chosen scheme.
  const qslp = hasDevanagari(raw) ? queryToSlp(raw, 'devanagari') : queryToSlp(raw, scheme)

  const out: { s: Sutra; score: number }[] = []
  for (const s of _all) {
    let score = -1
    if (s.ref === refq) score = 0
    else if (qslp && s.slp.startsWith(qslp)) score = 1
    else if (hasDevanagari(raw) && s.s.startsWith(raw)) score = 1
    else if (s.e.toLowerCase().startsWith(ql)) score = 2
    else if (qslp && s.slp.includes(qslp)) score = 3
    else if (hasDevanagari(raw) && s.s.includes(raw)) score = 3
    else if (s.e.toLowerCase().includes(ql)) score = 4
    else if (s.ref.startsWith(refq)) score = 5
    if (score >= 0) out.push({ s, score })
  }
  out.sort((a, b) => a.score - b.score || a.s.id.localeCompare(b.s.id))
  return out.slice(0, limit).map((x) => x.s)
}

const SUGGEST: SutraCategory[] = ['sanjna', 'paribhasha', 'atidesha', 'adhikara']

// Auto-suggested linked sūtras for a vidhi step: its anuvṛtti targets that are
// sañjñā/paribhāṣā/atideśa/adhikāra (i.e. the interpretive rules it leans on).
export function suggestLinkedIds(vidhiIds: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const vid of vidhiIds) {
    const v = getSutra(vid)
    if (!v) continue
    for (const link of v.anuvritti) {
      const t = getSutra(link.id)
      if (t && SUGGEST.includes(t.category) && !seen.has(t.id)) {
        seen.add(t.id)
        out.push(t.id)
      }
    }
  }
  return out
}
