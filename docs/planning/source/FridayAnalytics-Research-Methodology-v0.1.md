# FridayAnalytics Research Methodology

Draft v0.1, for review by Mo (3 Nov 2026). Produced by FridayAnalytics.org

> Source document (reference only). See `README.md` in this folder for precedence. The build checklist derived from it is `docs/planning/U6-Methodology-Checkpoints-Build-Checklist.md`. The flow diagram is in the live copy: https://claude.ai/artifact/DW8scpMEsu9MLFR2DiUq69

## Purpose

This methodology makes every FridayAnalytics investigation consistent, repeatable and defensible. It adopts three recognised standards and states how the FA Portal must enforce them in its flows. It sits alongside the FridayAnalytics Client Engagement Framework (FA-CEF-V1.10) and the Digital Evidence Standard (FA-STD-001). Where this document touches data storage or naming, FA-STD-001 governs.

## The three adopted standards

1. **Berkeley Protocol on Digital Open Source Investigations** (UN Human Rights Office and UC Berkeley Human Rights Center, 2022). The backbone for collecting, preserving, verifying and analysing online information so it can be relied on in formal proceedings.
2. **Global Investigative Journalism Network (GIJN) practice** — verification and research methods for open-source investigations: source checking, geolocation, chronolocation, account and network analysis, and documenting how a finding was reached.
3. **Society of Professional Journalists (SPJ) Code of Ethics** — seek truth and report it, minimise harm, act independently, be accountable and transparent.

## Core principles

- **Accountability:** every action on evidence is recorded against a named person and time.
- **Competence:** only trained staff collect or verify evidence; training is recorded.
- **Objectivity:** test findings against alternative explanations; record what would disprove them.
- **Legality and ethics:** collect only publicly accessible material within the signed brief; no deception, no unlawful access.
- **Security:** protect evidence, sources, staff and subjects; confidential material stays on DarkNight.
- **Minimise harm:** protect bystanders and vulnerable people; redact where publication is not needed.
- **Transparency:** clients see how conclusions were reached, without exposing sources or methods that would cause harm.

## The investigation cycle

The cycle maps onto the FA-CEF phases and gates so the portal can enforce it.

| Stage | Berkeley Protocol activity | FA-CEF phases | Portal enforcement |
| --- | --- | --- | --- |
| Plan | Preliminary assessment, investigation plan, digital threat and risk assessment | 0–4 (gates G0–G2) | Brief must be signed and data collection requirements registered before Research can run |
| Collect | Online inquiry and collection | 5 | Research module only runs against registered requirements; every capture logged |
| Preserve | Preservation, hashing, chain of custody | 5 | SHA-256 at capture; write-once storage; custody log per item |
| Verify | Source, technical and content analysis | 6 | Each item needs a verification record before it can be cited |
| Analyse | Investigative analysis | 6–7 | Findings must link to verified items and record alternative explanations |
| Report | Reporting with methodology statement | 8–9 (gates G3–G5) | Curator approval required; report carries methodology statement and footer |
| Close | Retention and disposal | 10 | Retention rule applied and recorded |

## Collection rules

- Collection follows the **central data collection requirements register**. Each requirement states platform, accounts or keywords, languages, time window and legal basis, traced to the signed brief.
- Every connector (SocialCrawl first, then Facebook, Google, Threads, X, Instagram and TikTok) works through the same adapter contract. It takes a requirement and returns items with source URL, capture time (UTC), collector, tool and version, and raw capture.
- Capture the full context: the post, comments, account page, timestamps and media, not only screenshots.
- Record what was searched and found nothing. Negative results are evidence too.

## Preservation and chain of custody

- Hash every captured file with SHA-256 at the moment of capture, and re-verify on every access and download.
- Originals are write-once. Working copies are derived and linked to the original.
- The custody log records who did what, when, with which tool, for every item.
- Naming, folder structure and metadata follow FA-STD-001 exactly. No connector may invent its own convention.
- Raw evidence and reports stay on DarkNight at home. The Namecheap Cloud Vault holds portal data only.

## Verification

Each item gets a verification record covering:

1. **Source:** who posted it, account history, links to other accounts, signs of automation or impersonation.
2. **Technical:** metadata, reverse image and video search, earliest known copy.
3. **Content:** geolocation, chronolocation, consistency with other evidence.
4. **Confidence:** Confirmed, Probable, Possible or Unverified, with the reasoning.

Only Confirmed or Probable items may support a finding in a client report. Lower levels may be mentioned only as leads, clearly labelled.

## Analysis

- Every finding links to the verified items it rests on.
- Record the alternative explanations considered and why they were rejected.
- A second analyst reviews any finding that names a person or organisation.

## Ethics and harm

- Weigh the public interest against harm before naming anyone.
- Redact identities of bystanders, minors and victims unless essential.
- Staff wellbeing: rotate exposure to distressing content and record it.
- Declare and record any conflict of interest at G0.

## Reporting

Every client report includes:

- a short methodology statement naming the three standards;
- the time window, platforms and limits of the collection;
- confidence levels for each finding;
- the Curator's release approval;
- the footer "Produced by FridayAnalytics.org".

## Data quality controls

Collection agents must not decide what to collect or how to store it. These controls stop off-scope or malformed data from entering the vault, so evidence stays reusable. All are enforced in the database.

1. **Requirement-bound collection.** An agent can only run against an approved requirement ID from the data collection requirements register. Anything outside it is refused.
2. **One schema for every connector.** Every connector returns the same fields, with fixed value lists for platform, item type and language. No connector may store data in its own format.
3. **Quarantine and validation.** New items land in a holding area first. Items with missing fields, the wrong format or no requirement ID are rejected and logged, never stored.
4. **Provenance on every item.** Each item carries its requirement ID, connector name and version, collector and capture time (UTC), so it can be traced and reused.
5. **Monitoring.** Rejection rates are reported per connector; a connector with repeated rejections is suspended until fixed.

## Verification and quantification checkpoints

Work cannot move past a checkpoint until it passes. A failure sends the work back to the step shown.

| Checkpoint | When | Pass condition | On failure |
| --- | --- | --- | --- |
| V1 Integrity | After preservation | SHA-256 recorded, custody log complete, FA-STD-001 name applied | Re-collect |
| V2 Verification | After verification | Item rated Confirmed or Probable with reasoning | Keep as labelled lead only |
| Q1 Collection measures | Before analysis | Volume, reach, time window and platform coverage recorded per requirement | Re-collect to fill gaps |
| Q2 Reproducible counts | After analysis | Every figure can be re-derived from listed items; confidence level stated | Return to analysis |
| R Second review | Before G4 | Second analyst approves any finding naming a person or organisation | Return to analysis |
| C Curator release | G3 to G5 | Methodology statement, limits and confidence levels present; Curator approves | Return to reporting |

## How the FA Portal must enforce this

1. Research cannot start until G2 is passed and the requirements register is complete.
2. Connectors write only through the shared adapter contract, which applies FA-STD-001 naming and hashing.
3. An item cannot be cited in a report until it has a verification record.
4. Findings that name a person need a second reviewer before G4.
5. Reports cannot be released without the methodology statement and Curator approval.
6. All of these are enforced in the database, not only in the screens.

## Open items

- Confirm the FA-STD-001 naming convention to be quoted in this document.
- Decide the retention periods per evidence type.
- Decide the staff training record format.
