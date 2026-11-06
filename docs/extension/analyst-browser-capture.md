# U10 Analyst browser capture: extension specification and intake contract

The browser extension is built **outside Lovable**. The portal provides only the manual connector registry row (`analyst_browser`), the intake contract below, and the database rules. It is a manual connector held to the same rules as every other connector (see `docs/connectors/connector-design-standard.md`). It cannot collect until it is certified, configured and approved in the engagement's signed brief.

## Analyst flow
1. Sign in with the analyst's own portal account. The extension uses that session; it has no shared key.
2. Choose an engagement, then an **active requirement ID** from that engagement's register (`REQ-NNN`). The capture button stays disabled until both are chosen.
3. One click saves:
   - the page (MHTML or WARC)
   - a full-page screenshot (PNG)
   - the URL
   - the capture time in UTC
4. The extension computes SHA-256 for each artefact and for the URL **at capture, before upload**.
5. Optional: a session log of every page visited (time and URL), hashed as one file.

## Where things go
- **Artefacts** (page, screenshot, session log, and the URL in clear) are uploaded straight to DarkNight, never to the cloud.
- **The portal** receives only hashes and references through `manual_capture_submit`:

```
rpc manual_capture_submit(_project uuid, _requirement_code text, _item jsonb)
_item = {
  "client_ref": "ext-<unique id per capture>",     // identifier, used to make retries safe
  "extension_version": "<must equal the registered connector version>",
  "captured_at_utc": "2026-11-06T08:00:00Z",
  "url_sha256": "<64 hex>",
  "page_sha256": "<64 hex>",
  "screenshot_sha256": "<64 hex>",
  "session_log_sha256": "<64 hex>" | null,
  "session_pages": 12 | null
}
→ { "status": "quarantine", "capture_id": "<uuid>", "repeat": false }
```
Every database refusal comes back word for word, and the extension must show it unchanged.

## Vault write (DarkNight → portal, service role)
`manual_capture_vault_write(capture_id, 'page'|'screenshot'|'session_log', sha256_recomputed_by_vault, darknight_path)`

- The database compares the vault's hash with the hash taken at capture and sets `verified` itself; the writer cannot assert it.
- A mismatch is recorded and returned as "Hash mismatch on vault write: the stored file does not match the hash taken at capture."

## Rules enforced by the database
- No capture without an active requirement ID from the engagement's register.
- Every capture names its analyst. The collector is the signed-in analyst, and must be staff, not a client.
- The connector must be certified for this extension version, configured, and approved in the engagement's signed brief.
- Capture times must be given in UTC and must not be in the future.
- Captures are append-only and start in `quarantine`, and vault writes are append-only.

## Not built here
- The extension itself.
- Moving a quarantined manual capture into the standard validation queue: this follows the same `research_submit_capture_std` rules once a research run for manual capture exists.
