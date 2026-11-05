-- U6 Methodology checkpoints (V1, V2, Q1, Q2, R, C). Every rule lives here; screens only show these refusals.
-- Results are append-only and can only be written by the check functions (no INSERT privilege for people).

CREATE TABLE public.checkpoint_definitions (
  id text PRIMARY KEY CHECK (id IN ('V1','V2','Q1','Q2','R','C')),
  name text NOT NULL, applies_at text NOT NULL, pass_rule_ref text NOT NULL, failure_target text NOT NULL,
  standard_version uuid REFERENCES public.framework_versions(id), sort int NOT NULL);
GRANT SELECT ON public.checkpoint_definitions TO authenticated; GRANT ALL ON public.checkpoint_definitions TO service_role;
ALTER TABLE public.checkpoint_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkpoint_definitions_read ON public.checkpoint_definitions FOR SELECT TO authenticated USING (public.is_investigator(auth.uid()));
CREATE TRIGGER checkpoint_definitions_append_only BEFORE UPDATE OR DELETE ON public.checkpoint_definitions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
INSERT INTO public.checkpoint_definitions (id, name, applies_at, pass_rule_ref, failure_target, sort) VALUES
 ('V1','Integrity','After preservation of an item','SHA-256 at capture equals SHA-256 on write; custody event recorded; FA-STD-001 name applied','Re-collect the item',1),
 ('V2','Verification','After verification of an item','Verification record with source, technical and content checks and a confidence rating with reasoning','Item stays a labelled lead',2),
 ('Q1','Collection measures','Before analysis starts','Volume, reach, time window and platform coverage (or a negative result) for every requirement ID','Re-collect to fill the gaps',3),
 ('Q2','Reproducible counts','After analysis','Every figure re-derives from its listed items and states a confidence level','Return to analysis',4),
 ('R','Second review','Before G4','A second analyst, not the author, approves every finding naming a person or organisation','Return to analysis',5),
 ('C','Curator release','G3 to G5','Methodology statement, limits and confidence present; Curator approves','Return to reporting',6);

CREATE OR REPLACE FUNCTION public.u6_standard_version() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.fw_active_version(e.id),
    (SELECT v.id FROM public.framework_versions v WHERE v.entry_id = e.id ORDER BY v.version DESC LIMIT 1))
  FROM public.framework_entries e WHERE e.kind = 'universal_standard' ORDER BY e.created_at LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.u6_standard() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('version_id', v.id, 'version', v.version,
    'sample', public.fw_active_version(v.entry_id) IS DISTINCT FROM v.id)
  FROM public.framework_versions v WHERE v.id = public.u6_standard_version();
$$;

CREATE TABLE public.checkpoint_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  cycle_no int NOT NULL DEFAULT 0,
  subject_kind text NOT NULL CHECK (subject_kind IN ('item','finding','report','engagement')),
  subject_id uuid NOT NULL,
  checkpoint text NOT NULL REFERENCES public.checkpoint_definitions(id),
  result text NOT NULL CHECK (result IN ('passed','failed','reopened')),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_by uuid DEFAULT auth.uid(),
  checked_by_kind text NOT NULL DEFAULT 'system' CHECK (checked_by_kind IN ('system','person')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id),
  CHECK (result <> 'passed' OR checked_by_kind = 'system'),
  CHECK (result = 'passed' OR length(trim(coalesce(reason,''))) > 0));
CREATE INDEX checkpoint_results_subject_idx ON public.checkpoint_results (subject_id, checkpoint, checked_at DESC);
CREATE INDEX checkpoint_results_project_idx ON public.checkpoint_results (project_id, checked_at DESC);
GRANT SELECT ON public.checkpoint_results TO authenticated; GRANT ALL ON public.checkpoint_results TO service_role;
ALTER TABLE public.checkpoint_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkpoint_results_read ON public.checkpoint_results FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER checkpoint_results_append_only BEFORE UPDATE OR DELETE ON public.checkpoint_results FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.u6_record(_project uuid, _kind text, _subject uuid, _cp text, _result text, _reason text, _details jsonb DEFAULT '{}'::jsonb, _by_kind text DEFAULT 'system')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sv uuid := public.u6_standard_version(); r uuid;
BEGIN
  IF sv IS NULL THEN RAISE EXCEPTION 'No universal standard version exists; checkpoints cannot run without one'; END IF;
  INSERT INTO public.checkpoint_results (project_id, subject_kind, subject_id, checkpoint, result, reason, details, checked_by_kind, standard_version)
    VALUES (_project, _kind, _subject, _cp, _result, _reason, coalesce(_details,'{}'::jsonb), _by_kind, sv) RETURNING id INTO r;
  RETURN r;
