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

