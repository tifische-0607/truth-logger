-- U3 evidence move (plan steps 1-5) checks. Everything runs inside one transaction and rolls back:
-- no row, cloud file or artefact is kept or changed.
-- Part A: runnable with the privileged test connection; acts as the owner by setting request.jwt.claims.
BEGIN;
CREATE TEMP TABLE _before AS
  SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'evidence') objs,
         (SELECT md5(string_agg(name || coalesce(metadata->>'eTag', '') || updated_at::text, ',' ORDER BY name)) FROM storage.objects WHERE bucket_id = 'evidence') objs_md5,
         (SELECT md5(string_agg(id || storage_path || coalesce(sha256, ''), ',' ORDER BY id)) FROM public.artefacts) arts_md5;

DO $$ DECLARE o uuid; BEGIN
  SELECT user_id INTO o FROM public.user_roles WHERE role = 'owner' LIMIT 1;
  IF o IS NULL THEN RAISE EXCEPTION 'A0 FAILED: no owner'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'A0 acting as owner';
END $$;

-- A1: the freeze switch is owner-only, needs a reason and is logged append-only.
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM public.evidence_move_set_freeze(true, ' '); EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'A reason is required%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A1 FAILED: blank reason accepted'; END IF;
  PERFORM public.evidence_move_set_freeze(true, 'A1 test');
  IF NOT public.evidence_move_frozen() THEN RAISE EXCEPTION 'A1 FAILED: freeze not on'; END IF;
  ok := false;
  BEGIN UPDATE public.evidence_move_freeze_log SET reason = 'x'; EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A1 FAILED: freeze log editable'; END IF;
  RAISE NOTICE 'A1 passed';
END $$;

-- A2: while frozen, no new evidence row or browser upload into cloud storage.
DO $$ DECLARE i uuid; ok boolean := false; BEGIN
  SELECT item_id INTO i FROM public.artefacts LIMIT 1;
  BEGIN
    INSERT INTO public.artefacts (item_id, filename, kind, storage_path, sha256) VALUES (i, 'a2.png', 'screenshot', 'CASE-X/a2.png', repeat('a', 64));
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Evidence move freeze is on%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A2 FAILED: artefact accepted while frozen'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'evidence_move_freeze_uploads' AND NOT polpermissive) THEN
    RAISE EXCEPTION 'A2 FAILED: no restrictive upload policy';
  END IF;
  RAISE NOTICE 'A2 passed';
END $$;

-- A3: with no DarkNight route the move refuses to start.
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM public.evidence_move_start(); EXCEPTION WHEN others THEN ok := SQLERRM = 'DarkNight gateway not connected'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A3 FAILED'; END IF; RAISE NOTICE 'A3 passed';
END $$;

-- A4: fake route; a matching hash verifies and adds one "transferred" custody event naming DarkNight.
UPDATE public.darknight_route SET gateway_url = 'https://fake-darknight.test' WHERE id;
CREATE TEMP TABLE _run AS SELECT (public.evidence_move_start()->>'run_id')::uuid id;
CREATE TEMP TABLE _arts AS SELECT * FROM public.evidence_move_pending() LIMIT 3;
DO $$ DECLARE r uuid := (SELECT id FROM _run); a record; res text; BEGIN
  SELECT * INTO a FROM _arts ORDER BY storage_path LIMIT 1;
  res := public.evidence_move_record(r, a.artefact_id, a.storage_path, a.sha256);
  IF res <> 'verified' THEN RAISE EXCEPTION 'A4 FAILED: %', res; END IF;
  IF (SELECT count(*) FROM public.custody_events WHERE artefact_id = a.artefact_id AND action = 'transferred' AND notes LIKE 'Transferred to DarkNight: darknight:/' || a.storage_path || '%') <> 1 THEN
    RAISE EXCEPTION 'A4 FAILED: transferred event';
  END IF;
  IF NOT (public.evidence_read_location(a.storage_path)->>'moved')::boolean THEN RAISE EXCEPTION 'A4 FAILED: read not switched'; END IF;
  RAISE NOTICE 'A4 passed';
END $$;

-- A5: an unverified artefact keeps reading from the cloud; a wrong path is refused.
DO $$ DECLARE r uuid := (SELECT id FROM _run); a record; ok boolean := false; BEGIN
  SELECT * INTO a FROM _arts ORDER BY storage_path OFFSET 1 LIMIT 1;
  IF (public.evidence_read_location(a.storage_path)->>'moved')::boolean THEN RAISE EXCEPTION 'A5 FAILED: unmoved shows moved'; END IF;
  BEGIN PERFORM public.evidence_move_record(r, a.artefact_id, 'elsewhere/' || a.storage_path, a.sha256); EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'The DarkNight location must be%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A5 FAILED: wrong path accepted'; END IF;
  RAISE NOTICE 'A5 passed';
