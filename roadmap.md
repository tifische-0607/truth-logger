# Roadmap

- [x] Scope reduced to identity/navigation and home vault; hide project navigation and case Projects button without deleting existing work
- [x] Stage 1 implementation: 0009/0010 plus 0011 identity/invite boundaries and 0012 staff-policy helper; single sign-in, client types, management read access, recorded invites, client portal shell and themes. Authenticated browser checks passed for acceptance, used-token refusal, staff-route isolation, enable guard, second invite/cap, deactivate/reactivate/cancel/resend; 18 unit tests pass and preview build is clean.
- [ ] Stage 1 SQL suite execution: tests/sql/portal_foundation_test.sql saved; blocked by absence of a privileged test connection (managed shell cannot execute functions or update rows). No database privileges widened.
- [ ] Production auth Site URL confirmation: user must set https://spyglass2.sentinel2.org in auth Advanced settings; production redirect wildcard is already present. No DNS changes.
- [x] Phase 0/1 close-out: shared exact document footer, reports/dossiers/CSV/ZIP exports and documentation updated; live attribution guidance corrected by 0013. No current output rows or stored exports found. No legacy visible product name or hard-coded hosting URL in active source/docs. 22 unit tests passed; public auth/portal footer checked; build OK. Applied migration history and immutable originals preserved.
- [x] Phase 2: Library data/rules (0014) — documents + append-only document log, output/brief sync, share/withdraw/void, re-hashed downloads, private library storage, staff Library screen. SQL exit checks saved in tests/sql/portal_library_test.sql; not executed (no privileged test connection).
- [x] Phase B: Brand v2.0 pass — tokens (3 themes), self-hosted fonts, BrandLogo (placeholder, TODO official SVGs), favicon set, shell/strip/footer, gradient sign-in/invite/landing/portal hero, kickers, status chips with dots.
- [ ] Brand assets: replace placeholder logo, icons and elements with FA-Portal-Brand-Assets.zip (blocked: file not received).
- [ ] Phase 3: Client portal screens — waits for "Go Phase 3"
- [ ] Phase 4: Research data/rules — waits for "Go Phase 4"
- [ ] Phase 5: Research screens/worker API — waits for "Go Phase 5"
- [ ] Phase 6: Vaults — waits for "Go Phase 6"
- [ ] Phase 7: SOP/clock engine — waits for "Go Phase 7"
- [ ] Phase 8: Management screens — waits for "Go Phase 8"
- [ ] Phase 9: Hardening/docs/full test run — waits for "Go Phase 9"

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
