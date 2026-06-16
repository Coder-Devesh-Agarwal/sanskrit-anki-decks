import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { loadSutras } from './data/sutras'
import { loadGlosses } from './data/glosses'

export function App() {
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // Glosses are optional — never block the app on them.
    loadSutras()
      .then(() => loadGlosses().catch(() => {}))
      .then(() => setReady(true))
      .catch((e) => setErr(String(e)))
  }, [])

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="dev text-lg font-semibold text-sky-300">शब्द-सिद्धि</span>
          <nav className="flex gap-1 text-sm">
            <Tab to="/" label="Cards" end />
            <Tab to="/author" label="Author" />
            <Tab to="/settings" label="Settings" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {err && (
          <div className="rounded border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">
            Failed to load sūtra data: {err}
          </div>
        )}
        {!ready && !err ? (
          <div className="text-slate-400">Loading sūtra data…</div>
        ) : (
          ready && <Outlet />
        )}
      </main>
    </div>
  )
}

function Tab({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 ${isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`
      }
    >
      {label}
    </NavLink>
  )
}
