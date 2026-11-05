-- U5 remainder: rejection-rate dashboard checks (migration 0035).
-- Part A runs as any role (structure, privileges, source tables) — RUN 5 Nov 2026.
-- Part B needs a staff user (:staff), a client user (:client) and a running run (:run, :plan, :project)
-- — NOT RUN: test access cannot impersonate signed-in users. Rolled back; rows labelled Sample.

-- ===== Part A (run) =====
-- A1 reads only from the existing rejection log (research_refusals) plus captures/connectors/events; writes nothing
SELECT prosrc LIKE '%research_refusals%' AND prosrc NOT ILIKE '%insert %' AND prosrc NOT ILIKE '%update %' AS reads_only_rejection_log
  FROM pg_proc WHERE proname = 'research_rejection_dashboard';
-- A2 anon cannot call; staff gate is inside the function
SELECT NOT has_function_privilege('anon', 'public.research_rejection_dashboard(int)', 'EXECUTE') AS anon_cannot_open;
SELECT prosrc LIKE '%portal_is_staff%' AND prosrc LIKE '%portal_has_client_identity%' AS staff_only_in_db
  FROM pg_proc WHERE proname = 'research_rejection_dashboard';
-- A3 Phase 5 defaults still hold: 5 rejected items within 60 minutes
SELECT column_name, column_default FROM information_schema.columns
  WHERE table_name = 'research_connectors' AND column_name IN ('reject_limit', 'reject_window_minutes');
--   expect: reject_limit 5, reject_window_minutes 60
SELECT key, reject_limit = 5 AND reject_window_minutes = 60 AS defaults_hold FROM public.research_connectors;

-- ===== Part B (not run) =====
BEGIN;
-- B1 a connector with repeated rejections shows as suspended (worker path, service role)
SET LOCAL role service_role;
SELECT public.research_quarantine(:'plan', :'project', :'run', 'socialcrawl', 'Sample malformed item', '{"sample":true}'::jsonb)
  FROM generate_series(1, 5);
SET LOCAL role authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub', :'staff')::text, true);
SELECT c->>'status' = 'suspended' AND (c->>'auto_suspended')::boolean AS shows_suspended
  FROM jsonb_array_elements(public.research_rejection_dashboard(14)->'connectors') c WHERE c->>'key' = 'socialcrawl';
-- B2 non-staff cannot open it
SELECT set_config('request.jwt.claims', json_build_object('sub', :'client')::text, true);
SELECT public.research_rejection_dashboard(14);
--   expect: "Only FridayAnalytics staff can open the rejection dashboard"
ROLLBACK;
