CREATE SEQUENCE public.documents_code_seq;
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('DOC-' || lpad(nextval('public.documents_code_seq')::text, 5, '0')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  kind text NOT NULL CHECK (kind IN ('report','brief','contract','client_upload','evidence_bundle_manifest','other')),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  engagement_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('fa','client')),
  visibility text NOT NULL DEFAULT 'staff_only' CHECK (visibility IN ('staff_only','client')),
  storage_bucket text CHECK (storage_bucket IN ('library','evidence')),
  storage_path text,
  file_name text, size_bytes bigint,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  manifest_only boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  output_id uuid UNIQUE REFERENCES public.project_outputs(id) ON DELETE RESTRICT,
  output_status text,
  brief_id uuid UNIQUE REFERENCES public.project_briefs(id) ON DELETE RESTRICT,
  voided boolean NOT NULL DEFAULT false,
  voided_note text,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path IS NULL OR (storage_bucket IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK (NOT voided OR length(trim(coalesce(voided_note,''))) > 0),
  CHECK (NOT manifest_only OR storage_path IS NULL)
);
CREATE INDEX documents_client_idx ON public.documents (client_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
GRANT USAGE ON SEQUENCE public.documents_code_seq TO authenticated, service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','uploaded','shared','withdrawn','downloaded','download_refused','voided','updated')),
  reason text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(),
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('staff','client','system')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_events_doc_idx ON public.document_events (document_id, at DESC);
GRANT SELECT ON public.document_events TO authenticated;
GRANT ALL ON public.document_events TO service_role;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER document_events_append_only BEFORE UPDATE OR DELETE ON public.document_events
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER documents_no_delete BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.library_actor_kind(u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN u IS NULL THEN 'system' WHEN public.portal_is_staff(u) THEN 'staff' ELSE 'client' END $$;

CREATE OR REPLACE FUNCTION public.library_log(d uuid, a text, r text DEFAULT NULL, det jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.document_events(document_id, client_id, action, reason, detail, actor, actor_kind)
  SELECT id, client_id, a, r, det, auth.uid(), public.library_actor_kind(auth.uid()) FROM public.documents WHERE id = d;
END $$;
REVOKE ALL ON FUNCTION public.library_log(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.library_can_read(u uuid, d public.documents) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.portal_is_staff(u) OR (d.visibility = 'client' AND NOT d.voided AND public.portal_is_admin(u, d.client_id)) $$;

CREATE POLICY "staff read all documents; client admins read shared documents of their own client" ON public.documents
  FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()) OR (visibility = 'client' AND NOT voided AND public.portal_is_admin(auth.uid(), client_id)));
CREATE POLICY "staff and client admins add documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK ((public.portal_is_staff(auth.uid()) AND NOT public.has_role(auth.uid(),'management'))
              OR public.portal_is_admin(auth.uid(), client_id));
CREATE POLICY "staff update documents through library functions" ON public.documents FOR UPDATE TO authenticated
  USING (public.portal_is_staff(auth.uid()) AND NOT public.has_role(auth.uid(),'management'))
  WITH CHECK (public.portal_is_staff(auth.uid()) AND NOT public.has_role(auth.uid(),'management'));
CREATE POLICY "staff read document log; clients read their own actions on shared documents" ON public.document_events
  FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid())
         OR (actor = auth.uid() AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id
              AND d.visibility = 'client' AND NOT d.voided AND public.portal_is_admin(auth.uid(), d.client_id))));

CREATE OR REPLACE FUNCTION public.library_document_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sys boolean := coalesce(current_setting('fa.library', true), '') = 'on'; uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF sys THEN RETURN NEW; END IF;
    NEW.output_id := NULL; NEW.output_status := NULL; NEW.brief_id := NULL; NEW.version := 1;
    NEW.voided := false; NEW.voided_note := NULL; NEW.created_by := uid; NEW.manifest_only := false;
    IF NEW.storage_path IS NOT NULL AND NEW.storage_bucket IS DISTINCT FROM 'library' THEN
      RAISE EXCEPTION 'Uploaded files are stored in the library';
    END IF;
    IF uid IS NOT NULL AND NOT public.portal_is_staff(uid) THEN
      IF NOT public.portal_is_admin(uid, NEW.client_id) THEN
        RAISE EXCEPTION 'Only an active administrator of this client, with the portal enabled, can upload';
      END IF;
      IF NEW.storage_path IS NULL OR NEW.storage_path NOT LIKE 'clients/' || NEW.client_id::text || '/uploads/%' THEN
        RAISE EXCEPTION 'A client upload must be a file stored under its own client folder';
      END IF;
      NEW.source := 'client'; NEW.kind := 'client_upload'; NEW.visibility := 'client'; NEW.engagement_id := NULL;
    ELSE
      NEW.source := 'fa'; NEW.visibility := 'staff_only';
      IF NEW.kind = 'evidence_bundle_manifest' THEN RAISE EXCEPTION 'Evidence bundle manifests come from engagement outputs'; END IF;
      IF NEW.engagement_id IS NOT NULL AND (SELECT client_id FROM public.projects WHERE id = NEW.engagement_id) IS DISTINCT FROM NEW.client_id THEN
        RAISE EXCEPTION 'The engagement belongs to a different client';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NOT sys THEN RAISE EXCEPTION 'Documents change only through Share, Withdraw or Void, each recorded in the log'; END IF;
  IF NEW.id <> OLD.id OR NEW.code <> OLD.code OR NEW.client_id <> OLD.client_id OR NEW.source <> OLD.source
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A document''s code, client, source and author cannot change';
  END IF;
  IF OLD.voided AND NOT NEW.voided THEN RAISE EXCEPTION 'A voided document cannot be reinstated'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER documents_guard BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.library_document_guard();

