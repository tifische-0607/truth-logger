# U11 Narrative and coordination gateway contract (DarkNight)

Status: contract only. The secure route to DarkNight is not decided. The portal uses a fake gateway with staff-only Sample data (`/narratives?preview=sample`).

## Where everything lives
| Item | Lives |
|---|---|
| Post text, translations, embeddings, similarity indexes, clusters, coordination computations | DarkNight only |
| Multilingual model (Malay and English at minimum; other languages not decided) | DarkNight only |
| Cluster/finding identifiers, analyst decisions, narrative names, myth/scenario identifiers, cited capture IDs, thresholds, standard version, logs | Portal database (`nar_*`) |

## Read endpoint (browser → DarkNight)
`GET {gateway}/v1/narratives/{engagement_uuid}`, sent over HTTPS only with `Authorization: Bearer <portal session token>`, redirects refused and no caching.
DarkNight must verify the token and that the user may see the engagement (`can_access_project`) before answering.

```json
{
  "standard_version": "<framework_versions.id of FA-USTD in force>",
  "model": "<model name and version>",
  "clusters": [{ "id": "clu-…", "languages": ["ms","en"], "summary": "…", "similarity": 0.86,
                 "captures": ["<research_captures.id>"],
                 "timeline": [{ "day": "YYYY-MM-DD", "volume": 0, "platforms": ["facebook"], "new_accounts": 0 }] }],
  "coordination": [{ "id": "crd-…", "kind": "near_identical_text|same_links|new_account_burst",
                     "accounts": ["acc-…"], "window_start": "ISO-8601", "window_end": "ISO-8601",
                     "basis": "…", "captures": ["<research_captures.id>"] }]
}
```
Any failure, timeout or malformed body makes the screen show "Temporarily unavailable, please try again later". Clusters and findings with no captures are hidden.

## Thresholds (read by DarkNight, set in the portal)
DarkNight reads the latest values with `nar_threshold(key)`, which only the service role can call. The keys are `similarity_min` (1–20, 5% steps), `cluster_window_minutes` and `coord_window_minutes` (1–4320, so up to 72 hours), `coord_min_accounts` and `new_account_min` (1–20).
A null value means "Threshold not set". DarkNight must then not mark anything as meeting a threshold, and the database refuses every confirmation.

## Feeds
- **To U9:** DarkNight calls `nar_confirmed_coordination(engagement)` (service role) and draws `coordinated_with` links between the listed accounts, citing the listed captures. Only analyst-confirmed findings appear.
- **To U7:** on confirmation, the database records an Early warning signal (`coordinated_posting` or `new_accounts`, scored by the number of accounts, against the DSP framework). If Early warning refuses it (for example, because no framework version is approved), the refusal is logged in `nar_events`, and the confirmation still stands.

## Rules enforced by the database
- Only an analyst can confirm a finding (`nar_row_guard` checks every insert, including direct ones).
- Every finding cites at least one capture from the engagement.
- Every finding records the universal-standard version in force.
- Nothing is confirmed while a threshold is not set.
- A coordination confirmation is refused when fewer accounts are listed than the threshold.
- Decisions and logs are append-only.
