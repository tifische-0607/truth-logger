-- U8 framework library checks. Needs a privileged test connection (creates users); rolls back.
BEGIN;
DO $$ DECLARE cur uuid := gen_random_uuid(); own uuid := gen_random_uuid(); e uuid; v uuid; s uuid; l uuid; merged uuid; ok boolean;
BEGIN
  INSERT INTO auth.users(id,email) VALUES (cur,'fw-curator@test.invalid'),(own,'fw-owner@test.invalid');
  INSERT INTO public.user_roles(user_id,role) VALUES (cur,'curator'),(own,'owner');
  -- F1 only the Curator approves
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own)::text, true);
  e := public.fw_add_entry('TEST-FW','Test framework','framework');
  v := public.fw_propose_version(e, current_date, 'Test', 'Body', '[]', 'first');
  BEGIN PERFORM public.fw_decide_version(v,true,null); RAISE EXCEPTION 'F1 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only the Curator can approve library changes.' THEN RAISE; END IF; END;
  RAISE NOTICE 'F1 passed';
  -- F2 a pending version is not in force; approval puts it in force and logs author and approver
  IF public.fw_active_version(e) IS NOT NULL THEN RAISE EXCEPTION 'F2 FAILED (pending in force)'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',cur)::text, true);
  PERFORM public.fw_decide_version(v,true,'ok');
  IF public.fw_active_version(e) <> v THEN RAISE EXCEPTION 'F2 FAILED'; END IF;
  IF (SELECT count(*) FROM public.framework_events WHERE entry_id=e AND action IN ('version_proposed','version_approved')) <> 2 THEN RAISE EXCEPTION 'F2 FAILED (log)'; END IF;
  RAISE NOTICE 'F2 passed';
  -- F3 versions are append-only: edits never alter past content
  BEGIN UPDATE public.framework_versions SET summary='x' WHERE id=v; RAISE EXCEPTION 'F3 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'F3%' THEN RAISE; END IF; END;
  RAISE NOTICE 'F3 passed';
  -- F4 a learning without page/passage is refused; an approved learning merges as a new approved universal version
  s := public.fw_record_source(e,'Src','a.pdf','sources/'||repeat('a',64)||'/a.pdf',repeat('a',64),10);
  BEGIN PERFORM public.fw_add_learning(s,'definition','add','t','','', 'manual'); RAISE EXCEPTION 'F4 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Every learning must point to its page and passage.' THEN RAISE; END IF; END;
  l := public.fw_add_learning(s,'definition','add','A rule','quoted passage','p. 3','manual');
  merged := public.fw_decide_learning(l,true,null,null);
  IF public.fw_version_status(merged) <> 'active' THEN RAISE EXCEPTION 'F4 FAILED (merge)'; END IF;
  RAISE NOTICE 'F4 passed';
  -- F5 research cannot start without a linked, approved framework version: see research_plan_framework_guard
  --    (needs a plan with signed G1/G2; run with research_model_test.sql fixtures)
END $$;
ROLLBACK;