CREATE OR REPLACE FUNCTION public.library_document_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.document_events(document_id, client_id, action, detail, actor, actor_kind)
  VALUES (NEW.id, NEW.client_id, CASE WHEN NEW.storage_path IS NOT NULL AND NEW.output_id IS NULL THEN 'uploaded' ELSE 'created' END,
          jsonb_strip_nulls(jsonb_build_object('sha256', NEW.sha256, 'visibility', NEW.visibility, 'kind', NEW.kind)),
          auth.uid(), public.library_actor_kind(auth.uid()));
  RETURN NULL;
END $$;
CREATE TRIGGER documents_created AFTER INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.library_document_created();

CREATE OR REPLACE FUNCTION public.library_sync_output() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; home boolean; vis text; did uuid; old_vis text; old_sha text;
BEGIN
  SELECT id, client_id INTO p FROM public.projects WHERE id = NEW.project_id;
  home := NEW.kind = 'evidence_bundle' AND EXISTS (SELECT 1 FROM public.project_items i WHERE i.project_id = NEW.project_id AND i.item_kind = 'home_ref' AND i.voided_at IS NULL);
  vis := CASE WHEN NEW.status = 'released' THEN 'client' ELSE 'staff_only' END;
  PERFORM set_config('fa.library', 'on', true);
  SELECT id, visibility, sha256 INTO did, old_vis, old_sha FROM public.documents WHERE output_id = NEW.id;
  IF did IS NULL THEN
    INSERT INTO public.documents(title, kind, client_id, engagement_id, source, visibility, storage_bucket, storage_path, file_name, size_bytes,
      sha256, manifest_only, output_id, output_status, created_by)
    VALUES (NEW.title, CASE WHEN NEW.kind = 'evidence_bundle' THEN 'evidence_bundle_manifest' ELSE 'report' END, p.client_id, p.id, 'fa', vis,
      CASE WHEN NEW.location IS NOT NULL AND NOT home THEN 'evidence' END, CASE WHEN home THEN NULL ELSE NEW.location END,
      NEW.file_name, NEW.size_bytes, NEW.sha256, home, NEW.id, NEW.status, NEW.created_by);
  ELSE
    UPDATE public.documents SET title = NEW.title, visibility = vis, output_status = NEW.status,
      storage_bucket = CASE WHEN NEW.location IS NOT NULL AND NOT home THEN 'evidence' END,
      storage_path = CASE WHEN home THEN NULL ELSE NEW.location END, manifest_only = home,
      file_name = NEW.file_name, size_bytes = NEW.size_bytes, sha256 = NEW.sha256,
      version = version + CASE WHEN NEW.sha256 IS DISTINCT FROM old_sha AND old_sha IS NOT NULL THEN 1 ELSE 0 END
    WHERE id = did;
    IF old_vis <> vis THEN
      PERFORM public.library_log(did, CASE WHEN vis = 'client' THEN 'shared' ELSE 'withdrawn' END,
        CASE WHEN vis = 'client' THEN 'Released at G5' ELSE 'Output status ' || NEW.status END, jsonb_build_object('output_status', NEW.status));
    ELSIF NEW.sha256 IS DISTINCT FROM old_sha THEN
      PERFORM public.library_log(did, 'updated', NULL, jsonb_build_object('sha256', NEW.sha256));
    END IF;
  END IF;
  PERFORM set_config('fa.library', '', true);
  RETURN NULL;
END $$;
CREATE TRIGGER project_outputs_library AFTER INSERT OR UPDATE ON public.project_outputs FOR EACH ROW EXECUTE FUNCTION public.library_sync_output();

