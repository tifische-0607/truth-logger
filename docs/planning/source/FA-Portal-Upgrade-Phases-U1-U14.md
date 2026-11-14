# FA Portal Upgrade Phases (U1 to U14)

Agreed 3 Nov 2026 as a draft for Mo's review before it went to Lovable. These upgrades follow Phase 4 and fold into the existing multi-phase plan; U4 to U6 extend the Phase 5 Research module. All HARD RULES and Brand v2.0 apply. Every access rule is enforced in the database, not only in screens.

> Source document (reference only). See `README.md` in this folder for precedence. Build order and current status: `docs/planning/FA-Portal-Master-Build-Plan-v2.md` and `roadmap.md`.

## Summary

| Upgrade | Scope | Depends on |
| --- | --- | --- |
| U1 | Client membership tiers and user seats | Phase 4 |
| U2 | Pricing page, upgrade requests, billing and invoicing | U1 |
| U3 | Storage split: Cloud Vault and DarkNight | Phase 4 |
| U4 | Research module: requirements register and connector layer | U3 |
| U5 | Data quality controls | U4 |
| U6 | Methodology enforcement and checkpoints | U4, U5 |
| U7 | Early warning platform for NGOs | U4, U5 |
| U8 | Internal framework library (universal standard); build before U6 and U7 | — |
| U9 | Link analysis | U4, U5, U8 |
| U10 | Analyst browser capture (optional) | U4, U5 |
| U11 | Narrative and coordination detection | U7, U8, U9 |
| U12 | Unified evidence search | U4, U5, U11 |
| U13 | Wider source coverage | U4, U5 |
| U14 | Executive agent gateway | U8 |

## U1 — Membership tiers and user seats

The portal follows the BRQ Plus model: an internal staff workspace, plus a client portal with each client's own dashboards.

- No self-registration. FridayAnalytics registers every client.
- FridayAnalytics issues one or two client administrator logins per client.
- Client administrators add further users, up to their tier's seat limit.
- Three tiers, starting values (staff can change them):

| Tier | User seats | Report library access |
| --- | --- | --- |
| Entry | 3 | Basic set of general reports |
| Professional | 10 | Most general reports |
| Enterprise | Unlimited | Full library |

- Research is the same for every tier. Tiers differ only in seats and report library access.
- Library access per report is set by staff (which tiers can see it).

**Exit checks:** a client cannot exceed its seat limit (refused in the database with a clear message); a user cannot open a report above their tier; client administrators cannot change their own tier.

## U2 — Pricing page, upgrade requests and billing

- A pricing page in the client portal compares the three tiers.
- Staff edit prices, seat limits and tier contents from the staff workspace. No code change needed.
- Clients do not pay online. They press "Request upgrade"; staff are notified.
- A billing section for staff, modelled on BRQ Plus: create and issue invoices, record payment, change the client's tier once paid.
- Clients see their current tier, seats used, and their invoices.

**Exit checks:** only staff can change prices or tiers; every tier change and invoice is logged; a client sees only its own invoices.

**Open:** prices, currency (RM or USD), monthly or yearly billing.

## U3 — Storage split

- **Cloud Vault** (Namecheap cPanel PostgreSQL, fridzdmo_DarkVault, role fridzdmo_FAVault) holds portal data only: clients, users, tiers, engagements, billing, activity.
- **DarkNight** (home server) holds all reports and evidence, for confidentiality. Nothing confidential is copied to the cloud.
- Downloads fetch live from DarkNight and re-check the SHA-256.
- If DarkNight is unreachable, the portal shows "Temporarily unavailable, please try again later" instead of failing.
- DarkNight gets a backup power supply (an operations task, not a build task).

**Exit checks:** no report or evidence file exists in the cloud; downloads re-verify the hash; the offline message appears when DarkNight is unreachable.

**Open:** confirm Namecheap allows the portal to connect to the database remotely; confirm the secure route from the portal to DarkNight.

## U4 — Research module: requirements register and connectors

- **Front: one central data collection requirements register**, fed by the signed brief. Each requirement states platform, accounts or keywords, languages, time window and legal basis.
- **Back: a connector layer.** Each crawler or platform access point plugs in as an adapter with the same contract: it takes a requirement and returns items in the standard format.
- First connector: **SocialCrawl** (existing membership).
- Minimum baseline platforms: **Facebook, Google, Threads, X, Instagram, TikTok**.
- New connectors are added as adapters, without changing the module.
- Collected evidence is written to DarkNight under FA-STD-001 naming.

**Exit checks:** research cannot start before G2; every collected item links to a requirement ID; a test adapter can be added without code changes elsewhere.

## U5 — Data quality controls

Fixes the past problem of agents collecting the wrong data points and storing them inconsistently.

1. **Requirement-bound collection:** an agent only runs against an approved requirement ID; anything else is refused.
2. **One schema for every connector:** same fields, fixed value lists for platform, item type and language.
3. **Quarantine and validation:** new items land in a holding area; items with missing fields, wrong format or no requirement ID are rejected and logged.
4. **Provenance on every item:** requirement ID, connector name and version, collector, capture time (UTC).
5. **Monitoring:** rejection rates per connector; a connector with repeated rejections is suspended until fixed.

