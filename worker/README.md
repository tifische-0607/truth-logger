# Mac mini capture worker

Runs on the owner's Mac mini. It checks in with the app, claims queued captures,
opens the post in a logged-in Chromium window, saves screenshots and raw data,
uploads every file to the private evidence bucket and writes the full record tree
(case → incident → account → post → comments → artefacts → custody events) through
the worker API in `../WORKER_API.md`.

## Install (once)

```bash
cd worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env      # then paste your WORKER_TOKEN
```

Log in to Facebook once — the session is kept in the profile folder:

```bash
python -m worker.login
```

(Run all commands from the folder **above** `worker/`, i.e. the project root, or
`cd ..` first; the module form `python -m worker.main` needs that.)

## Run

```bash
python -m worker.main
```

You should see the worker card in the app's sidebar turn green within a minute.
Queue a capture from the app ("New capture"), and the job log fills in live.

## Keep it running (auto-restart)

Two levels, pick one:

**Starts at login** (no password needed):

```bash
bash worker/install.sh
```

**Starts at boot — recommended** (survives macOS restarts even when nobody
logs in):

```bash
sudo bash worker/install-system.sh
```

Both register the worker with launchd so it:

- restarts automatically after any crash, and
- restarts automatically when the worker loses contact with the app — the
  worker exits on purpose after 20 consecutive failed heartbeats/claims
  (`NET_FAILURE_LIMIT`, override in `.env`) and launchd brings it back.

The system version runs as the user who owns the project folder, so it can
still read the venv, `worker/.env` and the saved Facebook session. To remove
it: `sudo bash worker/uninstall-system.sh`.

Logs: `~/fbem/worker.log` and `~/fbem/worker.err.log`.
To stop the login version: `launchctl unload ~/Library/LaunchAgents/com.fbem.worker.plist`.

Chromium runs with a visible window (Facebook blocks headless far more often), so
keep the Mac mini logged in to its macOS user account.

## What each job produces

Per post, saved locally in `WORK_DIR` and uploaded to
`CASE-x/INC-y_date/FB_@handle/POST-id/artefacts/`:

| File | Kind | Note |
| --- | --- | --- |
| `live_post.png` | `screenshot` | full-page live screenshot |
| `live_post.pdf` | `screenshot_pdf` | print-to-PDF of the same view |
| `comments_page.html` | `comments_page_raw` | raw DOM as served |
| `raw_extract.json` | `raw_extract` | parsed post + comments |
| `text_original.txt` | `text_original` | post text verbatim |
| `link.txt` | `link` | final permalink + capture time |

Each file is SHA-256 hashed locally before upload; the app re-hashes it from
storage after ingest and writes a `transferred` custody event recording MATCH or
MISMATCH. Nothing is ever overwritten — a re-capture is new rows and new files.

## Limits and honest caveats

- Comment extraction uses Facebook's DOM, which changes without notice. The
  selectors live in `capture.py` (`_EXTRACT_JS`, `_expand_comments`); if a capture
  returns zero comments, that's the place to adjust. The raw HTML is always kept,
  so nothing is lost when parsing degrades.
- Reply nesting deeper than one level is recorded as a reply to the nearest
  top-level comment.
- Translation is not done here; `text_en` and the translator statement stay empty
  until a human adds them.
- Commenters are recorded with what is on screen only. No inferred ethnicity,
  religion, politics or age — ever.

## Live-stream recording

Choose **Live stream** in the New capture form to record a Facebook live feed as it plays.
One-time setup on the Mac mini:

```bash
brew install ffmpeg yt-dlp
```

The worker opens the live page in the logged-in Chromium, takes a start screenshot, then
copies the stream without re-encoding into 1-minute `live_seg_NNNN.mp4` pieces (each its own
artefact and SHA-256) until the stream ends or the chosen maximum (default 30, cap 240 minutes)
is reached. It finishes with an end screenshot, `live_recording_log.txt` (UTC start/stop, stop
reason, tool versions, segment hashes) and `link.txt`. Progress on the Worker page shows the
elapsed recording time. The temporary cookie file used to fetch the stream is deleted afterwards
and never uploaded.

## Concurrent captures
The worker runs up to `MAX_CONCURRENT` (default 4, max 4) captures at once. Slot 0 uses the main Chrome profile; slots 1-3 use a fresh copy of it per job. Set `MAX_CONCURRENT=1` in `.env` to go back to one at a time.
