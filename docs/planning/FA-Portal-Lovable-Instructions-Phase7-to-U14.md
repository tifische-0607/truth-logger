# FA Portal: Lovable instructions for Phase 7, 8, 9 and U1 to U14

How to use: ONE instruction at a time, after the previous one has been reported on. Each starts with "Go <name>". The COMMON BLOCK applies to every one. Order and conflicts are in the Master Build Plan v2.

## COMMON BLOCK

All HARD RULES and Brand v2.0 apply. Additive migrations only, continuing after the latest migration; never edit applied migrations or delete data. RLS on every new table; append-only tables use block_mutation(); rules live in the database, with the database's own refusal message shown verbatim. No optimistic updates on gate, release, approval, SOP or invite actions. Tokens only, light, dark and high-contrast, Space Grotesk and Inter, 44 px targets, phone layouts, status as word plus dot. No secrets in code or chat; read server secrets by name and show "Not configured" when unset. Do not connect to any outside host unless the instruction says so. Every generated document ends "Produced by FridayAnalytics.org". Sample numbers labelled "Sample". Address https://portal.fridayanalytics.org. Start with a short plan; if blocked or unclear, stop and ask. When finished: SQL checks saved or run (say which), screenshots at desktop and phone in all three themes, keyboard check of any new dialog, then STOP and report: what you built, migration files, rules not enforced in the database and why, what you need from me.

## Go Phase 7: SOP and clock engine
Build: sop_definitions (phase 0-10, version, owner_role, target_working_days, warn_pct default 80, escalation_chain, steps jsonb, effective_from, created_by; append-only, a new version on each change); a working_days calendar (weekends seeded, holidays empty and flagged "Set holidays", editable by Management); phase_clocks (engagement, phase, cycle, started_at, completed_at, paused intervals with reason waiting_on_sponsor_readback, client_documents or client_approval); append-only sla_events.
Rules: a clock starts when a phase opens and stops when its gate or exit completes; Phase 5 runs per cycle. Status: On track below warn_pct of target; At risk from warn_pct to target; Breached above target; Paused only while waiting on the client (only the engagement lead or Management records the pause and the reason; time waiting on FA staff never pauses); Closed. Seed SAMPLE targets in working days for phases 0-10: 2, 10, 5, 3, 7, 14, 5, 3, 7, 2, 5 with owners lead, lead, lead, curator, curator, lead, analyst, evidence officer, lead, curator, lead, labelled "Sample" until Management edits them. KPIs computed from records, never typed: median and 90th percentile working days, on-time rate, breach count, paused time, rework, gate wait. At-risk alerts go to the SOP owner role; a breach also goes to the next in the escalation chain, recorded as in-app alerts in the event log (no email).
Screen: engagement Overview gets a Turnaround card (phase, clock bar, status, SOP target, owner, escalation, steps, "Waiting on client: pause clock" with reason, Resume).
Exit checks (SQL): clock starts and stops on the right triggers; pause only for client waiting; breach status and alert appear when the target is exceeded; an SOP edit creates a new version; a non-management user cannot edit an SOP.
Needs from you: real SOP targets, the working-day calendar, escalation chains (placeholders are fine to start).

## Go Phase 8: Management screens (role management, owner)
Sidebar item Management with pills Overview, Clients, Phases, SOPs and KPIs; none of it appears in the client portal. Management cannot sign gates, decide readings, start or stop research, or release outputs.
- Overview: counts (active, on track, at risk, breached, paused); phase performance table; portfolio heat map (engagement rows by phases 0-10, current cell days used over target coloured by status, future cells dashed); Needs attention list with owner, escalation and Open.
- Clients: a card per client (name, type chip, worst status, portal chip, engagements, shared documents, administrators n of 2, a status line per engagement) and a detail view.
- Phases: eleven tabs, each with KPI tiles (target, median actual, on-time rate, in phase now, breached), engagements in the phase with clocks, a bar chart of the last five durations with a dashed target line, and the SOP card with Edit target.
- SOPs and KPIs: grid of all eleven SOPs with Edit (target 1-60 working days, warn at 70, 80 or 90; saving creates the next version and an event; non-management refused with a plain message); "How the clock works" card; KPI filters by client, phase, owner role, period; CSV export as copy-to-clipboard.
Exit checks: a management user sees everything but every sign, decide, start, stop and release control is absent or refused; clients and analysts cannot open Management.
Use "Sample" data labels and a staff-only sample preview, as in Phase 3, because no engagements exist yet.

