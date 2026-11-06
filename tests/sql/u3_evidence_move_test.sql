-- U3 evidence move (plan steps 1-5) checks. Everything runs inside one transaction and rolls back:
-- no row, cloud file or artefact is kept or changed.
-- Part A: runnable with the privileged test connection (no signed-in identity; it cannot read auth.uid()).
BEGIN;
CREATE TEMP TABLE _before AS
  SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'evidence') objs,
         (SELECT md5(string_agg(name || coalesce(metadata->>'eTag', '') || updated_at::text, ',' ORDER BY name)) FROM storage.objects WHERE bucket_id = 'evidence') objs_md5,
         (SELECT md5(string_agg(id || storage_path || coalesce(sha256, ''), ',' ORDER BY id)) FROM public.artefacts) arts_md5;

-- A1: every new table has RLS and append-only guards; owner-only functions are not callable by anon.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['evidence_move_freeze_log','darknight_route','evidence_move_runs','evidence_move_results'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN RAISE EXCEPTION 'A1 FAILED: no RLS on %', t; END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.evidence_move_set_freeze(boolean, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.evidence_move_record(uuid, uuid, text, text, boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'A1 FAILED: anon can execute'; END IF;
  IF has_table_privilege('authenticated', 'public.evidence_move_results', 'INSERT') OR has_table_privilege('authenticated', 'public.evidence_move_freeze_log', 'INSERT')
     OR has_table_privilege('authenticated', 'public.darknight_route', 'UPDATE') THEN RAISE EXCEPTION 'A1 FAILED: direct writes granted'; END IF;
  RAISE NOTICE 'A1 passed';
END $$;

-- A2: freeze log is append-only; while frozen no new evidence row may be recorded; restrictive upload policy exists.
INSERT INTO public.evidence_move_freeze_log (frozen, reason) VALUES (true, 'A2 test');
DO $$ DECLARE i uuid; ok boolean := false; BEGIN
  IF NOT public.evidence_move_frozen() THEN RAISE EXCEPTION 'A2 FAILED: freeze not on'; END IF;
  BEGIN UPDATE public.evidence_move_freeze_log SET reason = 'x'; EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A2 FAILED: freeze log editable'; END IF;
  ok := false;
  SELECT item_id INTO i FROM public.artefacts LIMIT 1;
  BEGIN
    INSERT INTO public.artefacts (item_id, filename, kind, storage_path, sha256) VALUES (i, 'a2.png', 'screenshot', 'CASE-X/a2.png', repeat('a', 64));
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Evidence move freeze is on%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A2 FAILED: artefact accepted while frozen'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'evidence_move_freeze_uploads' AND NOT polpermissive)
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'outputs_not_in_cloud' AND NOT polpermissive) THEN
    RAISE EXCEPTION 'A2 FAILED: restrictive upload policies missing';
  END IF;
  RAISE NOTICE 'A2 passed';
END $$;

-- A3: the live DarkNight route is unset, so the move shows "DarkNight gateway not connected".
DO $$ BEGIN
  IF (SELECT gateway_url FROM public.darknight_route WHERE id) IS NOT NULL THEN RAISE EXCEPTION 'A3 FAILED: route set'; END IF;
  RAISE NOTICE 'A3 passed';
END $$;

-- A4: a result can be verified only with matching hashes; results are append-only; reads switch only when verified.
INSERT INTO public.evidence_move_runs (gateway_url, total) VALUES ('https://fake-darknight.test', 2);
DO $$ DECLARE r uuid; a record; b record; ok boolean := false; BEGIN
  SELECT id INTO r FROM public.evidence_move_runs WHERE gateway_url = 'https://fake-darknight.test';
  SELECT id, storage_path, sha256 INTO a FROM public.artefacts ORDER BY storage_path LIMIT 1;
  SELECT id, storage_path, sha256 INTO b FROM public.artefacts ORDER BY storage_path OFFSET 1 LIMIT 1;
  BEGIN INSERT INTO public.evidence_move_results (run_id, artefact_id, outcome, expected_sha256, got_sha256, darknight_path)
    VALUES (r, b.id, 'verified', b.sha256, repeat('0', 64), b.storage_path);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A4 FAILED: verified with mismatching hashes'; END IF;
  INSERT INTO public.evidence_move_results (run_id, artefact_id, outcome, expected_sha256, got_sha256, darknight_path)
    VALUES (r, a.id, 'verified', a.sha256, a.sha256, a.storage_path);
  IF NOT (public.evidence_read_location(a.storage_path)->>'moved')::boolean THEN RAISE EXCEPTION 'A4 FAILED: verified read not switched'; END IF;
  IF (public.evidence_read_location(b.storage_path)->>'moved')::boolean THEN RAISE EXCEPTION 'A4 FAILED: unverified read switched'; END IF;
  ok := false;
  BEGIN UPDATE public.evidence_move_results SET darknight_path = 'x' WHERE artefact_id = a.id; EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A4 FAILED: results editable'; END IF;
  ok := false;
  BEGIN DELETE FROM public.evidence_move_runs WHERE id = r; EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A4 FAILED: run deletable'; END IF;
  RAISE NOTICE 'A4 passed';
END $$;

-- A5: engagement outputs can no longer gain a cloud location; a DarkNight location must sit under the engagement.
DO $$ DECLARE o record; ok boolean := false; BEGIN
  SELECT id, project_id FROM public.project_outputs LIMIT 1 INTO o;
  IF o.id IS NULL THEN RAISE NOTICE 'A5 skipped: no output rows'; RETURN; END IF;
  BEGIN UPDATE public.project_outputs SET location = 'projects/x/outputs/y/z.pdf' WHERE id = o.id; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Outputs are no longer stored in the cloud%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A5 FAILED: cloud location'; END IF;
  ok := false;
  BEGIN UPDATE public.project_outputs SET home_path = 'projects/other/x.pdf', sha256 = repeat('a', 64) WHERE id = o.id; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'An output''s DarkNight location must sit%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A5 FAILED: foreign folder'; END IF;
  RAISE NOTICE 'A5 passed';
END $$;

-- A6: no cloud file and no original artefact row changed.
DO $$ BEGIN
  IF (SELECT objs FROM _before) <> (SELECT count(*) FROM storage.objects WHERE bucket_id = 'evidence')
     OR (SELECT objs_md5 FROM _before) IS DISTINCT FROM (SELECT md5(string_agg(name || coalesce(metadata->>'eTag', '') || updated_at::text, ',' ORDER BY name)) FROM storage.objects WHERE bucket_id = 'evidence')
     OR (SELECT arts_md5 FROM _before) IS DISTINCT FROM (SELECT md5(string_agg(id || storage_path || coalesce(sha256, ''), ',' ORDER BY id)) FROM public.artefacts) THEN
    RAISE EXCEPTION 'A6 FAILED: cloud files or artefacts changed';
  END IF;
  RAISE NOTICE 'A6 passed';
END $$;
ROLLBACK;

ROLLBACK;

-- Part B (saved, NOT run: the test connection has no signed-in identity, and the live DarkNight route is undecided).
-- Run each as the owner through the app (request.jwt.claims sub = owner) inside BEGIN ... ROLLBACK.
-- B1 evidence_move_set_freeze(true, ' ') -> 'A reason is required to switch the evidence move freeze.'; a real reason is logged.
-- B2 a non-owner calling evidence_move_set_freeze / evidence_move_start / evidence_move_record -> 'Only the owner ...'.
-- B3 evidence_move_start() with darknight_route unset -> 'DarkNight gateway not connected'; with freeze off -> 'Switch the evidence move freeze on before moving files.'
-- B4 evidence_move_record with the recorded hash -> 'verified' and exactly one custody_events row action 'transferred',
--    notes 'Transferred to DarkNight: darknight:/<storage_path> ...'; a different path -> 'The DarkNight location must be ...'.
-- B5 evidence_move_record with a wrong hash -> 'mismatch', no custody event; the next record in that run ->
--    'This move was stopped by a hash mismatch on <filename> ...'; evidence_move_progress().last_run.stopped_by names it.
-- B6 worker-upload-url with a real WORKER_TOKEN while frozen -> HTTP 423, code evidence_move_freeze.
-- B7 a signed-in investigator's browser upload to the evidence bucket while frozen is refused; any upload under projects/ is refused.
-- B8 a client login cannot read evidence_move_* or darknight_route, and evidence_move_progress() -> 'Staff only.'
-- B9 end-to-end move of every artefact row against the live DarkNight gateway (blocked until the secure route, C2, is decided).
