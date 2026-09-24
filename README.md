# Evidence Keeper

Build "FB Evidence Monitor": a polished, iPad-first web app for collecting Facebook posts and comments as legal evidence (police reports, MCMC/CMA s.233 complaints, civil actions in Malaysia). It is the front end and cloud evidence store. The capturing itself is done by a separate worker program on my Mac mini, which talks to this app only through the worker edge functions described below. Use Lovable Cloud for the database, auth, storage and edge functions.

## Look and feel
- Calm, professional "evidence room" style: dark navy sidebar, light content area, good dark mode, generous spacing, large touch targets (iPad in Safari is the main device; must also work on a phone).
- Installable to the iPad Home Screen (web app manifest, apple-touch-icon, standalone display).
- Clear status badges (queued / running / done / failed), monospace for hashes and IDs, copy-to-clipboard on hashes.

## Auth
- Email + password login. The first account to sign up becomes the owner; after that, disable public sign-up (show "Sign-ups are closed"). All data is private to authenticated users (RLS on every table). Storage bucket "evidence" is private; show files through short-lived signed URLs.

## Data model (6-level chain-of-custody structure)
1. cases: id (text, e.g. "2026-014"), opened_on, target_of_complaint, offence_alleged, jurisdiction_agency, lead_handler, status (open / filed / closed), related_cases, notes.
2. incidents: case_id, incident_id (e.g. "03"), start_date, end_date, narrative_themes (text[]), escalation_stage, summary.
3. accounts: incident FK, platform ("FB"), handle, display_name, profile_url, platform_id, plus account_snapshots (one row per capture: display_name, followers, following, verified, bio_verbatim, created, captured_at). Snapshots are never edited, only added.
4. items: account FK, item_code (POST-<id>, CMT-0001, CMT-0001-R01), item_type (post / comment / reply), parent_item FK, url, platform_item_id, author_name, author_handle, author_url, published_at, text_original, text_en, translator_statement, engagement (jsonb), captured_at, folder_path.
5. artefacts: item FK, filename, kind (screenshot, screenshot_pdf, render, render_pdf, link, text_original, text_en, raw, raw_extract, comments_page_raw, media), storage_path, sha256, size_bytes, mime_type, captured_at.
6. custody_events: artefact FK (nullable) + item FK, filename, sha256, action (captured / accessed / transferred / exported / re-hashed), handler, tool_version, notes, created_at.
   - custody_events and artefacts are APPEND-ONLY: add database triggers that block UPDATE and DELETE on both tables. A correction is a new row.
Also subject_profiles: item or account FK, subject_type (poster / commenter), stated (jsonb: bio, location_tag, stated_affiliation, listed_language), observed (jsonb: posting_language, posting_time_pattern, account_created, follower_following_ratio, verified), insufficient_data (bool). And analyst_assessments as a SEPARATE table (assessment, analyst, date, basis). Never mix it with the profile. Never add fields for inferred ethnicity, religion, political leaning or age.

capture_jobs: id, url, case_id, incident_id, incident_date, handler, options (jsonb: max_comments, live_comment_limit, include_replies, live_screenshots, rendered_sheets, archive, translate, download_media, recapture), case_meta, incident_meta, status (queued / running / done / failed), log (text[]), warnings (text[]), created_by, claimed_at, finished_at, result (jsonb).

## Screens
1. **Dashboard**: big "New capture" button; cards for open cases, jobs in progress (live-updating), and recent evidence items with screenshot thumbnails; a "Worker online" indicator showing when the Mac mini last checked in (green if under 2 minutes ago).
2. **New capture** (sheet/modal): Facebook URL (auto-filled from a ?url= query parameter so an iOS Shortcut can open it), choose an existing case or create one inline, then choose or create an incident; handler name (remember the last one); options as toggles with sensible defaults (max comments 500, live screenshots for first 100 comments, replies on, archive on, translation on, media on). Submitting creates a queued capture_job.
3. **Job detail**: live log (Realtime), status and progress, warnings highlighted, and a link to the resulting evidence item when done.
4. **Cases list → Case page** (case sheet, editable) → Incidents → Accounts (with snapshot history) → Items tree (post with nested comments and replies).
5. **Evidence item page**: screenshot gallery (clearly labelled "LIVE SCREENSHOT" vs "RENDER – from API data, not a platform screenshot"), tap to view full-size with pinch zoom; original text and English translation side by side with the translator statement; engagement numbers; parent/child links; artefacts table (filename, kind, size, SHA-256); custody log timeline. Viewing or downloading an artefact writes an "accessed" custody event.
6. **Verify**: on a case or item, a "Re-hash & verify" button calls an edge function that downloads each artefact from storage, computes its SHA-256, compares it with the captured hash, writes a "re-hashed" custody event (MATCH / MISMATCH / MISSING) for each, and shows the results.
7. **Export**: on a case, "Export bundle": verify first (block if anything fails), then an edge function builds a ZIP of all artefacts in the 6-level folder layout (CASE-x/INC-y_date/FB_@handle/POST-id/artefacts/...) plus a manifest.txt of SHA-256 hashes and the custody logs as markdown, logs "exported" per artefact with the recipient name, and returns a download link.
8. **Settings**: worker status, default handler.

## Worker API (edge functions for the Mac mini worker)
Authenticated with a bearer token checked against a secret WORKER_TOKEN (not a user session). Please create the secret WORKER_TOKEN and tell me where to find its value.
- POST /worker-heartbeat: records last_seen.
- POST /worker-claim: atomically claims the oldest queued job (status → running) and returns it, or returns empty.
- POST /worker-log: {job_id, lines[], warnings[]}. Appends to the job.
- POST /worker-upload-url: {path, content_type}. Returns a signed upload URL for bucket "evidence" at that path. Refuse to overwrite an existing object.
- POST /worker-ingest: {job_id, records}. Upserts the case, incident, account (+ new snapshot), items, subject_profiles, artefacts (with sha256, size, storage_path) and custody_events in one call. Artefact rows are insert-only. After inserting, the function must re-hash every newly uploaded artefact from storage and add a "transferred" custody event noting "uploaded from Mac mini worker, hash MATCH/MISMATCH".
- POST /worker-complete: {job_id, status, result}.

Please give me the exact request/response JSON shapes for each worker function in a WORKER_API.md file in the repo, because I'll write the worker against them.

Start with the database schema, auth, worker functions and the Dashboard, New capture, Job and Evidence item screens. Use fictional seed data (clearly labelled TEST) so I can see the evidence item page with a comment tree.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://truth-logger.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a91d8941-73a8-4bf1-b81c-478687c7171c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
