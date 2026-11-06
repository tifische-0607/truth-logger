-- U9 Link analysis. Graph contents stay on DarkNight; the portal stores only identifiers, decisions and released-graph references.

CREATE OR REPLACE FUNCTION public.lnk_ident_ok(_v text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _v IS NOT NULL AND _v ~ '^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$' $$;

CREATE OR REPLACE FUNCTION public.lnk_standard_in_force() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.fw_active_version(id) FROM public.framework_entries WHERE code='FA-USTD' LIMIT 1 $$;

CREATE TABLE public.lnk_merge_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  entity_a text NOT NULL CHECK (public.lnk_ident_ok(entity_a)),
  entity_b text NOT NULL CHECK (public.lnk_ident_ok(entity_b)),
  suggestion_ref text CHECK (suggestion_ref IS NULL OR public.lnk_ident_ok(suggestion_ref)),
  decision text NOT NULL CHECK (decision IN ('confirmed','rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  standard_version_id uuid NOT NULL REFERENCES public.framework_versions(id) ON DELETE RESTRICT,
  decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK (entity_a <> entity_b)
);
GRANT SELECT ON public.lnk_merge_decisions TO authenticated; GRANT ALL ON public.lnk_merge_decisions TO service_role;
ALTER TABLE public.lnk_merge_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY lnk_merges_staff_read ON public.lnk_merge_decisions FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER lnk_merges_append_only BEFORE UPDATE OR DELETE ON public.lnk_merge_decisions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.lnk_released_graphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  output_id uuid NOT NULL REFERENCES public.project_outputs(id) ON DELETE RESTRICT,
  graph_ref text NOT NULL CHECK (public.lnk_ident_ok(graph_ref)),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  standard_version_id uuid NOT NULL REFERENCES public.framework_versions(id) ON DELETE RESTRICT,
  released_by uuid NOT NULL, released_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (output_id, graph_ref)
);
GRANT SELECT ON public.lnk_released_graphs TO authenticated; GRANT ALL ON public.lnk_released_graphs TO service_role;
ALTER TABLE public.lnk_released_graphs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lnk_released_read ON public.lnk_released_graphs FOR SELECT TO authenticated USING (
  (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id))
  OR EXISTS (SELECT 1 FROM public.project_outputs o JOIN public.projects p ON p.id=o.project_id
             WHERE o.id=output_id AND o.status='released' AND o.shared_with_client AND public.portal_is_member(auth.uid(), p.client_id)));
CREATE TRIGGER lnk_released_append_only BEFORE UPDATE OR DELETE ON public.lnk_released_graphs FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.lnk_release_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.project_outputs;
BEGIN
  SELECT * INTO o FROM public.project_outputs WHERE id=NEW.output_id;
  IF NOT FOUND OR o.project_id <> NEW.project_id THEN RAISE EXCEPTION 'The report must belong to this engagement.'; END IF;
  IF o.status <> 'released' THEN RAISE EXCEPTION 'A graph can be shown to the client only inside a released report.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lnk_release_report_guard BEFORE INSERT ON public.lnk_released_graphs FOR EACH ROW EXECUTE FUNCTION public.lnk_release_guard();

CREATE TABLE public.lnk_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL CHECK (key IN ('burst_min_accounts','burst_window_minutes')),
  value numeric CHECK (value IS NULL OR value > 0),
  set_by uuid, set_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lnk_thresholds TO authenticated; GRANT ALL ON public.lnk_thresholds TO service_role;
ALTER TABLE public.lnk_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY lnk_thresholds_staff_read ON public.lnk_thresholds FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER lnk_thresholds_append_only BEFORE UPDATE OR DELETE ON public.lnk_thresholds FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.lnk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lnk_events TO authenticated; GRANT ALL ON public.lnk_events TO service_role;
ALTER TABLE public.lnk_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY lnk_events_staff_read ON public.lnk_events FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER lnk_events_append_only BEFORE UPDATE OR DELETE ON public.lnk_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.lnk_decide_merge(_project uuid, _a text, _b text, _confirm boolean, _reason text, _suggestion text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sv uuid := public.lnk_standard_in_force(); mid uuid;
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), _project)) THEN RAISE EXCEPTION 'Only analysts on this engagement can confirm or reject a merge.'; END IF;
  IF sv IS NULL THEN RAISE EXCEPTION 'The FridayAnalytics universal standard has no Curator-approved version in force, so merges cannot be recorded yet.'; END IF;
  IF NOT public.lnk_ident_ok(_a) OR NOT public.lnk_ident_ok(_b) THEN RAISE EXCEPTION 'Entity identifiers only — no names or content may be stored.'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'Give a reason for the decision.'; END IF;
  INSERT INTO public.lnk_merge_decisions(project_id,entity_a,entity_b,suggestion_ref,decision,reason,standard_version_id,decided_by)
    VALUES (_project, least(_a,_b), greatest(_a,_b), nullif(trim(_suggestion),''), CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END, trim(_reason), sv, auth.uid()) RETURNING id INTO mid;
  INSERT INTO public.lnk_events(project_id,action,detail,actor) VALUES (_project, CASE WHEN _confirm THEN 'merge_confirmed' ELSE 'merge_rejected' END, jsonb_build_object('decision_id',mid,'a',least(_a,_b),'b',greatest(_a,_b)), auth.uid());
  RETURN mid;
