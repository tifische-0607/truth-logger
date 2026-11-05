-- U4 remainder: one central data collection requirements register per engagement, fed by the signed brief.
-- Additive. Requirements and register marks are append-only (block_mutation); corrections are new versions.
-- Research Start is refused until G2 is signed and the register is marked complete against the brief in force.
-- Every new capture must link to an in-force requirement; off-register items are refused and logged.
-- Evidence paths on DarkNight come from ONE placeholder naming function marked Sample (FA-STD-001 not final).
-- (0032 was applied empty by mistake; this file carries the U4 body.)
SET check_function_bodies = off;

CREATE TABLE public.research_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  req_no int NOT NULL CHECK (req_no > 0),
  code text GENERATED ALWAYS AS ('REQ-' || lpad(req_no::text, 3, '0')) STORED,
  version int NOT NULL CHECK (version > 0),
  brief_id uuid NOT NULL REFERENCES public.project_briefs(id) ON DELETE RESTRICT,
  brief_version int NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  platform text NOT NULL CHECK (platform IN ('facebook','google','threads','x','instagram','tiktok')),
  accounts text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL CHECK (cardinality(languages) > 0 AND languages <@ ARRAY['ms','en','zh','ta','ar','id','und']),
  window_from date NOT NULL,
  window_to date NOT NULL,
  legal_basis text NOT NULL CHECK (length(trim(legal_basis)) > 0),
  change_reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, req_no, version),
  CHECK (window_to >= window_from),
  CHECK (status = 'withdrawn' OR cardinality(accounts) + cardinality(keywords) > 0),
  CHECK (version = 1 OR length(trim(coalesce(change_reason, ''))) > 0)
);
GRANT SELECT ON public.research_requirements TO authenticated;
GRANT ALL ON public.research_requirements TO service_role;
ALTER TABLE public.research_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_requirements_read ON public.research_requirements FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER research_requirements_append_only BEFORE UPDATE OR DELETE ON public.research_requirements
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.research_register_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  brief_id uuid NOT NULL REFERENCES public.project_briefs(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('complete','reopened')),
  register_sha256 text CHECK (register_sha256 IS NULL OR register_sha256 ~ '^[0-9a-f]{64}$'),
  note text,
  marked_by uuid DEFAULT auth.uid(),
  marked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.research_register_marks TO authenticated;
GRANT ALL ON public.research_register_marks TO service_role;
ALTER TABLE public.research_register_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_register_marks_read ON public.research_register_marks FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER research_register_marks_append_only BEFORE UPDATE OR DELETE ON public.research_register_marks
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.research_requirements_in_force(_project uuid)
RETURNS SETOF public.research_requirements LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (r.req_no) r.* FROM public.research_requirements r
  WHERE r.project_id = _project ORDER BY r.req_no, r.version DESC;
$$;

