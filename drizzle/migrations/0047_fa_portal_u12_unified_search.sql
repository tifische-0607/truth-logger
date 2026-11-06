-- U12 Unified evidence search. Indexes and content stay on DarkNight; the portal keeps settings, saved searches (analyst-typed queries), promotions, a search log and the access filter.

CREATE TABLE public.srch_content_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  types text[] NOT NULL CHECK (types <@ ARRAY['captures','cases','narratives','entities','reports']),
  set_by uuid NOT NULL, set_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.srch_content_types TO authenticated; GRANT ALL ON public.srch_content_types TO service_role;
ALTER TABLE public.srch_content_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY srch_types_staff_read ON public.srch_content_types FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER srch_types_append_only BEFORE UPDATE OR DELETE ON public.srch_content_types FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.srch_saved (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  mode text NOT NULL CHECK (mode IN ('keyword','meaning','image')),
  query text CHECK (query IS NULL OR length(query) <= 500),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.srch_saved TO authenticated; GRANT ALL ON public.srch_saved TO service_role;
ALTER TABLE public.srch_saved ENABLE ROW LEVEL SECURITY;
CREATE POLICY srch_saved_staff_read ON public.srch_saved FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER srch_saved_append_only BEFORE UPDATE OR DELETE ON public.srch_saved FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.srch_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_id uuid NOT NULL REFERENCES public.srch_saved(id) ON DELETE RESTRICT,
  step text NOT NULL CHECK (step IN ('requested','approved','declined')),
  requirement_id uuid REFERENCES public.research_requirements(id) ON DELETE RESTRICT,
  reason text,
  actor uuid NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  CHECK (step <> 'approved' OR requirement_id IS NOT NULL),
  CHECK (step <> 'declined' OR length(trim(coalesce(reason,''))) > 0)
);
GRANT SELECT ON public.srch_promotions TO authenticated; GRANT ALL ON public.srch_promotions TO service_role;
ALTER TABLE public.srch_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY srch_promotions_staff_read ON public.srch_promotions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.srch_saved s WHERE s.id=saved_id AND public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), s.project_id)));
CREATE TRIGGER srch_promotions_append_only BEFORE UPDATE OR DELETE ON public.srch_promotions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.srch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid, at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.srch_log TO authenticated; GRANT ALL ON public.srch_log TO service_role;
ALTER TABLE public.srch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY srch_log_settings_read ON public.srch_log FOR SELECT TO authenticated USING (public.ew_is_settings_editor(auth.uid()) OR actor = auth.uid());
CREATE TRIGGER srch_log_append_only BEFORE UPDATE OR DELETE ON public.srch_log FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.srch_set_content_types(_types text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can choose which content types are indexed.'; END IF;
  IF NOT (coalesce(_types,'{}') <@ ARRAY['captures','cases','narratives','entities','reports']) THEN RAISE EXCEPTION 'Unknown content type.'; END IF;
  INSERT INTO public.srch_content_types(types,set_by) VALUES (coalesce(_types,'{}'),auth.uid());
  INSERT INTO public.srch_log(action,detail,actor) VALUES ('content_types_set', jsonb_build_object('types',coalesce(_types,'{}')), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.srch_current_types() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT types FROM public.srch_content_types ORDER BY set_at DESC, id DESC LIMIT 1), '{}') $$;

-- Access filter. SECURITY INVOKER on purpose: the capture/item lookups run under the caller's own row-level rules,
-- so search can never reveal anything the caller cannot already open.
CREATE OR REPLACE FUNCTION public.srch_visible(_results jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; out jsonb := '[]'::jsonb; cid uuid; pid uuid; k text;
BEGIN
  IF NOT public.ew_is_analyst(auth.uid()) THEN RETURN '[]'::jsonb; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(_results,'[]'::jsonb)) LOOP
    BEGIN cid := (r->'capture'->>'id')::uuid; pid := nullif(r->>'project_id','')::uuid; EXCEPTION WHEN others THEN CONTINUE; END;
    k := r->'capture'->>'kind';
    CONTINUE WHEN cid IS NULL OR pid IS NULL OR NOT public.can_access_project(auth.uid(), pid);
    IF k = 'research' AND EXISTS (SELECT 1 FROM public.research_captures rc WHERE rc.id=cid AND rc.project_id=pid) THEN
      out := out || jsonb_build_array(jsonb_build_object('key', r->>'key', 'run_id', (SELECT run_id FROM public.research_captures WHERE id=cid)));
    ELSIF k = 'case_item' AND EXISTS (SELECT 1 FROM public.items i WHERE i.id=cid) THEN
      out := out || jsonb_build_array(jsonb_build_object('key', r->>'key', 'item_id', cid));
    END IF;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.srch_log_search(_project uuid, _mode text, _filters text[], _shown int, _hidden int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_analyst(auth.uid()) THEN RAISE EXCEPTION 'Search is for FridayAnalytics staff only.'; END IF;
  INSERT INTO public.srch_log(project_id,action,detail,actor) VALUES (_project,'searched', jsonb_build_object('mode',_mode,'filters',coalesce(_filters,'{}'),'shown',_shown,'hidden',_hidden), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.srch_save(_project uuid, _name text, _mode text, _query text, _filters jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), _project)) THEN RAISE EXCEPTION 'Only analysts on this engagement can save a search.'; END IF;
  INSERT INTO public.srch_saved(project_id,name,mode,query,filters,created_by) VALUES (_project,trim(_name),_mode,nullif(trim(_query),''),coalesce(_filters,'{}'),auth.uid()) RETURNING id INTO sid;
  INSERT INTO public.srch_log(project_id,action,detail,actor) VALUES (_project,'search_saved', jsonb_build_object('saved_id',sid), auth.uid());
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.srch_promotion_state(_saved uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT step FROM public.srch_promotions WHERE saved_id=_saved ORDER BY at DESC, id DESC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.srch_request_promotion(_saved uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.srch_saved;
BEGIN
  SELECT * INTO s FROM public.srch_saved WHERE id=_saved;
  IF NOT FOUND OR NOT (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), s.project_id)) THEN RAISE EXCEPTION 'Only analysts on this engagement can ask for a saved search to become a monitoring requirement.'; END IF;
  IF public.srch_promotion_state(_saved) IN ('requested','approved') THEN RAISE EXCEPTION 'This saved search is already waiting for, or has, Curator approval.'; END IF;
  INSERT INTO public.srch_promotions(saved_id,step,actor) VALUES (_saved,'requested',auth.uid());
  INSERT INTO public.srch_log(project_id,action,detail,actor) VALUES (s.project_id,'promotion_requested', jsonb_build_object('saved_id',_saved), auth.uid());
