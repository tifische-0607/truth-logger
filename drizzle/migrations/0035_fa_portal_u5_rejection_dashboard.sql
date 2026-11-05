-- U5 remainder: per-connector rejection-rate dashboard (staff only). Reads the existing rejection log
-- (research_refusals, kind 'capture') plus accepted captures; settings come from research_connectors.
CREATE OR REPLACE FUNCTION public.research_rejection_dashboard(_days int DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d int := least(greatest(coalesce(_days, 14), 1), 90); since timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_is_staff(auth.uid()) OR public.portal_has_client_identity(auth.uid()) THEN
    RAISE EXCEPTION 'Only FridayAnalytics staff can open the rejection dashboard'; END IF;
  since := date_trunc('day', now()) - make_interval(days => d - 1);
  RETURN jsonb_build_object('days', d, 'since', since, 'connectors', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'key', c.key, 'name', c.name, 'version', c.version, 'status', c.status, 'status_reason', c.status_reason,
      'reject_limit', c.reject_limit, 'reject_window_minutes', c.reject_window_minutes,
      'auto_suspended', c.status = 'suspended' AND c.updated_by IS NULL,
      'last_suspended_at', (SELECT max(e.at) FROM public.research_events e WHERE e.event = 'connector:suspended' AND e.details->>'connector' = c.key),
      'accepted', (SELECT count(*) FROM public.research_captures x WHERE x.connector_key = c.key AND x.captured_at >= since),
      'rejected', (SELECT count(*) FROM public.research_refusals r WHERE r.connector_key = c.key AND r.kind = 'capture' AND r.refused_at >= since),
      'rejected_in_window', (SELECT count(*) FROM public.research_refusals r WHERE r.connector_key = c.key AND r.kind = 'capture' AND r.refused_at > now() - make_interval(mins => c.reject_window_minutes)),
      'trend', (SELECT jsonb_agg(jsonb_build_object('day', g.day::date,
          'accepted', (SELECT count(*) FROM public.research_captures x WHERE x.connector_key = c.key AND x.captured_at >= g.day AND x.captured_at < g.day + interval '1 day'),
          'rejected', (SELECT count(*) FROM public.research_refusals r WHERE r.connector_key = c.key AND r.kind = 'capture' AND r.refused_at >= g.day AND r.refused_at < g.day + interval '1 day'))
          ORDER BY g.day)
        FROM generate_series(since, date_trunc('day', now()), interval '1 day') AS g(day))
    ) ORDER BY c.name) FROM public.research_connectors c), '[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.research_rejection_dashboard(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_rejection_dashboard(int) TO authenticated, service_role;