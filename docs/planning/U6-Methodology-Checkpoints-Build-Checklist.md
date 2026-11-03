# U6 Methodology checkpoints: build checklist

Source: FridayAnalytics Research Methodology draft v0.1 (Berkeley Protocol, GIJN practice, SPJ Code of Ethics) and Upgrade U6. Depends on U4, U5 and U8 (framework library). Where this touches storage or naming, FA-STD-001 governs. Every rule below is enforced in the database; screens only show the database's refusal. Use the COMMON BLOCK from the instructions pack.

## 1. Checkpoints (work cannot move past one until it passes)

| ID | Name | When it applies | Pass condition (checked in the database) | On failure | Record kept |
|---|---|---|---|---|---|
| V1 | Integrity | After preservation of an item | SHA-256 recorded at capture and re-checked on write; custody log complete for the item; FA-STD-001 name applied | Item is sent back to re-collect; it cannot be verified or cited | Result, who, when, hash, custody check |
| V2 | Verification | After verification of an item | Verification record exists with source, technical and content checks and a confidence rating Confirmed, Probable, Possible or Unverified, with reasoning | Item stays as a labelled lead only and cannot support a finding | Verification record, rater, date |
| Q1 | Collection measures | Before analysis starts | Volume, reach, time window and platform coverage recorded per requirement ID | Re-collect to fill the gaps | Measures per requirement |
| Q2 | Reproducible counts | After analysis | Every figure can be re-derived from a listed set of items; confidence level stated | Return to analysis | Figure to item-list link, confidence |
| R | Second review | Before G4 | A second analyst, different from the author, approves every finding that names a person or organisation | Return to analysis | Reviewer, decision, date |
| C | Curator release | G3 to G5 | Methodology statement, limits and confidence levels present; Curator approves | Return to reporting | Statement version, Curator, date |

## 2. Rules the database must enforce

1. Research cannot start until G2 is passed and the requirements register is complete (U4).
2. Connectors write only through the shared adapter contract, which applies FA-STD-001 naming and hashing.
3. An item cannot be cited in a report until it has a verification record (V2).
4. Only Confirmed or Probable items may support a finding in a client report. Possible or Unverified items may appear only as leads, clearly labelled.
5. A finding must link to the verified items it rests on, and must record the alternative explanations considered and why they were rejected.
6. A finding that names a person or organisation needs a second reviewer (R) before G4. The reviewer must not be the author.
7. A report cannot be released without the methodology statement and Curator approval (C).
8. A conflict of interest must be declared and recorded at G0 (can be "none declared", but the field must be filled).
9. Each checkpoint, plan and finding records the universal standard (U8) version used; a module cannot run without a linked version.
10. Failure never silently passes: a checkpoint row can only be set to passed by the check itself, never edited by a user; reopening creates a new row.

## 3. Data to add (names are suggestions; keep field names easy to extend)

- checkpoint_definitions: id (V1, V2, Q1, Q2, R, C), name, applies_at, pass_rule_ref, failure_target, standard_version.
- checkpoint_results (append-only): engagement, cycle, subject (item, finding or report), checkpoint id, result passed or failed, reason, checked_by (system or person), checked_at, standard_version.
- verification_records: item, source check, technical check, content check, confidence level, reasoning, rater, date.
- findings: engagement, text, linked item ids, alternative explanations, names_person_or_org flag, status.
- finding_reviews: finding, reviewer, decision, date (reviewer different from author).
- collection_measures: requirement ID, volume, reach, time window, platform coverage, recorded by.
- negative_results: requirement ID, what was searched, nothing found, date (negative results are evidence too).
- report_statements: report, methodology statement version, time window, platforms, limits, confidence summary, Curator approval.
- conflict_declarations: engagement, declared by, declaration, date (at G0).
- staff_exposure_log: staff member, engagement, date, distressing content flag (rotation of exposure; recorded, staff only).
- staff_training_records: staff member, training, date (format to be decided).

## 4. Screens

- Engagement checkpoint bar: V1, V2, Q1, Q2, R, C as steps with word plus icon and the reason shown when blocked.
- Item page: verification record form (source, technical, content, confidence with reasoning).
- Findings: create finding, link verified items, record alternative explanations, flag "names a person or organisation", send for second review.
- Second review queue for analysts (cannot review own findings).
- Report builder: methodology statement block pre-filled from the standard (names the three standards; time window, platforms and limits; confidence for each finding; Curator release approval; footer "Produced by FridayAnalytics.org").
- G0 form: conflict of interest declaration.
- Staff: exposure log, training record (simple lists).
- Clients see only the methodology statement in released reports, never the checkpoint internals.

## 5. Exit checks (SQL, each must be a saved test)

- An item without V1 cannot be verified; an item without V2 cannot be cited.
- A Possible or Unverified item cannot support a finding in a client report.
- Analysis cannot start without Q1; a report cannot be released without Q2.
- A finding that names a person is refused at G4 without a second reviewer; the author cannot be that reviewer.
- A report cannot be released without the methodology statement and Curator approval.
- G0 cannot be signed without a conflict declaration.
- A user cannot set a checkpoint to passed; reopening creates a new row.
- Past results are never altered by later framework edits.

## 6. Open items

- FA-STD-001 naming convention to quote in the methodology.
- Retention periods per evidence type (applies at phase 10).
- Staff training record format.
- Wording of the methodology statement for client reports (Curator to approve).
