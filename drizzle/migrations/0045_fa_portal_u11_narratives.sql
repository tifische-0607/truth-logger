-- U11 Narrative and coordination detection. Content, embeddings and clusters stay on DarkNight; the portal keeps identifiers, analyst decisions, thresholds and logs only.

CREATE OR REPLACE FUNCTION public.nar_captures_ok(_project uuid, _captures uuid[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT _captures IS NOT NULL AND cardinality(_captures) > 0
    AND NOT EXISTS (SELECT 1 FROM unnest(_captures) c WHERE NOT EXISTS (SELECT 1 FROM public.research_captures rc WHERE rc.id=c AND rc.project_id=_project)) $$;

CREATE TABLE public.nar_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL CHECK (key IN ('similarity_min','cluster_window_minutes','coord_min_accounts','coord_window_minutes','new_account_min')),
  value numeric,
  set_by uuid, set_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nar_thresholds TO authenticated; GRANT ALL ON public.nar_thresholds TO service_role;
ALTER TABLE public.nar_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY nar_thresholds_staff_read ON public.nar_thresholds FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER nar_thresholds_append_only BEFORE UPDATE OR DELETE ON public.nar_thresholds FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.nar_threshold(_key text) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT value FROM public.nar_thresholds WHERE key=_key ORDER BY set_at DESC, id DESC LIMIT 1 $$;

CREATE TABLE public.nar_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  cluster_ref text NOT NULL CHECK (public.lnk_ident_ok(cluster_ref)),
  decision text NOT NULL CHECK (decision IN ('confirmed','rejected')),
  name text CHECK (name IS NULL OR length(trim(name)) BETWEEN 1 AND 120),
  myth_refs text[] NOT NULL DEFAULT '{}',
  scenario_refs text[] NOT NULL DEFAULT '{}',
  capture_ids uuid[] NOT NULL CHECK (cardinality(capture_ids) > 0),
  similarity_min numeric NOT NULL, window_minutes numeric NOT NULL,
  standard_version_id uuid NOT NULL REFERENCES public.framework_versions(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision = 'rejected' OR name IS NOT NULL)
);
GRANT SELECT ON public.nar_narratives TO authenticated; GRANT ALL ON public.nar_narratives TO service_role;
ALTER TABLE public.nar_narratives ENABLE ROW LEVEL SECURITY;
CREATE POLICY nar_narratives_staff_read ON public.nar_narratives FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER nar_narratives_append_only BEFORE UPDATE OR DELETE ON public.nar_narratives FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.nar_coordination (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  finding_ref text NOT NULL CHECK (public.lnk_ident_ok(finding_ref)),
  kind text NOT NULL CHECK (kind IN ('near_identical_text','same_links','new_account_burst')),
  decision text NOT NULL CHECK (decision IN ('confirmed','rejected')),
  account_refs text[] NOT NULL CHECK (cardinality(account_refs) > 0),
  capture_ids uuid[] NOT NULL CHECK (cardinality(capture_ids) > 0),
  thresholds jsonb NOT NULL,
  standard_version_id uuid NOT NULL REFERENCES public.framework_versions(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nar_coordination TO authenticated; GRANT ALL ON public.nar_coordination TO service_role;
ALTER TABLE public.nar_coordination ENABLE ROW LEVEL SECURITY;
CREATE POLICY nar_coordination_staff_read ON public.nar_coordination FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER nar_coordination_append_only BEFORE UPDATE OR DELETE ON public.nar_coordination FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- Guard on every row, whoever writes it: a "coordinated" label exists only as an analyst confirmation that cites captures and the standard.
CREATE OR REPLACE FUNCTION public.nar_row_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_analyst(NEW.decided_by) THEN RAISE EXCEPTION 'Only an analyst can confirm or reject a finding.'; END IF;
  IF NOT public.nar_captures_ok(NEW.project_id, NEW.capture_ids) THEN RAISE EXCEPTION 'Every finding must cite captures from this engagement.'; END IF;
  IF NEW.standard_version_id IS DISTINCT FROM public.lnk_standard_in_force() THEN RAISE EXCEPTION 'A finding must record the universal standard version in force.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nar_narratives_guard BEFORE INSERT ON public.nar_narratives FOR EACH ROW EXECUTE FUNCTION public.nar_row_guard();
CREATE TRIGGER nar_coordination_guard BEFORE INSERT ON public.nar_coordination FOR EACH ROW EXECUTE FUNCTION public.nar_row_guard();

CREATE TABLE public.nar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nar_events TO authenticated; GRANT ALL ON public.nar_events TO service_role;
ALTER TABLE public.nar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY nar_events_staff_read ON public.nar_events FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER nar_events_append_only BEFORE UPDATE OR DELETE ON public.nar_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.nar_set_threshold(_key text, _value numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can change narrative and coordination thresholds.'; END IF;
  IF _value IS NOT NULL AND _value <> trunc(_value) THEN RAISE EXCEPTION 'A threshold must be a whole number.'; END IF;
  IF _value IS NOT NULL AND _key IN ('cluster_window_minutes','coord_window_minutes') AND (_value < 1 OR _value > 4320) THEN
    RAISE EXCEPTION 'A time window must be from 1 minute to 72 hours.'; END IF;
  IF _value IS NOT NULL AND _key NOT IN ('cluster_window_minutes','coord_window_minutes') AND (_value < 1 OR _value > 20) THEN
    RAISE EXCEPTION 'A threshold must be a whole number from 1 to 20.'; END IF;
  INSERT INTO public.nar_thresholds(key,value,set_by) VALUES (_key,_value,auth.uid());
  INSERT INTO public.nar_events(action,detail,actor) VALUES ('threshold_set', jsonb_build_object('key',_key,'value',_value), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.nar_decide_cluster(_project uuid, _cluster text, _confirm boolean, _name text, _myths text[], _scenarios text[], _captures uuid[], _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sv uuid := public.lnk_standard_in_force(); s numeric := public.nar_threshold('similarity_min'); w numeric := public.nar_threshold('cluster_window_minutes'); nid uuid;
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), _project)) THEN RAISE EXCEPTION 'Only analysts on this engagement can name and confirm a narrative.'; END IF;
  IF s IS NULL OR w IS NULL THEN RAISE EXCEPTION 'Threshold not set: narrative clusters cannot be confirmed until the similarity and time-window thresholds are set.'; END IF;
  IF sv IS NULL THEN RAISE EXCEPTION 'The FridayAnalytics universal standard has no Curator-approved version in force, so narratives cannot be recorded yet.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(_myths,'{}') || coalesce(_scenarios,'{}')) x WHERE NOT public.lnk_ident_ok(x)) THEN RAISE EXCEPTION 'Myths and scenarios are cited by their identifiers in the universal standard only.'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'Give a reason for the decision.'; END IF;
  INSERT INTO public.nar_narratives(project_id,cluster_ref,decision,name,myth_refs,scenario_refs,capture_ids,similarity_min,window_minutes,standard_version_id,reason,decided_by)
    VALUES (_project,trim(_cluster),CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END,CASE WHEN _confirm THEN nullif(trim(_name),'') END,
      coalesce(_myths,'{}'),coalesce(_scenarios,'{}'),_captures,s,w,sv,trim(_reason),auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.nar_events(project_id,action,detail,actor) VALUES (_project, CASE WHEN _confirm THEN 'narrative_confirmed' ELSE 'cluster_rejected' END, jsonb_build_object('id',nid,'cluster',trim(_cluster)), auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.nar_decide_coordination(_project uuid, _finding text, _kind text, _confirm boolean, _accounts text[], _captures uuid[], _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sv uuid := public.lnk_standard_in_force(); a numeric := public.nar_threshold('coord_min_accounts'); w numeric := public.nar_threshold('coord_window_minutes');
  na numeric := public.nar_threshold('new_account_min'); cid uuid; fed text := 'not_fed'; sig jsonb;
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), _project)) THEN RAISE EXCEPTION 'Only analysts on this engagement can confirm coordination.'; END IF;
  IF w IS NULL OR (CASE WHEN _kind='new_account_burst' THEN na ELSE a END) IS NULL THEN RAISE EXCEPTION 'Threshold not set: nothing can be labelled coordinated until the coordination thresholds are set.'; END IF;
  IF sv IS NULL THEN RAISE EXCEPTION 'The FridayAnalytics universal standard has no Curator-approved version in force, so coordination cannot be recorded yet.'; END IF;
  IF _accounts IS NULL OR EXISTS (SELECT 1 FROM unnest(_accounts) x WHERE NOT public.lnk_ident_ok(x)) THEN RAISE EXCEPTION 'Entity identifiers only — no names or content may be stored.'; END IF;
  IF _confirm AND cardinality(_accounts) < (CASE WHEN _kind='new_account_burst' THEN na ELSE a END) THEN RAISE EXCEPTION 'Fewer accounts than the coordination threshold; this cannot be labelled coordinated.'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'Give a reason for the decision.'; END IF;
  INSERT INTO public.nar_coordination(project_id,finding_ref,kind,decision,account_refs,capture_ids,thresholds,standard_version_id,reason,decided_by)
    VALUES (_project,trim(_finding),_kind,CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END,_accounts,_captures,
      jsonb_build_object('coord_min_accounts',a,'coord_window_minutes',w,'new_account_min',na),sv,trim(_reason),auth.uid()) RETURNING id INTO cid;
  IF _confirm THEN
    BEGIN
      sig := public.ew_record_signal(_project, CASE WHEN _kind='new_account_burst' THEN 'new_accounts' ELSE 'coordinated_posting' END, cardinality(_accounts), 'DSP', _captures, 'From confirmed coordination finding');
      fed := sig->>'outcome';
    EXCEPTION WHEN raise_exception THEN fed := 'refused: ' || SQLERRM; END;
    INSERT INTO public.lnk_events(project_id,action,detail,actor) VALUES (_project,'coordination_confirmed', jsonb_build_object('coordination_id',cid,'accounts',_accounts), auth.uid());
  END IF;
  INSERT INTO public.nar_events(project_id,action,detail,actor) VALUES (_project, CASE WHEN _confirm THEN 'coordination_confirmed' ELSE 'coordination_rejected' END, jsonb_build_object('id',cid,'finding',trim(_finding),'early_warning',fed), auth.uid());
  RETURN jsonb_build_object('id',cid,'early_warning',fed);
END $$;

CREATE OR REPLACE FUNCTION public.nar_overview(_project uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ok boolean := _project IS NOT NULL AND public.can_access_project(auth.uid(), _project);
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid())) THEN RAISE EXCEPTION 'Narrative analysis is for FridayAnalytics staff only.'; END IF;
  RETURN jsonb_build_object(
    'can_edit_settings', public.ew_is_settings_editor(auth.uid()),
    'standard_version_id', public.lnk_standard_in_force(),
    'thresholds', (SELECT jsonb_object_agg(k, public.nar_threshold(k)) FROM unnest(ARRAY['similarity_min','cluster_window_minutes','coord_min_accounts','coord_window_minutes','new_account_min']) k),
    'narratives', CASE WHEN ok THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('cluster_ref',n.cluster_ref,'decision',n.decision,'name',n.name,'myths',n.myth_refs,'scenarios',n.scenario_refs,'captures',n.capture_ids,'standard_version_id',n.standard_version_id,'at',n.decided_at) ORDER BY n.decided_at DESC) FROM public.nar_narratives n WHERE n.project_id=_project),'[]'::jsonb) ELSE '[]'::jsonb END,
    'coordination', CASE WHEN ok THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('finding_ref',c.finding_ref,'kind',c.kind,'decision',c.decision,'accounts',c.account_refs,'captures',c.capture_ids,'standard_version_id',c.standard_version_id,'at',c.decided_at) ORDER BY c.decided_at DESC) FROM public.nar_coordination c WHERE c.project_id=_project),'[]'::jsonb) ELSE '[]'::jsonb END
  );
