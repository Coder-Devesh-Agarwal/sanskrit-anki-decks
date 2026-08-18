import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'
import { Decklist } from './pages/Decklist'
import { Author } from './pages/Author'
import { Study } from './pages/Study'
import { Settings } from './pages/Settings'
import { hydrate } from './store/persist'

// Precaches the app shell + sūtra data + fonts so the app works fully offline
// once installed; `registerType: 'autoUpdate'` (vite.config.ts) applies new
// deploys on the next load with no user prompt.
registerSW({ immediate: true })

// Cards and settings live in IndexedDB but are read synchronously from an
// in-memory mirror (store/persist.ts), so the mirror has to be filled before
// the first render — otherwise every store read would come back empty.
hydrate().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Decklist />} />
            <Route path="author" element={<Author />} />
            <Route path="author/:id" element={<Author />} />
            <Route path="study/:id" element={<Study />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </React.StrictMode>,
  )
})
