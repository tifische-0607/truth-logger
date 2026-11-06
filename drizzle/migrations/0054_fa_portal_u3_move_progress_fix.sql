-- U3: evidence_move_progress failed before any move had run (unassigned record). Same result shape.
CREATE OR REPLACE FUNCTION public.evidence_move_progress() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE t int; v int; m int; c int; lr jsonb; stop jsonb; rid uuid;
BEGIN
  IF NOT ((public.is_investigator(auth.uid()) OR public.has_role(auth.uid(), 'management')) AND NOT public.portal_has_client_identity(auth.uid())) THEN
    RAISE EXCEPTION 'Staff only.';
  END IF;
  SELECT count(*) INTO t FROM public.artefacts;
  SELECT count(DISTINCT artefact_id) INTO v FROM public.evidence_move_results WHERE outcome = 'verified';
  SELECT count(DISTINCT x.artefact_id) INTO m FROM public.evidence_move_results x WHERE x.outcome = 'mismatch'
    AND NOT EXISTS (SELECT 1 FROM public.evidence_move_results y WHERE y.artefact_id = x.artefact_id AND y.outcome = 'verified');
  SELECT count(*) INTO c FROM storage.objects WHERE bucket_id = 'evidence' AND name NOT LIKE 'projects/%';
  SELECT id, jsonb_build_object('id', id, 'started_at', started_at, 'total', total) INTO rid, lr
    FROM public.evidence_move_runs ORDER BY started_at DESC LIMIT 1;
  IF rid IS NOT NULL THEN
    SELECT jsonb_build_object('artefact_id', x.artefact_id, 'filename', f.filename, 'path', f.storage_path,
      'expected', x.expected_sha256, 'got', x.got_sha256, 'at', x.at) INTO stop
      FROM public.evidence_move_results x JOIN public.artefacts f ON f.id = x.artefact_id
     WHERE x.run_id = rid AND x.outcome = 'mismatch' ORDER BY x.at LIMIT 1;
    lr := lr || jsonb_build_object('stopped_by', stop);
  END IF;
  RETURN jsonb_build_object(
    'total', t, 'verified', v, 'mismatched', m, 'not_yet_moved', t - v, 'cloud_copies', c,
    'frozen', public.evidence_move_frozen(),
    'gateway_connected', (SELECT gateway_url IS NOT NULL FROM public.darknight_route WHERE id),
    'step6', 'waiting_for_written_approval',
    'last_run', lr);
END $$;