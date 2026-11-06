# DarkNight link-analysis gateway contract (U9)

Status: contract only. The secure route to DarkNight is not decided, so the app is built against a fake gateway
(`src/lib/link-gateway.ts` → `sampleGateway`, staff-only Sample data shown at `/links?preview=sample`).

## Storage rule
Graph contents (nodes, edges, labels, measures) live only on DarkNight. The browser reads them live and never stores them.
The portal database keeps only identifiers and decisions:
- `lnk_merge_decisions` — two entity identifiers, confirm/reject, reason, analyst, standard version
- `lnk_released_graphs` — graph reference, snapshot SHA-256, released report, standard version
- `lnk_thresholds`, `lnk_events` — settings and the append-only log

## Transport
- Base URL: the `gateway_url` of the enabled home-vault source (HTTPS only, no credentials, query or fragment in the URL).
- Every request: `Authorization: Bearer <portal access token>`, `Accept: application/json`, no cookies, redirects refused, no caching, 20 s timeout.
- The gateway must verify the bearer token with the portal and check that the caller is staff on the engagement.
- Any network failure, timeout, redirect or non-2xx status is shown as: **Temporarily unavailable, please try again later**.

## Endpoints

### `GET /v1/graph/{project_id}`
Whole graph for one engagement.

```json
{
  "standard_version": "FA-USTD v1",
  "nodes": [{ "id": "acc-001", "type": "account", "label": "…" }],
  "edges": [{ "id": "e1", "source": "acc-001", "target": "grp-001", "type": "posted_in", "at": "2026-11-04T09:00:00Z", "captures": ["<research_captures.id>"] }],
  "suggestions": [{ "id": "sug-001", "a": "acc-003", "b": "acc-004", "score": 0.82, "basis": "…" }]
}
```

- `type` (node): `account | person | group | page | hashtag | url | phone | location | narrative`
- `type` (edge): `posted_in | shared | mentions | same_admin | same_phone`
- `captures`: required, at least one capture ID per edge. **No link without cited evidence** — the gateway must not return an
  edge without captures, and the app also hides any such edge and reports how many were hidden.
- Identifiers must match `^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$` (the same rule the database applies to merge decisions).

### `GET /v1/graph/{project_id}/node/{node_id}/neighbours`
Same shape; returns the node's neighbours and the edges to them (used by "Expand connections").

### `GET /v1/graph/{project_id}/edge/{edge_id}/evidence` (reserved)
Capture IDs and their SHA-256 values for one link. The current screen shows the capture IDs already on the edge.

## Measures (computed in the browser, never stored)
Degree centrality, clusters (connected groups) and coordinated posting bursts. Bursts are flagged only when both
coordination thresholds (`burst_min_accounts`, `burst_window_minutes`) are set; until then the screen shows "Threshold not set".
A burst can be sent to Early warning (U7) as a `coordinated_posting` signal citing its captures.

## Client visibility
Clients see only graphs attached to a released report (`portal_released_graphs`); the database refuses to attach a graph
to a report that is not released.
