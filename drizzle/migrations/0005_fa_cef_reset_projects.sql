-- Reset: the first projects design (briefs with free criteria, assessments, four output kinds)
-- is replaced by the FA-CEF V1.10 engagement model in 0006 and 0007. The old tables held only
-- test records. The home-vault tables (sources, evidence_refs, custody_events) and their guards
-- (hub_custody_guard, hub_ref_guard, hub_ref_linked) are kept.
DROP POLICY IF EXISTS project_storage_read_boundary ON storage.objects;
DROP POLICY IF EXISTS project_storage_write_boundary ON storage.objects;
DROP POLICY IF EXISTS project_output_no_overwrite ON storage.objects;
DROP POLICY IF EXISTS project_output_no_delete ON storage.objects;
DROP VIEW IF EXISTS public.project_current_briefs;
DROP TABLE IF EXISTS public.project_assessments, public.project_criteria, public.project_events, public.project_outputs,
  public.project_items, public.project_cases, public.project_members, public.project_briefs, public.projects, public.clients CASCADE;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('hub_assessment_guard', 'hub_brief_version', 'hub_criteria_latest',
      'hub_download_event_guard', 'hub_event_log', 'hub_item_guard', 'hub_member_guard', 'hub_output_file_boundary',
      'hub_output_guard', 'hub_project_identity', 'hub_project_lead', 'hub_project_number', 'hub_storage_project',
      'project_item_case', 'save_project_brief', 'can_access_project', 'can_manage_project', 'can_view_project_as_client',
      'can_work_project', 'project_role')
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn || ' CASCADE'; END LOOP;
END $$;
