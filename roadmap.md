# Roadmap

- [x] Scope reduced to identity/navigation and home vault; hide project navigation and case Projects button without deleting existing work
- [x] Stage 1 implementation: 0009/0010 plus 0011 identity/invite boundaries and 0012 staff-policy helper; single sign-in, client types, management read access, recorded invites, client portal shell and themes. Authenticated browser checks passed for acceptance, used-token refusal, staff-route isolation, enable guard, second invite/cap, deactivate/reactivate/cancel/resend; 18 unit tests pass and preview build is clean.
- [ ] Stage 1 SQL suite execution: tests/sql/portal_foundation_test.sql saved; blocked by absence of a privileged test connection (managed shell cannot execute functions or update rows). No database privileges widened.
- [ ] Production auth Site URL confirmation: user must set https://spyglass2.sentinel2.org in auth Advanced settings; production redirect wildcard is already present. No DNS changes.
- [ ] Stage 2: Library and full client portal — not requested in this turn
- [ ] Stage 3: Research metadata and worker API — not requested in this turn
- [ ] Stage 4: Vault metadata/plumbing — not requested in this turn
- [ ] Stage 5: Management/SOP clocks — not requested in this turn
- [ ] Stage 6: Cross-stage documentation and checks — follows remaining stages

- [x] Rechecked approved implementation in order; tightened output provenance/storage/log guards and added real hash-mismatch tests

- [x] Evidence Hub identity and six-workspace navigation; existing routes retained
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
