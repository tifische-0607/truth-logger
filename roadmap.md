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
6. [ ] U5 remainder (needs U4) — partly built: quality controls, quarantine, provenance, auto-suspend; still to do: rejection-rate dashboard over time — waits for Go
7. [ ] U6 Methodology checkpoints (needs U4, U5, U8) — waits for Go
8. [ ] Phase 9 Hardening and full test run — waits for Go
9. [x] U1 Membership tiers and seats — built 6 Nov 2026 (0038, 0039): client logins are administrators (issued by FridayAnalytics only) or users (invited by client administrators); real seat rule = active logins + unexpired pending invitations, refused at invite/resend/reactivate with seats used and limit; client with no tier can only have administrators; 2-administrator cap unchanged; non-administrators see tier and seats only; Administration > Team shows Users with invite/deactivate/reactivate; report access by tier set by owner/Curator/Management in Library (append-only versions), unset = every tier, with "Report access by tier not yet set" note. SQL: tests/sql/u1_tiers_seats_test.sql Part A run and passed, S1–S10 unrun (need auth-user fixtures)
10. [x] U2 Pricing, upgrade requests and billing — built 5 Nov 2026 (0030, 0031): client Pricing and Billing tabs, upgrade requests with staff Billing inbox badge, owner/Management pricing editor (placeholder Tier 1–3, "Price on request", RM/monthly), invoices Draft→Issued→Paid/Void with never-reused numbers, tier change after paid invoice refused below seats used, append-only logs, A4 invoice PDF. SQL checks saved in tests/sql/u2_billing_test.sql (unrun). Seat count replaced by U1's rule (active + unexpired pending)
11. [ ] U7 Early warning platform (needs U4, U5, U8) — waits for Go. Requested 3 Nov 2026 for after U6: analyst confirmation, email and Telegram alerts, briefing document on DarkNight, "Not configured" until channels are set.
12. [ ] U9 Link analysis (needs U4, U5, U8) — waits for Go
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
- Which reports belong to each tier (staff screen built in Library; nothing assigned, so all reports visible to all tiers)
- U1: do administrators count as seats (built: yes); may a client on no tier add users (built: no); who may assign report tiers (built: owner, Curator, Management); real tier names and seat limits
- FA-STD-001 naming
- Universal standard v1 is a Sample draft awaiting Curator edit/approval; wiring into the report builder waits for U6
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

## Open decisions from U2 (5 Nov 2026)
- Tier names, prices and contents (placeholders "Tier 1/2/3", "Price on request" until set)
- Seat limits: set to the agreed U1 counts 3 / 10 / unlimited — confirm
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
