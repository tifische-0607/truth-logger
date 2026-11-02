# DarkNight gateway API

The Evidence Hub calls these from the **browser**, over Tailscale, at the address
saved in Sources → DarkNight (e.g. `https://mac-studio.tail1234.ts.net:8443`).
Code: [`gateway/`](gateway/). Client: [`src/lib/darknight.ts`](src/lib/darknight.ts).

Every `/v1/*` request sends the hub's Supabase access token:

```
Authorization: Bearer <access token of the signed-in user>
```

The gateway verifies the token and checks `is_investigator`. Errors are
`{"detail": "<message>"}` with `401` (not signed in or expired), `403` (not an
investigator, or a file path outside the evidence share), `404`, `410` (file
missing from the NAS) or `503`. Every call is written to the home custody log.

---

## `GET /health` (no sign-in)

```json
{ "ok": true, "version": "gateway-0.2.0", "source_id": "darknight",
  "checks": { "database": true, "nas": true } }
```

## Record ids

DarkNight keeps evidence in four tables. Each is a **collection**, and a hub
record id is `<collection>.<row id>`:

| Collection | DarkNight table | Code | Files looked for under |
|---|---|---|---|
| `finding` | `mobilization.mobilization_findings` | `DN-MF-000418` | `01_Intake/`, then the DarkNight folder |
| `comment` | `hsdb.comments` | `DN-HC-…` | `01_Intake/`, `07_UNFILED/`, then the DarkNight folder |
| `profile` | `hsdb.profiles` | `DN-HP-…` | as comments |
| `artifact` | `ansarian.artifact_files` | `DN-AF-…` | `07_UNFILED/` |

Paths stored under the old mount `/Users/hermes/NAS_Friday_Analytics/` are
translated (see `legacy_prefixes` in `gateway/mapping.yaml`). A path that does
not resolve is reported, never matched to another file by its name.

## `GET /v1/status`

```json
{ "ok": true, "version": "gateway-0.2.0", "source_id": "darknight",
  "records": 18234,
  "collections": { "finding": 9120, "comment": 7402, "profile": 1310, "artifact": 402 },
  "nas_root_available": true, "signed_in_as": "analyst@example.org" }
```

## `GET /v1/search`

Query: `q` (matches original text, English text and handle), `collection`,
`platform`, `item_type`, `date_from`, `date_to` (YYYY-MM-DD), `limit` (≤ 100,
default 25), `offset`. Results from all collections are merged, newest first.

```json
{
  "results": [
    {
      "record_id": "finding.418",
      "record_code": "DN-MF-000418",
      "collection": "finding",
      "collection_label": "Mobilization finding",
      "element_crop": false,
      "platform": "tiktok",
      "item_type": "video",
      "author_handle": "[handle]",
      "published_at": "2026-10-27T14:10:00+00:00",
      "collected_at": "2026-10-28T01:31:00+00:00",
      "snippet": "first 280 characters of the original text",
      "classification": "gathering_only",
      "file_count": 3
    }
  ],
  "next_offset": 25
}
```

## `GET /v1/records/{record_id}`

```json
{
  "record_id": "finding.418",
  "record_code": "DN-MF-000418",
  "collection": "finding",
  "collection_label": "Mobilization finding",
  "evidence_tier": "FULL_PAGE",
  "element_crop": false,
  "crop_label": null,
  "platform": "tiktok",
  "item_type": "video",
  "author_handle": "[handle]",
  "author_url": "https://www.tiktok.com/@[handle]",
  "url": "https://www.tiktok.com/@[handle]/video/…",
  "published_at": "2026-10-27T14:10:00+00:00",
  "collected_at": "2026-10-28T01:31:00+00:00",
  "collected_by": "Friday OSINT agent",
  "text_original": "…",
  "language": "ms",
  "text_en": "…",
  "translator_statement": "Local model (Hermes); not yet verified by a person.",
  "classification": "gathering_only",
  "location": "[Area], [State]",
  "outcome": null,
  "extra": { "severity": "medium", "confidence": 0.7 },
  "files": [
    {
      "file_id": "1",
      "filename": "recording.mp4",
      "kind": "video",
      "mime_type": "video/mp4",
      "size_bytes": 19293112,
      "created_at": "2026-10-28T01:31:04+00:00",
      "sha256_stored": "5b1e…c09a",
      "sha256": "5b1e…c09a",
      "available": true,
      "path_status": "OK",
      "resolved_path": "300. Projects/Project DarkNight/01_Intake/…/recording.mp4",
      "resolved_via": "relative:300. Projects/Project DarkNight/01_Intake",
      "baselines": {
        "post_manifest": "5b1e…c09a",
        "case_manifest": "5b1e…c09a",
        "case_manifest_path": "300. Projects/Project DarkNight/01_Intake/…/HASHES_CASE.sha256.json",
        "timestamped": true
      },
      "integrity": "MATCH",
      "evidence_tier": null,
      "element_crop": false,
      "crop_label": null
    }
  ]
}
```

