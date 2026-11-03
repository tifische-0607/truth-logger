-- Phase 6: Vaults. Additive. Reuses research_vault_reports, research_home_vault_online(), the configurable
-- online window and research_plans.cloud_mirror. Adds vault configuration, append-only vault events, an append-only
-- outbox (plus append-only write results), Cloud Vault status and the offline rules.
SET check_function_bodies = off;

CREATE TABLE public.vault_config (
  vault text PRIMARY KEY CHECK (vault IN ('home','cloud')),
  name text NOT NULL,
  engine text NOT NULL,
  location text NOT NULL,
  route text NOT NULL CHECK (route IN ('gateway','direct','relay')),
  holds text NOT NULL,
  database_name text,
  database_roles text[] NOT NULL DEFAULT '{}',
  schema_name text,
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((vault = 'home' AND route = 'gateway') OR (vault = 'cloud' AND route IN ('direct','relay')))
);
GRANT SELECT ON public.vault_config TO authenticated;
GRANT ALL ON public.vault_config TO service_role;
ALTER TABLE public.vault_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_config_read ON public.vault_config FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER vault_config_no_delete BEFORE DELETE ON public.vault_config FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
INSERT INTO public.vault_config (vault, name, engine, location, route, holds, database_name, database_roles, schema_name, note) VALUES
 ('home', 'Home Vault (DarkNight)', 'DarkNight home server', 'FridayAnalytics premises, Malaysia', 'gateway',
  'Evidence originals, captures, reports and their custody records', NULL, '{}', NULL,
  'Read directly from the browser over HTTPS; files are never copied to the cloud.'),
 ('cloud', 'Cloud Vault', 'PostgreSQL 10.23 (Namecheap cPanel hosting)', 'Namecheap shared hosting', 'direct',
  'Copies of released outputs and shared documents (by SHA-256), custody and event records', 'fridzdmo_DarkVault',
  ARRAY['fridzdmo_FAVault'], 'fa_portal',
  'cPanel accepts remote PostgreSQL connections only from allowlisted IP addresses.');

CREATE TABLE public.vault_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault text NOT NULL CHECK (vault IN ('home','cloud')),
  event text NOT NULL CHECK (event IN ('check','rotate_credentials','route_changed','offline_pause')),
  outcome text NOT NULL CHECK (outcome IN ('ok','failed','not_configured','not_attempted','recorded')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_events_vault_idx ON public.vault_events (vault, at DESC);
GRANT SELECT ON public.vault_events TO authenticated;
GRANT ALL ON public.vault_events TO service_role;
ALTER TABLE public.vault_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_events_read ON public.vault_events FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER vault_events_append_only BEFORE UPDATE OR DELETE ON public.vault_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.vault_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL CHECK (target IN ('home','cloud')),
  kind text NOT NULL CHECK (kind IN ('document','output','capture','custody_event','document_event','research_event')),
  ref_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target, kind, ref_id, sha256)
);
CREATE INDEX vault_outbox_ref_idx ON public.vault_outbox (kind, ref_id);
GRANT SELECT ON public.vault_outbox TO authenticated;
GRANT ALL ON public.vault_outbox TO service_role;
ALTER TABLE public.vault_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_outbox_read ON public.vault_outbox FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER vault_outbox_append_only BEFORE UPDATE OR DELETE ON public.vault_outbox FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.vault_outbox_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.vault_outbox(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('written','failed')),
  sha256_on_write text,
  reason text,
  at timestamptz NOT NULL DEFAULT now(),
  CHECK (outcome = 'failed' OR sha256_on_write ~ '^[0-9a-f]{64}$')
);
CREATE INDEX vault_outbox_results_idx ON public.vault_outbox_results (outbox_id, at DESC);
GRANT SELECT ON public.vault_outbox_results TO authenticated;
GRANT ALL ON public.vault_outbox_results TO service_role;
ALTER TABLE public.vault_outbox_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_outbox_results_read ON public.vault_outbox_results FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER vault_outbox_results_append_only BEFORE UPDATE OR DELETE ON public.vault_outbox_results FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---------------------------------------------------------------- status
CREATE OR REPLACE FUNCTION public.vault_outbox_pending(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.vault_outbox_results r WHERE r.outbox_id = _id AND r.outcome = 'written');
$$;

