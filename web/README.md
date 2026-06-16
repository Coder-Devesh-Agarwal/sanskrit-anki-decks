# Śabda-Siddhi — web app

React + Tailwind app to **author and study Pāṇinian śabda-siddhi (word-derivation) cards**, with
sūtra autocomplete and Anki sync (AnkiConnect).

## Card model

Each card is a derivation:

- **Front** — a question, in one of two directions:
  - *forward* — derive / ask the final form;
  - *reverse* — given the final form, identify the base of derivation.
- **Back** —
  1. the net **result** first (with a click-to-reveal note);
  2. the **siddhi steps**, each showing only its **vidhi** sūtra(s);
  3. clicking a step reveals its linked **paribhāṣā / sañjñā** (and atideśa / adhikāra) sūtras + a step note;
  4. a final **card note** at the bottom.

Sūtra data comes from `../data_files/sutraani_data.json` (3983 sūtras). The `type` prefix classifies
each (V=vidhi, S=sañjñā, P=paribhāṣā, AT=atideśa, AD=adhikāra); the `an` (anuvṛtti) field drives the
auto-suggestion of linked sūtras when you add a vidhi sūtra to a step.

## Develop

```bash
cd web
npm install
npm run dev        # copies data_files/*.json → public/data, then serves on http://localhost:5173
npm run build      # production build into dist/
npm run typecheck
```

`predev`/`prebuild` run `scripts/copy-data.mjs`, which copies the sūtra dataset into `public/data/`.

## Storage & export

Cards live in browser **localStorage** (`shabdasiddhi.cards`) — the source of truth on a static host.
Use **Export JSON** / **Import JSON** on the Cards page to back up / move cards between machines.

## Anki sync (AnkiConnect)

The Cards page “Sync to Anki” pushes every card into a deck via [AnkiConnect](https://foosoft.net/projects/anki-connect/).
Cards upsert by a hidden `CardId` field, so re-syncing an edited card **updates** its note instead of
duplicating it. A self-contained note template renders the same click-to-reveal layout inside Anki
from a baked `Payload` field (Anki needs no access to the sūtra dataset).

Setup (Settings page has the full checklist):

1. Install AnkiConnect (add-on code `2055492159`); keep Anki running.
2. Add this site's origin to `webCorsOriginList` in the AnkiConnect config, e.g.
   `["http://localhost:5173", "https://<user>.github.io"]`; restart Anki.
3. Set the AnkiConnect URL (default `http://127.0.0.1:8765`) + deck name in Settings → Test connection.

**Hosting caveat:** AnkiConnect is HTTP-only on localhost. When the site is served over HTTPS
(GitHub Pages), some browsers block the call as mixed content. Fallbacks: run the app locally over
HTTP, or use Export/Import JSON and import the deck manually.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds `web/` and publishes to Pages on push to `main`. It sets the
Vite `base` to `/<repo-name>/` automatically. Enable Pages → Source: **GitHub Actions** in repo settings.
