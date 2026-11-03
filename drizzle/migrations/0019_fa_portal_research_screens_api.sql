-- Phase 5: research screens and worker API. Additive. Includes the U4 connector contract and U5 data-quality controls
-- that fall inside the worker API: a connector registry, one standard capture schema with fixed value lists,
-- quarantine of invalid captures (logged refusals), full provenance, and automatic suspension on repeated rejections.
SET check_function_bodies = off;

CREATE TABLE public.research_settings (
  key text PRIMARY KEY CHECK (key IN ('home_vault_online_minutes')),
  value int NOT NULL CHECK (value BETWEEN 1 AND 1440),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.research_settings TO authenticated;
GRANT ALL ON public.research_settings TO service_role;
ALTER TABLE public.research_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_settings_read ON public.research_settings FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
INSERT INTO public.research_settings (key, value, updated_by) VALUES ('home_vault_online_minutes', 15, NULL);

CREATE OR REPLACE FUNCTION public.research_vault_window_minutes()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value FROM public.research_settings WHERE key = 'home_vault_online_minutes'), 15);
$$;

CREATE OR REPLACE FUNCTION public.research_home_vault_online()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT r.online FROM public.research_vault_reports r JOIN public.sources s ON s.id = r.source_id
    WHERE s.kind = 'home_vault' AND s.enabled
      AND r.reported_at > now() - make_interval(mins => public.research_vault_window_minutes())
    ORDER BY r.reported_at DESC, r.id LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION public.research_set_vault_window(_minutes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can change the home vault online window'; END IF;
  IF _minutes IS NULL OR _minutes < 1 OR _minutes > 1440 THEN RAISE EXCEPTION 'The window must be between 1 and 1440 minutes'; END IF;
  UPDATE public.research_settings SET value = _minutes, updated_by = auth.uid(), updated_at = now() WHERE key = 'home_vault_online_minutes';
END; $$;

CREATE TABLE public.research_connectors (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  version text NOT NULL,
  platforms text[] NOT NULL CHECK (platforms <@ ARRAY['facebook','google','threads','x','instagram','tiktok']),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  status_reason text,
  reject_limit int NOT NULL DEFAULT 5 CHECK (reject_limit BETWEEN 1 AND 100),
  reject_window_minutes int NOT NULL DEFAULT 60 CHECK (reject_window_minutes BETWEEN 1 AND 1440),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'active' OR length(trim(coalesce(status_reason, ''))) > 0)
);
GRANT SELECT ON public.research_connectors TO authenticated;
GRANT ALL ON public.research_connectors TO service_role;
ALTER TABLE public.research_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_connectors_read ON public.research_connectors FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER research_connectors_no_delete BEFORE DELETE ON public.research_connectors
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
INSERT INTO public.research_connectors (key, name, version, platforms)
VALUES ('socialcrawl', 'SocialCrawl', '1', ARRAY['facebook','google','threads','x','instagram','tiktok']);

CREATE OR REPLACE FUNCTION public.research_set_connector(_key text, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'curator')) THEN
    RAISE EXCEPTION 'Only the owner or Curator can suspend or restore a connector'; END IF;
  IF _status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'A connector is either active or suspended'; END IF;
  IF length(trim(coalesce(_reason, ''))) = 0 THEN RAISE EXCEPTION 'Changing a connector needs a reason'; END IF;
  UPDATE public.research_connectors SET status = _status, status_reason = trim(_reason), updated_by = auth.uid(), updated_at = now()
    WHERE key = _key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown connector %', _key; END IF;
END; $$;

ALTER TABLE public.research_captures
  ADD COLUMN connector_key text REFERENCES public.research_connectors(key),
  ADD COLUMN connector_version text,
  ADD COLUMN platform text CHECK (platform IS NULL OR platform IN ('facebook','google','threads','x','instagram','tiktok')),
  ADD COLUMN item_type text CHECK (item_type IS NULL OR item_type IN ('post','comment','reply','profile','page','video','search_result')),
  ADD COLUMN language text CHECK (language IS NULL OR language IN ('ms','en','zh','ta','ar','id','und')),
  ADD COLUMN requirement_ref text,
  ADD COLUMN collector text,
  ADD COLUMN captured_at_utc timestamptz;

CREATE OR REPLACE FUNCTION public.research_capture_provenance_fixed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.connector_key, NEW.connector_version, NEW.platform, NEW.item_type, NEW.language, NEW.requirement_ref, NEW.collector, NEW.captured_at_utc)
     IS DISTINCT FROM (OLD.connector_key, OLD.connector_version, OLD.platform, OLD.item_type, OLD.language, OLD.requirement_ref, OLD.collector, OLD.captured_at_utc) THEN
    RAISE EXCEPTION 'A capture''s provenance is fixed once written'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_captures_provenance BEFORE UPDATE ON public.research_captures
  FOR EACH ROW EXECUTE FUNCTION public.research_capture_provenance_fixed();