CREATE OR REPLACE FUNCTION public.research_norm_platform(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(trim(t)) WHEN 'twitter' THEN 'x' WHEN 'x (twitter)' THEN 'x' WHEN 'fb' THEN 'facebook'
    WHEN 'ig' THEN 'instagram' WHEN 'youtube' THEN 'google' ELSE lower(trim(t)) END;
$$;
CREATE OR REPLACE FUNCTION public.research_norm_language(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(trim(t))
    WHEN 'malay' THEN 'ms' WHEN 'bahasa melayu' THEN 'ms' WHEN 'bm' THEN 'ms' WHEN 'english' THEN 'en'
    WHEN 'chinese' THEN 'zh' WHEN 'mandarin' THEN 'zh' WHEN 'tamil' THEN 'ta' WHEN 'arabic' THEN 'ar'
    WHEN 'indonesian' THEN 'id' WHEN 'bahasa indonesia' THEN 'id' ELSE lower(trim(t)) END;
$$;

CREATE OR REPLACE FUNCTION public.research_requirement_misfit(_brief uuid, _platform text, _languages text[], _from date, _to date)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.project_briefs; plats text[]; langs text[]; l text;
BEGIN
  SELECT * INTO b FROM public.project_briefs WHERE id = _brief;
  plats := ARRAY(SELECT public.research_norm_platform(x) FROM unnest(b.platforms) x);
  langs := ARRAY(SELECT public.research_norm_language(x) FROM unnest(b.languages) x);
  IF cardinality(plats) > 0 AND NOT (_platform = ANY(plats)) THEN
    RETURN format('Platform %s is not in the signed brief (brief v%s lists: %s)', _platform, b.version, array_to_string(b.platforms, ', ')); END IF;
  IF cardinality(langs) > 0 THEN
    FOREACH l IN ARRAY _languages LOOP
      IF l <> 'und' AND NOT (l = ANY(langs)) THEN
        RETURN format('Language %s is not in the signed brief (brief v%s lists: %s)', l, b.version, array_to_string(b.languages, ', ')); END IF;
    END LOOP;
  END IF;
  IF b.window_from IS NOT NULL AND _from < b.window_from THEN
    RETURN format('The time window starts before the signed brief''s window (%s)', b.window_from); END IF;
  IF b.window_to IS NOT NULL AND _to > b.window_to THEN
    RETURN format('The time window ends after the signed brief''s window (%s)', b.window_to); END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.research_register_editor(_project uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'management') THEN RAISE EXCEPTION 'FA Management cannot change the requirements register'; END IF;
  IF NOT public.has_project_role(auth.uid(), _project, ARRAY['owner','curator','engagement_lead','lead_analyst']) THEN
    RAISE EXCEPTION 'Only the engagement lead, lead analyst or Curator can change the requirements register'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.research_add_requirement(_project uuid, _platform text, _accounts text[], _keywords text[],
  _languages text[], _from date, _to date, _legal_basis text, _req_no int DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid; bv int; why text; n int; v int; new_id uuid; acc text[]; kw text[];
BEGIN
  PERFORM public.research_register_editor(_project);
  IF NOT public.gate_signed(_project, 'G0') THEN
    RAISE EXCEPTION 'The requirements register is fed by the signed brief: sign the brief (G0) first'; END IF;
  b := public.project_current_brief_id(_project);
  SELECT version INTO bv FROM public.project_briefs WHERE id = b;
  acc := ARRAY(SELECT trim(x) FROM unnest(coalesce(_accounts, '{}')) x WHERE length(trim(x)) > 0);
  kw := ARRAY(SELECT trim(x) FROM unnest(coalesce(_keywords, '{}')) x WHERE length(trim(x)) > 0);
  IF _platform IS NULL OR _platform NOT IN ('facebook','google','threads','x','instagram','tiktok') THEN
    RAISE EXCEPTION 'Choose a platform from the baseline list: Facebook, Google, Threads, X, Instagram, TikTok'; END IF;
  IF cardinality(acc) + cardinality(kw) = 0 THEN RAISE EXCEPTION 'A requirement needs at least one account or keyword'; END IF;
  IF _languages IS NULL OR cardinality(_languages) = 0 THEN RAISE EXCEPTION 'A requirement needs at least one language'; END IF;
  IF NOT (_languages <@ ARRAY['ms','en','zh','ta','ar','id','und']) THEN RAISE EXCEPTION 'Choose languages from the fixed list'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN RAISE EXCEPTION 'A requirement needs a time window that ends on or after it starts'; END IF;
  IF length(trim(coalesce(_legal_basis, ''))) = 0 THEN RAISE EXCEPTION 'A requirement needs a legal basis'; END IF;
  why := public.research_requirement_misfit(b, _platform, _languages, _from, _to);
  IF why IS NOT NULL THEN RAISE EXCEPTION '%', why; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('research_requirements:' || _project::text));
  IF _req_no IS NULL THEN
    SELECT coalesce(max(req_no), 0) + 1 INTO n FROM public.research_requirements WHERE project_id = _project; v := 1;
  ELSE
    n := _req_no;
    SELECT max(version) + 1 INTO v FROM public.research_requirements WHERE project_id = _project AND req_no = n;
    IF v IS NULL THEN RAISE EXCEPTION 'Unknown requirement REQ-%', lpad(n::text, 3, '0'); END IF;
    IF length(trim(coalesce(_reason, ''))) = 0 THEN RAISE EXCEPTION 'Changing a requirement needs a reason'; END IF;
  END IF;
  INSERT INTO public.research_requirements (project_id, req_no, version, brief_id, brief_version, platform, accounts, keywords,
    languages, window_from, window_to, legal_basis, change_reason)
  VALUES (_project, n, v, b, bv, _platform, acc, kw, _languages, _from, _to, trim(_legal_basis), nullif(trim(coalesce(_reason, '')), ''))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.research_withdraw_requirement(_project uuid, _req_no int, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_requirements; new_id uuid;
BEGIN
  PERFORM public.research_register_editor(_project);
  IF length(trim(coalesce(_reason, ''))) = 0 THEN RAISE EXCEPTION 'Withdrawing a requirement needs a reason'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('research_requirements:' || _project::text));
  SELECT * INTO r FROM public.research_requirements_in_force(_project) q WHERE q.req_no = _req_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown requirement REQ-%', lpad(_req_no::text, 3, '0'); END IF;
  IF r.status = 'withdrawn' THEN RAISE EXCEPTION 'This requirement is already withdrawn'; END IF;
  INSERT INTO public.research_requirements (project_id, req_no, version, brief_id, brief_version, status, platform, accounts, keywords,
    languages, window_from, window_to, legal_basis, change_reason)
  VALUES (_project, r.req_no, r.version + 1, r.brief_id, r.brief_version, 'withdrawn', r.platform, r.accounts, r.keywords,
    r.languages, r.window_from, r.window_to, r.legal_basis, trim(_reason))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.research_register_problems(_project uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid; p text[] := '{}'; r record; why text;
BEGIN
  IF NOT public.gate_signed(_project, 'G0') THEN RETURN ARRAY['The brief is not signed (G0)']; END IF;
  b := public.project_current_brief_id(_project);
  IF NOT EXISTS (SELECT 1 FROM public.research_requirements_in_force(_project) q WHERE q.status = 'active') THEN
    p := p || 'The register has no active requirement'::text; END IF;
  FOR r IN SELECT * FROM public.research_requirements_in_force(_project) q WHERE q.status = 'active' LOOP
    why := public.research_requirement_misfit(b, r.platform, r.languages, r.window_from, r.window_to);
    IF why IS NOT NULL THEN p := p || format('%s: %s', r.code, why); END IF;
  END LOOP;
  RETURN p;
END; $$;

CREATE OR REPLACE FUNCTION public.research_register_complete(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT m.action = 'complete' AND m.brief_id = public.project_current_brief_id(_project)
      AND m.marked_at >= coalesce((SELECT max(created_at) FROM public.research_requirements WHERE project_id = _project), '-infinity'::timestamptz)
    FROM public.research_register_marks m WHERE m.project_id = _project ORDER BY m.marked_at DESC, m.id DESC LIMIT 1), false)
    AND cardinality(public.research_register_problems(_project)) = 0;
$$;

CREATE OR REPLACE FUNCTION public.research_register_sha256(_project uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('code', code, 'version', version, 'status', status,
    'platform', platform, 'accounts', accounts, 'keywords', keywords, 'languages', languages, 'from', window_from,
    'to', window_to, 'legal_basis', legal_basis, 'brief_version', brief_version) ORDER BY req_no), '[]'::jsonb)::text, 'UTF8')), 'hex')
  FROM public.research_requirements_in_force(_project);
