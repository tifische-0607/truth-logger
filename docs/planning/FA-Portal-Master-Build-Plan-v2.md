# FA Portal: Master Build Plan v2

Reconciles the build plan (Phases 0-9, B, B2) with the Final Design Brief and the agreed Upgrade Phases (U1-U14). Dated 3 November 2026. Base: FA-CEF V1.10, Brand v2.0. Address: https://portal.fridayanalytics.org

## 1. Where we are

| Item | State |
|---|---|
| Phase 0 baseline, Phase 1 foundation, Phase 2 library | Done (database checks saved, not run) |
| Phase B brand pass, logo and icon swap, Phase B2 A4 documents | Done |
| Phase 3 client portal | Done (SQL checks 1-3 not run) |
| Phase 4 research data and rules | Done (gate-based SQL checks not run) |
| Phase 5 research screens and collection-device routes | Done, includes first parts of U4 and U5 |
| Phase 6 vaults | In progress (see conflict C1) |
| Phase 7 SOP and clock engine, Phase 8 Management screens, Phase 9 hardening | Not started |
| U1 to U14 | Not started, except U4 and U5 parts built inside Phase 5 |

## 2. Recommended order

The Design Brief puts U8 next, before U6 and U7. The vault, SOP and Management phases from the original plan are not in the brief's sequence, so they are slotted in here.

Release 1: core platform
1. Phase 6 Vaults (in progress, amended by U3, see C1)
2. Phase 7 SOP and clock engine
3. Phase 8 Management screens
4. U8 Internal framework library and universal standard (baseline for every later module)
5. U3 Storage split (also reworks where Phase 2 stores documents, see C1)
6. U4 remainder (requirements register fed by the signed brief) and U5 remainder (rejection-rate dashboard)
7. U6 Methodology checkpoints (needs U4, U5, U8)
8. Phase 9 Hardening, documentation, full test run (so Release 1 is proven before more is added)

Release 2: clients and billing
9. U1 Membership tiers and seats
10. U2 Pricing page, upgrade requests, billing

Release 3: intelligence
11. U7 Early warning platform (needs U4, U5, U8)
12. U9 Link analysis (needs U4, U5, U8)
13. U11 Narrative and coordination detection (needs U7, U8, U9)
14. U12 Unified evidence search (needs U4, U5, U11)
15. U13 Wider source coverage (needs U4, U5; Telegram and WhatsApp channels first)
16. U10 Analyst browser capture (optional)
17. U14 Executive agent gateway (needs U8; runs on the Hermes stack at home)
18. Final hardening pass and test run (Phase 9 repeated for Release 3)

Rule for every step: one "Go" at a time, stop and report after each, database rules enforced in the database, Brand v2.0, no secrets in code.

## 3. Conflicts to resolve

C1. Storage: U3 contradicts what Phases 2 and 6 were told to build.
- U3 (agreed): no report or evidence file exists in the cloud. DarkNight (home) holds all reports and evidence. Downloads fetch live from DarkNight and re-check the SHA-256. If DarkNight is unreachable, the portal shows "Temporarily unavailable, please try again later".
- Phase 2 as built stores library documents in private cloud storage. Phase 6 as instructed queues released outputs and shared documents to the Cloud Vault so downloads do not depend on the home network.
- These are opposite designs. Recommended: follow U3. Phase 6 keeps the vault status, checks, test connection and rotate-credentials plumbing, but copies no reports or evidence to the cloud. The Phase 2 storage rework happens in the U3 step.

C2. What the Cloud Vault holds under U3. DECIDED 3 Nov 2026: the Namecheap database (fridzdmo_DarkVault, role fridzdmo_FAVault, schema fa_portal) holds portal data. All other decisions are parked.

C3. Secure route from the portal to DarkNight. PARKED.

C4. Unrun database checks. Phase 1, 2, 3 and 4 checks and the Phase 5 simulation are saved but unrun, because there is no privileged test connection. Phase 9 cannot honestly print "ALL PORTAL CHECKS PASSED" until this is solved. PARKED (needs a test connection with a service role, plus a test engagement with G1 and G2 signed).

## 4. Open items collected from the documents

- U1, U2: prices, currency (RM or USD), monthly or yearly billing, which reports belong to each tier
- U3: confirm Namecheap allows remote connection; confirm the secure route to DarkNight; DarkNight backup power (operations task)
- U6, methodology: FA-STD-001 naming convention to quote; retention periods per evidence type; staff training record format
- U7: scoring thresholds per signal; which analysts get Telegram alerts; briefing document template
- U8: first set of entries for the framework library
- U9: which entity and link types first; coordination thresholds
- U11: time window and similarity thresholds; languages beyond Malay and English
- U12: which content types to index first
- U13: order of sources after Telegram; which local forums
- U14: which executives get access; whether the portal also gets a chat view
- Phase 5 defaults: auto-suspend after 5 rejected items in 60 minutes; language list; item types
- Phase 7: real SOP targets, working-day calendar, escalation chains
- Curator decisions: client pricing and tiers, retention wording, whether G5 stays HELD for external clients by default, default S3 thresholds
- Cloud Vault: DarkVault database holds nothing that must stay home? Relay or direct route

## 5. Dependencies at a glance

U1 needs Phase 4. U2 needs U1. U3 needs Phase 4. U4 needs U3. U5 needs U4. U6 needs U4, U5 (and U8 first). U7 needs U4, U5 (and U8). U8 first. U9 needs U4, U5, U8. U11 needs U7, U8, U9. U12 needs U4, U5, U11. U13 needs U4, U5. U10 is optional. U14 needs U8.
