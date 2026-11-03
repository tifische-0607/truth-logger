-- U8: internal framework library and the FridayAnalytics universal standard. Additive only.
CREATE OR REPLACE FUNCTION public.fw_is_editor(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (public.has_role(u,'owner') OR public.has_role(u,'curator')) AND NOT public.portal_has_client_identity(u) $$;
CREATE OR REPLACE FUNCTION public.fw_is_reader(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.portal_is_staff(u) AND NOT public.portal_has_client_identity(u) $$;

CREATE TABLE public.framework_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,40}$'),
  name text NOT NULL CHECK (length(trim(name))>0),
  kind text NOT NULL CHECK (kind IN ('universal_standard','framework','standard','lexicon','indicators','thresholds','glossary')),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX framework_one_universal ON public.framework_entries((true)) WHERE kind='universal_standard';
GRANT SELECT ON public.framework_entries TO authenticated; GRANT ALL ON public.framework_entries TO service_role;
ALTER TABLE public.framework_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read framework entries" ON public.framework_entries FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_entries_append_only BEFORE UPDATE OR DELETE ON public.framework_entries FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.framework_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.framework_entries(id),
  version integer NOT NULL,
  effective_from date NOT NULL,
  summary text NOT NULL CHECK (length(trim(summary))>0),
  body text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items)='array'),
  change_note text NOT NULL CHECK (length(trim(change_note))>0),
  author uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id, version)
);
GRANT SELECT ON public.framework_versions TO authenticated; GRANT ALL ON public.framework_versions TO service_role;
ALTER TABLE public.framework_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read framework versions" ON public.framework_versions FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_versions_append_only BEFORE UPDATE OR DELETE ON public.framework_versions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.framework_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL UNIQUE REFERENCES public.framework_versions(id),
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  note text, decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.framework_approvals TO authenticated; GRANT ALL ON public.framework_approvals TO service_role;
ALTER TABLE public.framework_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read framework approvals" ON public.framework_approvals FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_approvals_append_only BEFORE UPDATE OR DELETE ON public.framework_approvals FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.framework_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES public.framework_entries(id),
  title text NOT NULL CHECK (length(trim(title))>0),
  file_name text NOT NULL, storage_path text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes>0),
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.framework_sources TO authenticated; GRANT ALL ON public.framework_sources TO service_role;
ALTER TABLE public.framework_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read framework sources" ON public.framework_sources FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_sources_append_only BEFORE UPDATE OR DELETE ON public.framework_sources FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.framework_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.framework_sources(id),
  category text NOT NULL CHECK (category IN ('definition','indicator','risk_factor','scoring','lexicon_term','method')),
  proposal text NOT NULL CHECK (proposal IN ('strengthen','add','conflict')),
  text text NOT NULL CHECK (length(trim(text))>0),
  passage text NOT NULL CHECK (length(trim(passage))>0),
  page text NOT NULL CHECK (length(trim(page))>0),
  overlap_note text,
  method text NOT NULL CHECK (method IN ('manual','extracted')),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.framework_learnings TO authenticated; GRANT ALL ON public.framework_learnings TO service_role;
ALTER TABLE public.framework_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read framework learnings" ON public.framework_learnings FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_learnings_append_only BEFORE UPDATE OR DELETE ON public.framework_learnings FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.framework_learning_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id uuid NOT NULL UNIQUE REFERENCES public.framework_learnings(id),
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  final_text text, note text,
  merged_version_id uuid REFERENCES public.framework_versions(id),
  decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.framework_learning_decisions TO authenticated; GRANT ALL ON public.framework_learning_decisions TO service_role;
ALTER TABLE public.framework_learning_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read learning decisions" ON public.framework_learning_decisions FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_learning_decisions_append_only BEFORE UPDATE OR DELETE ON public.framework_learning_decisions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.framework_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES public.framework_entries(id),
  action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid, at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.framework_events TO authenticated; GRANT ALL ON public.framework_events TO service_role;
