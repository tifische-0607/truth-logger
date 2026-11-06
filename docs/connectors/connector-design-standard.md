# Connector design standard and certification (U13)

Every source is a connector in `research_connectors`. A connector added from U13 onward has `requires_certification = true`. The baseline SocialCrawl connector predates certification and is marked as the baseline.

## A connector can collect only when all of these are true (enforced by the database)
1. **Certified:** the Curator has recorded a passed certification for the connector's current version (`research_certify_connector`). A new version needs a new certification.
2. **Configured:** the collection device reported it configured (`research_report_connector_config`, service role only).
3. **Approved in the brief:** the engagement's lead, Curator or owner approved the source against the signed brief in force, with its legal basis (`research_approve_source`).

The activation trigger refuses status `active` until 1 and 2 hold. The capture trigger refuses any capture from the connector until 1, 2 and 3 all hold.

## Certification checklist (every item required for a pass)
| Key | Check |
|---|---|
| public_only | Publicly accessible content only |
| within_brief | Only within the signed brief and its legal basis |
| no_deception | No deception, fake accounts or unlawful access to private groups |
| standard_capture_shape | Sends the one standard capture shape (`research_submit_capture_std`) |
| sha256_at_capture | SHA-256 for every artefact at capture |
| utc_time | Capture time in UTC |
| requirement_bound | Every capture carries an approved requirement ID |
| quarantine_rules | Passes quarantine, validation and rejection-limit tests |

## Registry rows added (all "Not certified", "Not configured")
- Telegram public channels and groups
- WhatsApp channels
- YouTube
- Reddit
- Local forum (not chosen)
- News sites
- Blogs

No real forum names are recorded.

## Still to do when the first new connector is certified
The standard capture function still accepts only the six baseline platforms, so captures from new platforms are quarantined. Widening that list (and the requirements register's platform list) is a separate additive change, which ships with the first certified connector.
