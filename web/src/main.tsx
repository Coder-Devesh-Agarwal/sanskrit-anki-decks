import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { App } from './App'
import { Decklist } from './pages/Decklist'
import { Author } from './pages/Author'
import { Study } from './pages/Study'
import { Settings } from './pages/Settings'

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