CREATE OR REPLACE FUNCTION public.vault_cloud_online()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT e.outcome = 'ok' FROM public.vault_events e
    WHERE e.vault = 'cloud' AND e.event = 'check'
      AND e.at > now() - make_interval(mins => public.research_vault_window_minutes())
    ORDER BY e.at DESC, e.id LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION public.vault_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid())) THEN
    RAISE EXCEPTION 'Only FridayAnalytics staff can see vault status'; END IF;
  RETURN jsonb_build_object(
    'window_minutes', public.research_vault_window_minutes(),
    'home_online', public.research_home_vault_online(),
    'cloud_online', public.vault_cloud_online(),
    'home_last_report', (SELECT to_jsonb(r) FROM (SELECT rr.online, rr.reported_at, rr.note FROM public.research_vault_reports rr
        JOIN public.sources s ON s.id = rr.source_id WHERE s.kind = 'home_vault' ORDER BY rr.reported_at DESC LIMIT 1) r),
    'cloud_last_check', (SELECT to_jsonb(e) FROM (SELECT ve.outcome, ve.detail, ve.at FROM public.vault_events ve
        WHERE ve.vault = 'cloud' AND ve.event = 'check' ORDER BY ve.at DESC LIMIT 1) e),
    'outbox_pending', jsonb_build_object(
      'cloud', (SELECT count(*) FROM public.vault_outbox o WHERE o.target = 'cloud' AND public.vault_outbox_pending(o.id)),
      'home', (SELECT count(*) FROM public.vault_outbox o WHERE o.target = 'home' AND public.vault_outbox_pending(o.id))));
END; $$;

-- ---------------------------------------------------------------- offline rules
-- Home Vault offline pauses every running/queued plan; Cloud Vault offline pauses only plans that mirror to it.
CREATE OR REPLACE FUNCTION public.vault_apply_offline()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; n int := 0; home_ok boolean := public.research_home_vault_online(); cloud_ok boolean := public.vault_cloud_online(); why text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid())) THEN
    RAISE EXCEPTION 'Only FridayAnalytics staff can apply the vault rules'; END IF;
  FOR p IN SELECT id, engagement_id, cloud_mirror FROM public.research_plans
           WHERE status IN ('queued','running') AND (NOT home_ok OR (cloud_mirror AND NOT cloud_ok)) FOR UPDATE LOOP
    why := CASE WHEN NOT home_ok THEN 'Paused: the Home Vault is offline'
                ELSE 'Paused: the Cloud Vault is offline and this plan mirrors to it' END;
    PERFORM set_config('research.via', 'status', true);
    UPDATE public.research_plans SET status = 'paused', status_reason = why WHERE id = p.id;
    PERFORM set_config('research.via', '', true);
    INSERT INTO public.research_events (project_id, plan_id, event, reason, actor_kind)
      VALUES (p.engagement_id, p.id, 'vault:paused', why, 'worker');
    n := n + 1;
  END LOOP;
  IF n > 0 THEN
    INSERT INTO public.vault_events (vault, event, outcome, detail, actor)
      VALUES (CASE WHEN NOT home_ok THEN 'home' ELSE 'cloud' END, 'offline_pause', 'recorded', jsonb_build_object('plans_paused', n), auth.uid());
  END IF;
  RETURN n;
END; $$;

-- Start / resume is refused while a vault the plan needs is offline; success is refused while a required write is pending.
CREATE OR REPLACE FUNCTION public.vault_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pending int;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('queued','running') THEN
      IF NOT public.research_home_vault_online() THEN
        RAISE EXCEPTION 'The Home Vault is offline: research cannot start or resume'; END IF;
      IF NEW.cloud_mirror AND NOT public.vault_cloud_online() THEN
        RAISE EXCEPTION 'The Cloud Vault is offline: plans that mirror to it cannot start or resume'; END IF;
    END IF;
    IF NEW.status IN ('delivered','loaded') AND NEW.cloud_mirror THEN
      SELECT count(*) INTO pending FROM public.vault_outbox o JOIN public.research_captures c ON o.kind = 'capture' AND o.ref_id = c.id
        JOIN public.research_runs r ON r.id = c.run_id WHERE r.plan_id = NEW.id AND public.vault_outbox_pending(o.id);
      IF pending > 0 THEN RAISE EXCEPTION 'Not delivered: % Cloud Vault write(s) are still pending', pending; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_plans_vault_guard BEFORE UPDATE ON public.research_plans
  FOR EACH ROW EXECUTE FUNCTION public.vault_plan_guard();