$$;

CREATE OR REPLACE FUNCTION public.research_mark_register(_project uuid, _complete boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE probs text[];
BEGIN
  IF public.has_role(auth.uid(), 'management') THEN RAISE EXCEPTION 'FA Management cannot change the requirements register'; END IF;
  IF NOT public.has_project_role(auth.uid(), _project, ARRAY['owner','curator','engagement_lead']) THEN
    RAISE EXCEPTION 'Only the engagement lead or Curator can mark the requirements register complete or reopen it'; END IF;
  IF NOT public.gate_signed(_project, 'G0') THEN RAISE EXCEPTION 'The brief is not signed (G0)'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('research_requirements:' || _project::text));
  IF _complete THEN
    probs := public.research_register_problems(_project);
    IF cardinality(probs) > 0 THEN RAISE EXCEPTION 'The register cannot be marked complete: %', array_to_string(probs, '; '); END IF;
    IF public.research_register_complete(_project) THEN RAISE EXCEPTION 'The register is already marked complete'; END IF;
  ELSE
    IF length(trim(coalesce(_note, ''))) = 0 THEN RAISE EXCEPTION 'Reopening the register needs a reason'; END IF;
  END IF;
  INSERT INTO public.research_register_marks (project_id, brief_id, action, register_sha256, note)
  VALUES (_project, public.project_current_brief_id(_project), CASE WHEN _complete THEN 'complete' ELSE 'reopened' END,
    CASE WHEN _complete THEN public.research_register_sha256(_project) END, nullif(trim(coalesce(_note, '')), ''));
