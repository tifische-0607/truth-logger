# Roadmap

- [x] Scope reduced to identity/navigation and home vault; hide project navigation and case Projects button without deleting existing work
- [ ] Stage 1: FA Portal identity/canonical URLs, management read-only role, client types, recorded single-use invites, staff/client routing and client access; verify SQL rules and sign-in flow
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
