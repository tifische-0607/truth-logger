# SpyGlass V2 — App Documentation

SpyGlass V2 is an evidence-capture system for preserving Facebook content (posts, comments, and live streams) as legal evidence for escalation in Malaysia: police reports, MCMC complaints under the Communications and Multimedia Act 1998 (s.233), and civil action.

The system has two halves:

- **The web app** (this repository, hosted at your published address) — case management, evidence review, verification, export, and the capture queue.
- **The Mac mini worker** (`worker/` folder) — a Python program running on a dedicated Mac mini that holds the logged-in Facebook session, performs the captures, and uploads the artefacts.

> **Evidence integrity beats convenience.** Files are append-only, never overwritten. Every artefact has a SHA-256 fingerprint, every action is logged, and exports are blocked if any re-hash fails.

---

## 1. Chain of custody model

Six levels, kept explicit in the database:

```text
Case ── Incident wave ── Platform account ── Evidence item ── Artefact ── Custody event
     (2026-014)      (INC-1)          (@handle)        (POST-/CMT-)   (file+SHA-256)  (uploaded/accessed/…)
```

- **Cases** — top-level investigation folders, IDs like `2026-014`.
- **Incidents** — dated waves within a case, unique per case (`case_id + incident_id`).
- **Accounts** — a platform + handle observed in an incident (Facebook, Instagram).
- **Items** — evidence items: `POST-…`, comments `CMT-0001`, replies `-R01`, with parent links preserved.
- **Artefacts** — the actual captured files (screenshots, PDFs, saved pages, text, video segments). **Insert-only**: database triggers block UPDATE and DELETE. Corrections are new rows, never edits.
- **Custody events** — **insert-only** log: `transferred` (worker upload), `accessed` (view/download), `re-hashed` (verification), `exported`.

### File naming

```text
CASE-{case}_INC-{inc}_FB_{item}_{artefact}.{ext}
```

Storage paths mirror the folder layout:

```text
CASE-x/INC-y_YYYY-MM-DD/FB_@handle/POST-id/[comments/CMT-0001/]artefacts/
```

### Rules that protect the evidence

- Every artefact carries its own SHA-256, computed by the worker at capture time.
- Verification re-hashes every stored file; **export is blocked on any mismatch**.
- Viewing or downloading an artefact logs an `accessed` custody event.
- Storage is private; files are served only through short-lived signed URLs (view/download links expire in 5 minutes, export downloads in 1 hour).
- **"Render" images are rebuilt from API data** and are always labelled *"RENDER – from API data, not a platform screenshot"*. They are never presented as screenshots.
- Translations are stored separately from the original text and always carry the translator statement; machine translations require human verification.

---

## 2. Sign-in and roles

