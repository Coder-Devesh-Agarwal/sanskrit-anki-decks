// Copies the sutra dataset (and optional gloss files) from the repo's
// ../data_files into web/public/data so the static site can fetch them.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', 'data_files')
const dst = join(here, '..', 'public', 'data')

mkdirSync(dst, { recursive: true })

const required = ['sutraani_data.json']
// Gloss sources for the sūtra meaning popover: English summary + LSK + SK note.
const optional = [
  'vasu_english_summary.json',
  'laghukaumudi.json',
  'kaumudi.json',
  'vartika.json',
]

for (const f of required) {
  const from = join(src, f)
  if (!existsSync(from)) {
    console.error(`[copy-data] MISSING required ${from}`)
    process.exit(1)
  }
  copyFileSync(from, join(dst, f))
  console.log(`[copy-data] ${f}`)
}
for (const f of optional) {
  const from = join(src, f)
  if (existsSync(from)) {
    copyFileSync(from, join(dst, f))
    console.log(`[copy-data] ${f} (optional)`)
  }
}
