-- U3 storage split: library files live on DarkNight only. The portal keeps metadata, hash and log.
ALTER TABLE public.documents ADD COLUMN home_source_id text REFERENCES public.sources(id) ON DELETE RESTRICT;
ALTER TABLE public.documents ADD COLUMN home_path text;
ALTER TABLE public.documents ADD CONSTRAINT documents_home_path_safe CHECK (
  home_path IS NULL OR (home_source_id IS NOT NULL AND sha256 IS NOT NULL AND length(home_path) <= 400
    AND home_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' AND position('..' in home_path) = 0 AND position('//' in home_path) = 0));
ALTER TABLE public.documents ADD CONSTRAINT documents_home_not_manifest CHECK (NOT manifest_only OR home_path IS NULL);
COMMENT ON COLUMN public.documents.storage_path IS 'DEPRECATED (U3): files are never stored in the cloud; use home_source_id + home_path on DarkNight';
COMMENT ON COLUMN public.documents.storage_bucket IS 'DEPRECATED (U3): files are never stored in the cloud';

-- No document may gain a cloud file. Output syncs drop the cloud location; staff then record the DarkNight location.
CREATE OR REPLACE FUNCTION public.library_no_cloud_file() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.storage_path IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path) THEN
    IF NEW.output_id IS NOT NULL THEN
      NEW.storage_path := NULL; NEW.storage_bucket := NULL;
    ELSE
      RAISE EXCEPTION 'Files are not stored in the cloud. FridayAnalytics places the file on DarkNight and records its location and SHA-256.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.home_path IS NOT NULL AND (NEW.home_path IS DISTINCT FROM OLD.home_path OR NEW.home_source_id IS DISTINCT FROM OLD.home_source_id) THEN
    RAISE EXCEPTION 'A document''s DarkNight location cannot change once recorded; add a new document instead';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.home_path IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
    RAISE EXCEPTION 'A document''s SHA-256 cannot change once its DarkNight location is recorded';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documents_no_cloud_file BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.library_no_cloud_file();

-- No new uploads into the library bucket.
CREATE POLICY library_no_new_files ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'library');

