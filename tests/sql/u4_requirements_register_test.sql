-- U4 remainder: requirements register checks (migrations 0033, 0034).
-- Part A runs as any role (structure and privileges) — RUN 5 Nov 2026, all passed.
-- Part B needs a fixture engagement with G0, G1, G2 signed, a drafted plan (:plan), a running run (:run)
-- and a member user (:lead, engagement lead) — NOT RUN: test access cannot impersonate signed-in users or sign gates.
-- Every Part B row is labelled Sample and rolled back.

-- ===== Part A (run) =====
SELECT count(*) = 3 AS append_only_and_guard_triggers FROM pg_trigger
  WHERE tgname IN ('research_requirements_append_only','research_register_marks_append_only','research_captures_requirement');
SELECT bool_and(relrowsecurity) AS rls_on FROM pg_class WHERE relname IN ('research_requirements','research_register_marks');
SELECT NOT has_table_privilege('authenticated','public.research_requirements','INSERT')
   AND NOT has_table_privilege('authenticated','public.research_register_marks','INSERT') AS browser_cannot_insert_directly;
SELECT NOT has_function_privilege('anon','public.research_add_requirement(uuid,text,text[],text[],text[],date,date,text,int,text)','EXECUTE') AS anon_cannot_add;
SELECT NOT has_function_privilege('authenticated','public.research_submit_capture_std(uuid,jsonb)','EXECUTE') AS only_worker_submits;
SELECT (SELECT prosrc LIKE '%research_register_complete%' FROM pg_proc WHERE proname='research_block_reason')
   AND (SELECT prosrc LIKE '%research_off_register%' FROM pg_proc WHERE proname='research_submit_capture_std') AS rules_wired;

-- ===== Part B (not run) =====
BEGIN;
SET LOCAL role authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub', :'lead')::text, true);
-- B1 a requirement outside the signed brief is refused (plain message)
SELECT public.research_add_requirement(:'project', 'tiktok', ARRAY['@sample'], '{}', ARRAY['ms'], '2026-01-01', '2026-01-31', 'Sample basis');
--   expect: "Platform tiktok is not in the signed brief (brief vN lists: ...)" when the brief omits TikTok
-- B2 start refused while the register is incomplete
SELECT public.research_start_plan(:'plan');
--   expect: "Research cannot start until the requirements register is marked complete"
-- B3 add, mark complete, start allowed
SELECT public.research_add_requirement(:'project', 'facebook', ARRAY['Sample Page'], ARRAY['sample'], ARRAY['ms','en'], :'from', :'to', 'Sample: CMA 1998 s.233 complaint');
SELECT public.research_mark_register(:'project', true, NULL);
SELECT (public.research_register_status(:'project') ->> 'complete')::boolean AS register_complete;
-- B4 editing a requirement after completion re-opens the register automatically
SELECT public.research_add_requirement(:'project', 'facebook', ARRAY['Sample Page 2'], '{}', ARRAY['ms'], :'from', :'to', 'Sample', 1, 'Sample change');
SELECT NOT (public.research_register_status(:'project') ->> 'complete')::boolean AS edit_reopens;
-- B5 append-only
UPDATE public.research_requirements SET legal_basis = 'x' WHERE project_id = :'project';  -- expect refusal
RESET role;
-- B6 worker: off-register refused and logged; malformed refused and logged; on-register stored with full provenance
SET LOCAL role service_role;
SELECT public.research_mark_register(:'project', true, NULL);  -- (as lead in practice)
SELECT public.research_submit_capture_std(:'run', '{"connector":"socialcrawl","connector_version":"1","item_ref":"SAMPLE-OFF","platform":"facebook","item_type":"post","language":"ms","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","fstd001_version":"V2","requirement_ref":"REQ-999","collector":"Sample","captured_at_utc":"2026-11-05T04:00:00Z","source":"facebook"}') ->> 'reason'
  LIKE 'Off-register collection refused:%' AS off_register_refused;
SELECT public.research_submit_capture_std(:'run', '{"connector":"socialcrawl","connector_version":"1","item_ref":"SAMPLE-BAD","platform":"facebook"}') ->> 'status' = 'refused' AS malformed_refused;
SELECT count(*) >= 2 AS both_logged FROM public.research_refusals WHERE run_id = :'run' AND request->>'item_ref' IN ('SAMPLE-OFF','SAMPLE-BAD');
SELECT (public.research_submit_capture_std(:'run', '{"connector":"socialcrawl","connector_version":"1","item_ref":"SAMPLE-OK","platform":"facebook","item_type":"post","language":"ms","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","fstd001_version":"V2","requirement_ref":"REQ-001","collector":"Sample","captured_at_utc":"2026-11-05T04:00:00Z","source":"facebook"}') ->> 'darknight_path') LIKE 'SAMPLE-FA-STD-001/%' AS sample_name_returned;
SELECT requirement_id IS NOT NULL AND connector_key IS NOT NULL AND connector_version IS NOT NULL AND collector IS NOT NULL
   AND captured_at_utc IS NOT NULL AS full_provenance FROM public.research_captures WHERE item_ref = 'SAMPLE-OK';
-- B7 a direct insert without a requirement is refused
INSERT INTO public.research_captures (run_id, project_id, item_ref, source, sha256_at_capture, fstd001_version)
  VALUES (:'run', :'project', 'SAMPLE-DIRECT', 'facebook', repeat('c',64), 'V2');  -- expect "Every collected item must link to a requirement ID"
-- B8 a test adapter is only a registry row: no code change
INSERT INTO public.research_connectors (key, name, version, platforms) VALUES ('sample_test_adapter', 'Sample test adapter', '0', ARRAY['facebook']);
SELECT public.research_submit_capture_std(:'run', '{"connector":"sample_test_adapter","connector_version":"0","item_ref":"SAMPLE-TA","platform":"facebook","item_type":"post","language":"ms","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","fstd001_version":"V2","requirement_ref":"REQ-001","collector":"Sample","captured_at_utc":"2026-11-05T04:00:00Z","source":"facebook"}') ->> 'status' = 'recorded' AS test_adapter_works;
ROLLBACK;