END $$;

-- For the DarkNight gateway (service role only): confirmed coordination becomes "coordinated_with" links in the U9 graph.
CREATE OR REPLACE FUNCTION public.nar_confirmed_coordination(_project uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'finding_ref',c.finding_ref,'kind',c.kind,'accounts',c.account_refs,'captures',c.capture_ids,'standard_version_id',c.standard_version_id)),'[]'::jsonb)
  FROM public.nar_coordination c WHERE c.project_id=_project AND c.decision='confirmed' $$;

REVOKE ALL ON public.nar_thresholds, public.nar_narratives, public.nar_coordination, public.nar_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.nar_thresholds, public.nar_narratives, public.nar_coordination, public.nar_events FROM authenticated;
REVOKE ALL ON FUNCTION public.nar_captures_ok(uuid,uuid[]), public.nar_threshold(text), public.nar_row_guard(), public.nar_set_threshold(text,numeric),
  public.nar_decide_cluster(uuid,text,boolean,text,text[],text[],uuid[],text), public.nar_decide_coordination(uuid,text,text,boolean,text[],uuid[],text),
  public.nar_overview(uuid), public.nar_confirmed_coordination(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nar_set_threshold(text,numeric), public.nar_decide_cluster(uuid,text,boolean,text,text[],text[],uuid[],text),
  public.nar_decide_coordination(uuid,text,text,boolean,text[],uuid[],text), public.nar_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nar_confirmed_coordination(uuid), public.nar_threshold(text) TO service_role;