-- Staff register a file they have placed on DarkNight.
CREATE OR REPLACE FUNCTION public.library_register_home_file(
  p_client uuid, p_engagement uuid, p_title text, p_kind text, p_source text, p_path text,
  p_file_name text, p_size bigint, p_sha256 text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE did uuid; s public.sources;
BEGIN
  PERFORM public.library_require_staff_writer();
  SELECT * INTO s FROM public.sources WHERE id = p_source;
  IF s.id IS NULL OR s.kind <> 'home_vault' THEN RAISE EXCEPTION 'Choose a DarkNight home vault'; END IF;
  IF p_kind NOT IN ('report','brief','contract','client_upload','other') THEN RAISE EXCEPTION 'Choose a document kind'; END IF;
  IF length(trim(coalesce(p_title,''))) = 0 THEN RAISE EXCEPTION 'Give the document a title'; END IF;
  IF lower(coalesce(p_sha256,'')) !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Enter the file''s 64-character SHA-256'; END IF;
  IF p_engagement IS NOT NULL AND (SELECT client_id FROM public.projects WHERE id = p_engagement) IS DISTINCT FROM p_client THEN
    RAISE EXCEPTION 'The engagement belongs to a different client';
  END IF;
  PERFORM set_config('fa.library', 'on', true);
  INSERT INTO public.documents(title, kind, client_id, engagement_id, source, visibility, file_name, size_bytes, sha256,
    home_source_id, home_path, created_by)
  VALUES (trim(p_title), p_kind, p_client, p_engagement, CASE WHEN p_kind = 'client_upload' THEN 'client' ELSE 'fa' END,
    'staff_only', nullif(trim(coalesce(p_file_name,'')),''), p_size, lower(p_sha256), p_source, p_path, auth.uid())
  RETURNING id INTO did;
  PERFORM public.library_log(did, 'updated', 'DarkNight location recorded', jsonb_build_object('home_source', p_source, 'home_path', p_path, 'sha256', lower(p_sha256)));
  PERFORM set_config('fa.library', '', true);
  RETURN did;
END $$;

-- Staff record the DarkNight location of an existing document (for example a synced engagement output), once.
CREATE OR REPLACE FUNCTION public.library_set_home_location(doc uuid, p_source text, p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documents; s public.sources;
BEGIN
  PERFORM public.library_require_staff_writer();
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.manifest_only THEN RAISE EXCEPTION 'Home-vault bundles list their manifest and hash only'; END IF;
  IF d.sha256 IS NULL THEN RAISE EXCEPTION 'This document has no recorded SHA-256'; END IF;
  IF d.home_path IS NOT NULL THEN RAISE EXCEPTION 'The DarkNight location is already recorded'; END IF;
  SELECT * INTO s FROM public.sources WHERE id = p_source;
  IF s.id IS NULL OR s.kind <> 'home_vault' THEN RAISE EXCEPTION 'Choose a DarkNight home vault'; END IF;
  PERFORM set_config('fa.library', 'on', true);
  UPDATE public.documents SET home_source_id = p_source, home_path = p_path WHERE id = doc;
  PERFORM public.library_log(doc, 'updated', 'DarkNight location recorded', jsonb_build_object('home_source', p_source, 'home_path', p_path));
  PERFORM set_config('fa.library', '', true);
END $$;

-- What a permitted reader needs to fetch the file live from DarkNight.
CREATE OR REPLACE FUNCTION public.library_home_file_for(doc uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documents; s public.sources;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NULL OR NOT public.library_can_read(auth.uid(), d) THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.manifest_only THEN RAISE EXCEPTION 'This bundle holds home-vault files: only its manifest and hash are listed, with no download'; END IF;
  IF d.home_path IS NULL THEN RAISE EXCEPTION 'This document is not yet available on DarkNight'; END IF;
  SELECT * INTO s FROM public.sources WHERE id = d.home_source_id;
  RETURN jsonb_build_object('gateway_url', CASE WHEN s.enabled THEN s.gateway_url END, 'path', d.home_path,
    'sha256', d.sha256, 'file_name', d.file_name);
END $$;

-- Downloads are recorded against the DarkNight copy; the hash is re-checked every time.
CREATE OR REPLACE FUNCTION public.library_record_download(doc uuid, got_sha256 text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NULL OR NOT public.library_can_read(auth.uid(), d) THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.manifest_only THEN RAISE EXCEPTION 'This bundle holds home-vault files: only its manifest and hash are listed, with no download'; END IF;
  IF d.home_path IS NULL THEN RAISE EXCEPTION 'This document is not yet available on DarkNight'; END IF;
  IF lower(coalesce(got_sha256,'')) IS DISTINCT FROM d.sha256 THEN
    PERFORM public.library_log(doc, 'download_refused', 'Hash mismatch', jsonb_build_object('expected', d.sha256, 'got', got_sha256, 'from', 'darknight'));
    RETURN false;
  END IF;
  PERFORM public.library_log(doc, 'downloaded', NULL, jsonb_build_object('sha256', d.sha256, 'from', 'darknight'));
  RETURN true;
END $$;

-- The old cloud file link is retired.
CREATE OR REPLACE FUNCTION public.library_file_for(doc uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Files are fetched live from DarkNight'; END $$;
COMMENT ON FUNCTION public.library_file_for(uuid) IS 'DEPRECATED (U3): replaced by library_home_file_for';

REVOKE ALL ON FUNCTION public.library_register_home_file(uuid,uuid,text,text,text,text,text,bigint,text),
  public.library_set_home_location(uuid,text,text), public.library_home_file_for(uuid), public.library_no_cloud_file() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.library_register_home_file(uuid,uuid,text,text,text,text,text,bigint,text),
  public.library_set_home_location(uuid,text,text), public.library_home_file_for(uuid) TO authenticated, service_role;