-- Phase 4: Research data model and rules (no screens). Collection itself runs later on FA devices.
SET check_function_bodies = off;

-- ---- home vault reachability, reported by the collection device (service role only) ----
CREATE TABLE public.research_vault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.sources(id),
  online boolean NOT NULL,
  note text,
  reported_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.research_vault_reports TO authenticated;
GRANT ALL ON public.research_vault_reports TO service_role;
ALTER TABLE public.research_vault_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_vault_reports_read ON public.research_vault_reports FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER research_vault_reports_append_only BEFORE UPDATE OR DELETE ON public.research_vault_reports
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.research_home_vault_online()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT r.online FROM public.research_vault_reports r JOIN public.sources s ON s.id = r.source_id
    WHERE s.kind = 'home_vault' AND s.enabled AND r.reported_at > now() - interval '15 minutes'
    ORDER BY r.reported_at DESC, r.id LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION public.research_pending_amendment(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_briefs b WHERE b.project_id = _project AND b.kind = 'amendment'
    AND NOT EXISTS (SELECT 1 FROM public.project_amendment_approvals a WHERE a.brief_id = b.id));
$$;

-- one reason, in plain words, why research cannot be planned or started now (NULL = ready)
CREATE OR REPLACE FUNCTION public.research_block_reason(_project uuid, _cycle int, _plan uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.gate_signed(_project, 'G1') THEN RETURN 'Research needs the mandate confirmed (G1)'; END IF;
  IF NOT public.gate_signed(_project, 'G2') THEN RETURN 'Research needs the design approved (G2)'; END IF;
  IF (SELECT design_stale FROM public.projects WHERE id = _project) THEN
    RETURN 'The design is stale: G2 must be approved again before research'; END IF;
  IF public.research_pending_amendment(_project) THEN
    RETURN 'An amendment is awaiting the Curator; research cannot be planned or started'; END IF;
  IF NOT public.research_home_vault_online() THEN
    RETURN 'The home vault is not reported online; research cannot be planned or started'; END IF;
  IF EXISTS (SELECT 1 FROM public.research_plans p WHERE p.project_id = _project AND p.cycle = _cycle
             AND p.id IS DISTINCT FROM _plan AND p.status NOT IN ('loaded','stopped','failed')) THEN
    RETURN 'This cycle already has an active research plan'; END IF;
  RETURN NULL;
END; $$;

-- ---- research plans ----
CREATE TABLE public.research_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  project_id uuid GENERATED ALWAYS AS (engagement_id) STORED,
  cycle int NOT NULL,
  design_version int NOT NULL,
  brief_version int NOT NULL,
  lexicon_version text NOT NULL,
  approved_sources text[] NOT NULL CHECK (cardinality(approved_sources) > 0),
  job_types text[] NOT NULL CHECK (cardinality(job_types) > 0 AND job_types <@ ARRAY['monitor','scrape','osint_search']),
  window_from date NOT NULL, window_to date NOT NULL,
  cadence text NOT NULL CHECK (length(trim(cadence)) > 0),
  vault_primary text NOT NULL DEFAULT 'home' CHECK (vault_primary = 'home'),
  cloud_mirror boolean NOT NULL DEFAULT false,
  plan_sha256 text CHECK (plan_sha256 IS NULL OR plan_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','locked','queued','running','paused','delivered','loaded','stopped','failed')),
  status_reason text,
  locked_at timestamptz, locked_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_to >= window_from),
  CHECK ((status = 'draft') = (locked_at IS NULL)),
  FOREIGN KEY (engagement_id, cycle) REFERENCES public.project_cycles (project_id, cycle_no)
);
CREATE UNIQUE INDEX research_plans_one_active ON public.research_plans (engagement_id, cycle)
  WHERE status NOT IN ('loaded','stopped','failed');
GRANT SELECT, INSERT, UPDATE ON public.research_plans TO authenticated;
GRANT ALL ON public.research_plans TO service_role;
ALTER TABLE public.research_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_plans_read ON public.research_plans FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), engagement_id) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE POLICY research_plans_add ON public.research_plans FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(auth.uid(), engagement_id, ARRAY['owner','curator','engagement_lead','lead_analyst','collection_operator'])
    AND NOT public.has_role(auth.uid(), 'management'));
CREATE POLICY research_plans_edit ON public.research_plans FOR UPDATE TO authenticated
  USING (public.has_project_role(auth.uid(), engagement_id, ARRAY['owner','curator','engagement_lead','lead_analyst','collection_operator'])
    AND NOT public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_project_role(auth.uid(), engagement_id, ARRAY['owner','curator','engagement_lead','lead_analyst','collection_operator'])
    AND NOT public.has_role(auth.uid(), 'management'));