END; $$;
CREATE OR REPLACE FUNCTION public.u6_latest(_subject uuid, _cp text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT result FROM public.checkpoint_results WHERE subject_id = _subject AND checkpoint = _cp ORDER BY checked_at DESC, id DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.u6_require_worker(_project uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_work_project(auth.uid(), _project) THEN RAISE EXCEPTION 'Your engagement role cannot record methodology checks'; END IF;
END; $$;

-- ---------- V1 integrity ----------
CREATE OR REPLACE FUNCTION public.u6_check_v1(_capture uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.research_captures; miss text[] := '{}';
BEGIN
  SELECT * INTO c FROM public.research_captures WHERE id = _capture;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown item'; END IF;
  PERFORM public.u6_require_worker(c.project_id);
  IF c.sha256_at_capture IS NULL THEN miss := miss || 'no SHA-256 recorded at capture'; END IF;
  IF c.sha256_on_write IS DISTINCT FROM c.sha256_at_capture OR NOT coalesce(c.vault_write_verified, false) THEN miss := miss || 'SHA-256 not re-checked on write'; END IF;
  IF c.custody_event_id IS NULL THEN miss := miss || 'custody log incomplete for the item'; END IF;
  IF c.darknight_path IS NULL OR c.naming_scheme IS NULL THEN miss := miss || 'FA-STD-001 name not applied'; END IF;
  IF cardinality(miss) = 0 THEN
    PERFORM public.u6_record(c.project_id, 'item', c.id, 'V1', 'passed', NULL, jsonb_build_object('sha256', c.sha256_at_capture, 'custody_event', c.custody_event_id));
    RETURN jsonb_build_object('result','passed');
  END IF;
  PERFORM public.u6_record(c.project_id, 'item', c.id, 'V1', 'failed', 'Re-collect: ' || array_to_string(miss, '; '), jsonb_build_object('sha256', c.sha256_at_capture));
  RETURN jsonb_build_object('result','failed','reason','Re-collect: ' || array_to_string(miss, '; '));
END; $$;

-- ---------- V2 verification ----------
CREATE TABLE public.verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  capture_id uuid NOT NULL REFERENCES public.research_captures(id) ON DELETE RESTRICT,
  source_check text NOT NULL CHECK (length(trim(source_check)) > 0),
  technical_check text NOT NULL CHECK (length(trim(technical_check)) > 0),
  content_check text NOT NULL CHECK (length(trim(content_check)) > 0),
  confidence text NOT NULL CHECK (confidence IN ('Confirmed','Probable','Possible','Unverified')),
  reasoning text NOT NULL CHECK (length(trim(reasoning)) > 0),
  rater uuid NOT NULL DEFAULT auth.uid(), rated_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id));
GRANT SELECT ON public.verification_records TO authenticated; GRANT ALL ON public.verification_records TO service_role;
ALTER TABLE public.verification_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_records_read ON public.verification_records FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER verification_records_append_only BEFORE UPDATE OR DELETE ON public.verification_records FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.u6_latest_confidence(_capture uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT confidence FROM public.verification_records WHERE capture_id = _capture ORDER BY rated_at DESC, id DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.u6_verify(_capture uuid, _source text, _technical text, _content text, _confidence text, _reasoning text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.research_captures; r uuid;
BEGIN
  SELECT * INTO c FROM public.research_captures WHERE id = _capture;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown item'; END IF;
  PERFORM public.u6_require_worker(c.project_id);
  IF public.u6_latest(c.id, 'V1') IS DISTINCT FROM 'passed' THEN
    RAISE EXCEPTION 'This item has not passed V1 integrity, so it cannot be verified. Re-collect it.'; END IF;
  IF _confidence NOT IN ('Confirmed','Probable','Possible','Unverified') THEN RAISE EXCEPTION 'Confidence must be Confirmed, Probable, Possible or Unverified'; END IF;
  IF length(trim(coalesce(_source,''))) = 0 OR length(trim(coalesce(_technical,''))) = 0 OR length(trim(coalesce(_content,''))) = 0 THEN
    RAISE EXCEPTION 'Record the source, technical and content checks'; END IF;
  IF length(trim(coalesce(_reasoning,''))) = 0 THEN RAISE EXCEPTION 'Give the reasoning for the confidence rating'; END IF;
  INSERT INTO public.verification_records (project_id, capture_id, source_check, technical_check, content_check, confidence, reasoning, standard_version)
    VALUES (c.project_id, c.id, trim(_source), trim(_technical), trim(_content), _confidence, trim(_reasoning), public.u6_standard_version()) RETURNING id INTO r;
  PERFORM public.u6_record(c.project_id, 'item', c.id, 'V2', 'passed', NULL, jsonb_build_object('confidence', _confidence, 'record', r));
  RETURN r;
END; $$;

-- ---------- Q1 collection measures ----------
CREATE TABLE public.collection_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES public.research_requirements(id) ON DELETE RESTRICT,
  volume int NOT NULL CHECK (volume >= 0), reach bigint NOT NULL CHECK (reach >= 0),
  window_from date NOT NULL, window_to date NOT NULL CHECK (window_to >= window_from),
  platform_coverage text NOT NULL CHECK (length(trim(platform_coverage)) > 0),
  recorded_by uuid NOT NULL DEFAULT auth.uid(), recorded_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id));
CREATE TABLE public.negative_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES public.research_requirements(id) ON DELETE RESTRICT,
  searched text NOT NULL CHECK (length(trim(searched)) > 0), searched_on date NOT NULL,
  recorded_by uuid NOT NULL DEFAULT auth.uid(), recorded_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id));
