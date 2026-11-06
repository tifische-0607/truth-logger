-- U3 remainder, plan steps 1-5 (step 6, removing cloud copies, is NOT built). Additive only.
-- Freeze switch, DarkNight route (unset = not connected), move runs/results, transferred custody events,
-- read location for moved artefacts, outputs written to DarkNight only. No cloud file is deleted or changed.
SET check_function_bodies = off;

-- 1. Freeze: append-only log; the latest row is the state.
CREATE TABLE public.evidence_move_freeze_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frozen boolean NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.evidence_move_freeze_log TO authenticated;
GRANT ALL ON public.evidence_move_freeze_log TO service_role;
ALTER TABLE public.evidence_move_freeze_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_move_freeze_read ON public.evidence_move_freeze_log FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER evidence_move_freeze_append_only BEFORE UPDATE OR DELETE ON public.evidence_move_freeze_log
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE FUNCTION public.evidence_move_frozen() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT frozen FROM public.evidence_move_freeze_log ORDER BY at DESC, id DESC LIMIT 1), false)
$$;

CREATE FUNCTION public.evidence_move_set_freeze(_on boolean, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can switch the evidence move freeze.'; END IF;
  IF _on IS NULL THEN RAISE EXCEPTION 'Choose on or off.'; END IF;
  IF coalesce(length(trim(_reason)), 0) = 0 THEN RAISE EXCEPTION 'A reason is required to switch the evidence move freeze.'; END IF;
  IF _on = public.evidence_move_frozen() THEN
    RAISE EXCEPTION 'The evidence move freeze is already %.', CASE WHEN _on THEN 'on' ELSE 'off' END;
  END IF;
  INSERT INTO public.evidence_move_freeze_log (frozen, reason) VALUES (_on, trim(_reason));
END $$;

-- While frozen no new evidence file may be recorded in cloud storage (worker ingest and browser capture alike).
CREATE FUNCTION public.evidence_move_freeze_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.evidence_move_frozen() THEN
    RAISE EXCEPTION 'Evidence move freeze is on: new evidence files cannot be uploaded to cloud storage while files move to DarkNight.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER artefacts_evidence_move_freeze BEFORE INSERT ON public.artefacts
  FOR EACH ROW EXECUTE FUNCTION public.evidence_move_freeze_guard();

-- Browser uploads: no new evidence object while frozen; no new engagement output in cloud storage ever (item 6).
CREATE POLICY evidence_move_freeze_uploads ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'evidence' OR NOT public.evidence_move_frozen());
CREATE POLICY outputs_not_in_cloud ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'evidence' OR name NOT LIKE 'projects/%');

