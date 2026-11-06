-- U10 Analyst browser capture (manual connector). Portal side only: registry row, intake contract and rules.
-- Pages, screenshots and session logs are written to DarkNight; the portal keeps hashes, references, the analyst and the requirement.

INSERT INTO public.research_connectors (key, name, version, platforms, status, status_reason, requires_certification, source_kind) VALUES
  ('analyst_browser', 'Analyst browser capture (manual)', '0',
   ARRAY['facebook','google','threads','x','instagram','tiktok','telegram','whatsapp','youtube','reddit','forum','news','blog','web'],
   'suspended', 'Not certified · Not configured', true, 'manual');

CREATE TABLE public.manual_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES public.research_requirements(id) ON DELETE RESTRICT,
  connector_key text NOT NULL DEFAULT 'analyst_browser' REFERENCES public.research_connectors(key) ON DELETE RESTRICT CHECK (connector_key = 'analyst_browser'),
  connector_version text NOT NULL,
  collector uuid NOT NULL,
  client_ref text NOT NULL CHECK (public.lnk_ident_ok(client_ref)),
  url_sha256 text NOT NULL CHECK (url_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at_utc timestamptz NOT NULL,
  page_sha256 text NOT NULL CHECK (page_sha256 ~ '^[0-9a-f]{64}$'),
  screenshot_sha256 text NOT NULL CHECK (screenshot_sha256 ~ '^[0-9a-f]{64}$'),
  session_log_sha256 text CHECK (session_log_sha256 IS NULL OR session_log_sha256 ~ '^[0-9a-f]{64}$'),
  session_pages int CHECK (session_pages IS NULL OR session_pages >= 0),
  status text NOT NULL DEFAULT 'quarantine' CHECK (status = 'quarantine'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collector, client_ref)
);
GRANT SELECT ON public.manual_captures TO authenticated; GRANT ALL ON public.manual_captures TO service_role;
ALTER TABLE public.manual_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY manual_captures_staff_read ON public.manual_captures FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER manual_captures_append_only BEFORE UPDATE OR DELETE ON public.manual_captures FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- Rules on every row, however it is written.
CREATE OR REPLACE FUNCTION public.manual_capture_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.research_connectors;
BEGIN
  IF NEW.collector IS NULL OR NOT public.ew_is_analyst(NEW.collector) THEN RAISE EXCEPTION 'Every manual capture must name the analyst who collected it.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.research_requirements_in_force(NEW.project_id) q WHERE q.id = NEW.requirement_id AND q.status='active') THEN
    RAISE EXCEPTION 'No capture without an approved requirement ID: choose an active requirement from this engagement''s register.'; END IF;
  SELECT * INTO c FROM public.research_connectors WHERE key = NEW.connector_key;
  IF NEW.connector_version <> c.version THEN RAISE EXCEPTION 'Extension version % is not the registered version %.', NEW.connector_version, c.version; END IF;
  IF NOT public.research_connector_certified(c.key) THEN RAISE EXCEPTION 'Connector % is not certified; collection refused.', c.key; END IF;
  IF NOT public.research_connector_configured(c.key) THEN RAISE EXCEPTION 'Connector % is not configured; collection refused.', c.key; END IF;
  IF NOT public.research_source_approved(NEW.project_id, c.key) THEN RAISE EXCEPTION 'Source % is not approved in this engagement''s signed brief; collection refused.', c.key; END IF;
  IF NEW.captured_at_utc > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Capture time is in the future.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manual_captures_guard BEFORE INSERT ON public.manual_captures FOR EACH ROW EXECUTE FUNCTION public.manual_capture_guard();

CREATE TABLE public.manual_capture_vault_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid NOT NULL REFERENCES public.manual_captures(id) ON DELETE RESTRICT,
  artefact text NOT NULL CHECK (artefact IN ('page','screenshot','session_log')),
  sha256_on_write text NOT NULL CHECK (sha256_on_write ~ '^[0-9a-f]{64}$'),
  darknight_path text NOT NULL CHECK (length(trim(darknight_path)) > 0),
  verified boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.manual_capture_vault_writes TO authenticated; GRANT ALL ON public.manual_capture_vault_writes TO service_role;