END; $$;

CREATE OR REPLACE FUNCTION public.research_register_status(_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid;
BEGIN
  IF NOT (public.can_access_project(auth.uid(), _project) AND NOT public.portal_has_client_identity(auth.uid())) THEN
    RAISE EXCEPTION 'You cannot see this engagement'; END IF;
  b := CASE WHEN public.gate_signed(_project, 'G0') THEN public.project_current_brief_id(_project) END;
  RETURN jsonb_build_object('brief_signed', b IS NOT NULL, 'brief_id', b,
    'brief_version', (SELECT version FROM public.project_briefs WHERE id = b),
    'complete', public.research_register_complete(_project),
    'problems', to_jsonb(public.research_register_problems(_project)),
    'register_sha256', public.research_register_sha256(_project));
END; $$;

-- SAMPLE placeholder for FA-STD-001 naming. FA-STD-001 is NOT finalised: swap this ONE function when it is.
CREATE OR REPLACE FUNCTION public.research_fa_std001_name_sample(_project_code text, _req_code text, _platform text,
  _item_type text, _item_ref text, _captured timestamptz, _sha256 text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format('SAMPLE-FA-STD-001/%s/%s/%s/%s/%s_%s_%s_%s_%s_%s_%s.json',
    coalesce(nullif(regexp_replace(_project_code, '[^A-Za-z0-9-]', '', 'g'), ''), 'ENG'), _req_code, upper(_platform),
    to_char(_captured AT TIME ZONE 'UTC', 'YYYYMMDD'),
    coalesce(nullif(regexp_replace(_project_code, '[^A-Za-z0-9-]', '', 'g'), ''), 'ENG'), _req_code, upper(_platform),
    upper(_item_type), left(regexp_replace(_item_ref, '[^A-Za-z0-9-]', '-', 'g'), 64),
    to_char(_captured AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'), left(_sha256, 8));
$$;
COMMENT ON FUNCTION public.research_fa_std001_name_sample(text, text, text, text, text, timestamptz, text) IS
  'SAMPLE: placeholder FA-STD-001 naming. Not final. The only place DarkNight evidence names are built.';

ALTER TABLE public.research_captures
  ADD COLUMN requirement_id uuid REFERENCES public.research_requirements(id) ON DELETE RESTRICT,
  ADD COLUMN darknight_path text,
  ADD COLUMN naming_scheme text;

CREATE OR REPLACE FUNCTION public.research_capture_provenance_fixed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.connector_key, NEW.connector_version, NEW.platform, NEW.item_type, NEW.language, NEW.requirement_ref, NEW.collector,
      NEW.captured_at_utc, NEW.requirement_id, NEW.darknight_path, NEW.naming_scheme)
     IS DISTINCT FROM (OLD.connector_key, OLD.connector_version, OLD.platform, OLD.item_type, OLD.language, OLD.requirement_ref,
      OLD.collector, OLD.captured_at_utc, OLD.requirement_id, OLD.darknight_path, OLD.naming_scheme) THEN
    RAISE EXCEPTION 'A capture''s provenance is fixed once written'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.research_capture_requirement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.requirement_id IS NULL THEN RAISE EXCEPTION 'Every collected item must link to a requirement ID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.research_requirements r WHERE r.id = NEW.requirement_id AND r.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'The requirement belongs to another engagement'; END IF;
  IF NEW.connector_key IS NULL OR NEW.connector_version IS NULL OR NEW.collector IS NULL OR NEW.captured_at_utc IS NULL THEN
    RAISE EXCEPTION 'Every stored item needs connector, connector version, collector and UTC capture time'; END IF;
  IF NEW.darknight_path IS NULL THEN RAISE EXCEPTION 'Every stored item needs its DarkNight location'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_captures_requirement BEFORE INSERT ON public.research_captures
  FOR EACH ROW EXECUTE FUNCTION public.research_capture_requirement_guard();

CREATE OR REPLACE FUNCTION public.research_off_register(_project uuid, _ref text, _platform text, _language text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_requirements;
BEGIN
  SELECT * INTO r FROM public.research_requirements_in_force(_project) q WHERE q.code = upper(trim(_ref));
  IF NOT FOUND THEN RETURN format('Off-register collection refused: %s is not a requirement in this engagement''s register', _ref); END IF;
  IF r.status <> 'active' THEN RETURN format('Off-register collection refused: %s has been withdrawn', r.code); END IF;
  IF NOT public.research_register_complete(_project) THEN RETURN 'Off-register collection refused: the requirements register is not marked complete'; END IF;
  IF _platform <> r.platform THEN RETURN format('Off-register collection refused: %s covers %s, not %s', r.code, r.platform, _platform); END IF;
  IF _language <> 'und' AND NOT (_language = ANY(r.languages)) THEN
    RETURN format('Off-register collection refused: %s does not cover language %s', r.code, _language); END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.research_submit_capture_std(_run uuid, _item jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_runs; con public.research_connectors; why text; c uuid; terms text[];
  k text := _item->>'connector'; at_utc timestamptz; req public.research_requirements; pcode text; path text;
BEGIN
  SELECT * INTO r FROM public.research_runs WHERE id = _run;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown run'; END IF;
  SELECT x.id, x.darknight_path INTO c, path FROM public.research_captures x WHERE x.run_id = _run AND x.item_ref = _item->>'item_ref';
  IF c IS NOT NULL THEN RETURN jsonb_build_object('status', 'recorded', 'capture_id', c, 'repeat', true, 'darknight_path', path); END IF;
  SELECT * INTO con FROM public.research_connectors WHERE key = k;
  terms := ARRAY(SELECT jsonb_array_elements_text(coalesce(_item->'matched_terms', '[]'::jsonb)));
  BEGIN at_utc := (_item->>'captured_at_utc')::timestamptz; EXCEPTION WHEN others THEN at_utc := NULL; END;
  why := CASE
    WHEN con.key IS NULL THEN format('Unknown connector %s', coalesce(k, '(none)'))
    WHEN con.status <> 'active' THEN format('Connector %s is suspended', k)
    WHEN coalesce(_item->>'connector_version', '') <> con.version THEN format('Connector %s version %s is not the registered version %s', k, coalesce(_item->>'connector_version', '(none)'), con.version)
    WHEN length(trim(coalesce(_item->>'item_ref', ''))) = 0 THEN 'Missing item reference'
    WHEN coalesce(_item->>'platform', '') NOT IN ('facebook','google','threads','x','instagram','tiktok') THEN format('Platform %s is not in the fixed list', coalesce(_item->>'platform', '(none)'))
    WHEN NOT ((_item->>'platform') = ANY(con.platforms)) THEN format('Connector %s does not serve %s', k, _item->>'platform')
    WHEN coalesce(_item->>'item_type', '') NOT IN ('post','comment','reply','profile','page','video','search_result') THEN format('Item type %s is not in the fixed list', coalesce(_item->>'item_type', '(none)'))
    WHEN coalesce(_item->>'language', '') NOT IN ('ms','en','zh','ta','ar','id','und') THEN format('Language %s is not in the fixed list', coalesce(_item->>'language', '(none)'))
    WHEN coalesce(_item->>'sha256', '') !~ '^[0-9a-f]{64}$' THEN 'SHA-256 must be 64 lowercase hex characters'
    WHEN length(trim(coalesce(_item->>'fstd001_version', ''))) = 0 THEN 'Missing FA-STD-001 version'
    WHEN length(trim(coalesce(_item->>'requirement_ref', ''))) = 0 THEN 'Missing requirement reference: collection is requirement-bound'
    WHEN length(trim(coalesce(_item->>'collector', ''))) = 0 THEN 'Missing collector'
    WHEN at_utc IS NULL OR (_item->>'captured_at_utc') !~ '(Z|\+00:?00)$' THEN 'Capture time must be given in UTC'
    ELSE coalesce(public.research_off_register(r.project_id, _item->>'requirement_ref', _item->>'platform', _item->>'language'),
      public.research_scope_refusal(r.plan_id, r.type, _item->>'source', _item->>'target', terms)) END;
  IF why IS NOT NULL THEN
    RETURN public.research_quarantine(r.plan_id, r.project_id, _run, k, why, _item - 'original_context');
  END IF;
  SELECT * INTO req FROM public.research_requirements_in_force(r.project_id) q WHERE q.code = upper(trim(_item->>'requirement_ref'));
  SELECT p.code INTO pcode FROM public.projects p WHERE p.id = r.project_id;
  path := public.research_fa_std001_name_sample(pcode, req.code, _item->>'platform', _item->>'item_type', _item->>'item_ref', at_utc, _item->>'sha256');
  INSERT INTO public.research_captures (run_id, project_id, item_ref, source, target_key, matched_terms, sha256_at_capture,
    fstd001_version, captured_by, evidence_ref_id, original_context, connector_key, connector_version, platform, item_type,
    language, requirement_ref, collector, captured_at_utc, requirement_id, darknight_path, naming_scheme)
  VALUES (_run, r.project_id, _item->>'item_ref', _item->>'source', _item->>'target', terms, _item->>'sha256',
    _item->>'fstd001_version', nullif(_item->>'captured_by', '')::uuid, nullif(_item->>'evidence_ref_id', '')::uuid,
    coalesce(_item->'original_context', '{}'::jsonb), k, con.version, _item->>'platform', _item->>'item_type',
    _item->>'language', req.code, _item->>'collector', at_utc, req.id, path, 'SAMPLE-FA-STD-001')
  RETURNING id INTO c;
  RETURN jsonb_build_object('status', 'recorded', 'capture_id', c, 'requirement_id', req.id, 'requirement', req.code,
    'darknight_path', path, 'naming_scheme', 'SAMPLE-FA-STD-001');
END; $$;

CREATE OR REPLACE FUNCTION public.research_claim_job(_plan_sha256 text DEFAULT NULL, _cycle int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.research_jobs; p public.research_plans; run uuid;
BEGIN
  IF NOT public.research_home_vault_online() THEN
    RETURN jsonb_build_object('job', NULL, 'reason', 'The home vault is not reported online'); END IF;
  SELECT jb.* INTO j FROM public.research_jobs jb JOIN public.research_plans pl ON pl.id = jb.plan_id
    WHERE jb.status IN ('queued','claimed') AND pl.status IN ('queued','running')
      AND (_plan_sha256 IS NULL OR pl.plan_sha256 = lower(_plan_sha256)) AND (_cycle IS NULL OR pl.cycle = _cycle)
    ORDER BY (jb.status = 'claimed') DESC, jb.created_at LIMIT 1 FOR UPDATE OF jb SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('job', NULL); END IF;
  SELECT * INTO p FROM public.research_plans WHERE id = j.plan_id;
  IF j.status = 'queued' THEN UPDATE public.research_jobs SET status = 'claimed', claimed_at = now() WHERE id = j.id; END IF;
  SELECT id INTO run FROM public.research_runs WHERE job_id = j.id AND status IN ('running','paused') LIMIT 1;
  IF run IS NULL THEN
    INSERT INTO public.research_runs (plan_id, job_id, project_id, type) VALUES (j.plan_id, j.id, j.project_id, j.job_type) RETURNING id INTO run;
  END IF;
  IF p.status = 'queued' THEN UPDATE public.research_plans SET status = 'running' WHERE id = p.id; END IF;
  RETURN jsonb_build_object('job', jsonb_build_object('job_id', j.id, 'run_id', run, 'plan_id', p.id, 'plan_sha256', p.plan_sha256,
    'cycle', p.cycle, 'job_type', j.job_type, 'source', j.source, 'target', j.target_key, 'terms', to_jsonb(j.terms),
    'window_from', p.window_from, 'window_to', p.window_to, 'cloud_mirror', p.cloud_mirror,
    'requirements', coalesce((SELECT jsonb_agg(jsonb_build_object('code', q.code, 'platform', q.platform, 'accounts', q.accounts,
      'keywords', q.keywords, 'languages', q.languages, 'window_from', q.window_from, 'window_to', q.window_to) ORDER BY q.req_no)
      FROM public.research_requirements_in_force(p.engagement_id) q WHERE q.status = 'active'), '[]'::jsonb)));
END; $$;

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
  IF _plan IS NOT NULL AND NOT public.research_register_complete(_project) THEN
    RETURN 'Research cannot start until the requirements register is marked complete'; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.research_readiness(_project uuid, _cycle int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.can_access_project(auth.uid(), _project) AND NOT public.portal_has_client_identity(auth.uid())) THEN
    RAISE EXCEPTION 'You cannot see this engagement'; END IF;
  RETURN jsonb_build_object(
    'g1', public.gate_signed(_project, 'G1'), 'g2', public.gate_signed(_project, 'G2'),
    'design_current', NOT coalesce((SELECT design_stale FROM public.projects WHERE id = _project), true),
    'no_pending_amendment', NOT public.research_pending_amendment(_project),
    'vault_online', public.research_home_vault_online(),
    'vault_window_minutes', public.research_vault_window_minutes(),
    'cycle_free', NOT EXISTS (SELECT 1 FROM public.research_plans p WHERE p.project_id = _project AND p.cycle = _cycle
      AND p.status NOT IN ('draft','loaded','stopped','failed')),
    'register_complete', public.research_register_complete(_project),
    'block_reason', coalesce(public.research_block_reason(_project, _cycle),
      CASE WHEN NOT public.research_register_complete(_project) THEN 'Research cannot start until the requirements register is marked complete' END));
END; $$;

REVOKE ALL ON FUNCTION public.research_requirements_in_force(uuid), public.research_requirement_misfit(uuid, text, text[], date, date),
  public.research_register_editor(uuid), public.research_add_requirement(uuid, text, text[], text[], text[], date, date, text, int, text),
  public.research_withdraw_requirement(uuid, int, text), public.research_register_problems(uuid), public.research_register_complete(uuid),
  public.research_register_sha256(uuid), public.research_mark_register(uuid, boolean, text), public.research_register_status(uuid),
  public.research_fa_std001_name_sample(text, text, text, text, text, timestamptz, text), public.research_capture_requirement_guard(),
  public.research_off_register(uuid, text, text, text), public.research_submit_capture_std(uuid, jsonb),
  public.research_claim_job(text, int), public.research_block_reason(uuid, int, uuid), public.research_readiness(uuid, int)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_add_requirement(uuid, text, text[], text[], text[], date, date, text, int, text),
  public.research_withdraw_requirement(uuid, int, text), public.research_mark_register(uuid, boolean, text),
  public.research_register_status(uuid), public.research_readiness(uuid, int), public.research_block_reason(uuid, int, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_requirements_in_force(uuid), public.research_requirement_misfit(uuid, text, text[], date, date),
  public.research_register_problems(uuid), public.research_register_complete(uuid), public.research_register_sha256(uuid),
  public.research_fa_std001_name_sample(text, text, text, text, text, timestamptz, text), public.research_off_register(uuid, text, text, text),
  public.research_submit_capture_std(uuid, jsonb), public.research_claim_job(text, int), public.research_register_editor(uuid)
  TO service_role;