END $$;

CREATE OR REPLACE FUNCTION public.lnk_release_graph(_project uuid, _output uuid, _graph text, _sha256 text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sv uuid := public.lnk_standard_in_force(); rid uuid;
BEGIN
  IF NOT public.can_manage_project(auth.uid(), _project) THEN RAISE EXCEPTION 'Only the engagement lead, Curator or owner can attach a graph to a report.'; END IF;
  IF sv IS NULL THEN RAISE EXCEPTION 'The FridayAnalytics universal standard has no Curator-approved version in force, so graphs cannot be released yet.'; END IF;
  INSERT INTO public.lnk_released_graphs(project_id,output_id,graph_ref,snapshot_sha256,standard_version_id,released_by)
    VALUES (_project,_output,trim(_graph),lower(trim(_sha256)),sv,auth.uid()) RETURNING id INTO rid;
  INSERT INTO public.lnk_events(project_id,action,detail,actor) VALUES (_project,'graph_released', jsonb_build_object('release_id',rid,'output_id',_output,'graph_ref',trim(_graph)), auth.uid());
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.lnk_set_threshold(_key text, _value numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can change coordination thresholds.'; END IF;
  INSERT INTO public.lnk_thresholds(key,value,set_by) VALUES (_key,_value,auth.uid());
  INSERT INTO public.lnk_events(action,detail,actor) VALUES ('threshold_set', jsonb_build_object('key',_key,'value',_value), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.lnk_overview(_project uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid())) THEN RAISE EXCEPTION 'Link analysis is for FridayAnalytics staff only.'; END IF;
  RETURN jsonb_build_object(
    'can_edit_settings', public.ew_is_settings_editor(auth.uid()),
    'standard_version_id', public.lnk_standard_in_force(),
    'thresholds', (SELECT jsonb_object_agg(k, (SELECT value FROM public.lnk_thresholds WHERE key=k ORDER BY set_at DESC, id DESC LIMIT 1)) FROM unnest(ARRAY['burst_min_accounts','burst_window_minutes']) k),
    'merges', CASE WHEN _project IS NULL OR NOT public.can_access_project(auth.uid(), _project) THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('a',m.entity_a,'b',m.entity_b,'decision',m.decision,'reason',m.reason,'at',m.decided_at) ORDER BY m.decided_at DESC) FROM public.lnk_merge_decisions m WHERE m.project_id=_project),'[]'::jsonb) END,
    'released', CASE WHEN _project IS NULL OR NOT public.can_access_project(auth.uid(), _project) THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('graph_ref',r.graph_ref,'output_id',r.output_id,'sha256',r.snapshot_sha256,'at',r.released_at)) FROM public.lnk_released_graphs r WHERE r.project_id=_project),'[]'::jsonb) END
  );
END $$;

CREATE OR REPLACE FUNCTION public.portal_released_graphs(c uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid := public.portal_resolve_client(c);
BEGIN
  IF cid IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (public.portal_is_member(auth.uid(), cid) OR public.portal_is_staff(auth.uid())) THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'graph_ref',r.graph_ref,'sha256',r.snapshot_sha256,'report',o.title,'engagement',p.name,'released_at',r.released_at))
    FROM public.lnk_released_graphs r JOIN public.project_outputs o ON o.id=r.output_id JOIN public.projects p ON p.id=r.project_id
    WHERE p.client_id=cid AND o.status='released' AND o.shared_with_client),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.lnk_standard_in_force(), public.lnk_decide_merge(uuid,text,text,boolean,text,text), public.lnk_release_graph(uuid,uuid,text,text),
  public.lnk_set_threshold(text,numeric), public.lnk_overview(uuid), public.portal_released_graphs(uuid), public.lnk_release_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lnk_standard_in_force(), public.lnk_decide_merge(uuid,text,text,boolean,text,text), public.lnk_release_graph(uuid,uuid,text,text),
  public.lnk_set_threshold(text,numeric), public.lnk_overview(uuid), public.portal_released_graphs(uuid) TO authenticated;
