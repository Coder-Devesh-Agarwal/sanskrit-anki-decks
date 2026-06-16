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
