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
{ "ok": true, "version": "gateway-0.1.0", "source_id": "darknight",
  "checks": { "database": true, "nas": true } }
```

## `GET /v1/status`

```json
{ "ok": true, "version": "gateway-0.1.0", "source_id": "darknight",
  "records": 18234, "nas_root_available": true, "signed_in_as": "analyst@example.org" }
```

## `GET /v1/search`

Query: `q` (matches original text, English text and handle), `platform`,
`item_type`, `date_from`, `date_to` (YYYY-MM-DD), `limit` (≤ 100, default 25),
`offset`.

```json
{
  "results": [
    {
      "record_id": "418",
      "record_code": "DN-TI-00418",
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
  "record_id": "418",
  "record_code": "DN-TI-00418",
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
      "available": true
    }
  ]
}
```

`sha256` is computed by the gateway from the file on the NAS (cached by size and
modification time). `sha256_stored` is DarkNight's own hash, when it keeps one.
`available: false` means the file is missing or its path is outside the share.

## `GET /v1/records/{record_id}/files/{file_id}`

Streams the file (range requests work, so video seeks). `?download=1` sends it
as an attachment. Headers:

```
Content-Type: video/mp4
X-Evidence-SHA256: <sha256 computed now>
X-Evidence-Stored-SHA256: <DarkNight's hash, if any>
Cache-Control: no-store
```

The hub re-hashes the bytes it receives and compares them with the hash stored
in the case reference before it shows or exports them.

## `POST /v1/records/{record_id}/rehash`

Re-hashes every file of the record from the NAS (bypassing the cache).

```json
{ "record_id": "418",
  "results": [
    { "file_id": "1", "filename": "recording.mp4", "sha256": "5b1e…", "status": "MATCH" },
    { "file_id": "2", "filename": "frame_0012.png", "sha256": "a77d…", "status": "NO_BASELINE" },
    { "file_id": "3", "filename": "comments.json", "sha256": null, "status": "MISSING" }
  ] }
```

`status` compares with DarkNight's stored hash: `MATCH`, `MISMATCH`,
`NO_BASELINE` (DarkNight keeps none) or `MISSING`. The hub separately compares
`sha256` with the hash recorded when the record was linked to a case.

## `GET /v1/records/{record_id}/custody`

Entries from the home custody log for this record, oldest first.

```json
{ "record_id": "418",
  "entries": [
    { "at": "2026-11-01T12:05:00+00:00", "action": "accessed", "handler": "analyst@example.org",
      "record_id": "418", "file_id": "1", "filename": "recording.mp4", "sha256": "5b1e…",
      "download": false, "prev": "<sha256 of the previous log line>" }
  ] }
```