-- 2. DarkNight route for the move and for reads of moved files. Unset = "DarkNight gateway not connected".
-- Decision C2 (the secure route) is open, so no screen can set it; a later approved migration does.
CREATE TABLE public.darknight_route (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  gateway_url text CHECK (gateway_url IS NULL OR gateway_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.darknight_route TO authenticated;
GRANT ALL ON public.darknight_route TO service_role;
ALTER TABLE public.darknight_route ENABLE ROW LEVEL SECURITY;
CREATE POLICY darknight_route_read ON public.darknight_route FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid()) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER darknight_route_no_delete BEFORE DELETE ON public.darknight_route FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
INSERT INTO public.darknight_route (id, gateway_url) VALUES (true, NULL);

-- 2-4. Move runs and per-artefact results (append-only, written only through the functions below).
CREATE TABLE public.evidence_move_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_url text NOT NULL,
  total int NOT NULL CHECK (total >= 0),
  started_by uuid DEFAULT auth.uid(),
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.evidence_move_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.evidence_move_runs(id) ON DELETE RESTRICT,
  artefact_id uuid NOT NULL REFERENCES public.artefacts(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('verified','mismatch','unavailable')),
  expected_sha256 text NOT NULL,
  got_sha256 text,
  darknight_path text NOT NULL,
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (outcome <> 'verified' OR got_sha256 = expected_sha256)
);
CREATE UNIQUE INDEX evidence_move_one_verified ON public.evidence_move_results (artefact_id) WHERE outcome = 'verified';
CREATE INDEX evidence_move_results_run_idx ON public.evidence_move_results (run_id, at);
GRANT SELECT ON public.evidence_move_runs, public.evidence_move_results TO authenticated;
GRANT ALL ON public.evidence_move_runs, public.evidence_move_results TO service_role;
ALTER TABLE public.evidence_move_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_move_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_move_runs_read ON public.evidence_move_runs FOR SELECT TO authenticated
  USING ((public.is_investigator(auth.uid()) OR public.has_role(auth.uid(), 'management')) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE POLICY evidence_move_results_read ON public.evidence_move_results FOR SELECT TO authenticated
  USING ((public.is_investigator(auth.uid()) OR public.has_role(auth.uid(), 'management')) AND NOT public.portal_has_client_identity(auth.uid()));
CREATE TRIGGER evidence_move_runs_append_only BEFORE UPDATE OR DELETE ON public.evidence_move_runs FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER evidence_move_results_append_only BEFORE UPDATE OR DELETE ON public.evidence_move_results FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE FUNCTION public.evidence_move_start() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gw text; r uuid; n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can run the evidence move.'; END IF;
  SELECT gateway_url INTO gw FROM public.darknight_route WHERE id;
  IF gw IS NULL THEN RAISE EXCEPTION 'DarkNight gateway not connected'; END IF;
  IF NOT public.evidence_move_frozen() THEN RAISE EXCEPTION 'Switch the evidence move freeze on before moving files.'; END IF;
  SELECT count(*) INTO n FROM public.artefacts a
   WHERE NOT EXISTS (SELECT 1 FROM public.evidence_move_results x WHERE x.artefact_id = a.id AND x.outcome = 'verified');
  INSERT INTO public.evidence_move_runs (gateway_url, total) VALUES (gw, n) RETURNING id INTO r;
  RETURN jsonb_build_object('run_id', r, 'gateway_url', gw, 'total', n);
END $$;

-- Artefacts still to move (owner only; used by the move job).
CREATE FUNCTION public.evidence_move_pending() RETURNS TABLE (artefact_id uuid, storage_path text, sha256 text, filename text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can run the evidence move.'; END IF;
  RETURN QUERY SELECT a.id, a.storage_path, a.sha256, a.filename FROM public.artefacts a
   WHERE NOT EXISTS (SELECT 1 FROM public.evidence_move_results x WHERE x.artefact_id = a.id AND x.outcome = 'verified')
   ORDER BY a.storage_path, a.id;
END $$;

-- 3-4. Record DarkNight's re-hash. Verified only when hashes match; a mismatch stops the whole run.
CREATE FUNCTION public.evidence_move_record(_run uuid, _artefact uuid, _darknight_path text, _got_sha256 text, _unavailable boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.artefacts; bad record; res text; got text := lower(nullif(trim(_got_sha256), ''));
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can run the evidence move.'; END IF;
  IF NOT public.evidence_move_frozen() THEN RAISE EXCEPTION 'Switch the evidence move freeze on before moving files.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.evidence_move_runs WHERE id = _run) THEN RAISE EXCEPTION 'Unknown move run.'; END IF;
  SELECT x.artefact_id, f.filename INTO bad FROM public.evidence_move_results x JOIN public.artefacts f ON f.id = x.artefact_id
   WHERE x.run_id = _run AND x.outcome = 'mismatch' ORDER BY x.at LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'This move was stopped by a hash mismatch on % (%). Start a new move after it is investigated.', bad.filename, bad.artefact_id; END IF;
  SELECT * INTO a FROM public.artefacts WHERE id = _artefact;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown artefact.'; END IF;
  IF EXISTS (SELECT 1 FROM public.evidence_move_results WHERE artefact_id = a.id AND outcome = 'verified') THEN
    RAISE EXCEPTION 'This artefact has already been moved and verified.';
  END IF;
  IF _darknight_path IS DISTINCT FROM a.storage_path THEN
    RAISE EXCEPTION 'The DarkNight location must be the artefact''s existing folder path.';
  END IF;
  IF coalesce(_unavailable, false) THEN
    res := 'unavailable';
  ELSIF got IS NULL OR got !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'DarkNight must report the SHA-256 it computed.';
  ELSIF a.sha256 IS NOT NULL AND got = lower(a.sha256) THEN
    res := 'verified';
  ELSE
    res := 'mismatch';
  END IF;
  INSERT INTO public.evidence_move_results (run_id, artefact_id, outcome, expected_sha256, got_sha256, darknight_path)
  VALUES (_run, a.id, res, coalesce(lower(a.sha256), 'none recorded'), got, a.storage_path);
  IF res = 'verified' THEN
    INSERT INTO public.custody_events (artefact_id, item_id, filename, sha256, action, handler, tool_version, notes, source_id)
    VALUES (a.id, a.item_id, a.filename, lower(a.sha256), 'transferred',
      coalesce((SELECT display_name FROM public.profiles WHERE id = auth.uid()), 'owner'), 'FA Portal U3 evidence move',
      'Transferred to DarkNight: darknight:/' || a.storage_path || ' (re-hashed on DarkNight, SHA-256 matched). Cloud original untouched.', 'cloud');
  END IF;
  RETURN res;
END $$;

-- Progress for the Vaults page (staff).
CREATE FUNCTION public.evidence_move_progress() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE t int; v int; m int; c int; lr record; stop record;
BEGIN
  IF NOT ((public.is_investigator(auth.uid()) OR public.has_role(auth.uid(), 'management')) AND NOT public.portal_has_client_identity(auth.uid())) THEN
    RAISE EXCEPTION 'Staff only.';
  END IF;
  SELECT count(*) INTO t FROM public.artefacts;
  SELECT count(DISTINCT artefact_id) INTO v FROM public.evidence_move_results WHERE outcome = 'verified';
  SELECT count(DISTINCT x.artefact_id) INTO m FROM public.evidence_move_results x WHERE x.outcome = 'mismatch'
    AND NOT EXISTS (SELECT 1 FROM public.evidence_move_results y WHERE y.artefact_id = x.artefact_id AND y.outcome = 'verified');
  SELECT count(*) INTO c FROM storage.objects WHERE bucket_id = 'evidence' AND name NOT LIKE 'projects/%';
  SELECT * INTO lr FROM public.evidence_move_runs ORDER BY started_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT x.artefact_id, f.filename, f.storage_path, x.expected_sha256, x.got_sha256, x.at INTO stop
      FROM public.evidence_move_results x JOIN public.artefacts f ON f.id = x.artefact_id
     WHERE x.run_id = lr.id AND x.outcome = 'mismatch' ORDER BY x.at LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'total', t, 'verified', v, 'mismatched', m, 'not_yet_moved', t - v, 'cloud_copies', c,
    'frozen', public.evidence_move_frozen(),
    'gateway_connected', (SELECT gateway_url IS NOT NULL FROM public.darknight_route WHERE id),
    'step6', 'waiting_for_written_approval',
    'last_run', CASE WHEN lr.id IS NULL THEN NULL ELSE jsonb_build_object('id', lr.id, 'started_at', lr.started_at, 'total', lr.total,
      'stopped_by', CASE WHEN stop.artefact_id IS NULL THEN NULL ELSE jsonb_build_object('artefact_id', stop.artefact_id, 'filename', stop.filename,
        'path', stop.storage_path, 'expected', stop.expected_sha256, 'got', stop.got_sha256, 'at', stop.at) END) END);
END $$;

-- 5. Where to read an artefact. SECURITY INVOKER: artefact row rules apply to the caller.
CREATE FUNCTION public.evidence_read_location(_storage_path text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('artefact_id', a.id, 'sha256', lower(a.sha256), 'darknight_path', x.darknight_path,
    'moved', x.id IS NOT NULL, 'gateway_url', CASE WHEN x.id IS NOT NULL THEN (SELECT gateway_url FROM public.darknight_route WHERE id) END)
  FROM public.artefacts a
  LEFT JOIN public.evidence_move_results x ON x.artefact_id = a.id AND x.outcome = 'verified'
  WHERE a.storage_path = _storage_path
  ORDER BY x.id IS NOT NULL DESC LIMIT 1
$$;

-- 6. Engagement outputs live on DarkNight: new cloud locations refused; DarkNight path recorded with the hash.
ALTER TABLE public.project_outputs ADD COLUMN home_path text
  CHECK (home_path IS NULL OR (home_path ~ '^[A-Za-z0-9][A-Za-z0-9._/@-]*$' AND home_path NOT LIKE '%..%' AND home_path NOT LIKE '%//%'));
COMMENT ON COLUMN public.project_outputs.location IS 'DEPRECATED (U3): cloud storage path; outputs are written to DarkNight (home_path)';
CREATE FUNCTION public.project_outputs_darknight_only() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.location IS NOT NULL AND NEW.location IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.location END) THEN
    RAISE EXCEPTION 'Outputs are no longer stored in the cloud: they are written to DarkNight.';
  END IF;
  IF NEW.home_path IS NOT NULL AND NEW.home_path IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.home_path END) THEN
    IF NEW.home_path NOT LIKE 'projects/' || NEW.project_id || '/%' THEN
      RAISE EXCEPTION 'An output''s DarkNight location must sit under its engagement folder.';
    END IF;
    IF NEW.sha256 IS NULL THEN RAISE EXCEPTION 'An output''s SHA-256 must be recorded with its DarkNight location.'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_outputs_darknight_only BEFORE INSERT OR UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.project_outputs_darknight_only();

REVOKE ALL ON FUNCTION public.evidence_move_set_freeze(boolean, text), public.evidence_move_start(), public.evidence_move_pending(),
  public.evidence_move_record(uuid, uuid, text, text, boolean), public.evidence_move_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evidence_move_set_freeze(boolean, text), public.evidence_move_start(), public.evidence_move_pending(),
  public.evidence_move_record(uuid, uuid, text, text, boolean), public.evidence_move_progress(), public.evidence_read_location(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evidence_move_frozen() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.evidence_move_frozen(), public.evidence_read_location(text) FROM anon;