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

## Reference documents (docs only; nothing built from them until each "Go")
- Master build plan v2: docs/planning/FA-Portal-Master-Build-Plan-v2.md
- Instructions for Phase 7 to U14: docs/planning/FA-Portal-Lovable-Instructions-Phase7-to-U14.md
- U6 methodology checkpoints checklist: docs/planning/U6-Methodology-Checkpoints-Build-Checklist.md

## Order after Phase 6 (every item waits for "Go")
1. [x] Phase 7 SOP and clock engine (0024–0026) — clocks, SOP versions, pauses, alerts, Turnaround card. Outstanding: SQL checks C1–C2, C4b–C4d, C5–C6 in tests/sql/sop_clocks_test.sql need a privileged test connection; real SOP targets, holidays, escalation chains wait on user
2. [x] Phase 8 Management screens — built (0027); SQL checks saved in tests/sql/management_screens_test.sql, unrun
3. [x] U8 Framework library and universal standard (before U6 and U7) — built (0028); SQL checks saved in tests/sql/framework_library_test.sql, unrun
4. [~] U3 Storage split — files part built 3 Nov 2026 (0029): library files on DarkNight only, live fetch + SHA-256 re-check, offline message, cloud uploads refused, client uploads switched to email-to-staff. Still open: move 218 existing capture-evidence files per docs/vault/u3-evidence-move-plan.md (waits for approval); engagement outputs still generated into cloud storage (location dropped from library, staff record DarkNight location); portal data move to Namecheap deferred until connection proven; DarkNight gateway must serve GET /v1/library/{path}. Original scope: no report or evidence file in the cloud; DarkNight holds all reports and evidence, cloud holds portal data only — decided 3 Nov 2026: the Namecheap PostgreSQL schema `fa_portal` is that portal-data home (clients, users, tiers, engagements, billing, activity); downloads fetch live from DarkNight and re-check SHA-256, else "Temporarily unavailable, please try again later" — waits for Go
5. [x] U4 remainder — built 5 Nov 2026 (0032 empty by mistake, 0033, 0034): requirements register on the Collect tab fed by the signed brief (REQ-nnn IDs, platform, accounts/keywords, languages, window, legal basis; append-only versions; refused outside the brief in force); Start refused until G2 signed and register marked complete; every new capture must link to an in-force requirement (off-register refused and logged); full provenance stored; DarkNight path from the single SAMPLE FA-STD-001 naming function; worker job now carries the register; test adapters are registry rows only. SQL checks in tests/sql/u4_requirements_register_test.sql: Part A run and passed, Part B unrun (needs signed-gate fixture). Further connectors beyond SocialCrawl not added (none requested)
6. [x] U5 remainder — built 5 Nov 2026 (0035); see section below
7. [x] U6 Methodology checkpoints — built 5 Nov 2026 (0036, 0037); see section below
8. [ ] Phase 9 Hardening and full test run — waits for Go
9. [x] U1 Membership tiers and seats — built 6 Nov 2026 (0038, 0039): client logins are administrators (issued by FridayAnalytics only) or users (invited by client administrators); real seat rule = active logins + unexpired pending invitations, refused at invite/resend/reactivate with seats used and limit; client with no tier can only have administrators; 2-administrator cap unchanged; non-administrators see tier and seats only; Administration > Team shows Users with invite/deactivate/reactivate; report access by tier set by owner/Curator/Management in Library (append-only versions), unset = every tier, with "Report access by tier not yet set" note. SQL: tests/sql/u1_tiers_seats_test.sql Part A run and passed, S1–S10 unrun (need auth-user fixtures)
10. [x] U2 Pricing, upgrade requests and billing — built 5 Nov 2026 (0030, 0031): client Pricing and Billing tabs, upgrade requests with staff Billing inbox badge, owner/Management pricing editor (placeholder Tier 1–3, "Price on request", RM/monthly), invoices Draft→Issued→Paid/Void with never-reused numbers, tier change after paid invoice refused below seats used, append-only logs, A4 invoice PDF. SQL checks saved in tests/sql/u2_billing_test.sql (unrun). Seat count replaced by U1's rule (active + unexpired pending)
11. [x] U7 Early warning platform — built 6 Nov 2026 (0040, 0042): staff screen /early-warning; five signals scored against the in-force Rabat / DSP / UN-FAAC version from the Frameworks library, each citing captures; thresholds per signal and level (all "Threshold not set"; unset never fires); alerts to analysts only; analyst confirm/dismiss logged; Watch→portal, Warning→portal+email, Urgent→portal+email+Telegram enforced by trigger; email/Telegram build dispatch records only, nothing sent, "Not configured"; recipients start empty; confirmed alert → client notice on portal Dashboard; briefing location on DarkNight only (live fetch + SHA-256, offline message); hand-over logged; briefing template is one Sample placeholder (document samples). All append-only. SQL: tests/sql/u7_early_warning_test.sql Part A run and passed, Part B unrun. Note: signals are refused until Rabat/DSP/UN-FAAC have Curator-approved versions.
12. [x] U9 Link analysis — built 6 Nov 2026 (0041, 0042): staff screen /links with Cytoscape graph (expand, time filter, evidence behind each link, centrality, clusters, coordinated bursts → Early warning); graph data read live from DarkNight only, gateway contract in docs/link-analysis/gateway-contract.md, fake gateway + Sample dataset at /links?preview=sample, offline message when unreachable; links without cited captures hidden; database stores only identifiers: merge decisions (analyst confirm/reject, logged) and released-graph references (refused unless the report is released); clients see only released graphs on the portal Dashboard; coordination threshold "Threshold not set". Merges and releases record the universal-standard version and are refused until it is Curator-approved. SQL: tests/sql/u9_link_analysis_test.sql Part A run and passed, Part B unrun.
13. [ ] U11 Narrative and coordination detection (needs U7, U8, U9) — waits for Go
14. [ ] U12 Unified evidence search (needs U4, U5, U11) — waits for Go
15. [ ] U13 Wider source coverage, Telegram public channels/groups and WhatsApp channels first (needs U4, U5) — waits for Go
16. [ ] U10 Analyst browser capture (optional) — waits for Go
17. [ ] U14 Executive agent gateway (needs U8) — waits for Go
18. [ ] Final hardening pass — waits for Go

