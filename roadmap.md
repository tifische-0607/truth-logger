# Roadmap

- [x] Date range filter on Published timeline (from/until pickers, KL calendar days, clear button, count of shown items)
- [x] Auto-generated, incremental case (YEAR-NNN) and incident (NN) numbers — read-only fields, re-derived at submit time to prevent collisions
- [ ] (Open) Five DB security warnings on built-in helper functions — awaiting user's go-ahead
- [x] Evidence Hub redesign, phase 1 (branch `evidence-hub-redesign`): rename, six-place navigation, case workspace tabs, Home, Search, Collect, Integrity, Sources
- [x] Multi-source model: `sources`, `evidence_refs`, source-aware custody events (migration 20261101130000)
- [x] DarkNight gateway service with placeholder mapping, home custody log and tests (`gateway/`)
- [ ] (Open) Replace placeholder table/column names in `gateway/mapping.yaml` with DarkNight's real schema; confirm NAS path format
- [ ] (Open) Install the gateway on the Mac Studio, read-only DB user and NAS account, `tailscale serve`
- [ ] (Open) Decisions 2 to 5 in the redesign plan: home-vault custody log location, offline copies, local-model AI, partner access
- [x] Gateway v0.2: four DarkNight collections, per-table path bases, legacy prefix rule, hash manifests and RFC-3161 detection, element-crop label, read-only `reconcile` report
- [x] Engagements per FA-CEF V1.10: Curator role, gates G0-G5 enforced by the database, signed brief with amendments, registers, analyst decisions with second reader, tiers, outputs that report against the brief, G5 release (migrations 20261102090000 and 20261102090100)
- [ ] (Open) Run `reconcile` on the Mac Studio and review the unresolved-path report; confirm `# CONFIRM` columns once `darknight_schema.sql` is available
- [ ] (Open) Client portal (data model and access rules are in place; no screens)
- [ ] (Open) PDF rendering for the executive brief; today a Markdown skeleton plus an attached final file
- [ ] (Open) Curator decisions: client-facing pricing and tiers; retention wording; whether G5 stays HELD for external clients by default; default S3 thresholds to offer clients
