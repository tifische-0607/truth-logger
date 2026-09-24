# FB Evidence Monitor — Worker API

Endpoints the Mac mini worker calls. They are plain HTTP routes on the app itself
(not user-session endpoints), authenticated with a bearer token.

## Base URLs

| Environment | Base URL |
| --- | --- |
| Preview (latest build) | `https://project--a91d8941-73a8-4bf1-b81c-478687c7171c-dev.lovable.app` |
| Production (published) | `https://project--a91d8941-73a8-4bf1-b81c-478687c7171c.lovable.app` |

All paths below are relative to the base URL.

## Authentication

Every request must send:

```
Authorization: Bearer <WORKER_TOKEN>
Content-Type: application/json
```

`WORKER_TOKEN` is stored as a project secret. A wrong or missing token returns
`401 {"error":"Unauthorized"}`.

All endpoints are `POST`. All responses are JSON. Errors use
`{"error":"<message>"}` with status `400` (bad input), `401` (bad token),
`409` (conflict) or `500` (server/database failure).

---

## 1. `POST /api/public/worker-heartbeat`

Records that the worker is alive. Call once a minute; the UI shows "Worker online"
when the last heartbeat is under 2 minutes old.

**Request**

```json
{
  "version": "worker-1.4.2",
  "hostname": "macmini.local",
  "info": {
    "queue_depth": 0,
    "os": "macOS 15.3",
    "boot_time": "2026-09-20T21:44:03Z",
    "uptime_seconds": 191661
  }
}
```

All fields optional; an empty body `{}` is accepted. `info` is free-form and shown
on the Worker dashboard; the built-in worker reports `boot_time` (ISO 8601 UTC) and
`uptime_seconds` from macOS `kern.boottime` each heartbeat.

**Response `200`**

```json
{ "ok": true, "last_seen": "2026-09-23T06:12:44.118Z" }
```

---

## 2. `POST /api/public/worker-claim`

Atomically claims the oldest `queued` job and flips it to `running`. Safe to poll;
concurrent callers never get the same job.

**Request**

```json
{}
```

**Response `200` (job available)**

```json
{
  "job": {
    "id": "0f0d2bd4-1c1e-4a6e-9a58-2f2f1d8f1b77",
    "url": "https://www.facebook.com/example/posts/123456789",
    "case_id": "2026-014",
    "incident_id": "03",
    "incident_date": "2026-09-21",
    "handler": "M. Hafidz",
    "options": {
      "max_comments": 500,
      "live_comment_limit": 100,
      "include_replies": true,
      "live_screenshots": true,
      "rendered_sheets": true,
      "archive": true,
      "translate": true,
      "download_media": true,
      "recapture": false
    },
    "case_meta": {
      "target_of_complaint": "Page: Contoh Halaman",
      "offence_alleged": "CMA 1998 s.233",
      "jurisdiction_agency": "MCMC",
      "lead_handler": "M. Hafidz"
    },
    "incident_meta": { "start_date": "2026-09-21", "summary": "Coordinated posts" },
    "status": "running",
    "log": [],
    "warnings": [],
    "created_by": "6f2f…",
    "claimed_at": "2026-09-23T06:13:02.441Z",
    "finished_at": null,
    "result": null,
    "created_at": "2026-09-23T06:10:55.002Z",
    "updated_at": "2026-09-23T06:13:02.441Z"
  },
  "settings": {
    "fb_account_label": "investigations@fridayanalytics.org",
    "proxy_url": null,
    "timeout_seconds": 180,
    "expand_comments": true,
    "save_pdf": true,
    "notes": null
  }
}
```

`settings` is the workspace-wide capture setup (`public.capture_settings`, row `default`),
returned on every claim — including when `job` is `null`. It never contains credentials;
the Facebook session stays on the Mac mini. Apply `proxy_url` to the browser launch,
`timeout_seconds` as the per-capture deadline, and `expand_comments` / `save_pdf` as
capture toggles. Per-job `options` override these when both are present.

```json
{ "job": null, "settings": { "timeout_seconds": 180 } }
```