END $$;

-- Curator approval links the saved search to a requirement already in force in the engagement's U4 register,
-- so the register stays the only source of requirement IDs.
CREATE OR REPLACE FUNCTION public.srch_decide_promotion(_saved uuid, _approve boolean, _requirement uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.srch_saved;
BEGIN
  SELECT * INTO s FROM public.srch_saved WHERE id=_saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown saved search.'; END IF;
  IF NOT (public.has_role(auth.uid(),'curator') OR public.has_project_role(auth.uid(), s.project_id, ARRAY['curator'])) OR public.portal_has_client_identity(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Curator can approve a saved search as a monitoring requirement.'; END IF;
  IF coalesce(public.srch_promotion_state(_saved),'') <> 'requested' THEN RAISE EXCEPTION 'There is no pending request for this saved search.'; END IF;
  IF _approve AND NOT EXISTS (SELECT 1 FROM public.research_requirements_in_force(s.project_id) q WHERE q.id=_requirement AND q.status='active') THEN
    RAISE EXCEPTION 'Choose an active requirement from this engagement''s register.'; END IF;
  INSERT INTO public.srch_promotions(saved_id,step,requirement_id,reason,actor)
    VALUES (_saved, CASE WHEN _approve THEN 'approved' ELSE 'declined' END, CASE WHEN _approve THEN _requirement END, nullif(trim(_reason),''), auth.uid());
  INSERT INTO public.srch_log(project_id,action,detail,actor) VALUES (s.project_id, CASE WHEN _approve THEN 'promotion_approved' ELSE 'promotion_declined' END, jsonb_build_object('saved_id',_saved,'requirement_id',_requirement), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.srch_overview(_project uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ok boolean := _project IS NOT NULL AND public.can_access_project(auth.uid(), _project);
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid())) THEN RAISE EXCEPTION 'Search is for FridayAnalytics staff only.'; END IF;
  RETURN jsonb_build_object(
    'can_edit_settings', public.ew_is_settings_editor(auth.uid()),
    'is_curator', (public.has_role(auth.uid(),'curator') OR (ok AND public.has_project_role(auth.uid(), _project, ARRAY['curator']))) AND NOT public.portal_has_client_identity(auth.uid()),
    'content_types', to_jsonb(public.srch_current_types()),
    'saved', CASE WHEN ok THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'mode',s.mode,'query',s.query,'filters',s.filters,'at',s.created_at,
        'promotion',public.srch_promotion_state(s.id),
        'requirement',(SELECT r.code FROM public.srch_promotions p JOIN public.research_requirements r ON r.id=p.requirement_id WHERE p.saved_id=s.id AND p.step='approved' ORDER BY p.at DESC LIMIT 1)) ORDER BY s.created_at DESC)
      FROM public.srch_saved s WHERE s.project_id=_project),'[]'::jsonb) ELSE '[]'::jsonb END,
    'requirements', CASE WHEN ok THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'code',q.code)) FROM public.research_requirements_in_force(_project) q WHERE q.status='active'),'[]'::jsonb) ELSE '[]'::jsonb END
  );
END $$;

REVOKE ALL ON public.srch_content_types, public.srch_saved, public.srch_promotions, public.srch_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.srch_content_types, public.srch_saved, public.srch_promotions, public.srch_log FROM authenticated;
REVOKE ALL ON FUNCTION public.srch_set_content_types(text[]), public.srch_current_types(), public.srch_visible(jsonb), public.srch_log_search(uuid,text,text[],int,int),
  public.srch_save(uuid,text,text,text,jsonb), public.srch_promotion_state(uuid), public.srch_request_promotion(uuid), public.srch_decide_promotion(uuid,boolean,uuid,text),
  public.srch_overview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.srch_set_content_types(text[]), public.srch_visible(jsonb), public.srch_log_search(uuid,text,text[],int,int),
  public.srch_save(uuid,text,text,text,jsonb), public.srch_request_promotion(uuid), public.srch_decide_promotion(uuid,boolean,uuid,text), public.srch_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.srch_current_types() TO service_role;