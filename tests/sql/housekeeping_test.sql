-- Part A: RUN through the read-only database tool, passed 8 Nov 2026.
SELECT relrowsecurity FROM pg_class WHERE oid='public.housekeeping_deletions'::regclass;
SELECT policyname, permissive, cmd FROM pg_policies WHERE policyname IN ('Hide deleted projects','Hide deleted capture jobs','SuperAdmins read deletion history');
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'housekeeping%';
SELECT has_function_privilege('anon','public.housekeeping_delete(text,uuid,text)','execute') AS anon_delete,
 has_function_privilege('authenticated','public.housekeeping_delete(text,uuid,text)','execute') AS authenticated_delete;

-- Part B: rollback-only behavioral checks; run on a privileged test connection.
-- No original evidence/files are touched. Test uses existing active owner identity.
BEGIN;
DO $$ DECLARE u uuid; j uuid; d uuid; n integer; BEGIN
 SELECT user_id INTO u FROM public.account_access WHERE level='superadmin' AND status='active' LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'Active SuperAdmin test fixture needed'; END IF;
 INSERT INTO public.capture_jobs(url,status,created_by) VALUES ('https://example.invalid/housekeeping-test','failed',u) RETURNING id INTO j;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.housekeeping_delete('capture_job',j,'test'); RAISE EXCEPTION 'B1 FAILED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only a SuperAdmin can delete projects or capture jobs.' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 UPDATE public.capture_jobs SET status='running' WHERE id=j;
 BEGIN PERFORM public.housekeeping_delete('capture_job',j,'test'); RAISE EXCEPTION 'B2 FAILED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Stop the running capture job before deleting it.' THEN RAISE; END IF; END;
 UPDATE public.capture_jobs SET status='failed' WHERE id=j;
 d := public.housekeeping_delete('capture_job',j,'housekeeping fixture');
 IF NOT public.housekeeping_is_deleted('capture_job',j) THEN RAISE EXCEPTION 'B3 FAILED'; END IF;
 SELECT count(*) INTO n FROM public.capture_jobs WHERE id=j;
 IF n<>1 THEN RAISE EXCEPTION 'B4 FAILED: original erased'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.account_admin_events WHERE action='housekeeping_deleted' AND detail->>'record_id'=j::text AND actor=u AND detail->>'reason'='housekeeping fixture') THEN RAISE EXCEPTION 'B5 FAILED: audit missing'; END IF;
 BEGIN UPDATE public.housekeeping_deletions SET reason='changed' WHERE id=d; RAISE EXCEPTION 'B6 FAILED: audit changed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='B6 FAILED: audit changed' THEN RAISE; END IF; END;
 BEGIN PERFORM public.housekeeping_delete('capture_job',j,'again'); RAISE EXCEPTION 'B7 FAILED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'This record has already been deleted.' THEN RAISE; END IF; END;
END $$;
-- B8: authenticated SELECT sees no deleted capture-job row.
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.capture_jobs WHERE url='https://example.invalid/housekeeping-test') THEN RAISE EXCEPTION 'B8 FAILED'; END IF; END $$;
RESET ROLE;
DO $$ DECLARE u uuid; c uuid; p uuid; BEGIN
 SELECT user_id INTO u FROM public.account_access WHERE level='superadmin' AND status='active' LIMIT 1;
 SELECT id INTO c FROM public.clients LIMIT 1;
 IF c IS NULL THEN RAISE EXCEPTION 'Client test fixture needed'; END IF;
 INSERT INTO public.projects(client_id,code,name,created_by) VALUES(c,'HOUSEKEEPING-TEST-'||gen_random_uuid()::text,'Housekeeping fixture',u) RETURNING id INTO p;
 PERFORM public.housekeeping_delete('project',p,'rollback fixture');
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p) OR NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=p) THEN RAISE EXCEPTION 'B9 FAILED: original or membership removed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_admin_events WHERE action='housekeeping_deleted' AND detail->>'record_id'=p::text) THEN RAISE EXCEPTION 'B9 FAILED: missing project audit'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.projects WHERE name='Housekeeping fixture') THEN RAISE EXCEPTION 'B10 FAILED: deleted project visible'; END IF; END $$;
ROLLBACK;