**Exit checks:** an off-register collection attempt is refused; a malformed item is rejected and logged; every stored item carries full provenance.

## U6 — Methodology enforcement

The portal enforces the FridayAnalytics Research Methodology, based on the Berkeley Protocol (UN), GIJN practice and the SPJ Code of Ethics.

| Checkpoint | When | Pass condition | On failure |
| --- | --- | --- | --- |
| V1 Integrity | After preservation | SHA-256 recorded, custody log complete, FA-STD-001 name applied | Re-collect |
| V2 Verification | After verification | Item rated Confirmed or Probable with reasoning | Labelled lead only |
| Q1 Collection measures | Before analysis | Volume, reach, time window and coverage recorded | Re-collect |
| Q2 Reproducible counts | After analysis | Every figure re-derivable; confidence stated | Back to analysis |
| R Second review | Before G4 | Second analyst approves findings naming a person or organisation | Back to analysis |
| C Curator release | G3 to G5 | Methodology statement, limits, confidence levels; Curator approves | Back to reporting |

Every released report carries the methodology statement and the footer "Produced by FridayAnalytics.org".

**Exit checks:** each checkpoint blocks progress in the database when it fails.

## U7 — Early warning platform

A predictive capability that flags hate speech escalating towards real-world mobilisation or violence, so FridayAnalytics can warn the NGOs it supports early.

- **Frameworks for scoring:** the UN Rabat Plan of Action six-part threshold test, Dangerous Speech Project markers, and the UN Framework of Analysis for Atrocity Crimes risk indicators.
- **Signals tracked:** spikes in volume, calls to gather, named dates and locations, new accounts joining a narrative, and coordinated posting. Each is scored against the frameworks; crossing a threshold raises an alert.
- **Analyst first:** every alert goes to FridayAnalytics analysts, never straight to clients. An analyst confirms or dismisses it, and the decision is logged.
- **Alert levels and channels for analysts:**

| Level | Portal | Email | Telegram |
| --- | --- | --- | --- |
| Watch | Yes | No | No |
| Warning | Yes | Yes | No |
| Urgent | Yes | Yes | Yes, immediately |

- **Reaching the NGO:** once an analyst confirms an alert, the NGO gets a notice in its portal and a short briefing document, which FridayAnalytics hands over in person.
- **Evidence:** alerts link to the underlying captures, which follow U5 data quality controls and the U6 checkpoints; briefing documents stay on DarkNight.

**Exit checks:** no alert reaches a client without analyst confirmation; each level triggers only its channels; every alert, decision and briefing hand-over is logged.

**Open:** scoring thresholds per signal; which analysts receive Telegram alerts; the briefing document template.

## U8 — Internal framework library

One internal library of frameworks and reference material that is the baseline for research, analysis and early warning. Modules read their rules from it instead of hard-coding them.

**One universal standard.** The platform always follows a single FridayAnalytics universal standard. External frameworks are source material, not parallel rulebooks. New resources never create a competing standard; they only produce recommended enhancements to the one standard.

- **What it holds:** frameworks and standards (Berkeley Protocol, GIJN practice, SPJ Code of Ethics, Rabat Plan of Action, Dangerous Speech markers, UN Framework of Analysis for Atrocity Crimes, FA-CEF, FA-STD-001), plus reference data such as lexicons, indicator definitions, scoring thresholds and glossaries.
- **Managed by administrators:** staff administrators add, edit and load reference information (documents, structured indicators, term lists) without code changes.
- **Versioned:** every entry has a version, effective date and author. Changes create a new version; old versions stay readable.
- **Baseline for each module:** research plans, analysis checkpoints and early warning scoring each record which framework versions they used, so any finding or alert can be traced to the exact rules in force.
- **Approval:** a change to an active framework needs Curator approval before modules use it. Only the Curator can approve changes.
- **Staff only:** clients never see the library directly; reports cite the frameworks by name.

**Automatic review and ingestion of new resources:**

1. An administrator uploads a new resource (a report, standard, guideline or dataset).
2. The platform reviews and analyses it, and extracts the key learnings: definitions, indicators, risk factors, scoring criteria, terms for lexicons, and methods.
3. Each learning becomes a recommended enhancement to the universal standard (strengthen a rule, add a rule, or flag a conflict), linked to the exact page or passage it came from.
4. The platform flags conflicts or overlaps with existing entries.
5. The Curator reviews the drafts, edits or rejects any, and approves the rest; approved enhancements are merged into the universal standard as a new version, and modules always follow the latest approved version.
6. The original document is kept, hashed and versioned alongside its extracted learnings.

**Exit checks:** a module cannot run without a linked framework version; framework edits never alter past results; every change is logged with author and approval.

**Open:** first set of entries to load.

## U9 — Link analysis

A graph capability showing how accounts, groups and narratives connect, built on preserved evidence so every link is provable.