ALTER TABLE public.research_refusals ADD COLUMN connector_key text;

CREATE OR REPLACE FUNCTION public.research_quarantine(_plan uuid, _project uuid, _run uuid, _connector text, _why text, _request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.research_connectors; n int; suspended boolean := false;
BEGIN
  INSERT INTO public.research_refusals (plan_id, project_id, run_id, kind, reason, request, connector_key)
    VALUES (_plan, _project, _run, 'capture', _why, _request, _connector);
  INSERT INTO public.research_events (project_id, plan_id, run_id, event, reason, details, actor_kind)
    VALUES (_project, _plan, _run, 'capture:refused', _why, jsonb_build_object('connector', _connector), 'worker');
  SELECT * INTO c FROM public.research_connectors WHERE key = _connector FOR UPDATE;
  IF FOUND AND c.status = 'active' THEN
    SELECT count(*) INTO n FROM public.research_refusals
      WHERE connector_key = _connector AND refused_at > now() - make_interval(mins => c.reject_window_minutes);
    IF n >= c.reject_limit THEN
      UPDATE public.research_connectors SET status = 'suspended', updated_at = now(), updated_by = NULL,
        status_reason = format('Suspended automatically: %s rejected items within %s minutes', n, c.reject_window_minutes)
        WHERE key = _connector;
      INSERT INTO public.research_events (project_id, plan_id, run_id, event, reason, details, actor_kind)
        VALUES (_project, _plan, _run, 'connector:suspended', 'Repeated rejected items', jsonb_build_object('connector', _connector, 'rejected', n), 'worker');
      suspended := true;
    END IF;
  END IF;
  RETURN jsonb_build_object('status', 'refused', 'reason', _why, 'connector_suspended', suspended);
END; $$;

CREATE OR REPLACE FUNCTION public.research_submit_capture_std(_run uuid, _item jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_runs; con public.research_connectors; why text; c uuid; terms text[];
  k text := _item->>'connector'; at_utc timestamptz;
BEGIN
  SELECT * INTO r FROM public.research_runs WHERE id = _run;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown run'; END IF;
  SELECT id INTO c FROM public.research_captures WHERE run_id = _run AND item_ref = _item->>'item_ref';
  IF c IS NOT NULL THEN RETURN jsonb_build_object('status', 'recorded', 'capture_id', c, 'repeat', true); END IF;
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
    ELSE public.research_scope_refusal(r.plan_id, r.type, _item->>'source', _item->>'target', terms) END;
  IF why IS NOT NULL THEN
    RETURN public.research_quarantine(r.plan_id, r.project_id, _run, k, why, _item - 'original_context');
  END IF;
  INSERT INTO public.research_captures (run_id, project_id, item_ref, source, target_key, matched_terms, sha256_at_capture,
    fstd001_version, captured_by, evidence_ref_id, original_context, connector_key, connector_version, platform, item_type,
    language, requirement_ref, collector, captured_at_utc)
  VALUES (_run, r.project_id, _item->>'item_ref', _item->>'source', _item->>'target', terms, _item->>'sha256',
    _item->>'fstd001_version', nullif(_item->>'captured_by', '')::uuid, nullif(_item->>'evidence_ref_id', '')::uuid,
    coalesce(_item->'original_context', '{}'::jsonb), k, con.version, _item->>'platform', _item->>'item_type',
    _item->>'language', _item->>'requirement_ref', _item->>'collector', at_utc)
  RETURNING id INTO c;
  RETURN jsonb_build_object('status', 'recorded', 'capture_id', c);
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
    'window_from', p.window_from, 'window_to', p.window_to, 'cloud_mirror', p.cloud_mirror));
END; $$;

