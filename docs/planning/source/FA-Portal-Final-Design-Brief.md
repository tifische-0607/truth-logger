# FA Portal Final Design Brief

For Mo's review, 3 Nov 2026. FA Portal is FridayAnalytics' single tool for OSINT and investigative research: one staff workspace, one client portal, evidence held at home, and one universal standard every module follows. Address: https://portal.fridayanalytics.org. Produced by FridayAnalytics.org

> Source document (reference only). See `README.md` in this folder for precedence. The two diagrams are in the live copy: https://claude.ai/artifact/QR5F9KSee4Y2EaTcd47kjn

## Vision

FridayAnalytics aims to be the leading OSINT and investigative research outfit, starting with hate speech and anti-refugee mobilisation in Malaysia, then expanding. The portal earns that through open methods, evidence that holds up, and fast but careful work.

## Users and roles

| User | Side | What they do |
| --- | --- | --- |
| Curator | Staff | Approves gates, releases reports, sole approver of the universal standard |
| Analysts and collection operators | Staff | Plan research, verify, analyse, confirm early warning alerts |
| Evidence officer | Staff | Second-person checks, evidence tiers |
| Staff administrators | Staff | Clients, billing, pricing page, framework library uploads |
| FA Management | Staff | Reads everything, cannot start or stop research |
| Client administrators (1 to 2) | Client | Manage their users up to the seat limit, request upgrades |
| Client users | Client | Dashboards, engagements, documents within their tier |

No self-registration: FridayAnalytics registers every client.

## Modules

| Module | Side | Purpose |
| --- | --- | --- |
| Engagements and gates | Staff | FA-CEF phases 0 to 10, gates G0 to G5 |
| Research | Staff | Requirements register, connector layer, collection |
| Data quality controls | Staff | Requirement-bound collection, one schema, quarantine, provenance |
| Analysis and checkpoints | Staff | Verification and quantification checkpoints, second review |
| Early warning | Staff | Signal scoring, three alert levels, analyst confirmation |
| Framework library | Staff | The single universal standard, enhanced from uploaded resources |
| CRM, membership and billing | Staff | Clients, tiers, seats, invoices, editable pricing |
| Client dashboard, engagements, documents | Client | Plain five-stage progress, briefs, verified downloads |
| Client administration and pricing | Client | Team seats, organisation details, activity, upgrade requests |

## Architecture at a glance

Diagram: users, the two sides of the portal, storage and connectors (see the live copy).

Staff and clients use separate sides of one portal; all evidence and reports live on DarkNight, and the cloud holds portal data only.

## End-to-end flow

Diagram: research and early warning flow (see the live copy).

1. Client registered by FridayAnalytics.
2. Brief signed, gates G0 to G2.
3. Requirements register (approved IDs).
4. Connectors collect against requirements.
5. Quarantine and validation (U5).
6. Preserve on DarkNight: hash, custody (V1).
7. Verify: Confirmed or Probable (V2).
8. Analyse: Q1, Q2, second review.
9. Curator release (G3 to G5).
10. Client notified; download re-checks hash.

Early warning (U7) runs alongside, fed by the universal standard (U8): signals are scored against the universal standard, an alert is raised at Watch, Warning or Urgent, an analyst confirms or dismisses it, and the NGO receives a portal notice plus a briefing handed over in person.

Research runs top to bottom through every checkpoint; early warning draws on preserved evidence and the universal standard, and nothing reaches an NGO without analyst confirmation.

## Screen-level user flows

**Curator**

1. Dashboard shows gates awaiting approval, pending standard enhancements and reports awaiting release.
2. Opens an item, reviews evidence and checkpoint results, approves or returns it with a reason.
3. Framework library: reviews recommended enhancements side by side with their source passages, then approves, edits or rejects.

**Analyst or collection operator**

1. Opens an engagement once G2 is signed and builds the requirements register from the brief.
2. Drafts a research plan, then starts it, which locks and hashes it.
3. Monitors runs, captures and rejections; pauses or stops with a reason.
4. Verifies items, records measures, analyses, and sends findings for second review.
5. Early warning queue: reviews alerts, confirms or dismisses each, and prepares the NGO briefing.

