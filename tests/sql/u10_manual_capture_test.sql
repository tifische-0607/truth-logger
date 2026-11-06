-- U10 Analyst browser capture (manual connector) — SQL checks
-- Part A (structure): RUN 6 Nov 2026 through the read-only database tool — passed.
--   A1 analyst_browser registry row: manual, requires certification, suspended ("Not certified · Not configured").
--   A2 RLS + append-only on manual_captures and manual_capture_vault_writes; authenticated cannot insert directly.
--   A3 Guards manual_captures_guard and mcvw_verify present; collector and requirement_id are NOT NULL.
--   A4 authenticated cannot call manual_capture_vault_write (vault/service role only); anon cannot call manual_capture_submit.
-- Part B (behaviour): NOT RUN — needs an analyst test account, an engagement with an active requirement and a certified,
--   configured, brief-approved analyst_browser connector.

SELECT key, status, source_kind, requires_certification FROM public.research_connectors WHERE key='analyst_browser';

BEGIN;
-- B1 manual_capture_submit(project, 'REQ-999', item) → 'No capture without an approved requirement ID: choose an active requirement from this engagement''s register.'
-- B2 Direct insert with collector = a client user → 'Every manual capture must name the analyst who collected it.'
-- B3 Connector not certified → 'Connector analyst_browser is not certified; collection refused.'
-- B4 Vault write with a different hash → row stored with verified = false, function returns
--    'Hash mismatch on vault write: the stored file does not match the hash taken at capture.'
-- B5 Vault write cannot claim verified = true: INSERT ... verified => true with a wrong hash → stored as false (mcvw_verify).
-- B6 Same (collector, client_ref) submitted twice → second call returns repeat = true, no new row.
ROLLBACK;
