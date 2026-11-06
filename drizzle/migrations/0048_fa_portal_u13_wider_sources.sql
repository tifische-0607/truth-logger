-- U13 Wider source coverage. New sources are connector registry rows that cannot collect until certified and configured,
-- and only for sources the engagement's signed brief approves.

ALTER TABLE public.research_connectors DROP CONSTRAINT research_connectors_platforms_check;
ALTER TABLE public.research_connectors ADD CONSTRAINT research_connectors_platforms_check_v2 CHECK (platforms <@ ARRAY[
  'facebook','google','threads','x','instagram','tiktok','telegram','whatsapp','youtube','reddit','forum','news','blog','web']);
ALTER TABLE public.research_connectors ADD COLUMN requires_certification boolean NOT NULL DEFAULT true;
ALTER TABLE public.research_connectors ADD COLUMN source_kind text NOT NULL DEFAULT 'automated' CHECK (source_kind IN ('automated','manual'));
ALTER TABLE public.research_connectors ADD COLUMN access_scope text NOT NULL DEFAULT 'public_only' CHECK (access_scope = 'public_only');
-- The baseline connector was approved before certification existed.
UPDATE public.research_connectors SET requires_certification = false WHERE key = 'socialcrawl';

CREATE TABLE public.research_connector_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_key text NOT NULL REFERENCES public.research_connectors(key) ON DELETE RESTRICT,
  connector_version text NOT NULL,
  result text NOT NULL CHECK (result IN ('passed','failed','revoked')),
  checklist jsonb NOT NULL,
  notes text NOT NULL CHECK (length(trim(notes)) BETWEEN 1 AND 2000),
  decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.research_connector_certifications TO authenticated; GRANT ALL ON public.research_connector_certifications TO service_role;
ALTER TABLE public.research_connector_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY rcc_staff_read ON public.research_connector_certifications FOR SELECT TO authenticated USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER rcc_append_only BEFORE UPDATE OR DELETE ON public.research_connector_certifications FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.research_connector_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_key text NOT NULL REFERENCES public.research_connectors(key) ON DELETE RESTRICT,
  configured boolean NOT NULL,
  note text,
  reported_by text NOT NULL CHECK (reported_by IN ('worker','staff')),
  actor uuid, at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.research_connector_config TO authenticated; GRANT ALL ON public.research_connector_config TO service_role;
ALTER TABLE public.research_connector_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY rcfg_staff_read ON public.research_connector_config FOR SELECT TO authenticated USING (public.portal_is_staff(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER rcfg_append_only BEFORE UPDATE OR DELETE ON public.research_connector_config FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.research_approved_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  connector_key text NOT NULL REFERENCES public.research_connectors(key) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('approved','withdrawn')),
  brief_id uuid NOT NULL REFERENCES public.project_briefs(id) ON DELETE RESTRICT,
  legal_basis text NOT NULL CHECK (length(trim(legal_basis)) > 0),
  actor uuid NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.research_approved_sources TO authenticated; GRANT ALL ON public.research_approved_sources TO service_role;
ALTER TABLE public.research_approved_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY ras_staff_read ON public.research_approved_sources FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER ras_append_only BEFORE UPDATE OR DELETE ON public.research_approved_sources FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.research_connector_certified(_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT cc.result='passed' AND cc.connector_version=c.version FROM public.research_connector_certifications cc JOIN public.research_connectors c ON c.key=cc.connector_key
    WHERE cc.connector_key=_key ORDER BY cc.decided_at DESC, cc.id DESC LIMIT 1), false) $$;
CREATE OR REPLACE FUNCTION public.research_connector_configured(_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT configured FROM public.research_connector_config WHERE connector_key=_key ORDER BY at DESC, id DESC LIMIT 1), false) $$;
CREATE OR REPLACE FUNCTION public.research_source_approved(_project uuid, _key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT status='approved' FROM public.research_approved_sources WHERE project_id=_project AND connector_key=_key ORDER BY at DESC, id DESC LIMIT 1), false) $$;

-- A connector that needs certification can only be made active once certified for its current version and configured.
CREATE OR REPLACE FUNCTION public.research_connector_activation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.requires_certification AND NEW.status='active' THEN
    IF NOT public.research_connector_certified(NEW.key) THEN RAISE EXCEPTION 'Connector % is not certified for version %; it cannot collect.', NEW.key, NEW.version; END IF;
    IF NOT public.research_connector_configured(NEW.key) THEN RAISE EXCEPTION 'Connector % is not configured; it cannot collect.', NEW.key; END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.requires_certification AND NOT NEW.requires_certification THEN RAISE EXCEPTION 'Certification cannot be switched off for a connector.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_connector_activation BEFORE INSERT OR UPDATE ON public.research_connectors FOR EACH ROW EXECUTE FUNCTION public.research_connector_activation_guard();

-- Every capture from a certification-bound connector must come from a certified, configured connector that the engagement's brief approves.
CREATE OR REPLACE FUNCTION public.research_capture_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.research_connectors;
BEGIN
  IF NEW.connector_key IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.research_connectors WHERE key=NEW.connector_key;
  IF c.requires_certification THEN
    IF NOT public.research_connector_certified(c.key) THEN RAISE EXCEPTION 'Connector % is not certified; collection refused.', c.key; END IF;
    IF NOT public.research_connector_configured(c.key) THEN RAISE EXCEPTION 'Connector % is not configured; collection refused.', c.key; END IF;
    IF NOT public.research_source_approved(NEW.project_id, c.key) THEN RAISE EXCEPTION 'Source % is not approved in this engagement''s signed brief; collection refused.', c.key; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_capture_source BEFORE INSERT ON public.research_captures FOR EACH ROW EXECUTE FUNCTION public.research_capture_source_guard();

