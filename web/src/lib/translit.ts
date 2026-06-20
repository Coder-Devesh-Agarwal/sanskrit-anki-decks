// Central transliteration helper around @indic-transliteration/sanscript, plus
// the scheme list used by the global input→output setting.

import Sanscript from '@indic-transliteration/sanscript'

export interface SchemeDef {
  id: string
  label: string
}

// Curated subset of sanscript's schemes (romanisations + common Indic scripts).
export const SCHEMES: SchemeDef[] = [
  { id: 'devanagari', label: 'Devanagari (देवनागरी)' },
  { id: 'iast', label: 'IAST (vṛddhi)' },
  { id: 'hk', label: 'Harvard-Kyoto (vRddhi)' },
  { id: 'itrans', label: 'ITRANS (vRiddhi)' },
  { id: 'slp1', label: 'SLP1 (vfdDi)' },
  { id: 'velthuis', label: 'Velthuis (v.rddhi)' },
  { id: 'kannada', label: 'Kannada (ಕನ್ನಡ)' },
  { id: 'telugu', label: 'Telugu (తెలుగు)' },
  { id: 'tamil', label: 'Tamil (தமிழ்)' },
  { id: 'malayalam', label: 'Malayalam (മലയാളം)' },
  { id: 'bengali', label: 'Bengali (বাংলা)' },
  { id: 'gujarati', label: 'Gujarati (ગુજરાતી)' },
  { id: 'gurmukhi', label: 'Gurmukhi (ਗੁਰਮੁਖੀ)' },
  { id: 'grantha', label: 'Grantha' },
]

export function transliterate(text: string, from: string, to: string): string {
  if (!text || from === to) return text
  try {
    return Sanscript.t(text, from, to)
  } catch {
    return text
  }
}

// Transliterate the text of an HTML fragment, leaving tags/markup intact.
export function transliterateHtml(html: string, from: string, to: string): string {
  if (!html || from === to) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let n = walker.nextNode()
  while (n) {
    nodes.push(n as Text)
    n = walker.nextNode()
  }
  for (const t of nodes) {
    if (t.nodeValue) t.nodeValue = transliterate(t.nodeValue, from, to)
  }
  return doc.body.innerHTML
}
