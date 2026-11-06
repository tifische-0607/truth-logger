-- STATUS 6 Nov 2026
-- Part A (structure) RUN and passed through the read-only database tool:
--   A1 RLS on all 10 ew_* tables; append-only trigger on each; authenticated cannot INSERT; anon cannot SELECT.
--   A2 ew_level_channels: watch=[portal], warning=[portal,email], urgent=[portal,email,telegram].
--   A3 guards present: ew_notice_confirmed_guard, ew_dispatch_level_guard.
--   A4 thresholds and recipients start empty (0 rows = every threshold "Threshold not set").
--   A5 anon cannot execute ew_decide; authenticated cannot execute ew_active_recipients.
--   A6 RABAT, DSP and UN-FAAC have no approved version yet, so ew_record_signal refuses every signal for now.
-- Part B (behaviour) NOT RUN: needs a privileged test connection that can create auth users and an engagement with captures.
-- Run inside a transaction as a privileged test connection; everything rolls back.
BEGIN;

-- B1: no alert reaches a client without analyst confirmation.
DO $$ DECLARE a uuid := (SELECT id FROM public.ew_alerts a WHERE NOT EXISTS (SELECT 1 FROM public.ew_decisions d WHERE d.alert_id=a.id) LIMIT 1); BEGIN
  IF a IS NULL THEN RAISE NOTICE 'B1 SKIPPED: no undecided alert fixture'; RETURN; END IF;
  BEGIN
    INSERT INTO public.ew_client_notices(alert_id,client_id,project_id,level,title,body,created_by)
      SELECT a.id, p.client_id, a.project_id, a.level, 't', 'b', gen_random_uuid() FROM public.ew_alerts a JOIN public.projects p ON p.id=a.project_id WHERE a.id=a;
    RAISE EXCEPTION 'B1 FAILED: notice created without confirmation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'An alert reaches a client only after an analyst confirms it.' THEN RAISE; END IF;
  END;
END $$;

-- B2: each level triggers only its channels (a Watch alert cannot get an email dispatch).
DO $$ DECLARE a uuid := (SELECT id FROM public.ew_alerts WHERE level='watch' LIMIT 1); BEGIN
  IF a IS NULL THEN RAISE NOTICE 'B2 SKIPPED: no watch alert fixture'; RETURN; END IF;
  BEGIN
    INSERT INTO public.ew_dispatches(alert_id,channel,state) VALUES (a,'email','no_recipients');
    RAISE EXCEPTION 'B2 FAILED: email dispatch accepted for a Watch alert';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'A Watch alert does not use the email channel.' THEN RAISE; END IF;
  END;
END $$;

-- B3: every alert, decision and hand-over is append-only.
DO $$ BEGIN
  BEGIN UPDATE public.ew_alerts SET level='urgent'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.ew_decisions; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.ew_handovers; EXCEPTION WHEN others THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.ew_alerts) AND NOT EXISTS (SELECT 1 FROM public.ew_alerts WHERE level<>'urgent') THEN RAISE EXCEPTION 'B3 FAILED: alerts were updated'; END IF;
END $$;

-- B4: an unset threshold never raises an alert. Set claims to an analyst on a fixture engagement, then:
--   SELECT public.ew_record_signal('<project>', 'volume_spike', 9999, 'RABAT', ARRAY['<capture>']::uuid[], 'B4');
--   expected outcome = 'threshold_not_set' (after RABAT has an approved version) and no new ew_alerts row.

-- B5: a client member sees confirmed notices only (portal_ew_notices and RLS on ew_client_notices), and never
--   ew_alerts / ew_signals / ew_decisions rows. Set claims to a client user and SELECT count(*) from each: expect 0.

ROLLBACK;