GRANT SELECT ON public.collection_measures, public.negative_results TO authenticated;
GRANT ALL ON public.collection_measures, public.negative_results TO service_role;
ALTER TABLE public.collection_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negative_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_measures_read ON public.collection_measures FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY negative_results_read ON public.negative_results FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER collection_measures_append_only BEFORE UPDATE OR DELETE ON public.collection_measures FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER negative_results_append_only BEFORE UPDATE OR DELETE ON public.negative_results FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.u6_requirement_project(_req uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.research_requirements WHERE id = _req; $$;

CREATE OR REPLACE FUNCTION public.u6_record_measure(_req uuid, _volume int, _reach bigint, _from date, _to date, _coverage text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid := public.u6_requirement_project(_req); r uuid;
BEGIN
  IF p IS NULL THEN RAISE EXCEPTION 'Unknown requirement'; END IF;
  PERFORM public.u6_require_worker(p);
  INSERT INTO public.collection_measures (project_id, requirement_id, volume, reach, window_from, window_to, platform_coverage, standard_version)
    VALUES (p, _req, _volume, _reach, _from, _to, trim(coalesce(_coverage,'')), public.u6_standard_version()) RETURNING id INTO r;
  RETURN r;
END; $$;
CREATE OR REPLACE FUNCTION public.u6_record_negative(_req uuid, _searched text, _on date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid := public.u6_requirement_project(_req); r uuid;
BEGIN
  IF p IS NULL THEN RAISE EXCEPTION 'Unknown requirement'; END IF;
  PERFORM public.u6_require_worker(p);
  INSERT INTO public.negative_results (project_id, requirement_id, searched, searched_on, standard_version)
    VALUES (p, _req, trim(coalesce(_searched,'')), _on, public.u6_standard_version()) RETURNING id INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.u6_check_q1(_project uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gaps text[]; n int;
BEGIN
  PERFORM public.u6_require_worker(_project);
  WITH cur AS (SELECT DISTINCT ON (req_no) * FROM public.research_requirements WHERE project_id = _project ORDER BY req_no, version DESC)
  SELECT count(*), coalesce(array_agg(cur.code ORDER BY cur.req_no) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.research_requirements rr WHERE rr.project_id = _project AND rr.req_no = cur.req_no
        AND (EXISTS (SELECT 1 FROM public.collection_measures m WHERE m.requirement_id = rr.id)
          OR EXISTS (SELECT 1 FROM public.negative_results x WHERE x.requirement_id = rr.id)))), '{}')
    INTO n, gaps FROM cur WHERE cur.status = 'active';
  IF n = 0 THEN
    PERFORM public.u6_record(_project, 'engagement', _project, 'Q1', 'failed', 'The requirements register has no active requirements');
    RETURN jsonb_build_object('result','failed','reason','The requirements register has no active requirements');
  ELSIF cardinality(gaps) > 0 THEN
    PERFORM public.u6_record(_project, 'engagement', _project, 'Q1', 'failed', 'Re-collect to fill the gaps: no measures for ' || array_to_string(gaps, ', '), jsonb_build_object('gaps', gaps));
    RETURN jsonb_build_object('result','failed','reason','Re-collect to fill the gaps: no measures for ' || array_to_string(gaps, ', '));
  END IF;
  PERFORM public.u6_record(_project, 'engagement', _project, 'Q1', 'passed', NULL, jsonb_build_object('requirements', n));
  RETURN jsonb_build_object('result','passed');
END; $$;

-- ---------- Findings and R second review ----------
CREATE TABLE public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  cycle_no int NOT NULL DEFAULT 0,
  text text NOT NULL CHECK (length(trim(text)) > 0),
  alternatives text NOT NULL CHECK (length(trim(alternatives)) > 0),
  names_person_or_org boolean NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','returned','ready')),
  author uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id));
