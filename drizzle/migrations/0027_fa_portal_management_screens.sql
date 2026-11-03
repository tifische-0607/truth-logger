-- Phase 8: Management screens. Read-only portfolio feed; Management and the owner only.
CREATE OR REPLACE FUNCTION public.mgmt_can_open(u uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.has_role(u,'management') OR public.has_role(u,'owner'))
     AND NOT public.portal_has_client_identity(u)
$$;

CREATE OR REPLACE FUNCTION public.mgmt_portfolio()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.mgmt_can_open(auth.uid()) THEN
    RAISE EXCEPTION 'Management is open to Management and the owner only.';
  END IF;
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'name', coalesce(c.display_name, c.name), 'kind', c.kind,
        'portal_enabled', c.portal_enabled,
        'admins', (SELECT count(*) FROM public.client_users u WHERE u.client_id=c.id AND u.status IN ('pending','active')),
        'shared_documents', (SELECT count(*) FROM public.documents d WHERE d.client_id=c.id AND d.visibility='client' AND NOT d.voided)
      ) ORDER BY c.name) FROM public.clients c), '[]'::jsonb),
    'engagements', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'client_id', p.client_id, 'status', p.status
      ) ORDER BY p.code) FROM public.projects p), '[]'::jsonb),
    'clocks', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'project_id', k.project_id, 'phase', k.phase, 'cycle_no', k.cycle_no,
        'started_at', k.started_at, 'completed_at', k.completed_at,
        'owner_role', s.owner_role, 'escalation_chain', s.escalation_chain
      ) || public.sla_clock_status(k.id) ORDER BY k.started_at) FROM public.phase_clocks k JOIN public.sop_definitions s ON s.id=k.sop_id), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.mgmt_can_open(uuid), public.mgmt_portfolio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mgmt_can_open(uuid), public.mgmt_portfolio() TO authenticated;