CREATE OR REPLACE FUNCTION public.research_approve_source(_project uuid, _key text, _approve boolean, _legal_basis text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
  IF NOT public.has_project_role(auth.uid(), _project, ARRAY['owner','curator','engagement_lead']) THEN RAISE EXCEPTION 'Only the engagement lead, Curator or owner can approve sources for this engagement.'; END IF;
  IF NOT public.gate_signed(_project, 'G0') THEN RAISE EXCEPTION 'The brief is not signed (G0); sources cannot be approved.'; END IF;
  b := public.project_current_brief_id(_project);
  IF b IS NULL THEN RAISE EXCEPTION 'The brief is not signed (G0); sources cannot be approved.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.research_connectors WHERE key=_key) THEN RAISE EXCEPTION 'Unknown connector.'; END IF;
  IF _approve AND length(trim(coalesce(_legal_basis,''))) = 0 THEN RAISE EXCEPTION 'State the legal basis in the signed brief for this source.'; END IF;
  INSERT INTO public.research_approved_sources(project_id,connector_key,status,brief_id,legal_basis,actor)
    VALUES (_project,_key,CASE WHEN _approve THEN 'approved' ELSE 'withdrawn' END,b,coalesce(nullif(trim(_legal_basis),''),'Withdrawn'),auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.research_approve_source(uuid,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_approve_source(uuid,text,boolean,text) TO authenticated;