CREATE TABLE public.finding_items (
  finding_id uuid NOT NULL REFERENCES public.findings(id) ON DELETE RESTRICT,
  capture_id uuid NOT NULL REFERENCES public.research_captures(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('support','lead')),
  confidence_at_link text NOT NULL,
  linked_by uuid NOT NULL DEFAULT auth.uid(), linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (finding_id, capture_id),
  CHECK (role = 'lead' OR confidence_at_link IN ('Confirmed','Probable')));
CREATE TABLE public.finding_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.findings(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  reviewer uuid NOT NULL DEFAULT auth.uid(),
  decision text NOT NULL CHECK (decision IN ('approved','returned')),
  note text, decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision = 'approved' OR length(trim(coalesce(note,''))) > 0));
GRANT SELECT ON public.findings, public.finding_items, public.finding_reviews TO authenticated;
GRANT ALL ON public.findings, public.finding_items, public.finding_reviews TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY findings_read ON public.findings FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY finding_items_read ON public.finding_items FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY finding_reviews_read ON public.finding_reviews FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER finding_items_append_only BEFORE UPDATE OR DELETE ON public.finding_items FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER finding_reviews_append_only BEFORE UPDATE OR DELETE ON public.finding_reviews FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER findings_no_delete BEFORE DELETE ON public.findings FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.u6_finding_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.project_id, NEW.text, NEW.alternatives, NEW.names_person_or_org, NEW.author, NEW.created_at, NEW.standard_version, NEW.cycle_no)
     IS DISTINCT FROM (OLD.project_id, OLD.text, OLD.alternatives, OLD.names_person_or_org, OLD.author, OLD.created_at, OLD.standard_version, OLD.cycle_no) THEN
    RAISE EXCEPTION 'A finding''s text is fixed once written; record a new finding instead'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER findings_fixed BEFORE UPDATE ON public.findings FOR EACH ROW EXECUTE FUNCTION public.u6_finding_fixed();
CREATE OR REPLACE FUNCTION public.u6_review_not_author() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.findings f WHERE f.id = NEW.finding_id AND f.author = NEW.reviewer) THEN
    RAISE EXCEPTION 'The author cannot review their own finding'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER finding_reviews_not_author BEFORE INSERT ON public.finding_reviews FOR EACH ROW EXECUTE FUNCTION public.u6_review_not_author();