1. **Data model:** entities (accounts, people, groups, pages, hashtags, URLs, phone numbers, locations) and links (posted in, shared, mentions, same admin, same phone number). Every link cites the captures that prove it.
2. **Entity resolution:** the platform suggests when two accounts are likely the same actor; an analyst confirms or rejects each match, and the decision is logged.
3. **Storage:** PostgreSQL on DarkNight, as node and edge tables or with a graph extension such as Apache AGE. The graph stays at home with the evidence.
4. **Analysis and view:** an interactive graph screen (for example Cytoscape.js) to expand nodes, filter by time and open the evidence behind any link; measures for centrality, clusters and coordinated posting bursts, which feed early warning (U7).

Every graph and finding records the universal standard version it used.

**Exit checks:** no link exists without cited evidence; entity merges need analyst confirmation; graph data never leaves DarkNight; clients see only graphs released in reports.

**Open:** which entity and link types to start with; coordination thresholds.

## U10 — Analyst browser capture (OPTIONAL)

Optional. A browser extension so analysts can capture evidence while browsing manually, like Hunchly, held to the same rules as automated connectors.

1. Before browsing, the analyst selects an engagement and an approved requirement ID.
2. One click saves the page, a full-page screenshot, the URL and capture time, hashed with SHA-256 at capture.
3. Captures go through the same quarantine and validation as connectors, with the analyst recorded as collector.
4. Optional session log of every page visited, so the investigation path is itself evidence.

It is treated as a manual connector and must meet the connector design standard.

**Exit checks:** no capture without a requirement ID; hashes verified on vault write; every capture names its analyst.

## U11 — Narrative and coordination detection

Groups posts into narratives and detects accounts acting in concert, so a campaign is caught as it forms, before any single post looks alarming.

**Narrative clustering**

1. Multilingual language models (Malay and English at minimum) group posts that say the same thing in different words.
2. An analyst names and confirms each cluster as a narrative and links it to known myths and scenarios in the universal standard.
3. Each narrative is tracked over time: volume, platforms reached, and new accounts joining.

**Coordination detection**

1. Identical or near-identical text posted by many accounts within a short window.
2. The same links pushed by many accounts at once, and bursts of newly created accounts.
3. Coordinated links are added to the link analysis graph (U9).

**Outputs:** both feed early warning (U7) as signals, for example "narrative X grew threefold in 24 hours, pushed by 40 coordinated accounts". An analyst must confirm before anything is labelled coordinated.

**Exit checks:** every narrative and coordination finding cites its captures; no coordination label without analyst confirmation; each result records the standard version used.

**Open:** time window and similarity thresholds; languages beyond Malay and English.

## U12 — Unified evidence search

One search across captures, cases, narratives, entities and reports, for every engagement the analyst is allowed to see.

1. **Keyword search** in Malay and English, built into PostgreSQL on DarkNight.
2. **Meaning-based search** using the same multilingual models as U11, so different wordings of the same idea are found together.
3. **Image matching** to find copies and edited versions of a photo across the vault.
4. **Filters** by platform, date, engagement, narrative, entity and verification level.
5. **Saved searches**, which can become monitoring requirements once the Curator approves.

Results obey the same access rules as everything else and open straight to the evidence and its chain of custody.

**Exit checks:** search never returns items the user cannot access; every result links to its capture and custody log; search indexes stay on DarkNight.

**Open:** which content types to index first.

## U13 — Wider source coverage

Extends collection beyond the minimum baseline (Facebook, Google, Threads, X, Instagram, TikTok) to the places where mobilisation is organised, especially chat apps.

- **Priority:** Telegram public channels and groups; WhatsApp channels.
- **Next:** YouTube, Reddit and local forums, news sites and blogs.
- **Rules:** only publicly accessible content within the signed brief and its legal basis; no deception or unlawful access to private groups, in line with the methodology.
- **How:** each source is added as a connector that meets the connector design standard and passes certification before use.

**Exit checks:** each new source passes connector certification; collection is refused outside the brief's approved sources.

**Open:** order of sources after Telegram; local forums to include.

## U14 — Executive agent gateway

An AI agent that FridayAnalytics senior executives question in plain language to analyse the data set.

- **Runs on** the Hermes agent stack on the Mac Studio at home, so data stays local.
- **Access** through Telegram.
- **Read-only:** analyses and summarises; never starts research, changes evidence or releases anything.
- **Permission-aware:** sees only what that executive may see.
- **Cites everything:** every answer links to its evidence, narratives or reports and states confidence.
- **Logged:** every question and answer is recorded.
- **Follows the universal standard** (U8) when interpreting.

**Open:** which executives get access; whether the portal also gets a chat view.

## Carried-over and open items (as at 3 Nov 2026)

- Phase 3 SQL checks 1 to 3 remain unrun; need a test connection that can act as a signed-in user, or a real client administrator sign-in.
- FA-STD-001 naming convention to be shared and quoted in the methodology.
- Pricing amounts, currency and billing period.
- Which reports belong to each tier.
- Retention periods per evidence type.

Produced by FridayAnalytics.org
