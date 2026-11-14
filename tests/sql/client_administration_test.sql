-- Read-only regression checks; each query must return true.
SELECT NOT has_function_privilege('anon', 'public.client_admin_save(uuid,jsonb)', 'EXECUTE') AS anonymous_cannot_edit;
SELECT NOT has_table_privilege('authenticated', 'public.client_detail_events', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.client_detail_events', 'DELETE') AS audit_is_not_editable;
SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.client_detail_events'::regclass
  AND tgname='immutable_client_detail_events' AND tgenabled='O') AS audit_guard_enabled;
SELECT pg_get_functiondef('public.client_admin_save(uuid,jsonb)'::regprocedure)
  LIKE '%IF NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION%' AS only_active_superadmin_can_save;