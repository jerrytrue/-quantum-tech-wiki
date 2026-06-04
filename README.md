# Quantum Vendor Tracker

A bilingual (EN / 中文), single-page directory of quantum computing vendors worldwide. Filter by physics technology, stack level, and region. Card and table views. Live news via Google News RSS. Live stock prices for publicly traded vendors. Click any physics technology chip for an explanatory modal with diagram and an interactive Bloch sphere.

## Live demo

🌐 <https://jerrytrue.github.io/quantum-com-wiki/>

### Try it on mobile

<img src="qr-code.png" alt="QR code linking to the live site" width="200" />

## File layout

```
quantum-vendor-tracker/
├── index.html        # Page structure
├── style.css         # Theme + layout
├── app.js            # Logic (filter / sort / i18n / view / RSS)
├── vendors.json      # Vendor database — edit this to add/update vendors
├── i18n.json         # Translation strings
└── README.md
```

## Run locally

Because the page loads `vendors.json` and `i18n.json` via `fetch()`, you cannot just double-click `index.html` (browsers block `file://` fetch). Serve via a tiny local server:

**Python (built-in on macOS/Linux, or via py launcher on Windows):**
```
cd quantum-vendor-tracker
python -m http.server 8000
```
Then open <http://localhost:8000>.

**Node.js (one-shot, no install):**
```
npx serve .
```

**VS Code:** Install the "Live Server" extension, right-click `index.html` → "Open with Live Server".

## Deploy to GitHub Pages

1. Create a new repo on GitHub (e.g. `quantum-vendor-tracker`). Public is fine.
2. Push these files:
   ```
   git init
   git add .
   git commit -m "init: quantum vendor tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/quantum-vendor-tracker.git
   git push -u origin main
   ```
3. On GitHub → Settings → Pages → Source: `main` branch, root folder → Save.
4. After ~1 min the site is live at `https://<your-username>.github.io/quantum-vendor-tracker/`.

> ⚠️ Replace `<your-username>` with your actual GitHub login (not your email). I used `jerrychu888` as a placeholder — if that's your handle, you're set.

## Updating vendor data

Edit `vendors.json`. The structure of one entry:

```json
{
  "id": "ibm",
  "name": "IBM Quantum",
  "physics": "superconducting",        // see PHYSICS_OPTIONS in app.js
  "stack": ["full"],                    // can be multiple: full, qubit, control, software, cloud
  "region": "usa",                      // usa | europe | asia | canada
  "founded": 1980,
  "hq": "Yorktown Heights, NY, USA",
  "milestone": { "en": "...", "zh": "..." },
  "desc":      { "en": "...", "zh": "..." },
  "newsQuery": "IBM Quantum",          // used to build the Google News link
  "links": { "site": "https://...", "roadmap": "https://..." }
}
```

After editing, also bump `lastUpdated` at the top of `vendors.json`. Commit + push → GitHub Pages auto-redeploys.

## Daily news ("daily update" feature)

The left sidebar has a **Live News** panel that pulls Google News RSS for `"quantum computing" OR qubit` headlines via the [rss2json.com](https://rss2json.com/) free proxy (handles CORS). Reloads on every page view, so opening the site gives fresh news.

Each vendor card / table row also has a 📰 link that opens a Google News search for that specific vendor.

### Free-tier limits
- rss2json free: 10,000 requests/day per IP — plenty for personal use.
- If the panel breaks, swap to `https://api.allorigins.win/raw?url=` style proxy or switch to a paid plan.

## Upgrade path (later)

If you want fully automated daily updates of `vendors.json` itself (not just the news panel):

1. Add `.github/workflows/update.yml` running once a day.
2. Have a script scrape vendor press pages or arXiv RSS, generate a diff against `vendors.json`, and commit it.
3. GitHub Pages auto-deploys the new commit.

That's "Plan 2" from the original design discussion — we deliberately stayed in Plan 1 + 4 here for simplicity.

## Categorization scheme

**Physics Technology** — how the qubit is physically realized
- `superconducting` · `iontrap` · `photonic` · `neutralatom` · `topological` · `siliconspin` · `nvcenter` · `agnostic` (for control/SW/cloud vendors that span all)

**Stack Level** — what layer the vendor operates at
- `full` — full stack: qubit hardware + control + software + cloud
- `qubit` — qubit hardware / chips only
- `control` — control system, cryo HW, classical electronics
- `software` — algorithms, compilers, SDKs
- `cloud` — managed quantum cloud aggregators

**Region** — HQ country
- `usa` · `europe` · `asia` · `canada`

A vendor can have multiple stack tags (e.g. `["full"]` already implies everything; a chip-only company is `["qubit"]`; a cloud aggregator is `["cloud"]`).

## License

MIT for the code. Vendor info compiled from public sources (official sites, press releases, arXiv) for educational/research use.