CREATE OR REPLACE FUNCTION public.u6_create_finding(_project uuid, _text text, _alternatives text, _names boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  PERFORM public.u6_require_worker(_project);
  IF public.u6_latest(_project, 'Q1') IS DISTINCT FROM 'passed' THEN
    RAISE EXCEPTION 'Analysis cannot start until Q1 collection measures pass for this engagement'; END IF;
  IF length(trim(coalesce(_text,''))) = 0 THEN RAISE EXCEPTION 'Write the finding'; END IF;
  IF length(trim(coalesce(_alternatives,''))) = 0 THEN RAISE EXCEPTION 'Record the alternative explanations considered and why they were rejected'; END IF;
  IF _names IS NULL THEN RAISE EXCEPTION 'Say whether the finding names a person or organisation'; END IF;
  INSERT INTO public.findings (project_id, text, alternatives, names_person_or_org, standard_version)
    VALUES (_project, trim(_text), trim(_alternatives), _names, public.u6_standard_version()) RETURNING id INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.u6_link_item(_finding uuid, _capture uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.findings; c public.research_captures; conf text;
BEGIN
  SELECT * INTO f FROM public.findings WHERE id = _finding;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown finding'; END IF;
  PERFORM public.u6_require_worker(f.project_id);
  IF f.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'Items can only be linked while the finding is a draft or returned'; END IF;
  SELECT * INTO c FROM public.research_captures WHERE id = _capture;
  IF NOT FOUND OR c.project_id <> f.project_id THEN RAISE EXCEPTION 'The item is not part of this engagement'; END IF;
  conf := public.u6_latest_confidence(_capture);
  IF conf IS NULL THEN RAISE EXCEPTION 'This item has no verification record (V2), so it cannot be cited'; END IF;
  IF _role NOT IN ('support','lead') THEN RAISE EXCEPTION 'An item either supports a finding or is a lead'; END IF;
  IF _role = 'support' AND conf NOT IN ('Confirmed','Probable') THEN
    RAISE EXCEPTION 'Only Confirmed or Probable items can support a finding; this % item may appear only as a labelled lead', conf; END IF;
  INSERT INTO public.finding_items (finding_id, capture_id, project_id, role, confidence_at_link) VALUES (_finding, _capture, f.project_id, _role, conf);
END; $$;

CREATE OR REPLACE FUNCTION public.u6_send_for_review(_finding uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.findings; s text;
BEGIN
  SELECT * INTO f FROM public.findings WHERE id = _finding FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown finding'; END IF;
  PERFORM public.u6_require_worker(f.project_id);
  IF f.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'This finding has already been sent on'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finding_items WHERE finding_id = _finding AND role = 'support') THEN
    RAISE EXCEPTION 'A finding must link to at least one verified supporting item (Confirmed or Probable)'; END IF;
  s := CASE WHEN f.names_person_or_org THEN 'in_review' ELSE 'ready' END;
  UPDATE public.findings SET status = s WHERE id = _finding;
  RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.u6_review(_finding uuid, _approve boolean, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.findings;
BEGIN
  SELECT * INTO f FROM public.findings WHERE id = _finding FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown finding'; END IF;
  IF NOT public.has_project_role(auth.uid(), f.project_id, ARRAY['owner','lead_analyst','analyst','reviewer']) THEN
    RAISE EXCEPTION 'Second review is done by an analyst or reviewer on this engagement'; END IF;
  IF f.author = auth.uid() THEN RAISE EXCEPTION 'The author cannot review their own finding'; END IF;
  IF f.status <> 'in_review' THEN RAISE EXCEPTION 'This finding is not waiting for second review'; END IF;
  IF NOT coalesce(_approve, false) AND length(trim(coalesce(_note,''))) = 0 THEN RAISE EXCEPTION 'Say why the finding is returned to analysis'; END IF;
  INSERT INTO public.finding_reviews (finding_id, project_id, decision, note) VALUES (_finding, f.project_id, CASE WHEN _approve THEN 'approved' ELSE 'returned' END, nullif(trim(coalesce(_note,'')),''));
  UPDATE public.findings SET status = CASE WHEN _approve THEN 'approved' ELSE 'returned' END WHERE id = _finding;
  IF _approve THEN PERFORM public.u6_record(f.project_id, 'finding', f.id, 'R', 'passed', NULL, jsonb_build_object('reviewer', auth.uid()));
  ELSE PERFORM public.u6_record(f.project_id, 'finding', f.id, 'R', 'failed', 'Return to analysis: ' || trim(_note), jsonb_build_object('reviewer', auth.uid())); END IF;
END; $$;

-- ---------- Q2 reproducible counts and C methodology statement ----------
CREATE TABLE public.report_figures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id uuid NOT NULL REFERENCES public.project_outputs(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (length(trim(label)) > 0),
  value int NOT NULL CHECK (value >= 0),
  capture_ids uuid[] NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('Confirmed','Probable','Possible','Unverified')),
  recorded_by uuid NOT NULL DEFAULT auth.uid(), recorded_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id),
  CHECK (value = cardinality(capture_ids)));
CREATE TABLE public.report_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id uuid NOT NULL REFERENCES public.project_outputs(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  version int NOT NULL CHECK (version > 0),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id),
  statement text NOT NULL CHECK (length(trim(statement)) > 0),
  time_window text NOT NULL CHECK (length(trim(time_window)) > 0),
  platforms text[] NOT NULL CHECK (cardinality(platforms) > 0),
  limits text NOT NULL CHECK (length(trim(limits)) > 0),
  confidence_summary text NOT NULL CHECK (length(trim(confidence_summary)) > 0),
  written_by uuid NOT NULL DEFAULT auth.uid(), written_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (output_id, version));
