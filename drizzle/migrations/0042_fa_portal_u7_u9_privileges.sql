-- U7/U9: people write only through SECURITY DEFINER functions; no direct table writes, no anonymous access.
REVOKE ALL ON public.ew_thresholds, public.ew_recipients, public.ew_signals, public.ew_alerts, public.ew_dispatches, public.ew_decisions,
  public.ew_client_notices, public.ew_briefings, public.ew_handovers, public.ew_events,
  public.lnk_merge_decisions, public.lnk_released_graphs, public.lnk_thresholds, public.lnk_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ew_thresholds, public.ew_recipients, public.ew_signals, public.ew_alerts, public.ew_dispatches, public.ew_decisions,
  public.ew_client_notices, public.ew_briefings, public.ew_handovers, public.ew_events,
  public.lnk_merge_decisions, public.lnk_released_graphs, public.lnk_thresholds, public.lnk_events FROM authenticated;
REVOKE ALL ON FUNCTION public.ew_level_channels(text), public.lnk_ident_ok(text) FROM anon;
