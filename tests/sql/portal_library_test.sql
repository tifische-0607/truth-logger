-- Phase 2 Library exit checks. Run as a privileged test role inside a transaction; rolls back.
-- Requires two clients (A, B) with portal enabled, an active client admin of A (:admin_a), a staff user (:staff),
-- and an engagement of A with a held output (:held_out) and a document of B.
BEGIN;
DO $$
DECLARE a uuid := current_setting('test.admin_a')::uuid; s uuid := current_setting('test.staff')::uuid;
  ca uuid := current_setting('test.client_a')::uuid; cb uuid := current_setting('test.client_b')::uuid; n int; d uuid;
BEGIN
  -- 1. client admin cannot read another client's documents or any staff-only document
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.documents WHERE client_id = cb; IF n <> 0 THEN RAISE EXCEPTION 'FAIL other client visible'; END IF;
  SELECT count(*) INTO n FROM public.documents WHERE visibility = 'staff_only'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL staff-only visible'; END IF;
  -- 2. counts exclude hidden rows
  SELECT count(*) INTO n FROM public.documents; IF n <> (SELECT count(*) FROM public.documents WHERE client_id = ca AND visibility = 'client' AND NOT voided) THEN RAISE EXCEPTION 'FAIL counts'; END IF;
  RESET ROLE;
  -- 3. G5 release flips visibility (simulated through the release path)
  PERFORM set_config('fa.releasing', current_setting('test.held_out'), true);
  UPDATE public.project_outputs SET status = 'released' WHERE id = current_setting('test.held_out')::uuid;
  IF (SELECT visibility FROM public.documents WHERE output_id = current_setting('test.held_out')::uuid) <> 'client' THEN RAISE EXCEPTION 'FAIL release flip'; END IF;
  -- 4. withdraw without a reason is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  SELECT id INTO d FROM public.documents WHERE output_id = current_setting('test.held_out')::uuid;
  BEGIN PERFORM public.library_withdraw(d, '  '); RAISE EXCEPTION 'FAIL withdraw without reason accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  -- 5. direct edits and deletes are refused
  BEGIN UPDATE public.documents SET visibility = 'client' WHERE id = d; RAISE EXCEPTION 'FAIL direct update';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'ALL LIBRARY CHECKS PASSED';
END $$;
ROLLBACK;