**Staff administrator**

1. Registers a client, sets its tier and issues 1 to 2 administrator logins.
2. Handles upgrade requests: issues an invoice, records payment, changes the tier.
3. Edits the pricing page and tier contents.
4. Uploads a resource to the framework library; the platform extracts recommended enhancements for the Curator.

**Client administrator**

1. Signs in with the issued login and lands on the dashboard.
2. Administration: adds users up to the seat limit, edits organisation details, views activity.
3. Pricing: compares tiers and presses Request upgrade; sees invoices.

**Client user (including NGOs)**

1. Dashboard: engagements with plain five-stage progress, new documents, notices.
2. Engagement page: brief in force and its documents.
3. Documents: downloads fetched live from DarkNight with a SHA-256 re-check; a clear message if temporarily unavailable.
4. Early warning notice appears in the portal; the briefing document is handed over in person.

## Connector design standard

Every new connector, SocialCrawl first, must meet this structure before it is switched on. No exceptions, so evidence from any source is consistent and reusable.

**Mandatory structure**

| Part | Requirement |
| --- | --- |
| Manifest | Name, version, platform, owner, supported job types (monitor, scrape, OSINT search), rate limits, terms-of-service and legal notes |
| Input | Accepts only an approved requirement ID and the plan's scope (sources, targets, lexicon terms, time window); nothing else |
| Output | Returns items in the one standard schema with fixed value lists for platform, item type and language; no custom fields outside the extension area |
| Provenance | Every item carries requirement ID, connector name and version, collector, source URL and capture time (UTC) |
| Hashing | SHA-256 computed at capture over the raw item; full context kept (post, comments, account, media) |
| Write path | Submits only through the worker functions into quarantine; never writes directly to evidence, runs or storage |
| Idempotency | Each job and capture has a unique key, so retries never create duplicates |
| Errors | Out-of-scope or malformed items are refused and logged with a reason, never silently dropped or stored |
| Credentials | API keys and logins held as secrets on the collection device, never in code or the browser |
| Health | Reports a heartbeat and its error and rejection rates |

**Before activation**

1. Passes a certification test suite: scope refusal, schema validation, hash match on vault write, duplicate handling, and logging.
2. Runs a supervised trial on a test requirement, checked by an evidence officer.
3. Curator approves the connector version; it is recorded in the framework library.

**While in service**

- Any change to a connector creates a new version that is certified again.
- A connector with repeated rejections or a failed heartbeat is suspended automatically until fixed.
- Captures always record which connector version produced them.

## Data and storage

- Cloud Vault (Namecheap PostgreSQL fridzdmo_DarkVault): portal data only.
- DarkNight (home server, backup power): all evidence and reports. Nothing confidential in the cloud.
- Every access rule enforced in the database, not only in screens.

## Standards

One FridayAnalytics universal standard, built from the Berkeley Protocol, GIJN practice, the SPJ Code of Ethics, the Rabat Plan of Action, Dangerous Speech markers, the UN Framework of Analysis for Atrocity Crimes, FA-CEF and FA-STD-001. New resources only recommend enhancements; the Curator approves each version.

## Build sequence (as at 3 Nov 2026)

| Step | Content | Status |
| --- | --- | --- |
| Phases 1 to 4 | Foundations, library, client screens, research data model | Done |
| Phase 5 | Research module, with U4 and U5 where in scope | In progress |
| U8 | Framework library and universal standard | Next, before U6 and U7 |
| U1 to U3 | Membership, pricing and billing, storage split | Planned |
| U6 | Methodology checkpoints | Planned |
| U7 | Early warning platform | Planned |

Current status is kept in `roadmap.md`.

## Open items

- Prices, currency and billing period; reports per tier.
- FA-STD-001 naming convention.
- Early warning thresholds, Telegram recipients, briefing template.
- First entries for the framework library.
- Unrun database checks from Phases 3 and 4.
