# U3 evidence move: DarkNight gateway contract (receive, re-hash, report)

Status: defined, not connected. The secure route to DarkNight (decision C2) is undecided, so the portal's
`darknight_route.gateway_url` is unset and every screen shows **"DarkNight gateway not connected"**. Tests use the
in-memory fake gateway in `src/lib/darknight.ts` (`FakeDarkNight`); no outside host is contacted.

Covers plan steps 1-5 of `u3-evidence-move-plan.md`. Step 6 (removing cloud copies) is **not** part of this contract
and waits for the owner's separate written approval.

## Common rules

- Base URL: `darknight_route.gateway_url` (clean HTTPS, no user info, query or fragment). Paths are under `/v1/`.
- Every call carries `Authorization: Bearer <portal session token>`; the gateway validates it against the portal's
  auth before acting. Requests are sent with `credentials: omit`, `redirect: error`, `cache: no-store`.
- Paths are the artefact's existing folder path: `CASE-{case}/INC-{inc}_{YYYY-MM-DD}/FB_@{handle}/POST-{id}/[CMT-0001/]artefacts/{file}`.
  Allowed characters `A-Z a-z 0-9 . _ / @ -`; no `..`, no `//`.
- SHA-256 values are 64 lowercase hex characters.
- The gateway never overwrites: an existing file at a path is kept and its hash reported (or 409 for outputs).
- Any network failure, timeout or non-2xx status is shown to people as **"Temporarily unavailable, please try again later"**.

## 1. Receive an artefact (step 2)

`POST /v1/evidence-move/receive`

```json
{ "path": "CASE-2026-014/INC-03_2026-09-21/FB_@contoh/POST-123/artefacts/live_post.png",
  "source_url": "<read-only signed link to the cloud original, valid 300 s>",
  "expected_sha256": "<recorded artefact hash>" }
```

The gateway downloads the bytes itself from `source_url` (the portal does not stream file bytes), stores them under
`path`, and re-hashes what it stored. The cloud original is only read, never changed or deleted.

Response `200`: `{ "path": "<same path>", "sha256": "<hash DarkNight computed from the stored file>" }`.
The gateway reports its own hash even when it differs from `expected_sha256`; it does not judge.

## 2. Verify and record (steps 3-4)

The portal passes DarkNight's reported hash to `evidence_move_record(run, artefact, path, got_sha256, unavailable)`.
The database, not the screen, decides:

- `verified` only when the reported hash equals the artefact's recorded SHA-256 (also a table check constraint);
  it then adds one append-only custody event `transferred` with notes `Transferred to DarkNight: darknight:/<path> ...`.
- `mismatch` otherwise. The first mismatch stops the whole run: every later record in that run is refused with
  `This move was stopped by a hash mismatch on <file> (<id>) ...`, and the Vaults page names the artefact.
- `unavailable` when the gateway could not be reached; nothing is verified and the artefact keeps reading from the cloud.

## 3. Read a moved artefact (step 5)

`GET /v1/evidence/{path}` -> raw bytes. The browser re-hashes them; a mismatch blocks the file.
Only artefacts with a `verified` result are read here; all others keep reading from the cloud and show "Not yet moved".

## 4. Engagement outputs

`PUT /v1/outputs/projects/{project_id}/outputs/{output_id}/{sha256}/{file}` with the bytes and
`X-Expected-SHA256`. Response `200 { "path", "sha256" }` (hash DarkNight computed); `409` if the path already holds a file.
The portal records `home_path` and `sha256` only when the reported hash matches. Read back with
`GET /v1/outputs/{same path}` and re-hash. Cloud storage locations for outputs are refused by the database.

## Not enforced by the database (and why)

- That DarkNight really computed the hash it reports: the portal can only compare what the gateway returns. The
  gateway's own custody log is the second witness.
- The browser of the owner orchestrates the move; a tampered browser could report a hash. The record function is
  owner-only and every result is append-only, so any such report stays visible.
