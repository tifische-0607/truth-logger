# U12 Unified evidence search gateway contract (DarkNight)

Status: contract only. The secure route is not decided, so the portal uses a fake gateway with staff-only Sample data (`/evidence-search?preview=sample`).

## Where everything lives
- **DarkNight only:** keyword indexes (PostgreSQL full text, Malay and English), meaning indexes built with the U11 models, image fingerprints, and every snippet and title.
- **Portal (`srch_*`):** the content-type setting, saved searches (the analyst's own words and filters), Curator promotions, the search log (mode, filter names and counts only) and the access filter `srch_visible`.

## Request
`POST {gateway}/v1/search`, sent over HTTPS only with `Authorization: Bearer <portal session token>`, redirects refused and no caching.
```json
{ "project_id": "<uuid>", "mode": "keyword|meaning|image", "query": "…",
  "filters": { "platform": "…", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "narrative": "clu-…", "entity": "acc-…",
               "verification": "verified|unverified", "kinds": ["captures","cases","narratives","entities","reports"] } }
```
DarkNight must search only the content types returned by `srch_current_types()` (service role). When that list is empty, it returns nothing, and the portal shows "No content types chosen yet".

## Response
`{ "hits": [{ "key", "kind", "title", "snippet", "platform", "at", "project_id", "verification", "score", "capture": { "kind": "research|case_item", "id": "<uuid>" }, "case_id"? }] }`

Every hit must cite a capture.

## Access, applied twice
1. DarkNight checks the token and the engagement access before searching.
2. The browser passes the hits to `srch_visible`. This runs as the user, under the user's own row rules, and returns only the keys of hits whose engagement the user may access and whose capture the user can already open. Every other hit is dropped and only counted ("removed because you may not see them"). The search never returns items the user cannot access.

Each shown result opens its capture: the research run page, or the case item plus the case custody log.

## Saved searches and monitoring
- An analyst saves a search, then asks for it to become a monitoring requirement.
- Only the Curator can approve, and approval must name an active requirement in the engagement's U4 register. The register stays the only source of requirement IDs.
- Every step is append-only.