## Go U8: Internal framework library and universal standard
Build the library every module reads its rules from. One FridayAnalytics universal standard; external frameworks are source material, never parallel rulebooks.
- Holds: frameworks and standards (Berkeley Protocol, GIJN practice, SPJ Code of Ethics, Rabat Plan of Action, Dangerous Speech markers, UN Framework of Analysis for Atrocity Crimes, FA-CEF, FA-STD-001) plus reference data: lexicons, indicator definitions, scoring thresholds, glossaries.
- Staff administrators add, edit and load entries (documents, structured indicators, term lists) with no code changes. Every entry has version, effective date, author; changes create a new version; old versions stay readable. A change to an active framework needs Curator approval before modules use it; only the Curator approves. Staff only; clients never see the library, reports cite frameworks by name.
- Automatic review and ingestion: an administrator uploads a resource; the platform extracts definitions, indicators, risk factors, scoring criteria, lexicon terms and methods; each becomes a DRAFT recommended enhancement to the universal standard (strengthen a rule, add a rule, or flag a conflict) linked to the exact page or passage; the platform flags conflicts and overlaps; the Curator edits, rejects or approves; approved enhancements merge into the standard as a new version; the original document is kept, hashed and versioned beside its extracted learnings. Build the extraction as a replaceable server step; if no model service is configured show "Not configured" and allow manual entry of learnings.
- Modules (research plans, analysis checkpoints, later early warning) record the framework version they used; a module cannot run without a linked framework version.
Exit checks: a module cannot run without a linked version; edits never alter past results; every change logged with author and approval; only the Curator can approve.
Needs from you: the first set of entries to load.

## Go U3: Storage split (supersedes the document-copy design in Phase 2 and 6)
Rule: no report or evidence file exists in the cloud. DarkNight (home) holds all reports and evidence; the cloud holds portal data only (the Namecheap database holds portal data: clients, users, tiers, engagements, billing, activity). Downloads fetch live from DarkNight and re-check the SHA-256; if DarkNight is unreachable the portal shows "Temporarily unavailable, please try again later" instead of failing.
Build: move the library's file storage and the vault_outbox document copying so documents and evidence are referenced by hash and location, never stored in the cloud; fetch through the existing DarkNight gateway with the user token; keep the metadata (title, kind, client, hash, visibility, log) in the portal database. Update the Vaults page "Where data goes" table to match. Migrate any existing library files per a written plan I approve first (there are none now).
Exit checks: no report or evidence file exists in cloud storage; downloads re-verify the hash; the offline message appears when DarkNight is unreachable (test with a fake gateway).
Needs from you: the parked decisions (secure route to DarkNight; how portal data moves to the Namecheap database).

## Go U4 remainder and U5 remainder
U4: one central data collection requirements register, fed by the signed brief. Each requirement states platform, accounts or keywords, languages, time window and legal basis and has an ID. Research cannot start before G2 and the register being complete; every collected item links to a requirement ID. Connector contract unchanged (SocialCrawl first; baseline platforms Facebook, Google, Threads, X, Instagram, TikTok); adding a test adapter needs no code changes elsewhere. Evidence is written to DarkNight under FA-STD-001 naming.
U5: add the rejection-rate dashboard per connector over time (staff). Confirm the Phase 5 defaults still hold (auto-suspend after 5 rejected items in 60 minutes).
Exit checks: an off-register collection attempt is refused; a malformed item is rejected and logged; every stored item carries full provenance (requirement ID, connector and version, collector, UTC capture time).

## Go U6: Methodology checkpoints
Build exactly as in docs/planning/U6-Methodology-Checkpoints-Build-Checklist.md. Needs U4, U5, U8 done first.

## Go Phase 9: Hardening, documentation, full test run
Light, dark and high-contrast on every screen; phone layouts; keyboard-only dialogs. Update docs/APP_DOCUMENTATION.md and roadmap.md for everything built. Complete the SQL tests so every database rule has a passing check and run them; first resolve how to run them (a service-role test connection and a test engagement with G1 and G2 signed). Final line must print "ALL PORTAL CHECKS PASSED" only if every check really ran and passed; otherwise list exactly which did not run. Final report: all migrations, rules not enforced in the database, anything "Not configured", auth redirect URLs and allowed origins, and the unrun checks.

## Go U1: Membership tiers and user seats
No self-registration; FridayAnalytics registers every client and issues one or two client administrator logins. Client administrators add further users up to the tier's seat limit. Three starting tiers, staff-editable: Entry (3 seats, basic set of general reports), Professional (10 seats, most general reports), Enterprise (unlimited seats, full library). Research is the same for every tier; tiers differ only in seats and report library access. Staff set which tiers can see each report.
Exit checks: a client cannot exceed its seat limit (refused in the database with a clear message); a user cannot open a report above their tier; client administrators cannot change their own tier.
Needs from you: which reports belong to each tier.

## Go U2: Pricing page, upgrade requests and billing
Pricing page in the client portal comparing the three tiers. Staff edit prices, seat limits and tier contents from the staff workspace. Clients do not pay online; they press "Request upgrade" and staff are notified in the portal. Staff billing section modelled on BRQ Plus: create and issue invoices, record payment, change the client's tier once paid. Clients see their current tier, seats used and their invoices. Invoices use the Brand v2.0 A4 layout.
Exit checks: only staff can change prices or tiers; every tier change and invoice is logged; a client sees only its own invoices.
Needs from you: prices, currency (RM or USD), monthly or yearly billing.