CREATE OR REPLACE FUNCTION public.research_report_vault_write(_capture uuid, _sha256_on_write text, _custody_event uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.research_captures; r public.research_runs;
BEGIN
  SELECT * INTO c FROM public.research_captures WHERE id = _capture FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown capture'; END IF;
  IF c.vault_write_verified THEN RETURN jsonb_build_object('status', 'verified', 'repeat', true); END IF;
  IF lower(coalesce(_sha256_on_write, '')) <> c.sha256_at_capture THEN
    SELECT * INTO r FROM public.research_runs WHERE id = c.run_id;
    INSERT INTO public.research_refusals (plan_id, project_id, run_id, kind, reason, request, connector_key)
      VALUES (r.plan_id, c.project_id, c.run_id, 'capture', 'Vault write not verified: the hash on write does not match the hash at capture',
        jsonb_build_object('capture_id', _capture, 'sha256_on_write', _sha256_on_write), c.connector_key);
    INSERT INTO public.research_events (project_id, plan_id, run_id, capture_id, event, reason, actor_kind)
      VALUES (c.project_id, r.plan_id, c.run_id, _capture, 'vault:mismatch', 'Hash on write does not match hash at capture', 'worker');
    RETURN jsonb_build_object('status', 'refused', 'reason', 'Vault write not verified: the hash on write does not match the hash at capture');
  END IF;
  UPDATE public.research_captures SET sha256_on_write = lower(_sha256_on_write), vault_write_verified = true,
    custody_event_id = coalesce(_custody_event, custody_event_id) WHERE id = _capture;
  RETURN jsonb_build_object('status', 'verified');
END; $$;

CREATE OR REPLACE FUNCTION public.research_report_run(_run uuid, _status text, _expected int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.research_runs; p public.research_plans;
BEGIN
  SELECT * INTO r FROM public.research_runs WHERE id = _run FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown run'; END IF;
  IF _status NOT IN ('running','delivered','failed') THEN RAISE EXCEPTION 'The worker reports running, delivered or failed'; END IF;
  IF r.status = _status THEN RETURN jsonb_build_object('status', r.status, 'repeat', true); END IF;
  SELECT * INTO p FROM public.research_plans WHERE id = r.plan_id;
  IF p.status IN ('paused','stopped') AND _status = 'running' THEN
    RETURN jsonb_build_object('status', 'refused', 'reason', format('The plan is %s', p.status)); END IF;
  IF _status = 'delivered' AND r.captured <> r.in_vault THEN
    INSERT INTO public.research_events (project_id, plan_id, run_id, event, reason, details, actor_kind)
      VALUES (r.project_id, r.plan_id, _run, 'run:delivery_blocked', 'Captured and in-vault counts differ',
        jsonb_build_object('captured', r.captured, 'in_vault', r.in_vault), 'worker');
    RETURN jsonb_build_object('status', 'refused',
      'reason', format('A run is delivered only when captured (%s) equals in vault (%s)', r.captured, r.in_vault));
  END IF;
  UPDATE public.research_runs SET status = _status, expected = coalesce(_expected, expected),
    finished_at = CASE WHEN _status IN ('delivered','failed') THEN now() ELSE finished_at END WHERE id = _run;
  IF _status IN ('delivered','failed') AND r.job_id IS NOT NULL THEN
    UPDATE public.research_jobs SET status = 'done' WHERE id = r.job_id AND status = 'claimed'; END IF;
  IF _status = 'delivered' AND p.status = 'running'
     AND NOT EXISTS (SELECT 1 FROM public.research_jobs WHERE plan_id = p.id AND status IN ('queued','claimed'))
     AND NOT EXISTS (SELECT 1 FROM public.research_runs WHERE plan_id = p.id AND status NOT IN ('delivered','stopped')) THEN
    UPDATE public.research_plans SET status = 'delivered' WHERE id = p.id;
  END IF;
  IF _status = 'failed' AND p.status IN ('queued','running') THEN
    UPDATE public.research_plans SET status = 'failed', status_reason = 'A run failed on the collection device' WHERE id = p.id;
  END IF;
  RETURN jsonb_build_object('status', _status);
END; $$;

CREATE OR REPLACE FUNCTION public.research_report_vault(_source text, _online boolean, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sources WHERE id = _source AND kind = 'home_vault') THEN
    RAISE EXCEPTION 'Unknown home vault source %', _source; END IF;
  INSERT INTO public.research_vault_reports (source_id, online, note) VALUES (_source, _online, left(_note, 500));
  RETURN jsonb_build_object('online', public.research_home_vault_online());
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
    'block_reason', public.research_block_reason(_project, _cycle));
END; $$;

REVOKE ALL ON FUNCTION public.research_vault_window_minutes(), public.research_set_vault_window(int),
  public.research_set_connector(text, text, text), public.research_quarantine(uuid, uuid, uuid, text, text, jsonb),
  public.research_submit_capture_std(uuid, jsonb), public.research_claim_job(text, int),
  public.research_report_vault_write(uuid, text, uuid), public.research_report_run(uuid, text, int),
  public.research_report_vault(text, boolean, text), public.research_readiness(uuid, int),
  public.research_capture_provenance_fixed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_vault_window_minutes(), public.research_set_vault_window(int),
  public.research_set_connector(text, text, text), public.research_readiness(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_quarantine(uuid, uuid, uuid, text, text, jsonb),
  public.research_submit_capture_std(uuid, jsonb), public.research_claim_job(text, int),
  public.research_report_vault_write(uuid, text, uuid), public.research_report_run(uuid, text, int),
  public.research_report_vault(text, boolean, text), public.research_submit_job(uuid, text, text, text, text[], text) TO service_role;