## Open decisions
- [RESOLVED 3 Nov 2026] Namecheap database role under U3: the Namecheap PostgreSQL (database `fridzdmo_DarkVault`, role `fridzdmo_FAVault`, schema `fa_portal`) holds PORTAL DATA — clients, users, tiers, engagements, billing, activity. Reports and evidence stay on DarkNight only (U3). Every other decision below stays parked until the user raises it.
- Secure route from the portal to DarkNight
- Cloud Vault access route (direct or HTTPS relay) and its secrets
- Prices, currency and billing period
- [RESOLVED 6 Nov 2026] U1 seat counting: administrators count as seats (confirmed as built).
- [RESOLVED 6 Nov 2026] U1 client with no tier: cannot add users — administrators only until a tier is set (confirmed as built).
- [RESOLVED 6 Nov 2026] U1 report access by tier: may be set by owner, Curator and Management (confirmed as built).
- [RESOLVED 6 Nov 2026] Which reports belong to each tier: staff set this in the system through the Library tier tick boxes; nothing to build or decide here — the "Report access by tier not yet set" note stays until they do.
- [RESOLVED 6 Nov 2026] Final tier names and seat limits: decided later as part of membership tiering and pricing (with the U2 prices); keep the placeholders Tier 1/2/3 with 3 / 10 / unlimited seats.
- FA-STD-001 naming
- Universal standard v1 is a Sample draft awaiting Curator edit/approval; wiring into the report builder waits for U6
- Retention periods
- Early warning (U7): thresholds per signal and level; which analysts get email/Telegram alerts; briefing template; who may change thresholds/recipients (built as owner, Curator, Management); email sender setup (EW_EMAIL_SENDER_DOMAIN) and Telegram connection; approved versions of Rabat, DSP and UN-FAAC in the Frameworks library (signals refused until then)
- Link analysis (U9): coordination thresholds (minimum accounts, window minutes); the secure DarkNight route that will serve the graph gateway; Curator approval of the universal standard (merges and graph releases refused until then)
- First framework library entries
- Phase 5 defaults: auto-suspend after 5 rejected items in 60 minutes, language list, item types
- Real SOP targets and holiday calendar
- (OPEN) Unrun SQL checks (Phase 3 checks 1–3; Phase 4 gate checks; Phase 5 worker simulation; Phase 6 V2, V3, V5–V7; U1 S1–S10; U5 Part B; U6 Part B): need a test connection with the service role and a test engagement with G1 and G2 signed. Whether a test connection that can create test accounts will be provided is still open — no decision as at 6 Nov 2026.

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

