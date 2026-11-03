-- Worker-only entry points must never be callable from a person's session (default privileges granted them to authenticated).
REVOKE EXECUTE ON FUNCTION public.research_quarantine(uuid, uuid, uuid, text, text, jsonb),
  public.research_submit_capture_std(uuid, jsonb), public.research_claim_job(text, int),
  public.research_report_vault_write(uuid, text, uuid), public.research_report_run(uuid, text, int),
  public.research_report_vault(text, boolean, text) FROM authenticated, anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.research_connectors, public.research_settings FROM authenticated, anon;
REVOKE ALL ON public.research_connectors, public.research_settings FROM anon;
GRANT SELECT ON public.research_connectors, public.research_settings TO authenticated;