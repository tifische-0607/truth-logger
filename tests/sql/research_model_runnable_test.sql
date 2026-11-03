BEGIN;
INSERT INTO public.clients(id, code, name) VALUES ('00000000-0000-4000-a000-000000000001', 'SAMPLE-RES', 'Sample research client');
INSERT INTO public.projects(id, client_id, code, name) VALUES ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'SAMPLE-RES-1', 'Sample research engagement');
DO $$ BEGIN
  INSERT INTO public.research_plans(engagement_id, cycle, design_version, brief_version, lexicon_version, approved_sources, job_types, window_from, window_to, cadence)
  VALUES ('00000000-0000-4000-a000-000000000002', 0, 0, 0, 'x', ARRAY['facebook'], ARRAY['monitor'], '2026-01-01', '2026-01-31', 'Sample');
  RAISE NOTICE 'FAIL plan blocked before G1/G2';
EXCEPTION WHEN others THEN RAISE NOTICE 'PASS plan blocked before mandate/design: %', SQLERRM; END $$;
SELECT CASE WHEN NOT has_function_privilege('authenticated','public.research_submit_capture(uuid,text,text,text,text[],text,text,uuid,uuid,jsonb)','EXECUTE') THEN 'PASS browser cannot submit captures' ELSE 'FAIL' END;
SELECT CASE WHEN NOT has_function_privilege('authenticated','public.research_submit_job(uuid,text,text,text,text[],text)','EXECUTE') THEN 'PASS browser cannot submit jobs' ELSE 'FAIL' END;
SELECT CASE WHEN NOT has_table_privilege('authenticated','public.research_runs','INSERT') AND NOT has_table_privilege('authenticated','public.research_captures','UPDATE') THEN 'PASS browser cannot write runs or captures' ELSE 'FAIL' END;
SELECT 'RLS ' || string_agg(relname||'='||relrowsecurity, ', ') FROM pg_class WHERE relname LIKE 'research\_%' AND relkind='r';
ROLLBACK;