**Response `200` (queue empty)**

```json
{ "job": null }
```

---

## 3. `POST /api/public/worker-log`

Appends lines to a job's live log. The Job screen streams these in real time.
Appends only — nothing is ever replaced.

**Request**

```json
{
  "job_id": "0f0d2bd4-1c1e-4a6e-9a58-2f2f1d8f1b77",
  "lines": ["Opened browser profile", "Loaded post, 412 comments visible"],
  "warnings": ["Comment CMT-0233 has no permalink; recorded without URL"]
}
```

`lines` and `warnings` are both optional arrays of strings.

**Response `200`**

```json
{ "ok": true, "appended": 3 }
```

---

## 4. `POST /api/public/worker-upload-url`

Returns a signed upload URL for the private `evidence` bucket. Refuses to
overwrite an object that already exists at that path.

**Request**

```json
{
  "path": "CASE-2026-014/INC-03_2026-09-21/FB_@contoh/POST-123456789/artefacts/live_post.png",
  "content_type": "image/png"
}
```

**Response `200`**

```json
{
  "bucket": "evidence",
  "path": "CASE-2026-014/INC-03_2026-09-21/FB_@contoh/POST-123456789/artefacts/live_post.png",
  "token": "eyJhbGciOi…",
  "signed_url": "https://…/storage/v1/object/upload/sign/evidence/CASE-2026-014/…?token=eyJ…",
  "content_type": "image/png",
  "expires_in": 7200
}
```

Upload the bytes with a plain `PUT` to `signed_url`:

```
PUT <signed_url>
Content-Type: image/png
<binary body>
```

(Equivalently, `supabase.storage.from('evidence').uploadToSignedUrl(path, token, file)`.)

**Response `409` (already exists)**

```json
{ "error": "Object already exists; refusing to overwrite", "path": "CASE-2026-014/…/live_post.png" }
```

---

## 5. `POST /api/public/worker-ingest`

Writes the whole capture into the database in one call: case, incident, account
(+ one new snapshot), items, subject profiles, artefacts and custody events.

Cases, incidents, accounts and items are **upserted**. Account snapshots,
artefacts and custody events are **insert-only** — the database physically blocks
updates and deletes on artefacts and custody events.