CREATE OR REPLACE FUNCTION public.library_sync_brief() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record;
BEGIN
  SELECT id, client_id, code INTO p FROM public.projects WHERE id = NEW.project_id;
  PERFORM set_config('fa.library', 'on', true);
  INSERT INTO public.documents(title, kind, client_id, engagement_id, source, visibility, brief_id, created_by)
  VALUES (p.code || ' brief v' || NEW.version || CASE WHEN NEW.amendment_no IS NOT NULL THEN ' (A' || NEW.amendment_no || ')' ELSE '' END,
          'brief', p.client_id, p.id, 'fa', 'staff_only', NEW.id, NEW.authored_by);
  PERFORM set_config('fa.library', '', true);
  RETURN NULL;
END $$;
CREATE TRIGGER project_briefs_library AFTER INSERT ON public.project_briefs FOR EACH ROW EXECUTE FUNCTION public.library_sync_brief();

CREATE OR REPLACE FUNCTION public.library_brief_in_force() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid; did uuid; why text;
BEGIN
  IF TG_TABLE_NAME = 'project_gates' THEN
    IF NEW.gate <> 'G0' OR NEW.brief_id IS NULL THEN RETURN NULL; END IF; b := NEW.brief_id; why := 'Brief signed at G0';
  ELSE
    IF NEW.decision <> 'approved' THEN RETURN NULL; END IF; b := NEW.brief_id; why := 'Amendment approved';
  END IF;
  SELECT id INTO did FROM public.documents WHERE brief_id = b AND visibility = 'staff_only';
  IF did IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('fa.library', 'on', true);
  UPDATE public.documents SET visibility = 'client' WHERE id = did;
  PERFORM public.library_log(did, 'shared', why);
  PERFORM set_config('fa.library', '', true);
  RETURN NULL;
END $$;
CREATE TRIGGER project_gates_library AFTER INSERT ON public.project_gates FOR EACH ROW EXECUTE FUNCTION public.library_brief_in_force();
CREATE TRIGGER project_amendment_approvals_library AFTER INSERT ON public.project_amendment_approvals FOR EACH ROW EXECUTE FUNCTION public.library_brief_in_force();