ALTER TABLE public.framework_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read framework events" ON public.framework_events FOR SELECT TO authenticated USING (public.fw_is_reader(auth.uid()));
CREATE TRIGGER framework_events_append_only BEFORE UPDATE OR DELETE ON public.framework_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.fw_active_version(_entry uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT v.id FROM public.framework_versions v JOIN public.framework_approvals a ON a.version_id=v.id AND a.decision='approved'
  WHERE v.entry_id=_entry AND v.effective_from <= current_date ORDER BY v.version DESC LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.fw_version_status(_v uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN a.decision='rejected' THEN 'rejected'
    WHEN a.decision IS NULL THEN 'pending'
    WHEN v.id = public.fw_active_version(v.entry_id) THEN 'active'
    WHEN v.effective_from > current_date THEN 'scheduled'
    ELSE 'superseded' END
  FROM public.framework_versions v LEFT JOIN public.framework_approvals a ON a.version_id=v.id WHERE v.id=_v $$;

CREATE OR REPLACE FUNCTION public.fw_add_entry(_code text, _name text, _kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid uuid;
BEGIN
  IF NOT public.fw_is_editor(auth.uid()) THEN RAISE EXCEPTION 'Only staff administrators can add library entries.'; END IF;
  IF _kind='universal_standard' THEN RAISE EXCEPTION 'There is only one universal standard.'; END IF;
  INSERT INTO public.framework_entries(code,name,kind,created_by) VALUES (upper(trim(_code)),trim(_name),_kind,auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.framework_events(entry_id,action,detail,actor) VALUES (nid,'entry_added',jsonb_build_object('code',upper(trim(_code))),auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.fw_propose_version(_entry uuid, _effective date, _summary text, _body text, _items jsonb, _note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer; nid uuid;
BEGIN
  IF NOT public.fw_is_editor(auth.uid()) THEN RAISE EXCEPTION 'Only staff administrators can edit the library.'; END IF;
  IF _note IS NULL OR length(trim(_note))=0 THEN RAISE EXCEPTION 'Say what changed in this version.'; END IF;
  SELECT coalesce(max(version),0)+1 INTO v FROM public.framework_versions WHERE entry_id=_entry;
  INSERT INTO public.framework_versions(entry_id,version,effective_from,summary,body,items,change_note,author)
    VALUES (_entry,v,coalesce(_effective,current_date),_summary,coalesce(_body,''),coalesce(_items,'[]'::jsonb),trim(_note),auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.framework_events(entry_id,action,detail,actor) VALUES (_entry,'version_proposed',jsonb_build_object('version',v,'note',_note),auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.fw_decide_version(_version uuid, _approve boolean, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.framework_versions;
BEGIN
  IF NOT public.has_role(auth.uid(),'curator') OR public.portal_has_client_identity(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Curator can approve library changes.'; END IF;
  SELECT * INTO v FROM public.framework_versions WHERE id=_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.framework_approvals WHERE version_id=_version) THEN RAISE EXCEPTION 'This version has already been decided.'; END IF;
  IF NOT _approve AND (_note IS NULL OR length(trim(_note))=0) THEN RAISE EXCEPTION 'Rejecting needs a note.'; END IF;
  INSERT INTO public.framework_approvals(version_id,decision,note,decided_by) VALUES (_version, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, _note, auth.uid());
  INSERT INTO public.framework_events(entry_id,action,detail,actor) VALUES (v.entry_id, CASE WHEN _approve THEN 'version_approved' ELSE 'version_rejected' END, jsonb_build_object('version',v.version,'note',_note), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.fw_record_source(_entry uuid, _title text, _file text, _path text, _sha text, _size bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid uuid; v integer;
BEGIN
  IF NOT public.fw_is_editor(auth.uid()) THEN RAISE EXCEPTION 'Only staff administrators can load resources.'; END IF;
  IF _path NOT LIKE 'sources/' || lower(_sha) || '/%' THEN RAISE EXCEPTION 'Resource files are stored under their SHA-256.'; END IF;
  SELECT coalesce(max(version),0)+1 INTO v FROM public.framework_sources WHERE title=trim(_title);
  INSERT INTO public.framework_sources(entry_id,title,file_name,storage_path,sha256,size_bytes,version,uploaded_by)
    VALUES (_entry,trim(_title),_file,_path,lower(_sha),_size,v,auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.framework_events(entry_id,action,detail,actor) VALUES (_entry,'source_loaded',jsonb_build_object('title',_title,'sha256',lower(_sha),'version',v),auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.fw_add_learning(_source uuid, _category text, _proposal text, _text text, _passage text, _page text, _method text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid uuid; ov text;
BEGIN
  IF NOT public.fw_is_editor(auth.uid()) THEN RAISE EXCEPTION 'Only staff administrators can record learnings.'; END IF;
  IF _passage IS NULL OR length(trim(_passage))=0 OR _page IS NULL OR length(trim(_page))=0 THEN
    RAISE EXCEPTION 'Every learning must point to its page and passage.'; END IF;
  SELECT string_agg(left(l.text,80), ' | ') INTO ov FROM public.framework_learnings l
    WHERE l.category=_category AND (lower(l.text) LIKE '%'||lower(left(trim(_text),24))||'%' OR lower(_text) LIKE '%'||lower(left(trim(l.text),24))||'%');
  INSERT INTO public.framework_learnings(source_id,category,proposal,text,passage,page,overlap_note,method,created_by)
    VALUES (_source,_category,_proposal,trim(_text),trim(_passage),trim(_page),ov,coalesce(_method,'manual'),auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.framework_events(action,detail,actor) VALUES ('learning_drafted',jsonb_build_object('learning',nid,'proposal',_proposal),auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.fw_decide_learning(_learning uuid, _approve boolean, _final text, _note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.framework_learnings; s public.framework_sources; u uuid; cur public.framework_versions; nv uuid; vn integer; txt text;
BEGIN
  IF NOT public.has_role(auth.uid(),'curator') OR public.portal_has_client_identity(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Curator can approve library changes.'; END IF;
  SELECT * INTO l FROM public.framework_learnings WHERE id=_learning;
  IF NOT FOUND THEN RAISE EXCEPTION 'Learning not found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.framework_learning_decisions WHERE learning_id=_learning) THEN RAISE EXCEPTION 'This learning has already been decided.'; END IF;
  IF NOT _approve THEN
    IF _note IS NULL OR length(trim(_note))=0 THEN RAISE EXCEPTION 'Rejecting needs a note.'; END IF;
    INSERT INTO public.framework_learning_decisions(learning_id,decision,note,decided_by) VALUES (_learning,'rejected',_note,auth.uid());
    INSERT INTO public.framework_events(action,detail,actor) VALUES ('learning_rejected',jsonb_build_object('learning',_learning,'note',_note),auth.uid());
    RETURN NULL;
  END IF;
  SELECT * INTO s FROM public.framework_sources WHERE id=l.source_id;
  SELECT id INTO u FROM public.framework_entries WHERE kind='universal_standard';
  SELECT * INTO cur FROM public.framework_versions WHERE id=public.fw_active_version(u);
  txt := coalesce(nullif(trim(_final),''), l.text);
  SELECT coalesce(max(version),0)+1 INTO vn FROM public.framework_versions WHERE entry_id=u;
  INSERT INTO public.framework_versions(entry_id,version,effective_from,summary,body,items,change_note,author)
    VALUES (u, vn, current_date, coalesce(cur.summary,'FridayAnalytics universal standard'), coalesce(cur.body,''),
      coalesce(cur.items,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('category',l.category,'proposal',l.proposal,'text',txt,
        'source',s.title,'source_sha256',s.sha256,'page',l.page,'passage',l.passage,'learning_id',l.id)),
      'Merged learning ('||l.proposal||') from '||s.title||', '||l.page, auth.uid()) RETURNING id INTO nv;
  INSERT INTO public.framework_approvals(version_id,decision,note,decided_by) VALUES (nv,'approved',coalesce(_note,'Approved learning'),auth.uid());
  INSERT INTO public.framework_learning_decisions(learning_id,decision,final_text,note,merged_version_id,decided_by) VALUES (_learning,'approved',txt,_note,nv,auth.uid());
  INSERT INTO public.framework_events(entry_id,action,detail,actor) VALUES (u,'learning_merged',jsonb_build_object('learning',_learning,'version',vn),auth.uid());
  RETURN nv;
END $$;

ALTER TABLE public.research_plans ADD COLUMN framework_version_id uuid REFERENCES public.framework_versions(id);

CREATE OR REPLACE FUNCTION public.research_plan_framework_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL AND NEW.framework_version_id IS DISTINCT FROM OLD.framework_version_id THEN
    RAISE EXCEPTION 'This plan is locked: its framework version cannot change'; END IF;
  IF OLD.status='draft' AND NEW.status IS DISTINCT FROM 'draft' THEN
    IF NEW.framework_version_id IS NULL THEN RAISE EXCEPTION 'Research needs a linked framework version'; END IF;
    IF public.fw_version_status(NEW.framework_version_id) <> 'active' THEN
      RAISE EXCEPTION 'Research needs a Curator-approved framework version in force'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_plans_framework_guard BEFORE UPDATE ON public.research_plans FOR EACH ROW EXECUTE FUNCTION public.research_plan_framework_guard();

CREATE OR REPLACE FUNCTION public.research_link_framework(_plan uuid, _version uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.research_plans;
BEGIN
  SELECT * INTO p FROM public.research_plans WHERE id=_plan;
  IF NOT FOUND OR NOT public.can_access_project(auth.uid(), p.engagement_id) OR public.portal_has_client_identity(auth.uid()) THEN
    RAISE EXCEPTION 'Plan not found.'; END IF;
  IF public.has_role(auth.uid(),'management') THEN RAISE EXCEPTION 'FA Management cannot plan, start or stop research'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'This plan is locked: its framework version cannot change'; END IF;
  IF public.fw_version_status(_version) IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Research needs a Curator-approved framework version in force'; END IF;
  UPDATE public.research_plans SET framework_version_id=_version WHERE id=_plan;
  INSERT INTO public.framework_events(entry_id,action,detail,actor)
    SELECT v.entry_id,'module_linked',jsonb_build_object('module','research_plan','plan',_plan,'version',v.version),auth.uid() FROM public.framework_versions v WHERE v.id=_version;
END $$;

REVOKE ALL ON FUNCTION public.fw_is_editor(uuid), public.fw_is_reader(uuid), public.fw_version_status(uuid), public.fw_active_version(uuid),
  public.fw_add_entry(text,text,text), public.fw_propose_version(uuid,date,text,text,jsonb,text), public.fw_decide_version(uuid,boolean,text),
  public.fw_record_source(uuid,text,text,text,text,bigint), public.fw_add_learning(uuid,text,text,text,text,text,text),
  public.fw_decide_learning(uuid,boolean,text,text), public.research_link_framework(uuid,uuid), public.research_plan_framework_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fw_is_editor(uuid), public.fw_is_reader(uuid), public.fw_version_status(uuid), public.fw_active_version(uuid),
  public.fw_add_entry(text,text,text), public.fw_propose_version(uuid,date,text,text,jsonb,text), public.fw_decide_version(uuid,boolean,text),
  public.fw_record_source(uuid,text,text,text,text,bigint), public.fw_add_learning(uuid,text,text,text,text,text,text),
  public.fw_decide_learning(uuid,boolean,text,text), public.research_link_framework(uuid,uuid) TO authenticated;

INSERT INTO public.framework_entries(code,name,kind) VALUES
 ('FA-USTD','FridayAnalytics universal standard','universal_standard'),
 ('BERKELEY','Berkeley Protocol on Digital Open Source Investigations','framework'),
 ('GIJN','GIJN investigative practice','framework'),
 ('SPJ','SPJ Code of Ethics','framework'),
 ('RABAT','Rabat Plan of Action','framework'),
 ('DSP','Dangerous Speech markers','indicators'),
 ('UN-FAAC','UN Framework of Analysis for Atrocity Crimes','framework'),
 ('FA-CEF','FA-CEF','standard'),
 ('FA-STD-001','FA-STD-001','standard');

CREATE POLICY "staff read framework source files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='framework-sources' AND public.fw_is_reader(auth.uid()));
CREATE POLICY "editors upload framework source files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='framework-sources' AND public.fw_is_editor(auth.uid()));