Items are inserted parents-first; link children with `parent_item_code`
(the parent's `item_code`, not a UUID).

After inserting, the function downloads every newly inserted artefact from
storage, recomputes its SHA-256 and writes a `transferred` custody event with the
note `uploaded from Mac mini worker, hash MATCH` / `MISMATCH` / `MISSING`.

**Request**

```json
{
  "job_id": "0f0d2bd4-1c1e-4a6e-9a58-2f2f1d8f1b77",
  "records": {
    "case": {
      "id": "2026-014",
      "opened_on": "2026-09-21",
      "target_of_complaint": "Page: Contoh Halaman",
      "offence_alleged": "CMA 1998 s.233",
      "jurisdiction_agency": "MCMC",
      "lead_handler": "M. Hafidz",
      "status": "open",
      "related_cases": ["2026-009"],
      "notes": "Referred by complainant on 21 Sep."
    },
    "incident": {
      "incident_id": "03",
      "start_date": "2026-09-21",
      "end_date": "2026-09-22",
      "narrative_themes": ["defamation", "harassment"],
      "escalation_stage": "amplification",
      "summary": "Post and comment thread naming the complainant."
    },
    "account": {
      "platform": "FB",
      "handle": "contoh.halaman",
      "display_name": "Contoh Halaman",
      "profile_url": "https://www.facebook.com/contoh.halaman",
      "platform_id": "100064xxxxxxxxx"
    },
    "account_snapshot": {
      "display_name": "Contoh Halaman",
      "followers": 18422,
      "following": 31,
      "verified": false,
      "bio_verbatim": "Berita dan pandangan.",
      "created": "2019-04-11",
      "captured_at": "2026-09-23T06:14:10.000Z"
    },
    "items": [
      {
        "item_code": "POST-123456789",
        "item_type": "post",
        "parent_item_code": null,
        "url": "https://www.facebook.com/contoh.halaman/posts/123456789",
        "platform_item_id": "123456789",
        "author_name": "Contoh Halaman",
        "author_handle": "contoh.halaman",
        "author_url": "https://www.facebook.com/contoh.halaman",
        "published_at": "2026-09-21T14:02:00.000Z",
        "text_original": "Teks asal siaran…",
        "text_en": "Original post text…",
        "translator_statement": "Machine translation reviewed by the handler on 23 Sep 2026.",
        "engagement": { "reactions": 412, "comments": 87, "shares": 51 },
        "captured_at": "2026-09-23T06:14:10.000Z",
        "folder_path": "CASE-2026-014/INC-03_2026-09-21/FB_@contoh.halaman/POST-123456789",
        "subject_profile": {
          "subject_type": "poster",
          "stated": {
            "bio": "Berita dan pandangan.",
            "location_tag": "Kuala Lumpur",
            "stated_affiliation": "none stated",
            "listed_language": "Bahasa Melayu"
          },
          "observed": {
            "posting_language": "Bahasa Melayu",
            "posting_time_pattern": "20:00–23:00 MYT",
            "account_created": "2019-04-11",
            "follower_following_ratio": 594.3,
            "verified": false
          },
          "insufficient_data": false
        },
        "artefacts": [
          {
            "filename": "live_post.png",
            "kind": "screenshot",
            "storage_path": "CASE-2026-014/INC-03_2026-09-21/FB_@contoh.halaman/POST-123456789/artefacts/live_post.png",
            "sha256": "9f2c…64 hex chars…",
            "size_bytes": 482113,
            "mime_type": "image/png",
            "captured_at": "2026-09-23T06:14:10.000Z"
          }
        ],
        "custody_events": [
          {
            "filename": "live_post.png",
            "sha256": "9f2c…",
            "action": "captured",
            "handler": "M. Hafidz",
            "tool_version": "worker-1.4.2",
            "notes": "Captured live in Safari on macOS 15.3"
          }
        ]
      },
      {
        "item_code": "CMT-0001",
        "item_type": "comment",
        "parent_item_code": "POST-123456789",
        "author_name": "Ali bin Abu",
        "text_original": "Komen asal…",
        "text_en": "Original comment…",
        "engagement": { "reactions": 22, "replies": 3 },
        "artefacts": [],
        "custody_events": []
      },
      {
        "item_code": "CMT-0001-R01",
        "item_type": "reply",
        "parent_item_code": "CMT-0001",
        "author_name": "Siti Nor",
        "text_original": "Balasan asal…"
      }
    ]
  }
}
```

Field notes:

- `action` on custody events must be one of `captured`, `accessed`, `transferred`,
  `exported`, `re-hashed`.
- `item_type` must be `post`, `comment` or `reply`.
- `stated` / `observed` are free-form JSON. **Never** send inferred ethnicity,
  religion, political leaning or age — those are not part of the model.
- Analyst opinions are a separate table and are not accepted here.

**Response `200`**

```json
{
  "ok": true,
  "job_id": "0f0d2bd4-1c1e-4a6e-9a58-2f2f1d8f1b77",
  "case_id": "2026-014",
  "incident_uuid": "7c41…",
  "account_id": "b21e…",
  "item_id": "3a90…",
  "items": {
    "POST-123456789": "3a90…",
    "CMT-0001": "5f12…",
    "CMT-0001-R01": "8d77…"
  },
  "artefacts_inserted": 1,
  "verification": [
    { "filename": "live_post.png", "result": "MATCH", "sha256": "9f2c…" }
  ]
}
```

`verification[].result` is `MATCH`, `MISMATCH`, `MISSING` (no object at that
storage path) or `RECORDED` (no `sha256` was supplied, so the computed one was
recorded without comparison).

**Response `400` / `500`**

```json
{ "error": "item CMT-0001: duplicate key value violates unique constraint" }
```

---

## 5b. `POST /api/public/worker-transcribe`

Machine transcript of a reel/video audio track. Called by the worker when the URL is a
reel/video (disable with `options.transcript = false`).

Request: `{ "job_id": "uuid", "audio_base64": "<mp3 bytes, base64, max ~20 MB>", "format": "mp3" }`

Response 200:
```json
{ "model": "google/gemini-2.5-flash", "language": "Malay, English", "has_speech": true,
  "transcript_original": "[00:03] ...verbatim...", "transcript_en": "[00:03] ...English..." }
```
Errors: 400 missing fields, 413 too large, 402/429 AI limits, 502 AI error.

The worker saves these artefacts (each hashed, with custody events via ingest):
`reel_audio.m4a` (kind `audio_original`, the original audio from yt-dlp),
`transcript_original.txt` (kind `transcript_original`) and `transcript_en.txt`
(kind `transcript_en`). Both text files start with the statement
"MACHINE TRANSCRIPT – … Not verified by a human …"; the compressed mp3 sent for
transcription is a working copy and is never uploaded.

## 6. `POST /api/public/worker-complete`

Marks the job finished.

**Request**

```json
{
  "job_id": "0f0d2bd4-1c1e-4a6e-9a58-2f2f1d8f1b77",
  "status": "done",
  "result": {
    "item_id": "3a90…",
    "items_captured": 89,
    "artefacts": 214,
    "duration_seconds": 372
  }
}
```

`status` must be `done` or `failed`. Put `item_id` in `result` — the Job screen
links straight to that evidence item when it is present.

**Response `200`**

```json
{ "ok": true, "job_id": "0f0d2bd4-1c1e-4a6e-9a58-2f2f1d8f1b77", "status": "done" }
```

---

## Suggested worker loop

```
every 60s:  POST /api/public/worker-heartbeat
loop:
  job = POST /api/public/worker-claim
  if job is null: sleep 5s; continue
  POST /api/public/worker-log            (as work progresses)
  for each file:
    POST /api/public/worker-upload-url   -> PUT bytes to signed_url
  POST /api/public/worker-ingest         (once, with the whole record tree)
  POST /api/public/worker-complete
```

## Folder layout for `storage_path`

```
CASE-<case id>/INC-<incident id>_<incident date>/FB_@<handle>/<ITEM-CODE>/artefacts/<filename>
```

Example:

```
CASE-2026-014/INC-03_2026-09-21/FB_@contoh.halaman/POST-123456789/artefacts/live_post.png
```

### Live-stream jobs

`options.mode = "live"` asks the worker to record a live video feed instead of a post capture.
Extra options: `live_max_minutes` (int, default 30, max 240) and `live_segment_seconds`
(int, default 60, min 15). Artefact kinds produced: `screenshot` (live_start.png, live_end.png),
`live_video_segment` (video/mp4, one per segment), `live_recording_log` (text/plain), `link`.
Ingest payload shape is unchanged: one `post` item whose `text_original` is
`"[Live stream recording] <page title>"`.


## Author profile capture (worker 1.1)

When the post author's link is found, the worker opens that profile (option `capture_profile`, default true) and saves two extra artefacts on the post item: `profile_screenshot` (profile_page.png) and `profile_extract` (profile_stated.json). The profile's publicly stated fields fill `account.display_name/profile_url/platform_id`, `account_snapshot.followers/following/verified/bio_verbatim`, and the poster's `subject_profile.stated` (display_name, handle, profile_url, platform_id, verified, followers, following, likes, bio_verbatim, intro_stated). The handle now comes from the author's profile link, not the post link. Commenters get `author_handle` and stated handle/profile_url from their own links. PDPA: stated intro lines or bios mentioning religion, politics, ethnicity, birth date or age are dropped; nothing is inferred.

### Profile privacy (`settings.profile_fields`)
`/worker-claim` returns `settings.profile_fields`: `{ "<field>": { "keep": bool, "reason": string } }`. Fields: profile_screenshot, platform_id, verified, followers, following, likes, bio_verbatim, intro_stated. When `keep` is false the worker never stores that field (screenshot not taken) and logs the drop with its reason. display_name and profile_url are always kept.