CREATE TABLE public.report_statement_approvals (
  statement_id uuid PRIMARY KEY REFERENCES public.report_statements(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  curator uuid NOT NULL DEFAULT auth.uid(), approved_at timestamptz NOT NULL DEFAULT now(), note text);
GRANT SELECT ON public.report_figures, public.report_statements, public.report_statement_approvals TO authenticated;
GRANT ALL ON public.report_figures, public.report_statements, public.report_statement_approvals TO service_role;
ALTER TABLE public.report_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_statement_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_figures_read ON public.report_figures FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
-- clients see only the methodology statement of a released, shared report
CREATE POLICY report_statements_read ON public.report_statements FOR SELECT TO authenticated USING (
  public.can_access_project(auth.uid(), project_id)
  OR (EXISTS (SELECT 1 FROM public.project_outputs o WHERE o.id = output_id AND o.status = 'released' AND o.shared_with_client)
      AND EXISTS (SELECT 1 FROM public.report_statement_approvals a WHERE a.statement_id = id)
      AND public.can_view_project_as_client(auth.uid(), project_id)));
CREATE POLICY report_statement_approvals_read ON public.report_statement_approvals FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER report_figures_append_only BEFORE UPDATE OR DELETE ON public.report_figures FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER report_statements_append_only BEFORE UPDATE OR DELETE ON public.report_statements FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER report_statement_approvals_append_only BEFORE UPDATE OR DELETE ON public.report_statement_approvals FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.u6_output_project(_output uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.project_outputs WHERE id = _output; $$;

CREATE OR REPLACE FUNCTION public.u6_add_figure(_output uuid, _label text, _captures uuid[], _confidence text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid := public.u6_output_project(_output); ids uuid[]; r uuid;
BEGIN
  IF p IS NULL THEN RAISE EXCEPTION 'Unknown report'; END IF;
  PERFORM public.u6_require_worker(p);
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO ids FROM unnest(coalesce(_captures,'{}')) x;
  IF cardinality(ids) = 0 THEN RAISE EXCEPTION 'A figure must list the items it is counted from'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS (SELECT 1 FROM public.research_captures c WHERE c.id = x AND c.project_id = p)) THEN
    RAISE EXCEPTION 'Every listed item must belong to this engagement'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ids) x WHERE public.u6_latest_confidence(x) IS NULL) THEN
    RAISE EXCEPTION 'Every listed item needs a verification record (V2) before it can be counted'; END IF;
  INSERT INTO public.report_figures (output_id, project_id, label, value, capture_ids, confidence, standard_version)
    VALUES (_output, p, trim(coalesce(_label,'')), cardinality(ids), ids, _confidence, public.u6_standard_version()) RETURNING id INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.u6_check_q2(_output uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid := public.u6_output_project(_output); n int; bad int;
BEGIN
  IF p IS NULL THEN RAISE EXCEPTION 'Unknown report'; END IF;
  PERFORM public.u6_require_worker(p);
  SELECT count(*), count(*) FILTER (WHERE value <> cardinality(capture_ids) OR EXISTS (SELECT 1 FROM unnest(capture_ids) x WHERE public.u6_latest_confidence(x) IS NULL))
    INTO n, bad FROM public.report_figures WHERE output_id = _output;
  IF n = 0 OR bad > 0 THEN
    PERFORM public.u6_record(p, 'report', _output, 'Q2', 'failed',
      CASE WHEN n = 0 THEN 'Return to analysis: the report lists no figures' ELSE format('Return to analysis: %s figure(s) cannot be re-derived from their items', bad) END);
    RETURN jsonb_build_object('result','failed');
  END IF;
  PERFORM public.u6_record(p, 'report', _output, 'Q2', 'passed', NULL, jsonb_build_object('figures', n));
  RETURN jsonb_build_object('result','passed');
END; $$;

CREATE OR REPLACE FUNCTION public.u6_write_statement(_output uuid, _statement text, _window text, _platforms text[], _limits text, _confidence text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p uuid := public.u6_output_project(_output); v int; r uuid;
BEGIN
  IF p IS NULL THEN RAISE EXCEPTION 'Unknown report'; END IF;
  PERFORM public.u6_require_worker(p);
  IF length(trim(coalesce(_statement,''))) = 0 OR length(trim(coalesce(_window,''))) = 0 OR cardinality(coalesce(_platforms,'{}')) = 0
     OR length(trim(coalesce(_limits,''))) = 0 OR length(trim(coalesce(_confidence,''))) = 0 THEN
    RAISE EXCEPTION 'The methodology statement needs the statement, time window, platforms, limits and confidence levels'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM public.report_statements WHERE output_id = _output;
  INSERT INTO public.report_statements (output_id, project_id, version, standard_version, statement, time_window, platforms, limits, confidence_summary)
    VALUES (_output, p, v, public.u6_standard_version(), trim(_statement), trim(_window), _platforms, trim(_limits), trim(_confidence)) RETURNING id INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.u6_approve_statement(_statement uuid, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.report_statements;
BEGIN
  IF NOT public.has_role(auth.uid(), 'curator') THEN RAISE EXCEPTION 'Only the Curator can approve the methodology statement'; END IF;
  SELECT * INTO s FROM public.report_statements WHERE id = _statement;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown statement'; END IF;
  IF s.version <> (SELECT max(version) FROM public.report_statements WHERE output_id = s.output_id) THEN
    RAISE EXCEPTION 'Only the latest version of the methodology statement can be approved'; END IF;
  INSERT INTO public.report_statement_approvals (statement_id, project_id, note) VALUES (s.id, s.project_id, nullif(trim(coalesce(_note,'')),''));
  PERFORM public.u6_record(s.project_id, 'report', s.output_id, 'C', 'passed', NULL, jsonb_build_object('statement_version', s.version, 'curator', auth.uid()));
END; $$;

CREATE OR REPLACE FUNCTION public.u6_release_problem(_output uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.report_statements;
BEGIN
  IF public.u6_latest(_output, 'Q2') IS DISTINCT FROM 'passed' THEN RETURN 'the report figures have not passed Q2 reproducible counts'; END IF;
  SELECT * INTO s FROM public.report_statements WHERE output_id = _output ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'the methodology statement is missing (C)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.report_statement_approvals WHERE statement_id = s.id) THEN RETURN 'the Curator has not approved the latest methodology statement (C)'; END IF;
  RETURN NULL;
END; $$;

-- ---------- G0 conflict declaration ----------
CREATE TABLE public.conflict_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  declared_by uuid NOT NULL DEFAULT auth.uid(),
  declaration text NOT NULL CHECK (length(trim(declaration)) > 0),
  declared_at timestamptz NOT NULL DEFAULT now(),
  standard_version uuid NOT NULL REFERENCES public.framework_versions(id));
GRANT SELECT ON public.conflict_declarations TO authenticated; GRANT ALL ON public.conflict_declarations TO service_role;
ALTER TABLE public.conflict_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conflict_declarations_read ON public.conflict_declarations FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER conflict_declarations_append_only BEFORE UPDATE OR DELETE ON public.conflict_declarations FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.u6_declare_conflict(_project uuid, _declaration text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  IF NOT public.can_access_project(auth.uid(), _project) THEN RAISE EXCEPTION 'You are not on this engagement'; END IF;
  IF length(trim(coalesce(_declaration,''))) = 0 THEN RAISE EXCEPTION 'Fill in the declaration (write "None declared" if there is none)'; END IF;
  INSERT INTO public.conflict_declarations (project_id, declaration, standard_version) VALUES (_project, trim(_declaration), public.u6_standard_version()) RETURNING id INTO r;
  RETURN r;
END; $$;

-- ---------- gate and release guards ----------
CREATE OR REPLACE FUNCTION public.u6_gate_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; why text;
BEGIN
  IF NEW.gate = 'G0' AND NOT EXISTS (SELECT 1 FROM public.conflict_declarations WHERE project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'G0: record a conflict of interest declaration first (it may be "None declared")'; END IF;
  IF NEW.gate = 'G4' THEN
    SELECT count(*) INTO n FROM public.findings WHERE project_id = NEW.project_id AND names_person_or_org AND status <> 'approved';
    IF n > 0 THEN RAISE EXCEPTION 'G4: % finding(s) naming a person or organisation still need an approved second review (R)', n; END IF;
  END IF;
  IF NEW.gate = 'G5' AND NEW.output_id IS NOT NULL THEN
    why := public.u6_release_problem(NEW.output_id);
    IF why IS NOT NULL THEN RAISE EXCEPTION 'G5: the report cannot be released: %', why; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_gates_u6 BEFORE INSERT ON public.project_gates FOR EACH ROW EXECUTE FUNCTION public.u6_gate_guard();

CREATE OR REPLACE FUNCTION public.u6_output_release_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text;
BEGIN
  IF NEW.status = 'released' AND OLD.status IS DISTINCT FROM 'released' THEN
    why := public.u6_release_problem(NEW.id);
    IF why IS NOT NULL THEN RAISE EXCEPTION 'The report cannot be released: %', why; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_outputs_u6_release BEFORE UPDATE ON public.project_outputs FOR EACH ROW EXECUTE FUNCTION public.u6_output_release_guard();

-- ---------- reopening ----------
CREATE OR REPLACE FUNCTION public.u6_reopen(_project uuid, _kind text, _subject uuid, _checkpoint text, _reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.u6_require_worker(_project);
  IF length(trim(coalesce(_reason,''))) = 0 THEN RAISE EXCEPTION 'Say why the checkpoint is reopened'; END IF;
  IF public.u6_latest(_subject, _checkpoint) IS NULL THEN RAISE EXCEPTION 'This checkpoint has not been run yet'; END IF;
  RETURN public.u6_record(_project, _kind, _subject, _checkpoint, 'reopened', trim(_reason), '{}'::jsonb, 'person');
END; $$;

-- ---------- staff welfare and training (staff only) ----------
CREATE TABLE public.staff_exposure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL, project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  on_date date NOT NULL, distressing boolean NOT NULL, note text,
  recorded_by uuid NOT NULL DEFAULT auth.uid(), recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.staff_training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL, training text NOT NULL CHECK (length(trim(training)) > 0), on_date date NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid NOT NULL DEFAULT auth.uid(), recorded_at timestamptz NOT NULL DEFAULT now());
COMMENT ON COLUMN public.staff_training_records.details IS 'Placeholder: training record format not yet decided';
GRANT SELECT ON public.staff_exposure_log, public.staff_training_records TO authenticated;
GRANT ALL ON public.staff_exposure_log, public.staff_training_records TO service_role;
ALTER TABLE public.staff_exposure_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_training_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_exposure_read ON public.staff_exposure_log FOR SELECT TO authenticated USING (
  public.is_investigator(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid())
  AND (staff_id = auth.uid() OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'management')));
CREATE POLICY staff_training_read ON public.staff_training_records FOR SELECT TO authenticated USING (
  public.is_investigator(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid())
  AND (staff_id = auth.uid() OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'management')));
CREATE TRIGGER staff_exposure_append_only BEFORE UPDATE OR DELETE ON public.staff_exposure_log FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER staff_training_append_only BEFORE UPDATE OR DELETE ON public.staff_training_records FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.u6_staff_guard(_staff uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_investigator(auth.uid()) OR public.portal_has_client_identity(auth.uid()) THEN RAISE EXCEPTION 'Staff only'; END IF;
  IF _staff <> auth.uid() AND NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'management')) THEN
    RAISE EXCEPTION 'Only the owner or Management can record this for another staff member'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.u6_log_exposure(_staff uuid, _project uuid, _on date, _distressing boolean, _note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  PERFORM public.u6_staff_guard(_staff);
  INSERT INTO public.staff_exposure_log (staff_id, project_id, on_date, distressing, note) VALUES (_staff, _project, _on, coalesce(_distressing,false), nullif(trim(coalesce(_note,'')),'')) RETURNING id INTO r;
  RETURN r;
END; $$;
CREATE OR REPLACE FUNCTION public.u6_add_training(_staff uuid, _training text, _on date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  PERFORM public.u6_staff_guard(_staff);
  INSERT INTO public.staff_training_records (staff_id, training, on_date) VALUES (_staff, trim(coalesce(_training,'')), _on) RETURNING id INTO r;
  RETURN r;
END; $$;

-- ---------- privileges ----------
REVOKE ALL ON FUNCTION public.u6_record(uuid,text,uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.u6_record(uuid,text,uuid,text,text,text,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.u6_standard_version(), public.u6_standard(), public.u6_latest(uuid,text), public.u6_latest_confidence(uuid),
  public.u6_require_worker(uuid), public.u6_check_v1(uuid), public.u6_verify(uuid,text,text,text,text,text),
  public.u6_requirement_project(uuid), public.u6_record_measure(uuid,int,bigint,date,date,text), public.u6_record_negative(uuid,text,date),
  public.u6_check_q1(uuid), public.u6_create_finding(uuid,text,text,boolean), public.u6_link_item(uuid,uuid,text), public.u6_send_for_review(uuid),
  public.u6_review(uuid,boolean,text), public.u6_output_project(uuid), public.u6_add_figure(uuid,text,uuid[],text), public.u6_check_q2(uuid),
  public.u6_write_statement(uuid,text,text,text[],text,text), public.u6_approve_statement(uuid,text), public.u6_release_problem(uuid),
  public.u6_declare_conflict(uuid,text), public.u6_reopen(uuid,text,uuid,text,text), public.u6_staff_guard(uuid),
  public.u6_log_exposure(uuid,uuid,date,boolean,text), public.u6_add_training(uuid,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.u6_standard_version(), public.u6_standard(), public.u6_latest(uuid,text), public.u6_latest_confidence(uuid),
  public.u6_require_worker(uuid), public.u6_check_v1(uuid), public.u6_verify(uuid,text,text,text,text,text),
  public.u6_requirement_project(uuid), public.u6_record_measure(uuid,int,bigint,date,date,text), public.u6_record_negative(uuid,text,date),
  public.u6_check_q1(uuid), public.u6_create_finding(uuid,text,text,boolean), public.u6_link_item(uuid,uuid,text), public.u6_send_for_review(uuid),
  public.u6_review(uuid,boolean,text), public.u6_output_project(uuid), public.u6_add_figure(uuid,text,uuid[],text), public.u6_check_q2(uuid),
  public.u6_write_statement(uuid,text,text,text[],text,text), public.u6_approve_statement(uuid,text), public.u6_release_problem(uuid),
  public.u6_declare_conflict(uuid,text), public.u6_reopen(uuid,text,uuid,text,text), public.u6_staff_guard(uuid),
  public.u6_log_exposure(uuid,uuid,date,boolean,text), public.u6_add_training(uuid,text,date) TO authenticated, service_role;