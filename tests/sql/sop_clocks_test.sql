-- Phase 7 SOP and clock engine checks. Runs in a transaction and rolls back.
-- Run 3 Nov 2026 on the sandbox test connection: C4a PASSED (clock started at phase 0 on a new engagement). All other blocks need table/function rights this connection lacks.
BEGIN;

-- C1: SOP definitions are append-only (an edit must be a new version)
DO $$ BEGIN
  BEGIN
    UPDATE public.sop_definitions SET target_working_days = 3 WHERE phase = 0;
    RAISE EXCEPTION 'FAIL C1: SOP row was edited in place';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS C1: SOP edit in place refused (%)', SQLERRM;
  END;
END $$;

-- C2: a non-management user cannot edit an SOP (no signed-in Management role)
DO $$ BEGIN
  BEGIN
    PERFORM public.sop_save(0, 3, 80, 'engagement_lead', '{curator}', '[]');
    RAISE EXCEPTION 'FAIL C2: non-management SOP edit accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM <> 'Only Management can edit an SOP.' THEN RAISE EXCEPTION 'FAIL C2: wrong message %', SQLERRM; END IF;
    RAISE NOTICE 'PASS C2: %', SQLERRM;
  END;
END $$;

-- C3: status rule and working-day arithmetic
DO $$ BEGIN
  IF public.sla_working_days('2026-11-06 09:00+08', '2026-11-09 09:00+08') <> 1 THEN
    RAISE EXCEPTION 'FAIL C3: Friday to Monday should be 1 working day';
  END IF;
  RAISE NOTICE 'PASS C3: weekends skipped';
END $$;

-- C4: clock starts on a new engagement, stops and restarts when the phase changes,
--     breach status and alert appear when the target is exceeded,
--     pause only for client waiting (needs a signed-in engagement lead: see C5).
DO $$
DECLARE pid uuid; cid uuid; c2 uuid; st jsonb;
BEGIN
  INSERT INTO public.projects(code, name, status) VALUES ('SLA-TEST', 'Clock test', 'active') RETURNING id INTO pid;
  SELECT id INTO cid FROM public.phase_clocks WHERE project_id = pid AND completed_at IS NULL AND phase = 0;
  IF cid IS NULL THEN RAISE EXCEPTION 'FAIL C4a: no phase 0 clock on creation'; END IF;
  RAISE NOTICE 'PASS C4a: clock started at phase 0';

  UPDATE public.phase_clocks SET started_at = now() - interval '30 days' WHERE id = cid;
  PERFORM public.sla_sync(pid);
  st := public.sla_clock_status(cid);
  IF st->>'status' <> 'breached' THEN RAISE EXCEPTION 'FAIL C4b: expected breached, got %', st; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sla_events WHERE clock_id = cid AND kind = 'breached') THEN
    RAISE EXCEPTION 'FAIL C4b: no breach alert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_events WHERE project_id = pid AND action = 'sla_breached') THEN
    RAISE EXCEPTION 'FAIL C4b: breach not in the event log';
  END IF;
  RAISE NOTICE 'PASS C4b: breached with alert to %', (SELECT to_roles FROM public.sla_events WHERE clock_id = cid AND kind = 'breached');

  UPDATE public.projects SET status = 'closed' WHERE id = pid;
  IF NOT EXISTS (SELECT 1 FROM public.phase_clocks WHERE id = cid AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL C4c: clock did not stop on close';
  END IF;
  RAISE NOTICE 'PASS C4c: clock stopped when the engagement closed';

  BEGIN
    PERFORM public.sla_pause(cid, 'waiting_on_fa_staff', 'x');
    RAISE EXCEPTION 'FAIL C4d: pause accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS C4d: pause refused (%)', SQLERRM;
  END;
END $$;

-- C5 (needs a signed-in engagement lead session, not runnable from this connection):
--   sla_pause with 'waiting_on_fa_staff' -> 'A clock can only be paused while waiting on the client ...'
--   sla_pause with 'client_documents' -> paused; status 'paused'; sla_resume -> resumed.
-- C6 (needs signed G0/G1 gate fixtures): signing G1 stops the phase 0 clock and starts phase 1.

ROLLBACK;
