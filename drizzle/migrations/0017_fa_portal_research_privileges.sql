-- Worker-only entry points and worker-written tables: the browser roles get read access only.
REVOKE EXECUTE ON FUNCTION public.research_scope_refusal(uuid, text, text, text, text[]),
  public.research_submit_job(uuid, text, text, text, text[], text),
  public.research_submit_capture(uuid, text, text, text, text[], text, text, uuid, uuid, jsonb) FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.research_vault_reports, public.research_jobs, public.research_runs,
  public.research_captures, public.research_refusals, public.research_events, public.research_loads FROM authenticated, anon;
REVOKE ALL ON public.research_plans, public.research_vault_reports, public.research_jobs, public.research_runs,
  public.research_captures, public.research_refusals, public.research_events, public.research_loads FROM anon;
REVOKE DELETE, TRUNCATE ON public.research_plans FROM authenticated;