INSERT INTO public.research_connectors (key, name, version, platforms, status, status_reason, requires_certification) VALUES
  ('telegram_public', 'Telegram public channels and groups', '0', ARRAY['telegram'], 'suspended', 'Not certified · Not configured', true),
  ('whatsapp_channels', 'WhatsApp channels', '0', ARRAY['whatsapp'], 'suspended', 'Not certified · Not configured', true),
  ('youtube_public', 'YouTube', '0', ARRAY['youtube'], 'suspended', 'Not certified · Not configured', true),
  ('reddit_public', 'Reddit', '0', ARRAY['reddit'], 'suspended', 'Not certified · Not configured', true),
  ('local_forum', 'Local forum (not chosen)', '0', ARRAY['forum'], 'suspended', 'Not certified · Not configured', true),
  ('news_sites', 'News sites', '0', ARRAY['news'], 'suspended', 'Not certified · Not configured', true),
  ('blogs', 'Blogs', '0', ARRAY['blog'], 'suspended', 'Not certified · Not configured', true);

CREATE OR REPLACE FUNCTION public.research_certify_connector(_key text, _passed boolean, _checklist jsonb, _notes text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.research_connectors; k text;
  required text[] := ARRAY['public_only','within_brief','standard_capture_shape','sha256_at_capture','utc_time','requirement_bound','quarantine_rules','no_deception'];
BEGIN
  IF NOT public.has_role(auth.uid(),'curator') OR public.portal_has_client_identity(auth.uid()) THEN RAISE EXCEPTION 'Only the Curator can certify a connector.'; END IF;
  SELECT * INTO c FROM public.research_connectors WHERE key=_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown connector.'; END IF;
  IF _passed THEN
    FOREACH k IN ARRAY required LOOP
      IF coalesce((_checklist->>k)::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Certification needs every check to pass; % is not ticked.', k; END IF;
    END LOOP;
  END IF;
  INSERT INTO public.research_connector_certifications(connector_key,connector_version,result,checklist,notes,decided_by)
    VALUES (_key,c.version,CASE WHEN _passed THEN 'passed' ELSE 'failed' END,coalesce(_checklist,'{}'),trim(_notes),auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.research_approve_source(_project uuid, _key text, _approve boolean, _legal_basis text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
  IF NOT public.has_project_role(auth.uid(), _project, ARRAY['owner','curator','engagement_lead']) THEN RAISE EXCEPTION 'Only the engagement lead, Curator or owner can approve sources for this engagement.'; END IF;
  SELECT id INTO b FROM public.project_briefs WHERE project_id=_project AND signed_at IS NOT NULL ORDER BY signed_at DESC LIMIT 1;
  IF b IS NULL THEN RAISE EXCEPTION 'The engagement has no signed brief; sources cannot be approved.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.research_connectors WHERE key=_key) THEN RAISE EXCEPTION 'Unknown connector.'; END IF;
  INSERT INTO public.research_approved_sources(project_id,connector_key,status,brief_id,legal_basis,actor)
    VALUES (_project,_key,CASE WHEN _approve THEN 'approved' ELSE 'withdrawn' END,b,trim(coalesce(_legal_basis,'')),auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.research_report_connector_config(_key text, _configured boolean, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Only the collection device can report connector configuration.'; END IF;
  INSERT INTO public.research_connector_config(connector_key,configured,note,reported_by) VALUES (_key,_configured,nullif(trim(_note),''),'worker');
END $$;

CREATE OR REPLACE FUNCTION public.research_sources_overview(_project uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.portal_is_staff(auth.uid()) OR public.portal_has_client_identity(auth.uid()) THEN RAISE EXCEPTION 'Sources are for FridayAnalytics staff only.'; END IF;
  RETURN jsonb_build_object(
    'is_curator', public.has_role(auth.uid(),'curator'),
    'can_approve', _project IS NOT NULL AND public.has_project_role(auth.uid(), _project, ARRAY['owner','curator','engagement_lead']),
    'connectors', COALESCE((SELECT jsonb_agg(jsonb_build_object('key',c.key,'name',c.name,'version',c.version,'platforms',c.platforms,'status',c.status,
      'kind',c.source_kind,'requires_certification',c.requires_certification,
      'certified',public.research_connector_certified(c.key),'configured',public.research_connector_configured(c.key),
      'approved', CASE WHEN _project IS NULL OR NOT public.can_access_project(auth.uid(), _project) THEN NULL ELSE public.research_source_approved(_project,c.key) END) ORDER BY c.requires_certification, c.name)
      FROM public.research_connectors c), '[]'::jsonb)
  );
END $$;

REVOKE ALL ON public.research_connector_certifications, public.research_connector_config, public.research_approved_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.research_connector_certifications, public.research_connector_config, public.research_approved_sources FROM authenticated;
REVOKE ALL ON FUNCTION public.research_connector_certified(text), public.research_connector_configured(text), public.research_source_approved(uuid,text),
  public.research_connector_activation_guard(), public.research_capture_source_guard(), public.research_certify_connector(text,boolean,jsonb,text),
  public.research_approve_source(uuid,text,boolean,text), public.research_report_connector_config(text,boolean,text), public.research_sources_overview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_certify_connector(text,boolean,jsonb,text), public.research_approve_source(uuid,text,boolean,text), public.research_sources_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.research_report_connector_config(text,boolean,text), public.research_connector_certified(text), public.research_connector_configured(text), public.research_source_approved(uuid,text) TO service_role;