CREATE OR REPLACE FUNCTION public.vault_run_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pending int;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT count(*) INTO pending FROM public.vault_outbox o JOIN public.research_captures c ON o.kind = 'capture' AND o.ref_id = c.id
      WHERE c.run_id = NEW.id AND public.vault_outbox_pending(o.id);
    IF pending > 0 THEN RAISE EXCEPTION 'Not delivered: % Cloud Vault write(s) are still pending', pending; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_runs_vault_guard BEFORE UPDATE ON public.research_runs
  FOR EACH ROW EXECUTE FUNCTION public.vault_run_guard();

CREATE OR REPLACE FUNCTION public.vault_on_home_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.online THEN PERFORM public.vault_apply_offline(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_vault_reports_offline AFTER INSERT ON public.research_vault_reports
  FOR EACH ROW EXECUTE FUNCTION public.vault_on_home_report();

CREATE OR REPLACE FUNCTION public.vault_on_cloud_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.vault = 'cloud' AND NEW.event = 'check' AND NEW.outcome <> 'ok' THEN PERFORM public.vault_apply_offline(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER vault_events_cloud_offline AFTER INSERT ON public.vault_events
  FOR EACH ROW EXECUTE FUNCTION public.vault_on_cloud_check();

-- ---------------------------------------------------------------- outbox feeds
CREATE OR REPLACE FUNCTION public.vault_row_sha(j jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(j::text, 'UTF8')), 'hex') $$;

CREATE OR REPLACE FUNCTION public.vault_enqueue(_target text, _kind text, _ref uuid, _sha text, _project uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.vault_outbox (target, kind, ref_id, sha256, project_id) VALUES (_target, _kind, _ref, lower(_sha), _project)
  ON CONFLICT (target, kind, ref_id, sha256) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.vault_feed_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visibility = 'client' AND NOT NEW.voided AND NOT NEW.manifest_only AND NEW.sha256 IS NOT NULL THEN
    PERFORM public.vault_enqueue('cloud', 'document', NEW.id, NEW.sha256, NEW.engagement_id); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER documents_vault_outbox AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.vault_feed_document();

CREATE OR REPLACE FUNCTION public.vault_feed_output()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'released' AND NEW.sha256 IS NOT NULL THEN
    PERFORM public.vault_enqueue('cloud', 'output', NEW.id, NEW.sha256, NEW.project_id); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_outputs_vault_outbox AFTER INSERT OR UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.vault_feed_output();

CREATE OR REPLACE FUNCTION public.vault_feed_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sha256_at_capture IS NOT NULL AND EXISTS (SELECT 1 FROM public.research_runs r JOIN public.research_plans p ON p.id = r.plan_id
      WHERE r.id = NEW.run_id AND p.cloud_mirror) THEN
    PERFORM public.vault_enqueue('cloud', 'capture', NEW.id, NEW.sha256_at_capture, NEW.project_id); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER research_captures_vault_outbox AFTER INSERT ON public.research_captures
  FOR EACH ROW EXECUTE FUNCTION public.vault_feed_capture();

-- custody and event records go to both vaults
CREATE OR REPLACE FUNCTION public.vault_feed_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := CASE TG_TABLE_NAME WHEN 'custody_events' THEN 'custody_event' WHEN 'document_events' THEN 'document_event' ELSE 'research_event' END;
  h text := public.vault_row_sha(to_jsonb(NEW)); pid uuid;
BEGIN
  IF TG_TABLE_NAME = 'research_events' THEN pid := (to_jsonb(NEW)->>'project_id')::uuid; END IF;
  PERFORM public.vault_enqueue('cloud', k, NEW.id, h, pid);
  PERFORM public.vault_enqueue('home', k, NEW.id, h, pid);
  RETURN NEW;
END; $$;
CREATE TRIGGER custody_events_vault_outbox AFTER INSERT ON public.custody_events FOR EACH ROW EXECUTE FUNCTION public.vault_feed_record();
CREATE TRIGGER document_events_vault_outbox AFTER INSERT ON public.document_events FOR EACH ROW EXECUTE FUNCTION public.vault_feed_record();
CREATE TRIGGER research_events_vault_outbox AFTER INSERT ON public.research_events FOR EACH ROW EXECUTE FUNCTION public.vault_feed_record();

-- ---------------------------------------------------------------- writers (service role only)
CREATE OR REPLACE FUNCTION public.vault_outbox_record(_id uuid, _sha256_on_write text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.vault_outbox;
BEGIN
  SELECT * INTO o FROM public.vault_outbox WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown outbox entry'; END IF;
  IF NOT public.vault_outbox_pending(_id) THEN RETURN jsonb_build_object('status', 'written', 'repeat', true); END IF;
  IF _sha256_on_write IS NULL OR lower(_sha256_on_write) <> o.sha256 THEN
    INSERT INTO public.vault_outbox_results (outbox_id, outcome, sha256_on_write, reason)
      VALUES (_id, 'failed', lower(_sha256_on_write), coalesce(_reason, 'The hash on write does not match the recorded SHA-256'));
    RETURN jsonb_build_object('status', 'failed', 'reason', 'The hash on write does not match the recorded SHA-256');
  END IF;
  INSERT INTO public.vault_outbox_results (outbox_id, outcome, sha256_on_write) VALUES (_id, 'written', lower(_sha256_on_write));
  RETURN jsonb_build_object('status', 'written');
END; $$;

CREATE OR REPLACE FUNCTION public.vault_record_check(_vault text, _outcome text, _detail jsonb, _actor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.vault_events (vault, event, outcome, detail, actor) VALUES (_vault, 'check', _outcome, coalesce(_detail, '{}'::jsonb), _actor);
$$;

-- the Cloud Vault copy a reader may use for a document (NULL = no verified copy)
CREATE OR REPLACE FUNCTION public.vault_cloud_copy_for(doc uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documents; w record;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NULL OR NOT public.library_can_read(auth.uid(), d) THEN RAISE EXCEPTION 'Document not found'; END IF;
  SELECT o.id, r.sha256_on_write INTO w FROM public.vault_outbox o JOIN public.vault_outbox_results r ON r.outbox_id = o.id AND r.outcome = 'written'
    WHERE o.target = 'cloud' AND o.kind = 'document' AND o.ref_id = doc AND o.sha256 = d.sha256 ORDER BY r.at DESC LIMIT 1;
  IF w.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('outbox_id', w.id, 'sha256', d.sha256);
END; $$;

-- ---------------------------------------------------------------- people
CREATE OR REPLACE FUNCTION public.vault_record_rotation(_vault text, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can record a credential rotation'; END IF;
  IF _vault NOT IN ('home','cloud') THEN RAISE EXCEPTION 'Unknown vault'; END IF;
  IF length(trim(coalesce(_note, ''))) = 0 THEN RAISE EXCEPTION 'Give a note describing the rotation'; END IF;
  INSERT INTO public.vault_events (vault, event, outcome, detail, actor)
    VALUES (_vault, 'rotate_credentials', 'recorded', jsonb_build_object('note', left(trim(_note), 500)), auth.uid()) RETURNING id INTO e;
  RETURN e;
END; $$;

CREATE OR REPLACE FUNCTION public.vault_set_cloud_route(_route text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can change the Cloud Vault access route'; END IF;
  IF _route NOT IN ('direct','relay') THEN RAISE EXCEPTION 'The access route is direct or relay'; END IF;
  SELECT route INTO old FROM public.vault_config WHERE vault = 'cloud' FOR UPDATE;
  IF old = _route THEN RETURN; END IF;
  UPDATE public.vault_config SET route = _route, updated_by = auth.uid(), updated_at = now() WHERE vault = 'cloud';
  INSERT INTO public.vault_events (vault, event, outcome, detail, actor)
    VALUES ('cloud', 'route_changed', 'recorded', jsonb_build_object('from', old, 'to', _route), auth.uid());
END; $$;

REVOKE ALL ON FUNCTION public.vault_outbox_pending(uuid), public.vault_cloud_online(), public.vault_status(), public.vault_apply_offline(),
  public.vault_enqueue(text,text,uuid,text,uuid), public.vault_outbox_record(uuid,text,text), public.vault_record_check(text,text,jsonb,uuid),
  public.vault_cloud_copy_for(uuid), public.vault_record_rotation(text,text), public.vault_set_cloud_route(text),
  public.vault_row_sha(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_outbox_pending(uuid), public.vault_cloud_online(), public.vault_status(), public.vault_apply_offline(),
  public.vault_cloud_copy_for(uuid), public.vault_record_rotation(text,text), public.vault_set_cloud_route(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_outbox_pending(uuid), public.vault_cloud_online(), public.vault_status(), public.vault_apply_offline(),
  public.vault_enqueue(text,text,uuid,text,uuid), public.vault_outbox_record(uuid,text,text), public.vault_record_check(text,text,jsonb,uuid),
  public.vault_cloud_copy_for(uuid), public.vault_record_rotation(text,text), public.vault_set_cloud_route(text), public.vault_row_sha(jsonb) TO service_role;
