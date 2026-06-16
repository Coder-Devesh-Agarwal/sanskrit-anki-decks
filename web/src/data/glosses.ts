// Gloss sources keyed by sūtra id (same id as sutraani_data):
//  - vasu_english_summary.json → English meaning
//  - laghukaumudi.json         → Laghu-Siddhānta-Kaumudī note (preferred)
//  - kaumudi.json              → Siddhānta-Kaumudī note (fallback)
// All optional; loading failures degrade silently to no gloss.

export interface Gloss {
  english: string
  /** preferred Sanskrit note: LSK if present, else SK */
  note: string
  /** which source `note` came from, for labelling */
  noteSource: 'lsk' | 'sk' | ''
}

let _english: Record<string, string> = {}
let _lsk: Record<string, string> = {}
let _sk: Record<string, string> = {}
let _loading: Promise<void> | null = null

function dataUrl(name: string): string {
  return `${import.meta.env.BASE_URL}data/${name}`
}

async function fetchMap(name: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(dataUrl(name))
    if (!res.ok) return {}
    return (await res.json()) as Record<string, string>
  } catch {
    return {}
  }
}

export async function loadGlosses(): Promise<void> {
  if (_loading) return _loading
  _loading = (async () => {
    const [en, lsk, sk] = await Promise.all([
      fetchMap('vasu_english_summary.json'),
      fetchMap('laghukaumudi.json'),
      fetchMap('kaumudi.json'),
    ])
    _english = en
    _lsk = lsk
    _sk = sk
  })()
  return _loading
}

export function getGloss(id: string): Gloss {
  const english = (_english[id] ?? '').trim()
  const lsk = (_lsk[id] ?? '').trim()
  const sk = (_sk[id] ?? '').trim()
  if (lsk) return { english, note: lsk, noteSource: 'lsk' }
  if (sk) return { english, note: sk, noteSource: 'sk' }
  return { english, note: '', noteSource: '' }
}