END $$;

-- A6: a mismatch is never verified and stops the whole run, naming the artefact.
DO $$ DECLARE r uuid := (SELECT id FROM _run); a record; b record; res text; ok boolean := false; BEGIN
  SELECT * INTO a FROM _arts ORDER BY storage_path OFFSET 1 LIMIT 1;
  SELECT * INTO b FROM _arts ORDER BY storage_path OFFSET 2 LIMIT 1;
  res := public.evidence_move_record(r, a.artefact_id, a.storage_path, repeat('0', 64));
  IF res <> 'mismatch' THEN RAISE EXCEPTION 'A6 FAILED: %', res; END IF;
  IF EXISTS (SELECT 1 FROM public.custody_events WHERE artefact_id = a.artefact_id AND action = 'transferred') THEN RAISE EXCEPTION 'A6 FAILED: custody on mismatch'; END IF;
  BEGIN PERFORM public.evidence_move_record(r, b.artefact_id, b.storage_path, b.sha256); EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'This move was stopped by a hash mismatch on ' || a.filename || '%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A6 FAILED: run continued after mismatch'; END IF;
  IF (public.evidence_move_progress()->'last_run'->'stopped_by'->>'artefact_id')::uuid <> a.artefact_id THEN RAISE EXCEPTION 'A6 FAILED: progress'; END IF;
  ok := false;
  BEGIN INSERT INTO public.evidence_move_results (run_id, artefact_id, outcome, expected_sha256, got_sha256, darknight_path)
    VALUES (r, b.artefact_id, 'verified', repeat('1', 64), repeat('2', 64), b.storage_path);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A6 FAILED: verified with mismatching hashes'; END IF;
  ok := false;
  BEGIN UPDATE public.evidence_move_results SET outcome = 'verified' WHERE artefact_id = a.artefact_id; EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A6 FAILED: results editable'; END IF;
  RAISE NOTICE 'A6 passed';
END $$;

-- A7: engagement outputs can no longer gain a cloud location; a DarkNight location must sit under the engagement.
DO $$ DECLARE o record; ok boolean := false; BEGIN
  SELECT id, project_id FROM public.project_outputs LIMIT 1 INTO o;
  IF o.id IS NULL THEN RAISE NOTICE 'A7 skipped: no output rows'; RETURN; END IF;
  BEGIN UPDATE public.project_outputs SET location = 'projects/x/outputs/y/z.pdf' WHERE id = o.id; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Outputs are no longer stored in the cloud%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A7 FAILED: cloud location'; END IF;
  ok := false;
  BEGIN UPDATE public.project_outputs SET home_path = 'projects/other/x.pdf', sha256 = repeat('a', 64) WHERE id = o.id; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'An output''s DarkNight location must sit%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A7 FAILED: foreign folder'; END IF;
  RAISE NOTICE 'A7 passed';
END $$;

-- A8: a non-owner cannot switch the freeze or run the move.
DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.evidence_move_set_freeze(false, 'A8'); EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Only the owner%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A8 FAILED: freeze'; END IF;
  ok := false;
  BEGIN PERFORM public.evidence_move_start(); EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Only the owner%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'A8 FAILED: start'; END IF;
  RAISE NOTICE 'A8 passed';
END $$;

-- A9: no cloud file and no original artefact row changed.
DO $$ BEGIN
  IF (SELECT objs FROM _before) <> (SELECT count(*) FROM storage.objects WHERE bucket_id = 'evidence')
     OR (SELECT objs_md5 FROM _before) IS DISTINCT FROM (SELECT md5(string_agg(name || coalesce(metadata->>'eTag', '') || updated_at::text, ',' ORDER BY name)) FROM storage.objects WHERE bucket_id = 'evidence')
     OR (SELECT arts_md5 FROM _before) IS DISTINCT FROM (SELECT md5(string_agg(id || storage_path || coalesce(sha256, ''), ',' ORDER BY id)) FROM public.artefacts) THEN
    RAISE EXCEPTION 'A9 FAILED: cloud files or artefacts changed';
  END IF;
  RAISE NOTICE 'A9 passed';
END $$;
ROLLBACK;

-- Part B (not runnable here: needs real signed-in sessions through the app, and a connected DarkNight route):
-- B1 worker-upload-url returns 423 "Evidence move freeze is on…" with a real WORKER_TOKEN while frozen.
-- B2 a signed-in investigator's browser upload to the evidence bucket is refused by the restrictive policy while frozen.
-- B3 a client login cannot read evidence_move_* tables or call evidence_move_progress.
-- B4 end-to-end move of the 213 artefact rows against the live DarkNight gateway (blocked: route undecided, C2).