ALTER TABLE public.manual_capture_vault_writes ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcvw_staff_read ON public.manual_capture_vault_writes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.manual_captures m WHERE m.id=capture_id AND public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), m.project_id)));
CREATE TRIGGER mcvw_append_only BEFORE UPDATE OR DELETE ON public.manual_capture_vault_writes FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- verified is decided by the database by comparing with the hash taken at capture; it cannot be asserted by the writer.
CREATE OR REPLACE FUNCTION public.manual_vault_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.manual_captures; expected text;
BEGIN
  SELECT * INTO m FROM public.manual_captures WHERE id = NEW.capture_id;
  expected := CASE NEW.artefact WHEN 'page' THEN m.page_sha256 WHEN 'screenshot' THEN m.screenshot_sha256 ELSE m.session_log_sha256 END;
  IF expected IS NULL THEN RAISE EXCEPTION 'This capture has no % artefact.', NEW.artefact; END IF;
  NEW.verified := (NEW.sha256_on_write = expected);
  RETURN NEW;
END $$;
CREATE TRIGGER mcvw_verify BEFORE INSERT ON public.manual_capture_vault_writes FOR EACH ROW EXECUTE FUNCTION public.manual_vault_write_guard();

CREATE OR REPLACE FUNCTION public.manual_capture_submit(_project uuid, _requirement_code text, _item jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE req uuid; c public.research_connectors; mid uuid; at_utc timestamptz;
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), _project)) THEN RAISE EXCEPTION 'Only analysts on this engagement can submit manual captures.'; END IF;
  SELECT q.id INTO req FROM public.research_requirements_in_force(_project) q WHERE q.code = upper(trim(coalesce(_requirement_code,''))) AND q.status='active';
  IF req IS NULL THEN RAISE EXCEPTION 'No capture without an approved requirement ID: choose an active requirement from this engagement''s register.'; END IF;
  IF coalesce(_item->>'captured_at_utc','') !~ '(Z|\+00:?00)$' THEN RAISE EXCEPTION 'Capture time must be given in UTC'; END IF;
  at_utc := (_item->>'captured_at_utc')::timestamptz;
  SELECT * INTO c FROM public.research_connectors WHERE key='analyst_browser';
  SELECT id INTO mid FROM public.manual_captures WHERE collector=auth.uid() AND client_ref=_item->>'client_ref';
  IF mid IS NOT NULL THEN RETURN jsonb_build_object('status','quarantine','capture_id',mid,'repeat',true); END IF;
  INSERT INTO public.manual_captures(project_id,requirement_id,connector_version,collector,client_ref,url_sha256,captured_at_utc,page_sha256,screenshot_sha256,session_log_sha256,session_pages)
    VALUES (_project, req, coalesce(_item->>'extension_version',''), auth.uid(), _item->>'client_ref', lower(_item->>'url_sha256'), at_utc,
      lower(_item->>'page_sha256'), lower(_item->>'screenshot_sha256'), lower(nullif(_item->>'session_log_sha256','')), nullif(_item->>'session_pages','')::int)
    RETURNING id INTO mid;
  RETURN jsonb_build_object('status','quarantine','capture_id',mid,'repeat',false);
END $$;

CREATE OR REPLACE FUNCTION public.manual_capture_vault_write(_capture uuid, _artefact text, _sha256 text, _path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.manual_capture_vault_writes;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Only the vault can record a vault write.'; END IF;
  INSERT INTO public.manual_capture_vault_writes(capture_id,artefact,sha256_on_write,darknight_path,verified) VALUES (_capture,_artefact,lower(_sha256),_path,false) RETURNING * INTO w;
  RETURN jsonb_build_object('verified', w.verified, 'message', CASE WHEN w.verified THEN 'Hash verified on vault write.' ELSE 'Hash mismatch on vault write: the stored file does not match the hash taken at capture.' END);
END $$;

REVOKE ALL ON public.manual_captures, public.manual_capture_vault_writes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.manual_captures, public.manual_capture_vault_writes FROM authenticated;
REVOKE ALL ON FUNCTION public.manual_capture_guard(), public.manual_vault_write_guard(), public.manual_capture_submit(uuid,text,jsonb), public.manual_capture_vault_write(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_capture_submit(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_capture_vault_write(uuid,text,text,text) TO service_role;