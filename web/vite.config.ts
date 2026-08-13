import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// For GitHub project pages the site is served from /<repo>/.
// Override with BASE_PATH env when the repo name differs.
const base = process.env.BASE_PATH ?? '/sanskrit-anki-decks/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // test the service worker under `npm run dev` too, not just `build && preview`
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Śabda-Siddhi',
        short_name: 'Śabda-Siddhi',
        description: 'Author and study Pāṇinian śabda-siddhi word-derivation cards, offline.',
        lang: 'sa',
        start_url: '.',
        display: 'standalone',
        background_color: '#020617',
        theme_color: '#0284c7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // sūtraani_data.json (~3.8MB) exceeds Workbox's 2MB default per-file cap
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,json,ttf,png,svg,ico}'],
        // only the 4 Adishila Vedic faces actually used at runtime (anki/template.ts FONT_FACES)
        globIgnores: ['fonts/AdishilaVedic/*Heavy*', 'fonts/AdishilaVedic/*SemiBold*', 'fonts/AdishilaVedic/AdishilaSan*'],
        // HashRouter: every route is the same document, so one fallback covers all of them
        navigateFallback: 'index.html',
      },
    }),
  ],
})
