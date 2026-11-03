-- U3 storage split checks. Run with a privileged test connection inside a transaction; everything rolls back.
BEGIN;
-- S1: a document can no longer gain a cloud file.
DO $$ DECLARE c uuid; ok boolean := false; BEGIN
  SELECT id INTO c FROM public.clients LIMIT 1;
  BEGIN
    INSERT INTO public.documents(title, kind, client_id, source, storage_bucket, storage_path, sha256)
    VALUES ('S1', 'report', c, 'fa', 'library', 'clients/' || c || '/uploads/a', repeat('a', 64));
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Files are not stored in the cloud%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'S1 FAILED'; END IF; RAISE NOTICE 'S1 passed';
END $$;
-- S2: a DarkNight path must be safe.
DO $$ DECLARE c uuid; ok boolean := false; BEGIN
  SELECT id INTO c FROM public.clients LIMIT 1;
  BEGIN
    INSERT INTO public.documents(title, kind, client_id, source, sha256, home_source_id, home_path)
    VALUES ('S2', 'report', c, 'fa', repeat('a', 64), 'darknight', '../etc/passwd');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'S2 FAILED'; END IF; RAISE NOTICE 'S2 passed';
END $$;
-- S3: no object has been added to the library bucket (expect 0).
SELECT count(*) AS library_objects FROM storage.objects WHERE bucket_id = 'library';
-- S4 (needs a staff session): library_register_home_file then library_set_home_location on the same row is refused;
-- library_record_download with a wrong hash returns false and logs download_refused.
ROLLBACK;
