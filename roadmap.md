# Roadmap

- [x] Scope reduced to identity/navigation and home vault; hide project navigation and case Projects button without deleting existing work
- [x] Stage 1 implementation: 0009/0010 plus 0011 identity/invite boundaries and 0012 staff-policy helper; single sign-in, client types, management read access, recorded invites, client portal shell and themes. Authenticated browser checks passed for acceptance, used-token refusal, staff-route isolation, enable guard, second invite/cap, deactivate/reactivate/cancel/resend; 18 unit tests pass and preview build is clean.
- [ ] Stage 1 SQL suite execution: tests/sql/portal_foundation_test.sql saved; blocked by absence of a privileged test connection (managed shell cannot execute functions or update rows). No database privileges widened.
- [ ] Production auth Site URL confirmation: user must set https://portal.fridayanalytics.org in auth Advanced settings; production redirect wildcard is already present. No DNS changes.
- [x] Phase 0/1 close-out: shared exact document footer, reports/dossiers/CSV/ZIP exports and documentation updated; live attribution guidance corrected by 0013. No current output rows or stored exports found. No legacy visible product name or hard-coded hosting URL in active source/docs. 22 unit tests passed; public auth/portal footer checked; build OK. Applied migration history and immutable originals preserved.
- [x] Phase 2: Library data/rules (0014) — documents + append-only document log, output/brief sync, share/withdraw/void, re-hashed downloads, private library storage, staff Library screen. SQL exit checks saved in tests/sql/portal_library_test.sql; not executed (no privileged test connection).
- [x] Phase B: Brand v2.0 pass — tokens (3 themes), self-hosted fonts, BrandLogo (placeholder, TODO official SVGs), favicon set, shell/strip/footer, gradient sign-in/invite/landing/portal hero, kickers, status chips with dots.
- [x] Brand assets swapped (official logos and Lens icons)
- [x] Phase 3: Client portal screens
- [x] Phase 4: Research data/rules (0016, 0017); full SQL checks saved, need signed-gate fixtures
- [ ] Phase 3 SQL checks 1–3 — outstanding (need authenticated role switch)
- [x] Phase 5: Research screens/worker API (0018 empty by mistake, 0019, 0020); includes U4 connector contract and U5 quality controls inside the worker API
- [ ] Phase 4 gate-based SQL checks and Phase 5 full worker simulation (tests/sql/research_worker_test.sql) — outstanding: need a signed-G1/G2 engagement and a service-role test connection
- [x] Phase 6: Vaults (0021, 0022) — vault config/events/outbox, offline rules, Vaults page, sidebar panel, U3 correction 0023 makes document/output/capture copies inert; Cloud Vault setup SQL at docs/vault/cloud-vault-fa_portal-setup.sql (manual run)
- [ ] Phase 6 SQL checks V2, V3 (need function execute rights), V6–V7 (need signed-G1/G2 plan fixtures; V5 retired by U3) — outstanding
- [ ] Cloud Vault access route decision (direct vs HTTPS relay) and secrets — waits on user

## Order after Phase 6 (every item waits for "Go")
1. [ ] Phase 7 SOP and clock engine — waits for Go
2. [ ] Phase 8 Management screens — waits for Go
3. [ ] U8 Framework library and universal standard (before U6 and U7) — waits for Go
4. [ ] U3 Storage split (needs Phase 4): no report or evidence file in the cloud; DarkNight holds all reports and evidence, cloud holds portal data only; downloads fetch live from DarkNight and re-check SHA-256, else "Temporarily unavailable, please try again later" — waits for Go
5. [ ] U4 remainder (needs U3) — partly built: connector contract, worker API; still to do: requirements register fed by the signed brief, further connectors — waits for Go
6. [ ] U5 remainder (needs U4) — partly built: quality controls, quarantine, provenance, auto-suspend; still to do: rejection-rate dashboard over time — waits for Go
7. [ ] U6 Methodology checkpoints (needs U4, U5, U8) — waits for Go
8. [ ] Phase 9 Hardening and full test run — waits for Go
9. [ ] U1 Membership tiers and seats (needs Phase 4) — waits for Go
10. [ ] U2 Pricing, upgrade requests and billing (needs U1) — waits for Go
11. [ ] U7 Early warning platform (needs U4, U5, U8) — waits for Go
12. [ ] U9 Link analysis (needs U4, U5, U8) — waits for Go
13. [ ] U11 Narrative and coordination detection (needs U7, U8, U9) — waits for Go
14. [ ] U12 Unified evidence search (needs U4, U5, U11) — waits for Go
15. [ ] U13 Wider source coverage, Telegram public channels/groups and WhatsApp channels first (needs U4, U5) — waits for Go
16. [ ] U10 Analyst browser capture (optional) — waits for Go
17. [ ] U14 Executive agent gateway (needs U8) — waits for Go
18. [ ] Final hardening pass — waits for Go

## Open decisions
- Namecheap database role under U3: replacement, mirror or backup for the portal database, or only some tables
- Secure route from the portal to DarkNight
- Cloud Vault access route (direct or HTTPS relay) and its secrets
- Prices, currency and billing period
- Which reports belong to each tier
- FA-STD-001 naming
- Retention periods
- Early warning thresholds, Telegram recipients, briefing template
- First framework library entries
- Phase 5 defaults: auto-suspend after 5 rejected items in 60 minutes, language list, item types
- Real SOP targets and holiday calendar
- Unrun SQL checks (Phase 3 checks 1–3; Phase 4 gate checks; Phase 5 worker simulation; Phase 6 V2, V3, V5–V7): need a test connection with the service role and a test engagement with G1 and G2 signed

- [x] Rechecked approved implementation in order; tightened output provenance/storage/log guards and added real hash-mismatch tests

- [x] FA Portal identity and six-workspace navigation; existing routes retained
- [x] Sources, home references and custody extensions with restrictive policies
- [x] DarkNight integration UI, gateway calls, browser hashing and device-only exports
- [x] Clients/projects, guarded memberships, versioned briefs/criteria, shared evidence, assessments, outputs and log
- [x] Projects/client screens, case linking, outputs and dashboard
- [x] Verdict/file-safety tests, security review, signed-in brief/link/assessment/report delivery/download-log checks and phone layout
- [ ] Live DarkNight verification — requires an enabled, reachable gateway URL accepting the user token

- [x] Date range filter on Published timeline (from/until pickers, KL calendar days, clear button, count of shown items)
- [x] Auto-generated, incremental case (YEAR-NNN) and incident (NN) numbers — read-only fields, re-derived at submit time to prevent collisions
- [x] Reviewed database helper warnings; new authorization helpers require signed-in execution for RLS, trigger-only helpers are not callable
- [x] Engagements per FA-CEF V1.10 replace the first projects design: Curator role, gates G0-G5 enforced by the database, signed brief with amendments, registers, analyst decisions with second reader, tiers, outputs that report against the brief, G5 release (drizzle 0005-0007)
- [ ] (Open) Curator decisions: client-facing pricing and tiers; retention wording; whether G5 stays HELD for external clients by default; default S3 thresholds
- [ ] (Open) Client portal (rules in place, no screens); PDF rendering for the executive brief