CREATE OR REPLACE FUNCTION public.research_plan_facts(p public.research_plans)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('engagement_id', p.engagement_id, 'cycle', p.cycle, 'design_version', p.design_version,
    'brief_version', p.brief_version, 'lexicon_version', p.lexicon_version, 'approved_sources', p.approved_sources,
    'job_types', p.job_types, 'window_from', p.window_from, 'window_to', p.window_to, 'cadence', p.cadence,
    'vault_primary', p.vault_primary, 'cloud_mirror', p.cloud_mirror);
$$;

CREATE OR REPLACE FUNCTION public.research_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text; d record; via text := coalesce(current_setting('research.via', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'management') THEN
      RAISE EXCEPTION 'FA Management cannot plan, start or stop research'; END IF;
    why := public.research_block_reason(NEW.engagement_id, NEW.cycle);
    IF why IS NOT NULL THEN RAISE EXCEPTION '%', why; END IF;
    SELECT version, lexicon_version INTO d FROM public.project_design_sheets
      WHERE project_id = NEW.engagement_id ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Research needs a design sheet'; END IF;
    -- research reads the design; it never sets or changes it
    NEW.design_version := d.version; NEW.lexicon_version := d.lexicon_version;
    NEW.brief_version := (SELECT version FROM public.project_briefs WHERE id = public.project_current_brief_id(NEW.engagement_id));
    IF NEW.brief_version IS NULL THEN RAISE EXCEPTION 'Research needs a brief in force'; END IF;
    NEW.status := 'draft'; NEW.status_reason := NULL; NEW.plan_sha256 := NULL;
    NEW.locked_at := NULL; NEW.locked_by := NULL; NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  -- UPDATE
  IF OLD.locked_at IS NOT NULL AND public.research_plan_facts(NEW) IS DISTINCT FROM public.research_plan_facts(OLD) THEN
    RAISE EXCEPTION 'This plan is locked: it was started and cannot be edited'; END IF;
  IF OLD.locked_at IS NOT NULL AND (NEW.plan_sha256 IS DISTINCT FROM OLD.plan_sha256
      OR NEW.locked_at IS DISTINCT FROM OLD.locked_at OR NEW.locked_by IS DISTINCT FROM OLD.locked_by) THEN
    RAISE EXCEPTION 'This plan is locked: its hash and lock cannot change'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Plan authorship cannot change'; END IF;
  IF OLD.locked_at IS NULL THEN
    IF NEW.design_version <> OLD.design_version OR NEW.lexicon_version <> OLD.lexicon_version OR NEW.brief_version <> OLD.brief_version THEN
      RAISE EXCEPTION 'Design, lexicon and brief versions are fixed by the database'; END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- people change status only through the research functions; the worker uses the service role
    IF auth.uid() IS NOT NULL AND via <> 'status' THEN
      RAISE EXCEPTION 'Research status changes only through Start, Pause, Resume or Stop'; END IF;
    IF NOT ((OLD.status = 'draft' AND NEW.status = 'locked')
         OR (OLD.status = 'locked' AND NEW.status IN ('queued','stopped'))
         OR (OLD.status = 'queued' AND NEW.status IN ('running','paused','stopped','failed'))
         OR (OLD.status = 'running' AND NEW.status IN ('paused','stopped','failed','delivered'))
         OR (OLD.status = 'paused' AND NEW.status IN ('running','queued','stopped'))
         OR (OLD.status = 'delivered' AND NEW.status = 'loaded')) THEN
      RAISE EXCEPTION 'A research plan cannot move from % to %', OLD.status, NEW.status; END IF;
    IF NEW.status = 'stopped' AND length(trim(coalesce(NEW.status_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'Stopping research needs a reason'; END IF;
    IF NEW.status = 'delivered' AND (NOT EXISTS (SELECT 1 FROM public.research_runs r WHERE r.plan_id = NEW.id)
        OR EXISTS (SELECT 1 FROM public.research_runs r WHERE r.plan_id = NEW.id AND r.status NOT IN ('delivered','stopped'))) THEN
      RAISE EXCEPTION 'A plan is delivered only when every run is delivered'; END IF;
    IF NEW.status = 'loaded' AND coalesce(current_setting('research.via', true), '') <> 'load' THEN
      RAISE EXCEPTION 'A plan is loaded only by a reconciled load'; END IF;
  ELSIF auth.uid() IS NOT NULL AND OLD.locked_at IS NOT NULL AND via = '' THEN
    RAISE EXCEPTION 'This plan is locked: it was started and cannot be edited';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER research_plans_guard BEFORE INSERT OR UPDATE ON public.research_plans
  FOR EACH ROW EXECUTE FUNCTION public.research_plan_guard();
CREATE TRIGGER research_plans_no_delete BEFORE DELETE ON public.research_plans
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- jobs, runs, captures, refusals, events, loads ----
CREATE TABLE public.research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.research_plans(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('monitor','scrape','osint_search')),
  source text NOT NULL,
  target_key text,
  terms text[] NOT NULL DEFAULT '{}',
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','done','stopped')),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, idempotency_key)
);
CREATE TABLE public.research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.research_plans(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES public.research_jobs(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('monitor','scrape','osint_search')),
  expected int NOT NULL DEFAULT 0 CHECK (expected >= 0),
  captured int NOT NULL DEFAULT 0 CHECK (captured >= 0),
  in_vault int NOT NULL DEFAULT 0 CHECK (in_vault >= 0 AND in_vault <= captured),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','delivered','stopped','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.research_runs(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  item_ref text NOT NULL CHECK (length(trim(item_ref)) > 0),
  source text NOT NULL,
  target_key text,
  matched_terms text[] NOT NULL DEFAULT '{}',
  evidence_ref_id uuid REFERENCES public.evidence_refs(id) ON DELETE RESTRICT,
  sha256_at_capture text NOT NULL CHECK (sha256_at_capture ~ '^[0-9a-f]{64}$'),
  sha256_on_write text CHECK (sha256_on_write IS NULL OR sha256_on_write ~ '^[0-9a-f]{64}$'),
  vault_write_verified boolean NOT NULL DEFAULT false,
  custody_event_id uuid REFERENCES public.custody_events(id) ON DELETE RESTRICT,
  original_context jsonb NOT NULL DEFAULT '{}'::jsonb,   -- FA-STD-001: keep field names easy to extend
  standard_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_by uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  second_check_by uuid,
  second_check_at timestamptz,
  tier text CHECK (tier IN ('API_RAW_ONLY','BROWSER_DOM_ONLY','ELEMENT_CROP','FA_STD_001_V2')),
  fstd001_version text NOT NULL CHECK (length(trim(fstd001_version)) > 0),
  pipeline_state text NOT NULL DEFAULT 'captured'
    CHECK (pipeline_state IN ('captured','hashed','in_vault','custody_logged','checked','tiered')),
  UNIQUE (run_id, item_ref),
  CHECK (second_check_by IS NULL OR captured_by IS NULL OR second_check_by <> captured_by)
);
CREATE TABLE public.research_refusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.research_plans(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  run_id uuid REFERENCES public.research_runs(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('job','capture')),
  reason text NOT NULL,
  request jsonb NOT NULL,
  refused_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES public.research_plans(id) ON DELETE RESTRICT,
  run_id uuid REFERENCES public.research_runs(id) ON DELETE RESTRICT,
  capture_id uuid REFERENCES public.research_captures(id) ON DELETE RESTRICT,
  event text NOT NULL,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(),
  actor_kind text NOT NULL DEFAULT 'person' CHECK (actor_kind IN ('person','worker')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES public.research_plans(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  cycle int NOT NULL,
  captured int NOT NULL, in_vault int NOT NULL, loaded int NOT NULL,
  reconciled boolean NOT NULL DEFAULT false,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  candidates_created int NOT NULL DEFAULT 0,
  recorded_by uuid DEFAULT auth.uid(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['research_jobs','research_runs','research_captures','research_refusals','research_events','research_loads'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id) AND NOT public.portal_has_client_identity(auth.uid()))', t || '_read', t);
  END LOOP;
END $$;
CREATE TRIGGER research_refusals_append_only BEFORE UPDATE OR DELETE ON public.research_refusals FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER research_events_append_only BEFORE UPDATE OR DELETE ON public.research_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER research_loads_append_only BEFORE UPDATE OR DELETE ON public.research_loads FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER research_jobs_no_delete BEFORE DELETE ON public.research_jobs FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER research_runs_no_delete BEFORE DELETE ON public.research_runs FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER research_captures_no_delete BEFORE DELETE ON public.research_captures FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- scope check: lexicon, targets marked in, approved sources ----
-- A target is "in" when its latest revision is not withdrawn and its identity is resolved or Curator-confirmed.
CREATE OR REPLACE FUNCTION public.research_scope_refusal(_plan uuid, _job_type text, _source text, _target text, _terms text[])
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.research_plans; lex text[]; t record;
BEGIN
  SELECT * INTO p FROM public.research_plans WHERE id = _plan;
  IF NOT FOUND THEN RETURN 'Unknown research plan'; END IF;
  IF p.locked_at IS NULL THEN RETURN 'The plan has not been started'; END IF;
  IF p.status NOT IN ('locked','queued','running') THEN RETURN format('The plan is %s', p.status); END IF;
  IF _job_type IS NOT NULL AND NOT (_job_type = ANY(p.job_types)) THEN
    RETURN format('Job type %s is not in the plan', _job_type); END IF;
  IF _source IS NULL OR NOT (lower(_source) = ANY(SELECT lower(x) FROM unnest(p.approved_sources) x)) THEN
    RETURN format('Source %s is not an approved source in the plan', coalesce(_source, '(none)')); END IF;
  IF _target IS NOT NULL THEN
    SELECT * INTO t FROM public.project_targets WHERE project_id = p.engagement_id AND target_key = lower(_target)
      ORDER BY rev DESC LIMIT 1;
    IF NOT FOUND OR t.withdrawn OR NOT (t.identity_resolved OR t.curator_confirmed) THEN
      RETURN format('Target %s is not marked in on the target register', _target); END IF;
  END IF;
  SELECT array_agg(lower(term)) INTO lex FROM public.project_design_sheets d,
    jsonb_each(d.lexicon) l, jsonb_array_elements_text(CASE WHEN jsonb_typeof(l.value) = 'array' THEN l.value ELSE '[]'::jsonb END) term
    WHERE d.project_id = p.engagement_id AND d.version = p.design_version;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(_terms, '{}')) x WHERE NOT (lower(x) = ANY(coalesce(lex, '{}')))) THEN
    RETURN 'A term is not in the plan''s lexicon'; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.research_job_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.project_id := (SELECT engagement_id FROM public.research_plans WHERE id = NEW.plan_id);
    why := public.research_scope_refusal(NEW.plan_id, NEW.job_type, NEW.source, NEW.target_key, NEW.terms);
    IF why IS NOT NULL THEN RAISE EXCEPTION 'Refused: %', why; END IF;
    NEW.status := 'queued';
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) - 'status' - 'claimed_at' IS DISTINCT FROM to_jsonb(OLD) - 'status' - 'claimed_at' THEN
    RAISE EXCEPTION 'A queued job cannot be rewritten'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_jobs_guard BEFORE INSERT OR UPDATE ON public.research_jobs
  FOR EACH ROW EXECUTE FUNCTION public.research_job_guard();

CREATE OR REPLACE FUNCTION public.research_run_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.research_plans;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO p FROM public.research_plans WHERE id = NEW.plan_id;
    IF p.locked_at IS NULL OR p.status NOT IN ('locked','queued','running') THEN
      RAISE EXCEPTION 'A run needs a started plan that is queued or running'; END IF;
    IF NOT (NEW.type = ANY(p.job_types)) THEN RAISE EXCEPTION 'Refused: run type % is not in the plan', NEW.type; END IF;
    NEW.project_id := p.engagement_id; NEW.captured := 0; NEW.in_vault := 0; NEW.status := 'running';
    RETURN NEW;
  END IF;
  IF NEW.plan_id <> OLD.plan_id OR NEW.project_id <> OLD.project_id OR NEW.type <> OLD.type
     OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'A run''s plan, job and type are fixed'; END IF;
  IF coalesce(current_setting('research.via', true), '') <> 'counts'
     AND (NEW.captured <> OLD.captured OR NEW.in_vault <> OLD.in_vault) THEN
    RAISE EXCEPTION 'Run counts come only from recorded captures'; END IF;
  IF OLD.status IN ('delivered','stopped','failed') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A finished run cannot change status'; END IF;
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    IF NEW.captured <> NEW.in_vault THEN
      RAISE EXCEPTION 'A run is delivered only when captured (%) equals in vault (%)', NEW.captured, NEW.in_vault; END IF;
    NEW.finished_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER research_runs_guard BEFORE INSERT OR UPDATE ON public.research_runs
  FOR EACH ROW EXECUTE FUNCTION public.research_run_guard();

CREATE OR REPLACE FUNCTION public.research_capture_pipeline(c public.research_captures)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN c.tier IS NOT NULL THEN 'tiered'
    WHEN c.second_check_by IS NOT NULL THEN 'checked'
    WHEN c.custody_event_id IS NOT NULL THEN 'custody_logged'
    WHEN c.vault_write_verified THEN 'in_vault'
    WHEN c.sha256_at_capture IS NOT NULL THEN 'hashed' ELSE 'captured' END;
$$;

CREATE OR REPLACE FUNCTION public.research_capture_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_runs; why text; via text := coalesce(current_setting('research.via', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO r FROM public.research_runs WHERE id = NEW.run_id;
    IF NOT FOUND OR r.status <> 'running' THEN RAISE EXCEPTION 'Captures are recorded only on a running run'; END IF;
    NEW.project_id := r.project_id;
    why := public.research_scope_refusal(r.plan_id, r.type, NEW.source, NEW.target_key, NEW.matched_terms);
    IF why IS NOT NULL THEN RAISE EXCEPTION 'Refused: %', why; END IF;
    NEW.vault_write_verified := false; NEW.sha256_on_write := NULL; NEW.custody_event_id := NULL;
    NEW.second_check_by := NULL; NEW.second_check_at := NULL; NEW.tier := NULL;
  ELSE
    IF NEW.run_id <> OLD.run_id OR NEW.project_id <> OLD.project_id OR NEW.item_ref <> OLD.item_ref
       OR NEW.sha256_at_capture <> OLD.sha256_at_capture OR NEW.source <> OLD.source
       OR NEW.target_key IS DISTINCT FROM OLD.target_key OR NEW.matched_terms <> OLD.matched_terms
       OR NEW.captured_by IS DISTINCT FROM OLD.captured_by OR NEW.captured_at <> OLD.captured_at
       OR NEW.fstd001_version <> OLD.fstd001_version OR NEW.original_context <> OLD.original_context
       OR NEW.evidence_ref_id IS DISTINCT FROM OLD.evidence_ref_id THEN
      RAISE EXCEPTION 'A capture record is fixed once written; only its pipeline steps advance'; END IF;
    IF OLD.vault_write_verified AND NOT NEW.vault_write_verified THEN RAISE EXCEPTION 'A verified vault write cannot be undone'; END IF;
    IF (OLD.custody_event_id IS NOT NULL AND NEW.custody_event_id IS DISTINCT FROM OLD.custody_event_id)
       OR (OLD.second_check_by IS NOT NULL AND NEW.second_check_by IS DISTINCT FROM OLD.second_check_by)
       OR (OLD.sha256_on_write IS NOT NULL AND NEW.sha256_on_write IS DISTINCT FROM OLD.sha256_on_write)
       OR (OLD.tier IS NOT NULL AND NEW.tier IS DISTINCT FROM OLD.tier) THEN
      RAISE EXCEPTION 'A completed pipeline step cannot be changed'; END IF;
    IF NEW.vault_write_verified AND NOT OLD.vault_write_verified
       AND (NEW.sha256_on_write IS NULL OR NEW.sha256_on_write <> NEW.sha256_at_capture) THEN
      RAISE EXCEPTION 'Vault write not verified: the hash on write does not match the hash at capture'; END IF;
    IF auth.uid() IS NOT NULL AND via NOT IN ('check','tier') THEN
      RAISE EXCEPTION 'Capture and vault results come only from the collection device'; END IF;
    IF NEW.second_check_by IS NOT NULL AND OLD.second_check_by IS NULL THEN
      IF NEW.second_check_by = NEW.captured_by THEN
        RAISE EXCEPTION 'The second-person check must be done by someone other than the capturer'; END IF;
      IF NOT public.has_project_role(NEW.second_check_by, NEW.project_id, ARRAY['owner','evidence_officer']) THEN
        RAISE EXCEPTION 'The second-person check must be done by an evidence officer'; END IF;
      NEW.second_check_at := now();
    END IF;
    IF NEW.tier = 'FA_STD_001_V2' AND OLD.tier IS NULL AND NOT (
         NEW.vault_write_verified AND NEW.sha256_on_write = NEW.sha256_at_capture AND NEW.custody_event_id IS NOT NULL
         AND NEW.captured_by IS NOT NULL AND NEW.second_check_by IS NOT NULL AND NEW.second_check_by <> NEW.captured_by
         AND length(trim(NEW.fstd001_version)) > 0) THEN
      RAISE EXCEPTION 'FA-STD-001 V2 needs a complete capture record (hash re-checked on write, vault write, custody event, standard version) and a second-person check by a different person'; END IF;
  END IF;
  NEW.pipeline_state := public.research_capture_pipeline(NEW);
  RETURN NEW;
END; $$;
CREATE TRIGGER research_captures_guard BEFORE INSERT OR UPDATE ON public.research_captures
  FOR EACH ROW EXECUTE FUNCTION public.research_capture_guard();

CREATE OR REPLACE FUNCTION public.research_capture_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('research.via', 'counts', true);
  UPDATE public.research_runs r SET
    captured = (SELECT count(*) FROM public.research_captures c WHERE c.run_id = r.id),
    in_vault = (SELECT count(*) FROM public.research_captures c WHERE c.run_id = r.id AND c.vault_write_verified)
  WHERE r.id = NEW.run_id;
  PERFORM set_config('research.via', '', true);
  INSERT INTO public.research_events (project_id, plan_id, run_id, capture_id, event, details, actor, actor_kind)
  VALUES (NEW.project_id, (SELECT plan_id FROM public.research_runs WHERE id = NEW.run_id), NEW.run_id, NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'captured' ELSE 'pipeline:' || NEW.pipeline_state END,
    jsonb_build_object('sha256_at_capture', NEW.sha256_at_capture, 'pipeline_state', NEW.pipeline_state, 'tier', NEW.tier),
    auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'worker' ELSE 'person' END);
  RETURN NEW;
END; $$;
CREATE TRIGGER research_captures_counts AFTER INSERT OR UPDATE ON public.research_captures
  FOR EACH ROW EXECUTE FUNCTION public.research_capture_counts();

CREATE OR REPLACE FUNCTION public.research_log_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF TG_TABLE_NAME = 'research_plans' THEN
      INSERT INTO public.research_events (project_id, plan_id, event, reason, details, actor, actor_kind)
      VALUES (NEW.engagement_id, NEW.id, 'plan:' || NEW.status, NEW.status_reason,
        jsonb_build_object('plan_sha256', NEW.plan_sha256), auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'worker' ELSE 'person' END);
    ELSIF TG_TABLE_NAME = 'research_runs' THEN
      INSERT INTO public.research_events (project_id, plan_id, run_id, event, details, actor, actor_kind)
      VALUES (NEW.project_id, NEW.plan_id, NEW.id, 'run:' || NEW.status,
        jsonb_build_object('captured', NEW.captured, 'in_vault', NEW.in_vault, 'expected', NEW.expected),
        auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'worker' ELSE 'person' END);
    ELSE
      INSERT INTO public.research_events (project_id, plan_id, event, details, actor, actor_kind)
      VALUES (NEW.project_id, NEW.plan_id, 'job:' || NEW.status, jsonb_build_object('job_id', NEW.id, 'type', NEW.job_type),
        auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'worker' ELSE 'person' END);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_plans_log AFTER INSERT OR UPDATE ON public.research_plans FOR EACH ROW EXECUTE FUNCTION public.research_log_status();
CREATE TRIGGER research_runs_log AFTER INSERT OR UPDATE ON public.research_runs FOR EACH ROW EXECUTE FUNCTION public.research_log_status();
CREATE TRIGGER research_jobs_log AFTER INSERT OR UPDATE ON public.research_jobs FOR EACH ROW EXECUTE FUNCTION public.research_log_status();

-- ---- people's actions (no optimistic writes: each returns only after the database accepts it) ----
CREATE OR REPLACE FUNCTION public.research_start_plan(_plan uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.research_plans; why text; h text; latest int;
BEGIN
  SELECT * INTO p FROM public.research_plans WHERE id = _plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown research plan'; END IF;
  IF public.has_role(auth.uid(), 'management') THEN RAISE EXCEPTION 'FA Management cannot plan, start or stop research'; END IF;
  IF NOT public.has_project_role(auth.uid(), p.engagement_id, ARRAY['owner','curator','engagement_lead','collection_operator']) THEN
    RAISE EXCEPTION 'Only the collection operator, engagement lead or Curator can start research'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'This plan is already started (%)', p.status; END IF;
  why := public.research_block_reason(p.engagement_id, p.cycle, p.id);
  IF why IS NOT NULL THEN RAISE EXCEPTION '%', why; END IF;
  SELECT max(version) INTO latest FROM public.project_design_sheets WHERE project_id = p.engagement_id;
  IF latest <> p.design_version THEN RAISE EXCEPTION 'The design changed after this plan was drafted; draft a new plan'; END IF;
  h := encode(sha256(convert_to(public.research_plan_facts(p)::text, 'UTF8')), 'hex');
  PERFORM set_config('research.via', 'status', true);
  UPDATE public.research_plans SET status = 'locked', plan_sha256 = h, locked_at = now(), locked_by = auth.uid() WHERE id = _plan;
  UPDATE public.research_plans SET status = 'queued' WHERE id = _plan;
  PERFORM set_config('research.via', '', true);
  RETURN h;
END; $$;

CREATE OR REPLACE FUNCTION public.research_set_status(_plan uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.research_plans;
BEGIN
  SELECT * INTO p FROM public.research_plans WHERE id = _plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown research plan'; END IF;
  IF public.has_role(auth.uid(), 'management') THEN RAISE EXCEPTION 'FA Management cannot plan, start or stop research'; END IF;
  IF NOT public.has_project_role(auth.uid(), p.engagement_id, ARRAY['owner','curator','engagement_lead','collection_operator']) THEN
    RAISE EXCEPTION 'Only the collection operator, engagement lead or Curator can pause, resume or stop research'; END IF;
  IF _status NOT IN ('paused','running','stopped') THEN RAISE EXCEPTION 'People can only pause, resume or stop research'; END IF;
  IF _status = 'running' AND p.status <> 'paused' THEN RAISE EXCEPTION 'Only paused research can be resumed'; END IF;
  IF _status = 'stopped' AND length(trim(coalesce(_reason, ''))) = 0 THEN RAISE EXCEPTION 'Stopping research needs a reason'; END IF;
  PERFORM set_config('research.via', 'status', true);
  UPDATE public.research_plans SET status = _status, status_reason = nullif(trim(coalesce(_reason, '')), '') WHERE id = _plan;
  IF _status = 'stopped' THEN
    UPDATE public.research_jobs SET status = 'stopped' WHERE plan_id = _plan AND status IN ('queued','claimed');
    PERFORM set_config('research.via', 'counts', true);
    UPDATE public.research_runs SET status = 'stopped', finished_at = now() WHERE plan_id = _plan AND status IN ('running','paused');
  END IF;
  PERFORM set_config('research.via', '', true);
END; $$;

-- Jobs and captures outside the plan are refused AND logged (never queued). Used by the worker API.
CREATE OR REPLACE FUNCTION public.research_submit_job(_plan uuid, _job_type text, _source text, _target text, _terms text[], _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text; j uuid; pid uuid;
BEGIN
  SELECT engagement_id INTO pid FROM public.research_plans WHERE id = _plan;
  IF pid IS NULL THEN RAISE EXCEPTION 'Unknown research plan'; END IF;
  SELECT id INTO j FROM public.research_jobs WHERE plan_id = _plan AND idempotency_key = _key;
  IF j IS NOT NULL THEN RETURN jsonb_build_object('status', 'queued', 'job_id', j, 'repeat', true); END IF;
  why := public.research_scope_refusal(_plan, _job_type, _source, _target, _terms);
  IF why IS NOT NULL THEN
    INSERT INTO public.research_refusals (plan_id, project_id, kind, reason, request)
      VALUES (_plan, pid, 'job', why, jsonb_build_object('job_type', _job_type, 'source', _source, 'target', _target, 'terms', _terms, 'key', _key));
    INSERT INTO public.research_events (project_id, plan_id, event, reason, actor_kind) VALUES (pid, _plan, 'job:refused', why, 'worker');
    RETURN jsonb_build_object('status', 'refused', 'reason', why);
  END IF;
  INSERT INTO public.research_jobs (plan_id, project_id, job_type, source, target_key, terms, idempotency_key)
    VALUES (_plan, pid, _job_type, _source, _target, coalesce(_terms, '{}'), _key) RETURNING id INTO j;
  RETURN jsonb_build_object('status', 'queued', 'job_id', j);
END; $$;

CREATE OR REPLACE FUNCTION public.research_submit_capture(_run uuid, _item_ref text, _source text, _target text, _terms text[],
  _sha256 text, _fstd001_version text, _captured_by uuid DEFAULT NULL, _evidence_ref uuid DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_runs; why text; c uuid;
BEGIN
  SELECT * INTO r FROM public.research_runs WHERE id = _run;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown run'; END IF;
  SELECT id INTO c FROM public.research_captures WHERE run_id = _run AND item_ref = _item_ref;
  IF c IS NOT NULL THEN RETURN jsonb_build_object('status', 'recorded', 'capture_id', c, 'repeat', true); END IF;
  why := public.research_scope_refusal(r.plan_id, r.type, _source, _target, _terms);
  IF why IS NOT NULL THEN
    INSERT INTO public.research_refusals (plan_id, project_id, run_id, kind, reason, request)
      VALUES (r.plan_id, r.project_id, _run, 'capture', why, jsonb_build_object('item_ref', _item_ref, 'source', _source, 'target', _target, 'terms', _terms, 'sha256', _sha256));
    INSERT INTO public.research_events (project_id, plan_id, run_id, event, reason, actor_kind) VALUES (r.project_id, r.plan_id, _run, 'capture:refused', why, 'worker');
    RETURN jsonb_build_object('status', 'refused', 'reason', why);
  END IF;
  INSERT INTO public.research_captures (run_id, project_id, item_ref, source, target_key, matched_terms, sha256_at_capture,
    fstd001_version, captured_by, evidence_ref_id, original_context)
  VALUES (_run, r.project_id, _item_ref, _source, _target, coalesce(_terms, '{}'), lower(_sha256), _fstd001_version,
    _captured_by, _evidence_ref, coalesce(_context, '{}'::jsonb)) RETURNING id INTO c;
  RETURN jsonb_build_object('status', 'recorded', 'capture_id', c);
END; $$;

CREATE OR REPLACE FUNCTION public.research_second_check(_capture uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.research_captures;
BEGIN
  SELECT * INTO c FROM public.research_captures WHERE id = _capture FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture'; END IF;
  IF public.has_role(auth.uid(), 'management') THEN RAISE EXCEPTION 'FA Management cannot check captures'; END IF;
  PERFORM set_config('research.via', 'check', true);
  UPDATE public.research_captures SET second_check_by = auth.uid() WHERE id = _capture;
  PERFORM set_config('research.via', '', true);
END; $$;

CREATE OR REPLACE FUNCTION public.research_set_tier(_capture uuid, _tier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.research_captures;
BEGIN
  SELECT * INTO c FROM public.research_captures WHERE id = _capture FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture'; END IF;
  IF NOT public.has_project_role(auth.uid(), c.project_id, ARRAY['owner','evidence_officer']) THEN
    RAISE EXCEPTION 'Only an evidence officer sets the evidence tier'; END IF;
  PERFORM set_config('research.via', 'tier', true);
  UPDATE public.research_captures SET tier = _tier WHERE id = _capture;
  PERFORM set_config('research.via', '', true);
END; $$;

-- A reconciled load (captured = in vault = loaded) marks the plan loaded, opens the cycle for Reading
-- and creates reading candidates for captures that reference a home-vault record in a linked case.
CREATE OR REPLACE FUNCTION public.research_record_load(_plan uuid, _loaded int, _manifest_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.research_plans; cap int; inv int; ok boolean; n int := 0; lid uuid;
BEGIN
  SELECT * INTO p FROM public.research_plans WHERE id = _plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown research plan'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_project_role(auth.uid(), p.engagement_id, ARRAY['owner','data_steward']) THEN
    RAISE EXCEPTION 'Only the data steward records a research load'; END IF;
  IF p.status <> 'delivered' THEN RAISE EXCEPTION 'Only a delivered plan can be loaded'; END IF;
  SELECT coalesce(sum(captured), 0), coalesce(sum(in_vault), 0) INTO cap, inv FROM public.research_runs WHERE plan_id = _plan;
  ok := cap = inv AND inv = _loaded;
  INSERT INTO public.research_loads (plan_id, project_id, cycle, captured, in_vault, loaded, reconciled, manifest_sha256)
    VALUES (_plan, p.engagement_id, p.cycle, cap, inv, _loaded, ok, lower(_manifest_sha256)) RETURNING id INTO lid;
  IF NOT ok THEN
    INSERT INTO public.research_events (project_id, plan_id, event, details)
      VALUES (p.engagement_id, _plan, 'load:not_reconciled', jsonb_build_object('captured', cap, 'in_vault', inv, 'loaded', _loaded));
    RETURN jsonb_build_object('reconciled', false, 'captured', cap, 'in_vault', inv, 'loaded', _loaded);
  END IF;
  INSERT INTO public.project_items (project_id, cycle_no, item_kind, evidence_ref_id, matched_terms, source_line, note)
  SELECT DISTINCT ON (c.evidence_ref_id) p.engagement_id, p.cycle, 'home_ref', c.evidence_ref_id, c.matched_terms, c.source,
    'From research plan ' || left(p.plan_sha256, 12)
  FROM public.research_captures c JOIN public.research_runs r ON r.id = c.run_id
  JOIN public.evidence_refs e ON e.id = c.evidence_ref_id
  WHERE r.plan_id = _plan AND c.vault_write_verified
    AND EXISTS (SELECT 1 FROM public.project_cases pc WHERE pc.project_id = p.engagement_id AND pc.case_id = e.case_id AND pc.voided_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.project_items i WHERE i.project_id = p.engagement_id AND i.cycle_no = p.cycle AND i.evidence_ref_id = c.evidence_ref_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('research.via', 'load', true);
  UPDATE public.research_plans SET status = 'loaded' WHERE id = _plan;
  PERFORM set_config('research.via', '', true);
  INSERT INTO public.research_events (project_id, plan_id, event, details)
    VALUES (p.engagement_id, _plan, 'load:reconciled', jsonb_build_object('loaded', _loaded, 'candidates_created', n, 'load_id', lid));
  RETURN jsonb_build_object('reconciled', true, 'candidates_created', n);
END; $$;
-- research_loads is append-only; candidates_created is reported in the load event instead.

CREATE OR REPLACE FUNCTION public.research_cycle_open_for_reading(_project uuid, _cycle int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.research_loads l WHERE l.project_id = _project AND l.cycle = _cycle AND l.reconciled);
$$;

REVOKE ALL ON FUNCTION public.research_home_vault_online(), public.research_pending_amendment(uuid),
  public.research_block_reason(uuid, int, uuid), public.research_scope_refusal(uuid, text, text, text, text[]),
  public.research_start_plan(uuid), public.research_set_status(uuid, text, text),
  public.research_submit_job(uuid, text, text, text, text[], text),
  public.research_submit_capture(uuid, text, text, text, text[], text, text, uuid, uuid, jsonb),
  public.research_second_check(uuid), public.research_set_tier(uuid, text),
  public.research_record_load(uuid, int, text), public.research_cycle_open_for_reading(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_home_vault_online(), public.research_pending_amendment(uuid),
  public.research_block_reason(uuid, int, uuid), public.research_start_plan(uuid), public.research_set_status(uuid, text, text),
  public.research_second_check(uuid), public.research_set_tier(uuid, text), public.research_record_load(uuid, int, text),
  public.research_cycle_open_for_reading(uuid, int) TO authenticated, service_role;
-- the worker-only entry points: never callable from the browser
GRANT EXECUTE ON FUNCTION public.research_scope_refusal(uuid, text, text, text, text[]),
  public.research_submit_job(uuid, text, text, text, text[], text),
  public.research_submit_capture(uuid, text, text, text, text[], text, text, uuid, uuid, jsonb) TO service_role;