`sha256` is computed by the gateway from the file on the NAS (cached by size and
modification time). `sha256_stored` is DarkNight's own hash, when it keeps one.
`available: false` means the file could not be opened; `path_status` says why:
`MISSING` (no candidate path exists), `AMBIGUOUS` (candidates are two different
files) or `UNSAFE` (outside the share, or contains `..`).

`baselines` are the hashes DarkNight's scan pipeline wrote beside the file:
`HASHES.sha256.json` in the post folder and `HASHES_CASE.sha256.json` in the
nearest case folder above it. `timestamped` is true when an RFC-3161 `.tsr`
sits next to the case manifest. `integrity` compares `sha256` with every
baseline that exists (database, post and case manifest): `MATCH`, `MISMATCH`
or `NO_BASELINE`.

`element_crop` is true for tiers listed in `element_crop_tiers`
(`ELEMENT_CROP_V1`): a crop of one page element, which the hub labels with
`crop_label` and does not treat as proof by itself.

## `GET /v1/records/{record_id}/files/{file_id}`

Streams the file (range requests work, so video seeks). `?download=1` sends it
as an attachment. Headers:

```
Content-Type: video/mp4
X-Evidence-SHA256: <sha256 computed now>
X-Evidence-Stored-SHA256: <DarkNight's hash, if any>
X-Evidence-Tier: ELEMENT_CROP_V1        (only for element crops)
Cache-Control: no-store
```

The hub re-hashes the bytes it receives and compares them with the hash stored
in the case reference before it shows or exports them.

## `POST /v1/records/{record_id}/rehash`

Re-hashes every file of the record from the NAS (bypassing the cache).

```json
{ "record_id": "finding.418",
  "results": [
    { "file_id": "1", "filename": "recording.mp4", "sha256": "5b1e…", "status": "MATCH" },
    { "file_id": "2", "filename": "frame_0012.png", "sha256": "a77d…", "status": "NO_BASELINE" },
    { "file_id": "3", "filename": "comments.json", "sha256": null, "status": "MISSING" }
  ] }
```

`status` compares with every DarkNight baseline (stored hash and manifests):
`MATCH`, `MISMATCH`, `NO_BASELINE` (none kept), `MISSING` or `AMBIGUOUS`.
Each result also carries `baselines`. Errors on the file stream: `403` unsafe
path, `409` ambiguous path, `410` missing. The hub separately compares
`sha256` with the hash recorded when the record was linked to a case.

## `GET /v1/records/{record_id}/custody`

Entries from the home custody log for this record, oldest first.

```json
{ "record_id": "finding.418",
  "entries": [
    { "at": "2026-11-01T12:05:00+00:00", "action": "accessed", "handler": "analyst@example.org",
      "record_id": "finding.418", "file_id": "1", "filename": "recording.mp4", "sha256": "5b1e…",
      "download": false, "prev": "<sha256 of the previous log line>" }
  ] }
```

---

## Reconcile (command line, on the Mac Studio)

```
python -m darknight_gateway reconcile --out ~/darknight-gateway/reconcile.csv --orphans
```

Read-only. For every file path in every collection it writes one CSV row:
`OK`, `MISSING`, `AMBIGUOUS` or `UNSAFE`, where it resolved and how, the
DarkNight hash, the manifest hash and whether the case manifest is timestamped.
`--orphans` adds evidence files under the DarkNight folder that no row points
at. Nothing is moved, renamed or written to DarkNight; fixing a path is a
decision for a person, recorded in DarkNight itself.