- Email + password sign-in at `/auth`. **Sign-ups close after the first account** (a `signup_open()` database function enforces this).
- The first user is the **owner**. Only the owner can: manage capture settings, manage case templates, restart the worker, and see everyone's captures.
- Investigators see their own queued captures by default (My captures / Everyone's toggle on the Queue page).
- All tables are protected by row-level security; nothing is public.

---

## 3. The capture flow, end to end

1. **You queue a capture** — from any screen in the app ("New capture" button), the Worker page ("Send to Mac mini"), or the iPad Home Screen quick action. You paste a Facebook link, pick the case and incident, and choose **Post or video** or **Live stream**.
2. **The Mac mini picks it up** — the worker polls the queue every ~5 seconds and heartbeats every 20 seconds. No manual start needed.
3. **The worker captures** — it opens the link in a logged-in Chromium browser, expands comments and replies, and saves: full-page screenshot, PDF print, raw page HTML, parsed post data, post text, permalink, and (for live mode) the recorded video segments.
4. **Everything is hashed and uploaded** — each file gets a SHA-256, uploads to private evidence storage (overwrites are refused), and records are written: case → post → comments → artefacts → custody events. The upload logs a `transferred` custody event.
5. **You review** — the Results page shows the finished capture with one-tap access to each file; the evidence item page has hashes, translations, and the full custody trail.
6. **You verify and export** — the Verify page re-hashes everything; the Export page builds a ZIP (manifest of hashes, verification report, per-item text with translations, custody log) released to a named recipient, logging an `exported` event per file.

### Progress reporting

The worker emits `PROGRESS:{0–100}:{stage}` lines in its log. The Dashboard, Worker page, and job pages parse these into live progress bars. Stages: 5 preparing → 10 opening Chromium → 20 post opened → 28 expanding comments → 45 processed → 55 files saved → 62 hashed → 65+ uploading → 90 writing records → 98 integrity checks → 100 complete.

### Safety nets

- **Abandoned runs** — a job picked up but silent for 30+ minutes is automatically returned to the queue with the note "Run was abandoned and re-queued automatically".
- **Failed runs do not retry by themselves** — resend the link after fixing the cause.
- **Restart worker button** (Worker page, owner only) — re-queues any stuck capture, then the Mac mini restarts the worker process cleanly at its next check-in (~20 s), killing any stuck browser.

---

## 4. The Mac mini worker

### What it is

A Python program (`worker/`) running as a macOS background service. It holds the logged-in Facebook session — that is why captures can only run on that machine.

### One-time setup

```bash
cd /Users/hermes/truth-logger
git pull

python3 -m venv worker/.venv
source worker/.venv/bin/activate
pip install -r worker/requirements.txt
playwright install chromium
brew install ffmpeg yt-dlp        # only needed for live-stream recording

cp worker/.env.example worker/.env
# edit worker/.env: keep WORKER_BASE_URL=https://spyglass2.sentinel2.org
# and set WORKER_TOKEN to the token configured for the app

python -m worker.login            # sign in to Facebook once in the window that opens
```

### Installing the service (auto-restart, survives reboots)

```bash
sudo bash worker/install-system.sh   # starts at boot, before login; restarts after any crash
```

- Logs: `~/fbem/worker.log` and `~/fbem/worker.err.log`
- Remove: `sudo bash worker/uninstall-system.sh`
- Login-session alternative (no sudo, but needs a logged-in user): `bash worker/install.sh`

**Important:** the project must live outside `~/Documents` — macOS privacy protections block background services from reading there (this is why it lives at `/Users/hermes/truth-logger`). Use `sudo` only with `install-system.sh`, never with `install.sh`.

The worker also exits deliberately after 20 consecutive network failures so the service restarts it clean (`NET_FAILURE_LIMIT` in `.env`).

### Keeping the worker current

After any app-side worker change:

```bash
cd /Users/hermes/truth-logger && git pull
# then restart the service (or use the Restart worker button in the app)
```

Never commit `worker/.env` — the worker token lives only in the app's Secrets.

### Worker HTTP API

The worker talks to six endpoints under `/api/public/`, authenticated with `Authorization: Bearer $WORKER_TOKEN`. Full request/response JSON shapes are documented in **[WORKER_API.md](../WORKER_API.md)**:

| Endpoint | Purpose |
|---|---|
| `worker-heartbeat` | Check-in every 20 s; receives restart commands |
| `worker-claim` | Atomically claims the oldest queued job; returns workspace capture settings with the job |
| `worker-log` | Appends log lines (including `PROGRESS:` markers) |
| `worker-upload-url` | Signed upload URLs; refuses overwrites (409) |
| `worker-ingest` | Upserts case/incident/account/items/artefacts/custody; re-hashes new artefacts |
| `worker-complete` | Marks the job done or failed |

---

## 5. Pages

| Page | What it does |
|---|---|
| **Dashboard** | Worker status card, queue with live progress bars, recent activity |
| **Cases** | Case tree: case → incidents → accounts → items; per-case timeline of every dated event |
| **Evidence item** | Live screenshot vs *Render* gallery, original text + English translation + translator statement, artefacts with copyable SHA-256, custody timeline, AI case-ready summary |
| **Results** | Each completed capture as a card: screenshot preview, one-tap file buttons (screenshot / PDF / saved page / text / video), custody trail, link to full evidence page |
| **Worker** | Worker status, current capture with live output streaming beside the progress bar, queued jobs, worker logs, **Restart worker** button, diagnostics |
| **Queue** | All capture jobs; My captures / Everyone's toggle |
| **Capture log** | Every run with date, duration, success/failure, case link; live-updating |
| **Capture setup** | Workspace capture settings (owner only): account label, proxy, timeout, comment expansion, PDF toggle |
| **Templates** | Case templates (owner only): define fields and required artefacts per investigation type |
| **Verify** | Re-hash every stored file; MATCH / MISMATCH / MISSING per artefact |
| **Export** | Verify first (blocks on failure), then ZIP per case with manifest, verification report, texts + translations, custody log |
| **Settings** | Worker card (public IP, port note, diagnostics), secrets, sign-out |
| **Offline** | Manage cases downloaded to this device; sync button |
| **Review** (`/review/$caseId`) | iPad-only case viewer: swipeable artefact deck, full-screen zoom viewer (double-tap / pinch, 1–6×) |

### AI case-ready summary

Each evidence item can generate an AI-assisted draft summary: factual summary, numbered key allegations with verbatim quotes, and caveats. It is editable, copyable, marked as an AI draft to verify, and **never stored as evidence**. The model is instructed not to infer ethnicity, religion, political leaning, or age.

---

## 6. iPad and offline use

- **Install:** Safari → sign in → Share → Add to Home Screen. The app runs full-screen as "SpyGlass". Chrome on iPad cannot install web apps. Long-press the icon for a "New capture" shortcut.
- **Offline mode:** cases can be downloaded to the device (records + files, each file re-hashed on download — mismatches are rejected). Viewing offline works from local copies; custody "accessed" events queue up and sync back when you're online again. A banner shows when you're offline; the Offline page has the sync button. Files over 40 MB are skipped on download.
- **If the worker isn't checking in**, a red banner appears across the top of every signed-in screen with the exact fix command.

---

## 7. Privacy (PDPA 2010)

- Subject profiles hold only **Stated** and **Observed** fields; a handle-only commenter is recorded as "insufficient data", never guessed.
- Analyst assessments live in a **separate table** (linked to profiles), dated and attributed — never mixed into the profile itself.
- The app never infers or stores ethnicity, religion, political leaning, or age.

---

## 8. Repository layout

```text
src/routes/                 app pages, incl. api/public/worker-* endpoints
src/lib/                    shared helpers (offline db, capture progress, worker shared)
src/components/             AppShell, capture sheet, custody trail, viewers
supabase/migrations/        database schema and security rules
worker/                     Mac mini capture worker (Python) — see worker/README.md
WORKER_API.md               worker HTTP API contract — keep in sync with endpoint changes
public/manifest.webmanifest iPad install metadata
```

---

## 9. Not yet built / known limits

- **Emailing files to contacts** — designed (secure expiring links + custody logging, no attachments) but blocked until an email domain is connected to the project.
- **Live-stream recording** — implemented; needs `ffmpeg` + `yt-dlp` on the Mac mini; records only streams currently playing and visible to the logged-in account.
- The app cannot start a fully stopped worker remotely — the boot-time service (§4) is the fix for that; the in-app Restart button works while the worker is still online.