CREATE OR REPLACE FUNCTION public.library_require_staff_writer() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_is_staff(auth.uid()) THEN RAISE EXCEPTION 'Only FA staff can change who sees a document'; END IF;
  IF public.has_role(auth.uid(), 'management') THEN RAISE EXCEPTION 'Management reads the library but does not share or withdraw documents'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.library_share(doc uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.documents;
BEGIN
  PERFORM public.library_require_staff_writer();
  SELECT * INTO d FROM public.documents WHERE id = doc FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.voided THEN RAISE EXCEPTION 'A voided document cannot be shared'; END IF;
  IF d.visibility = 'client' THEN RAISE EXCEPTION 'This document is already shared with the client'; END IF;
  IF d.output_id IS NOT NULL AND coalesce(d.output_status, '') <> 'released' THEN
    RAISE EXCEPTION 'Draft, QA and held outputs stay staff only; an output is shared with the client only by release at gate G5';
  END IF;
  IF d.brief_id IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM public.project_gates g WHERE g.gate = 'G0' AND g.brief_id = d.brief_id)
       OR EXISTS (SELECT 1 FROM public.project_amendment_approvals a WHERE a.brief_id = d.brief_id AND a.decision = 'approved')) THEN
    RAISE EXCEPTION 'Only the signed brief and approved amendments can be shared; drafts and pending amendments stay staff only';
  END IF;
  PERFORM set_config('fa.library', 'on', true);
  UPDATE public.documents SET visibility = 'client' WHERE id = doc;
  PERFORM public.library_log(doc, 'shared');
  PERFORM set_config('fa.library', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.library_withdraw(doc uuid, reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.library_require_staff_writer();
  IF length(trim(coalesce(reason, ''))) = 0 THEN RAISE EXCEPTION 'Give a reason for withdrawing this document from the client'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = doc AND visibility = 'client') THEN
    RAISE EXCEPTION 'This document is not shared with the client';
  END IF;
  PERFORM set_config('fa.library', 'on', true);
  UPDATE public.documents SET visibility = 'staff_only' WHERE id = doc;
  PERFORM public.library_log(doc, 'withdrawn', trim(reason));
  PERFORM set_config('fa.library', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.library_void(doc uuid, note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.library_require_staff_writer();
  IF length(trim(coalesce(note, ''))) = 0 THEN RAISE EXCEPTION 'Give a note explaining why this document is void'; END IF;
  PERFORM set_config('fa.library', 'on', true);
  UPDATE public.documents SET voided = true, voided_note = trim(note), visibility = 'staff_only' WHERE id = doc AND NOT voided;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found or already void'; END IF;
  PERFORM public.library_log(doc, 'voided', trim(note));
  PERFORM set_config('fa.library', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.library_record_download(doc uuid, got_sha256 text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NULL OR NOT public.library_can_read(auth.uid(), d) THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.manifest_only THEN RAISE EXCEPTION 'This bundle holds home-vault files: only its manifest and hash are listed, with no download'; END IF;
  IF d.storage_path IS NULL THEN RAISE EXCEPTION 'This document has no stored file'; END IF;
  IF got_sha256 IS DISTINCT FROM d.sha256 THEN
    PERFORM public.library_log(doc, 'download_refused', 'Hash mismatch', jsonb_build_object('expected', d.sha256, 'got', got_sha256));
    RETURN false;
  END IF;
  PERFORM public.library_log(doc, 'downloaded', NULL, jsonb_build_object('sha256', d.sha256));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.library_file_for(doc uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NULL OR NOT public.library_can_read(auth.uid(), d) THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.manifest_only THEN RAISE EXCEPTION 'This bundle holds home-vault files: only its manifest and hash are listed, with no download'; END IF;
  IF d.storage_path IS NULL THEN RAISE EXCEPTION 'This document has no stored file'; END IF;
  RETURN jsonb_build_object('bucket', d.storage_bucket, 'path', d.storage_path, 'sha256', d.sha256, 'file_name', d.file_name);
END $$;

REVOKE ALL ON FUNCTION public.library_share(uuid), public.library_withdraw(uuid,text), public.library_void(uuid,text),
  public.library_record_download(uuid,text), public.library_file_for(uuid), public.library_can_read(uuid, public.documents),
  public.library_actor_kind(uuid), public.library_require_staff_writer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.library_share(uuid), public.library_withdraw(uuid,text), public.library_void(uuid,text),
  public.library_record_download(uuid,text), public.library_file_for(uuid), public.library_can_read(uuid, public.documents)
  TO authenticated, service_role;

CREATE POLICY library_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'library' AND (public.portal_is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.documents d WHERE d.storage_bucket = 'library' AND d.storage_path = name
      AND d.visibility = 'client' AND NOT d.voided AND public.portal_is_admin(auth.uid(), d.client_id))));
CREATE POLICY library_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library' AND (public.portal_is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_users a WHERE a.user_id = auth.uid() AND split_part(name, '/', 1) = 'clients'
      AND a.client_id::text = split_part(name, '/', 2) AND split_part(name, '/', 3) = 'uploads'
      AND public.portal_is_admin(auth.uid(), a.client_id))));
CREATE POLICY library_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'library') WITH CHECK (bucket_id <> 'library');
CREATE POLICY library_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'library');

SELECT set_config('fa.library', 'on', true);
INSERT INTO public.documents(title, kind, client_id, engagement_id, source, visibility, brief_id, created_by)
SELECT p.code || ' brief v' || b.version || CASE WHEN b.amendment_no IS NOT NULL THEN ' (A' || b.amendment_no || ')' ELSE '' END,
  'brief', p.client_id, p.id, 'fa',
  CASE WHEN EXISTS (SELECT 1 FROM public.project_gates g WHERE g.gate='G0' AND g.brief_id=b.id)
         OR EXISTS (SELECT 1 FROM public.project_amendment_approvals a WHERE a.brief_id=b.id AND a.decision='approved') THEN 'client' ELSE 'staff_only' END,
  b.id, b.authored_by
FROM public.project_briefs b JOIN public.projects p ON p.id = b.project_id;
INSERT INTO public.documents(title, kind, client_id, engagement_id, source, visibility, storage_bucket, storage_path, file_name, size_bytes, sha256, manifest_only, output_id, output_status, created_by)
SELECT o.title, CASE WHEN o.kind='evidence_bundle' THEN 'evidence_bundle_manifest' ELSE 'report' END, p.client_id, p.id, 'fa',
  CASE WHEN o.status='released' THEN 'client' ELSE 'staff_only' END,
  CASE WHEN o.location IS NOT NULL AND NOT h.home THEN 'evidence' END, CASE WHEN h.home THEN NULL ELSE o.location END,
  o.file_name, o.size_bytes, o.sha256, h.home, o.id, o.status, o.created_by
FROM public.project_outputs o JOIN public.projects p ON p.id = o.project_id
CROSS JOIN LATERAL (SELECT (o.kind='evidence_bundle' AND EXISTS (SELECT 1 FROM public.project_items i WHERE i.project_id=o.project_id AND i.item_kind='home_ref' AND i.voided_at IS NULL)) AS home) h;
SELECT set_config('fa.library', '', true);