# Evidence Hub — App Documentation

Evidence Hub (formerly SpyGlass V2) is the single place to find, review, verify and export evidence from every FridayAnalytics source, for escalation in Malaysia: police reports, MCMC complaints under the Communications and Multimedia Act 1998 (s.233), and civil action.

The system has three parts:

- **The web app** (this repository, hosted at your published address) — search, case workspaces, evidence review, verification, export, and the capture queue.
- **The Mac mini worker** (`worker/` folder) — a Python program running on a dedicated Mac mini that holds the logged-in Facebook session, performs the captures, and uploads the artefacts to the **cloud vault**.
- **The DarkNight gateway** (`gateway/` folder) — a read-only service on the Mac Studio that lets the app read DarkNight, the **home vault**, live over Tailscale. Home-vault content never enters the cloud. See §10.

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

The sidebar has six workspaces, then Sources and Admin. Old addresses still work; each page now sits inside one of these.

| Place | Pages | What it does |
|---|---|---|
| **Home** (`/dashboard`) | — | What needs attention (failed captures, worker or DarkNight offline), capture in progress, source status, recent evidence from both vaults, open cases |
| **Projects** (`/projects`, `/clients/…`) | Overview, Brief & criteria, Evidence, Outputs, Dashboard, Team, Log | Clients and their projects; see §11 |
| **Search** (`/search`) | — | One search across original text, English translations, handles and item codes: the cloud vault, linked home-vault references, and DarkNight itself when it is online. "Add to case" on DarkNight results |
| **Cases** | Overview, Evidence, Timeline, People, Comments, Transcripts, Custody, Report, Dossier | Every per-case page is a tab under one case header (ID, status, home-vault count, Verify / Export / Present). The Evidence tab lists home-vault items beside the case tree |
| **Evidence item** (`/items/…`) | — | Cloud-vault item: Live screenshot vs *Render* gallery, text + translation, artefacts with SHA-256, custody, AI case-ready summary |
| **Home-vault item** (`/vault/darknight/…`) | — | DarkNight record streamed live: files viewed or downloaded straight from the gateway and re-hashed on the device, text, DarkNight details, cases it is in, case and home custody logs. Offline: reference and hashes only |
| **Collect** | Now, All jobs, Watched pages, Results, Capture log, Worker, Capture setup | Everything about the Mac mini capture pipeline. "Now" shows the running capture by stage, worker health, queued and failed jobs, and today's finished captures |
| **Integrity** | Verify, Export bundle, Offline library | Verify re-hashes cloud files on the server and home-vault files at home. Export builds the cloud ZIP on the server and a separate home-vault ZIP on the device |
| **Sources** (`/sources`) | — | One card per source: where it is kept, how it is read, health, and (owner) the DarkNight gateway address and connection checklist |
| **Admin** | Team and case access, Case templates, Settings | Owner settings |
| **Review** (`/review/$caseId`) | — | iPad case viewer ("Present" on the case header): swipeable artefact deck, full-screen zoom viewer |

### AI case-ready summary

Each evidence item can generate an AI-assisted draft summary: factual summary, numbered key allegations with verbatim quotes, and caveats. It is editable, copyable, marked as an AI draft to verify, and **never stored as evidence**. The model is instructed not to infer ethnicity, religion, political leaning, or age.

---

## 6. iPad and offline use

