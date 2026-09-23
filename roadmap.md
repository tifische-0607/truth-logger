# FB Evidence Monitor — roadmap

## Done
- [x] Database schema (cases → incidents → accounts → snapshots → items → artefacts → custody events)
- [x] Append-only triggers on artefacts and custody_events
- [x] Subject profiles + separate analyst assessments table
- [x] Email/password auth, first account becomes owner, sign-ups then closed
- [x] Private `evidence` storage bucket + signed URLs
- [x] Worker API: heartbeat, claim, log, upload-url, ingest, complete (+ WORKER_API.md)
- [x] iPad-first shell, installable manifest + apple-touch-icon
- [x] Dashboard (open cases, live jobs, recent evidence, worker online indicator)
- [x] New capture sheet with `?url=` auto-fill for iOS Shortcuts
- [x] Job detail with live log via Realtime
- [x] Evidence item page: gallery, live vs render labels, translations, artefacts, custody timeline, access logging
- [x] Cases list and editable case page with incidents/accounts/items
- [x] Fictional TEST seed data
- [x] Verify screen: re-hash every artefact, MATCH/MISMATCH/MISSING, writes `re-hashed` custody events
- [x] Export screen: verify-then-ZIP bundle (6-level layout, manifest.txt, verification report, custody-log.md, `exported` events)

## Next
- [ ] Offline mode: on-device case cache, sync button, offline banner (in progress)
- [ ] iPad-only case viewer: swipeable artefacts + zoomed screenshot viewer
- [ ] Accounts and items browsing screens beyond the case page
- [ ] Analyst assessment entry UI

## Worker
- [x] Mac mini capture worker (`worker/`) — heartbeat, claim, Chromium capture, upload, ingest, complete
