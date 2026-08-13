import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  deckMetaOf,
  loadSettings,
  patchSettings,
  saveSettings,
  setDeckMeta,
  useSettings,
  type DeckType,
} from "../store/settings";
import { testConnection } from "../anki/ankiConnect";
import { renameDeck } from "../store/cards";
import { SCHEMES, transliterate } from "../lib/translit";
import {
  FSA_SUPPORTED,
  backupNow,
  backupStatus,
  forgetBackupFolder,
  pickBackupFolder,
  reauthorizeBackupFolder,
  type BackupStatus,
} from "../lib/folderBackup";

export function Settings() {
  const [s, setS] = useState(() => loadSettings());
  const [status, setStatus] = useState<string | null>(null);
  const origin = window.location.origin;
  const originalDeck = useRef(loadSettings().deckName);
  const initialMeta = deckMetaOf(originalDeck.current);
  const [deckType, setDeckType] = useState<DeckType>(initialMeta.type);
  const [deckParent, setDeckParent] = useState(initialMeta.parent ?? "");
  const composites = s.decks.filter(
    (d) => d !== originalDeck.current && deckMetaOf(d).type === "composite",
  );

  function save() {
    const old = originalDeck.current;
    const next = s.deckName.trim() || old;
    // renaming the active deck moves its cards + updates the deck list
    if (next !== old) {
      renameDeck(old, next); // also rewrites deckMeta keys/parent links
      const decks = s.decks.map((d) => (d === old ? next : d));
      // deckMeta from storage: renameDeck just rewrote it, s's copy is stale
      saveSettings({
        ...s,
        deckMeta: loadSettings().deckMeta,
        deckName: next,
        decks,
      });
      originalDeck.current = next;
    } else {
      saveSettings({ ...s, deckMeta: loadSettings().deckMeta });
    }
    // apply the active deck's type/parent
    if (deckType === "sub" && deckParent)
      setDeckMeta(next, { type: "sub", parent: deckParent });
    else setDeckMeta(next, { type: deckType === "sub" ? "default" : deckType });
    setStatus("Saved.");
  }

  async function test() {
    setStatus("Testing…");
    try {
      const v = await testConnection(s.ankiUrl);
      setStatus(`Connected. AnkiConnect version ${v}.`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-lg font-semibold text-slate-200">Settings</h1>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">
          AnkiConnect URL
        </span>
        <input
          value={s.ankiUrl}
          onChange={(e) => setS({ ...s, ankiUrl: e.target.value })}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
      </label>

      <label className="block">
        <span className="dev mb-1 block text-xs text-slate-400">
          Active deck name (rename on save)
        </span>
        <input
          value={s.deckName}
          onChange={(e) => setS({ ...s, deckName: e.target.value })}
          className="dev w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">
            Deck type (independent / composite / sub)
          </span>
          <select
            value={deckType}
            onChange={(e) => setDeckType(e.target.value as DeckType)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            <option value="default">Independent (default)</option>
            <option value="composite">Composite (holds sub decks)</option>
            <option value="sub" disabled={composites.length === 0}>
              Sub deck{composites.length === 0 ? " — no composite decks" : ""}
            </option>
          </select>
        </label>
        {deckType === "sub" && composites.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">
              Parent composite (Anki deck “parent::name”)
            </span>
            <select
              value={deckParent}
              onChange={(e) => setDeckParent(e.target.value)}
              className="dev w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
            >
              <option value="">— choose parent —</option>
              {composites.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">
            Input scheme (you type)
          </span>
          <select
            value={s.inputScheme}
            onChange={(e) => setS({ ...s, inputScheme: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {SCHEMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">
            Output scheme (preview/convert)
          </span>
          <select
            value={s.outputScheme}
            onChange={(e) => setS({ ...s, outputScheme: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {SCHEMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm">
        <span className="text-xs text-slate-500">preview: </span>
        <span className="dev text-slate-300">
          {transliterate("vfdDiH", "slp1", s.inputScheme)}
        </span>
        <span className="px-2 text-slate-600">→</span>
        <span className="dev text-emerald-200">
          {transliterate(
            transliterate("vfdDiH", "slp1", s.inputScheme),
            s.inputScheme,
            s.outputScheme,
          )}
        </span>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">
          Web base font size — {s.baseFontSize}px (web app scales from this)
        </span>
        <input
          type="range"
          min={12}
          max={28}
          step={1}
          value={s.baseFontSize}
          onChange={(e) => setS({ ...s, baseFontSize: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">
          Anki card font size — {s.ankiFontSize}px (rendered Anki card scales
          from this)
        </span>
        <input
          type="range"
          min={12}
          max={40}
          step={1}
          value={s.ankiFontSize}
          onChange={(e) => setS({ ...s, ankiFontSize: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <div className="block">
        <span className="mb-1 block text-xs text-slate-400">
          Theme (web + Anki card)
        </span>
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setS({ ...s, theme: t })}
              className={`rounded px-3 py-1.5 text-sm ${
                s.theme === t
                  ? "bg-sky-600 text-white"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <BackupSection />

      <div className="flex gap-2">
        <button
          onClick={save}
          className="rounded bg-emerald-600 px-4 py-2 hover:bg-emerald-500"
        >
          Save
        </button>
        <button
          onClick={test}
          className="rounded bg-sky-600 px-4 py-2 hover:bg-sky-500"
        >
          Test connection
        </button>
        <button
          onClick={() => setS({ ...DEFAULT_SETTINGS })}
          className="rounded bg-slate-700 px-4 py-2 hover:bg-slate-600"
        >
          Reset defaults
        </button>
      </div>

      {status && (
        <div className="rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
          {status}
        </div>
      )}

      <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-100/90">
        <p className="mb-2 font-semibold text-amber-300">Connecting to Anki</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Install the AnkiConnect add-on (code <code>2055492159</code>) and
            keep Anki open.
          </li>
          <li>
            Anki → Tools → Add-ons → AnkiConnect → Config. Add this site's
            origin to <code>webCorsOriginList</code>:
            <pre className="mt-1 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-200">{`"webCorsOriginList": ["${origin}", "http://localhost:5173"]`}</pre>
          </li>
          <li>Restart Anki, then use “Test connection”.</li>
        </ol>
        <p className="mt-2 text-xs text-amber-200/70">
          Note: AnkiConnect is HTTP-only on localhost. If this site is opened
          over HTTPS (GitHub Pages), some browsers block the request as mixed
          content. Fallbacks: run the app locally over HTTP, or use
          Export/Import JSON. Current origin: <code>{origin}</code>
        </p>
      </div>
    </div>
  );
}

// Local-folder auto-backup (File System Access API). Self-contained so its
// async status polling doesn't tangle with the rest of the Settings form.
// The actual interval scheduler lives in App.tsx (runs app-wide, not just
// while this page is mounted); this section just grants/revokes the folder
// and configures/reads the settings the scheduler watches.
function BackupSection() {
  const { backupEnabled, backupIntervalMinutes, lastBackupAt } = useSettings();
  const [status, setStatus] = useState<BackupStatus>({ name: null, state: "none" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backupStatus().then(setStatus);
  }, []);

  async function choose() {
    setBusy(true);
    try {
      setStatus(await pickBackupFolder());
      setMsg(null);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reallow() {
    setBusy(true);
    try {
      const state = await reauthorizeBackupFolder();
      setStatus((s) => ({ ...s, state }));
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setMsg("Backing up…");
    try {
      const r = await backupNow();
      patchSettings({ lastBackupAt: Date.now() });
      setMsg(`Saved ${(r.bytes / 1024).toFixed(1)} KB → ${r.file}`);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    if (!confirm("Forget the backup folder? Auto-backup stops until you choose a new one.")) return;
    await forgetBackupFolder();
    setStatus({ name: null, state: "none" });
    setMsg(null);
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm">
      <p className="mb-1 font-semibold text-slate-200">Local folder backup</p>
      <p className="mb-3 text-xs text-slate-500">
        Writes every deck straight to a folder on this device on a timer — no Anki, no downloads
        folder clutter. Independent of Anki sync; a plain snapshot you can hand back to Import JSON.
      </p>

      {!FSA_SUPPORTED ? (
        <p className="text-xs text-amber-300">
          This browser doesn't support saving straight to a folder (Chrome/Edge only). Use Export JSON
          on the Cards page instead.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">
              Folder:{" "}
              <span className="text-slate-200">
                {status.name ?? "(none chosen)"}
                {status.name && ` — ${status.state}`}
              </span>
            </span>
            {status.state === "prompt" && (
              <button
                onClick={reallow}
                disabled={busy}
                className="rounded bg-amber-700 px-2 py-1 text-xs hover:bg-amber-600 disabled:opacity-50"
              >
                Re-allow
              </button>
            )}
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={choose}
              disabled={busy}
              className="rounded bg-slate-700 px-3 py-1.5 text-xs hover:bg-slate-600 disabled:opacity-50"
            >
              {status.name ? "Change folder" : "Choose folder"}
            </button>
            <button
              onClick={runNow}
              disabled={busy || status.state !== "granted"}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs hover:bg-sky-500 disabled:opacity-50"
            >
              Backup now
            </button>
            {status.name && (
              <button
                onClick={forget}
                disabled={busy}
                className="rounded bg-slate-700 px-3 py-1.5 text-xs hover:bg-rose-900/60 hover:text-rose-300 disabled:opacity-50"
              >
                Forget folder
              </button>
            )}
          </div>

          <label className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={backupEnabled}
              onChange={(e) => patchSettings({ backupEnabled: e.target.checked })}
            />
            Auto-backup every
            <select
              value={backupIntervalMinutes}
              onChange={(e) => patchSettings({ backupIntervalMinutes: Number(e.target.value) })}
              className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {[5, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-slate-500">
            Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "never"}
          </p>
        </>
      )}

      {msg && <p className="mt-2 text-xs text-slate-300">{msg}</p>}
    </div>
  );
}
