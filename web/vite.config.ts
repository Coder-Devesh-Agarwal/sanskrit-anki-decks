import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// For GitHub project pages the site is served from /<repo>/.
// Override with BASE_PATH env when the repo name differs.
const base = process.env.BASE_PATH ?? '/sanskrit-anki-decks/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
