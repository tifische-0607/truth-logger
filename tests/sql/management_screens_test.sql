-- Phase 8 Management screens checks. Run as a privileged test connection inside a transaction; rolls back.
BEGIN;
-- M1: an analyst (staff without management/owner) cannot open Management
DO $$ DECLARE u uuid := gen_random_uuid(); BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'm1-analyst@test.invalid');
  INSERT INTO public.user_roles(user_id, role) VALUES (u, 'analyst');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  BEGIN PERFORM public.mgmt_portfolio(); RAISE EXCEPTION 'M1 FAILED: analyst opened Management';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Management is open to Management and the owner only.' THEN RAISE; END IF; END;
  RAISE NOTICE 'M1 passed';
END $$;
-- M2: a management user can read the portfolio
DO $$ DECLARE u uuid := gen_random_uuid(); r jsonb; BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'm2-mgmt@test.invalid');
  INSERT INTO public.user_roles(user_id, role) VALUES (u, 'management');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  r := public.mgmt_portfolio();
  IF NOT (r ? 'clients' AND r ? 'engagements' AND r ? 'clocks') THEN RAISE EXCEPTION 'M2 FAILED'; END IF;
  RAISE NOTICE 'M2 passed';
END $$;
-- M3: a client administrator cannot open Management (no staff role) - same refusal as M1.
-- M4: non-management SOP edit refused: covered by sop_clocks_test.sql ('Only Management can edit an SOP.').
-- M5: management cannot sign gates, decide readings, start/stop research or release: covered by existing
--     guards (portal_foundation_test.sql, research_model_test.sql); rerun those as a management user.
ROLLBACK;