## Open decisions from U2 (5 Nov 2026)
- Tier names, prices and contents: names and seat limits are decided later as part of membership tiering and pricing (6 Nov 2026); keep the placeholders "Tier 1/2/3" and "Price on request" until then. Prices, currency and billing period stay open.
- Seat limits: placeholders 3 / 10 / unlimited kept (the agreed U1 counts, confirmed 6 Nov 2026); final limits wait for the membership tiering and pricing decision.
- Who may run billing: built as owner and Management only (not Curator/analyst)
- Partial payments: not supported; payment must equal the invoice total
- A paid invoice cannot be voided; credit notes not built
- First tier for a client can be set without an invoice; later changes need a paid invoice
- Invoice number format FA-INV-YYYY-NNNNN; tax/SST lines not included

## Open decisions from U4 (5 Nov 2026)
- FA-STD-001 final naming (replace public.research_fa_std001_name_sample only)
- Who may edit the register (now: engagement lead, lead analyst, Curator, owner) and who may mark it complete (now: engagement lead, Curator, owner)
- Whether captures must also fall inside the requirement time window by post date (connector does not yet send a post date)
- Brief wording-to-code mapping for platforms/languages (e.g. "YouTube" counted as Google)

## U5 remainder — built 5 Nov 2026
- Rejection-rate dashboard per connector (staff only, `/rejections`), migration 0035. Phase 5 defaults (5 rejects / 60 min) confirmed and shown from connector settings. SQL Part A run; Part B (suspension simulation, non-staff refusal) not run — `tests/sql/u5_rejection_dashboard_test.sql`.

## U6 Methodology checkpoints — built 5 Nov 2026 (needs live fixture testing)
- V1, V2, Q1, Q2, R, C plus G0 conflict declaration, findings, second review, report builder and methodology statement, staff exposure/training. Migrations 0036, 0037. Screen: engagement → Checkpoints.
- SQL Part A run; Part B behaviour checks not run (no engagements exist; test access cannot sign in as users) — `tests/sql/u6_methodology_checkpoints_test.sql`.
- Open (waits on user): FA-STD-001 naming wording, retention periods, training record format, methodology statement wording (Curator), Curator approval of universal standard v1 (still Sample), client portal display of released methodology statements.

- U7/U9 decisions (2026-11-06): owner/Curator/Management confirmed as settings editors; U7 signal thresholds and U9 coordination thresholds are admin-set 0–20 sliders (whole numbers, enforced by the database).

## U11 Narrative and coordination detection — built 6 Nov 2026
- Staff `/narratives` (Sample at `/narratives?preview=sample`): clusters with timeline (volume, platforms, new accounts), coordination findings (near-identical text, same links, new-account bursts), analyst name/confirm dialogs, threshold dialog (counts 1–20; windows 1 min–72 h). Gateway contract `docs/narratives/gateway-contract.md`.
- Migrations 0045 (tables, guards, functions), 0046 (gateway-feed functions service-role only).
- Database: analyst-only confirmations (row guard on every insert), captures cited, standard version recorded, nothing confirmed while a threshold is unset, confirmed coordination feeds U9 (lnk_events + service-role feed) and U7 (ew_record_signal; refusals logged).
- SQL `tests/sql/u11_narratives_test.sql`: Part A RUN, passed; Part B NOT RUN (no test-account connection, no approved universal standard).
- Open: similarity/time-window/account thresholds; languages beyond Malay and English; myth and scenario identifier list in the universal standard.