- **Install:** Safari → sign in → Share → Add to Home Screen. The app runs full-screen as "Evidence Hub". Chrome on iPad cannot install web apps. Long-press the icon for a "New capture" shortcut.
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
src/routes/                 app pages, incl. api/public/worker-* endpoints and vault.$sourceId.$recordId
src/lib/                    shared helpers (offline db, capture progress, worker shared)
src/components/             AppShell, capture sheet, custody trail, viewers
supabase/migrations/        database schema and security rules
worker/                     Mac mini capture worker (Python) — see worker/README.md
gateway/                    DarkNight gateway (Python, read-only) — see gateway/README.md
GATEWAY_API.md              gateway HTTP API contract, called from the browser
WORKER_API.md               worker HTTP API contract — keep in sync with endpoint changes
public/manifest.webmanifest iPad install metadata
```

---

## 9. Not yet built / known limits

- **Emailing files to contacts** — designed (secure expiring links + custody logging, no attachments) but blocked until an email domain is connected to the project.
- **Live-stream recording** — implemented; needs `ffmpeg` + `yt-dlp` on the Mac mini; records only streams currently playing and visible to the logged-in account.
- The app cannot start a fully stopped worker remotely — the boot-time service (§4) is the fix for that; the in-app Restart button works while the worker is still online.

---

## 10. Sources: cloud vault and home vault

| | Cloud vault | Home vault |
|---|---|---|
| Source | Mac mini captures (`sources.id = 'cloud'`) | DarkNight (`sources.id = 'darknight'`) |
| Content kept | In this project: `artefacts` + the private `evidence` bucket | At home only: DarkNight's database on the Mac Studio, files on the NAS |
| How the app reads it | Supabase, signed links | The browser calls the gateway directly over Tailscale |
| What the cloud stores | Everything | `evidence_refs` only: case, record id, platform, type, published date, note, and the SHA-256 of each file at linking |
| Custody | `custody_events` | `custody_events` with `source_id = 'darknight'` and `evidence_ref_id` (linked items), plus the gateway's hash-chained home log for every read |
| Verify | Server re-hash | Gateway re-hash at home, compared with the hash at linking |
| Export | Server-built ZIP | Device-built ZIP; each file re-hashed on the device and must match |

`evidence_refs` and `custody_events` are append-only. Only the owner can set the gateway address (Sources → DarkNight).

The DarkNight field mapping lives in `gateway/mapping.yaml`. **Its table and column names are placeholders** until they are checked against DarkNight's real schema; run `python -m darknight_gateway check` on the Mac Studio after editing it.


## 11. Clients and engagements (FA-CEF V1.10)

FridayAnalytics works for several clients, each with several engagements (shown as "projects"). Every engagement follows the **Client Engagement Framework FA-CEF-V1.10**: eleven phases, six control gates, fixed deliverables. The database enforces the framework; screens show the database's own message when it refuses something, because that message names what is missing.

**Roles.** The **Curator** is a new global role (owner grants it): it reads every engagement, signs G1, G2 and G5, approves brief amendments and rules on judgement calls. Engagement roles: engagement lead, lead analyst, analyst, collection operator, evidence officer, data steward, reviewer, client viewer (portal off).

| Gate | Signed by | Pass condition enforced by the database |
|---|---|---|
| G0 Brief signed | Engagement lead records the client sponsor | Appendix H sections complete; interviews, research questions, scenarios, success plan recorded; sponsor and read-back date |
| G1 Mandate | Curator | Scope sheet, risk screen and legal note done. No collection, case link, target or design before it |
| G2 Design approved | Curator | Lexicon tested (incl. obfuscated spellings), each choice traced to a brief section or flagged ASSUMPTION, target register resolved. Later design or scope changes need G2 again |
| G3 Read complete (per cycle) | Lead analyst | Every candidate decided; every CRITICAL or HIGH flag confirmed by a second reader |
| G4 Evidence and QA (per cycle) | Evidence officer or data steward | Reconciled single-transaction load report with manifest; evidence tier on every flagged item |
| G5 Release (per output) | Curator, in writing | Output HELD after QA; mandate allows release; attribution checked; recipient and written approval recorded. Default is HELD |

**Brief.** Appendix H template, versioned and append-only. After G0 it changes only through numbered amendments (A1, A2…) with what changed, why and who asked; the Curator approves; a scope or lexicon change makes the design stale until G2 is signed again. Scenarios (T04) and success measures (T05) change after G0 only through an approved amendment. Thresholds and targets are the client's; probability only if the client supplies it; impact only from client records; unobservable measures are listed as out of reach, never estimated.

**Registers.** Interviews (two different FA people), research-content intake register with SHA-256 (T03), research questions, scenario register and scenario watch events (declaration needs the confidence rule: N distinct confirming readers and the evidence tier).

**Reading.** Cycles (0 baseline, then delta cycles, same-day re-run tagged). Candidates come only from case folders linked to the engagement. Every candidate gets a flag (category, severity, target group, note) or an exclusion code with a reason; judgement calls are listed for the Curator; after G3 only a Curator ruling can change a decision. Nothing is deleted: duplicates and withdrawn items are voided with a note.

**Evidence.** Tiers API_RAW_ONLY, BROWSER_DOM_ONLY, ELEMENT_CROP (none are proof) and FA_STD_001_V2 (proof; needs a complete capture record and a two-person check).

**Outputs.** Executive brief, findings tables, network map, limits statement, evidence bundle, dashboard snapshot, dataset, release pack. Each answers the brief in force. An executive brief cannot pass QA until it reports every research question, every success measure and every scenario; QA is passed by someone other than the author; once HELD its file and hash are fixed. Released only through G5. Bundles with home-vault files stay on the building device; the hub keeps only their hash. Every document carries "Produced by FridayAnalytics.org for the Ansarian Collective."

**Close-out.** Freeze the design, archive manifest hash, retention (five years unless the contract says otherwise), lessons learned.

**Client portal: designed, not built.** `clients.portal_enabled` is off; a client viewer would see only the brief in force and released outputs shared with them.

Migrations `20261102090000_evidence_hub_curator_role.sql` and `20261102090100_evidence_hub_engagements.sql`; tests in `supabase/tests/engagement_gates_test.sql`; client code in `src/lib/projects.ts`, `src/lib/engagement-outputs.ts`, `src/components/engagement/`.
