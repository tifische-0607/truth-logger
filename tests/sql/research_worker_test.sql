-- Phase 5 worker API checks. Run as service_role inside a transaction against an engagement fixture
-- whose G1 and G2 are signed (set :plan to a started plan of that engagement, :vault to its home-vault source).
-- All rows are labelled Sample and rolled back.
BEGIN;
-- 1. vault online, then claim is idempotent on plan hash and cycle
SELECT public.research_report_vault(:'vault', true, 'Sample');
SELECT public.research_submit_job(:'plan', 'monitor', 'facebook', NULL, '{}', 'SAMPLE-JOB-1') ->> 'status' = 'queued' AS job_queued;
SELECT (public.research_claim_job(NULL, NULL) -> 'job' ->> 'run_id') AS run \gset
SELECT (public.research_claim_job(NULL, NULL) -> 'job' ->> 'run_id') = :'run' AS claim_repeat_same_run;
-- 2. a refusal appears: out-of-list platform is quarantined and logged
SELECT public.research_submit_capture_std(:'run', '{"connector":"socialcrawl","connector_version":"1","item_ref":"SAMPLE-BAD","platform":"myspace","item_type":"post","language":"en","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","fstd001_version":"V2","requirement_ref":"R1","collector":"Sample","captured_at_utc":"2026-11-03T10:00:00Z","source":"facebook"}') ->> 'status' = 'refused' AS bad_platform_refused;
SELECT count(*) = 1 AS refusal_logged FROM public.research_refusals WHERE run_id = :'run';
SELECT count(*) = 0 AS nothing_stored FROM public.research_captures WHERE item_ref = 'SAMPLE-BAD';
-- 3. valid capture recorded; delivery blocked until counts match
SELECT (public.research_submit_capture_std(:'run', '{"connector":"socialcrawl","connector_version":"1","item_ref":"SAMPLE-1","platform":"facebook","item_type":"post","language":"ms","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","fstd001_version":"V2","requirement_ref":"R1","collector":"Sample","captured_at_utc":"2026-11-03T10:00:00Z","source":"facebook"}') ->> 'capture_id') AS cap \gset
SELECT public.research_report_run(:'run', 'delivered') ->> 'status' = 'refused' AS delivery_blocked;
SELECT public.research_report_vault_write(:'cap', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc') ->> 'status' = 'refused' AS hash_mismatch_refused;
SELECT public.research_report_vault_write(:'cap', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') ->> 'status' = 'verified' AS vault_verified;
SELECT public.research_report_run(:'run', 'delivered') ->> 'status' = 'delivered' AS delivered_when_counts_match;
-- 4. repeated rejections suspend the connector
SELECT public.research_submit_capture_std(:'run', jsonb_build_object('connector','socialcrawl','connector_version','1','item_ref','SAMPLE-X'||g,'platform','nope')) FROM generate_series(1,5) g;
SELECT status = 'suspended' AS connector_suspended FROM public.research_connectors WHERE key = 'socialcrawl';
ROLLBACK;
-- 5. the browser cannot write capture events (run as any role):
SELECT NOT has_table_privilege('authenticated', 'public.research_events', 'INSERT')
   AND NOT has_table_privilege('authenticated', 'public.research_captures', 'INSERT')
   AND NOT has_function_privilege('authenticated', 'public.research_submit_capture_std(uuid,jsonb)', 'EXECUTE')
   AND NOT has_function_privilege('authenticated', 'public.research_report_run(uuid,text,int)', 'EXECUTE') AS browser_cannot_write_captures;