## Go U7: Early warning platform
Flags hate speech escalating towards real-world mobilisation or violence so FridayAnalytics can warn the NGOs it supports. Scoring frameworks: UN Rabat Plan of Action six-part threshold test, Dangerous Speech Project markers, UN Framework of Analysis for Atrocity Crimes risk indicators, all read from the U8 library. Signals tracked: volume spikes, calls to gather, named dates and locations, new accounts joining a narrative, coordinated posting; each scored; crossing a threshold raises an alert. Analyst first: every alert goes to FridayAnalytics analysts, never straight to clients; an analyst confirms or dismisses, logged. Levels and channels for analysts: Watch (portal only); Warning (portal and email); Urgent (portal, email and Telegram immediately). Once an analyst confirms, the NGO gets a portal notice and a short briefing document that FridayAnalytics hands over in person; briefing documents stay on DarkNight. Alerts link to the underlying captures (U5 quality, U6 checkpoints). Email and Telegram: build the channel layer and recipient settings; do not send real messages until the channels are configured; show "Not configured".
Exit checks: no alert reaches a client without analyst confirmation; each level triggers only its channels; every alert, decision and hand-over is logged.
Needs from you: thresholds per signal, which analysts get Telegram alerts, the briefing template.

## Go U9: Link analysis
A graph showing how accounts, groups and narratives connect, built on preserved evidence. Entities: accounts, people, groups, pages, hashtags, URLs, phone numbers, locations. Links: posted in, shared, mentions, same admin, same phone number. Every link cites the captures that prove it. Entity resolution: the platform suggests likely same-actor accounts; an analyst confirms or rejects, logged. Storage: PostgreSQL on DarkNight as node and edge tables or a graph extension such as Apache AGE; the graph stays at home. Interactive graph screen (for example Cytoscape.js): expand nodes, filter by time, open the evidence behind any link; measures for centrality, clusters and coordinated posting bursts feeding U7. Every graph and finding records the standard version used.
Exit checks: no link without cited evidence; merges need analyst confirmation; graph data never leaves DarkNight; clients see only graphs released in reports.
Needs from you: entity and link types to start with; coordination thresholds.

## Go U11: Narrative and coordination detection
Groups posts into narratives and detects accounts acting in concert. Narrative clustering with multilingual models (Malay and English at minimum): same message in different words grouped; an analyst names and confirms each cluster as a narrative and links it to known myths and scenarios in the universal standard; each narrative tracked over time (volume, platforms, new accounts). Coordination detection: identical or near-identical text from many accounts in a short window; the same links pushed at once; bursts of new accounts; coordinated links go into the U9 graph. Both feed U7 as signals. An analyst must confirm before anything is labelled coordinated. Runs on DarkNight; no content leaves home.
Exit checks: every finding cites its captures; no coordination label without analyst confirmation; each result records the standard version.
Needs from you: time window and similarity thresholds; languages beyond Malay and English.

## Go U12: Unified evidence search
One search across captures, cases, narratives, entities and reports for engagements the analyst may see. Keyword search in Malay and English (PostgreSQL on DarkNight); meaning-based search using the U11 models; image matching to find copies and edits; filters (platform, date, engagement, narrative, entity, verification level); saved searches that can become monitoring requirements once the Curator approves. Results obey the same access rules and open to the evidence and its custody log; indexes stay on DarkNight.
Exit checks: search never returns items the user cannot access; every result links to its capture and custody log.
Needs from you: which content types to index first.

## Go U13: Wider source coverage
Beyond the baseline: Telegram public channels and groups and WhatsApp channels first; then YouTube, Reddit, local forums, news sites and blogs. Only publicly accessible content within the signed brief and its legal basis; no deception or unlawful access to private groups. Each source is a connector that meets the connector design standard and passes certification before use.
Exit checks: each new source passes connector certification; collection is refused outside the brief's approved sources.
Needs from you: order of sources after Telegram; which local forums.

## Go U10 (optional): Analyst browser capture
A browser extension for manual capture, like Hunchly, held to the same rules as connectors. The analyst selects an engagement and an approved requirement ID first; one click saves the page, a full-page screenshot, URL and capture time, hashed with SHA-256 at capture; captures go through the same quarantine and validation with the analyst recorded as collector; optional session log of every page visited. Treated as a manual connector.
Exit checks: no capture without a requirement ID; hashes verified on vault write; every capture names its analyst.

## Go U14: Executive agent gateway
An AI agent FridayAnalytics senior executives question in plain language to analyse the data set. Runs on the Hermes agent stack on the Mac Studio at home so data stays local; access through Telegram; read-only (analyses and summarises, never starts research, changes evidence or releases anything); permission-aware (sees only what that executive may see); cites everything with evidence links and confidence; every question and answer logged; follows the U8 universal standard. In the portal build only the access control list, the log and the gateway contract; the agent itself is built outside Lovable.
Needs from you: which executives get access; whether the portal also gets a chat view.
