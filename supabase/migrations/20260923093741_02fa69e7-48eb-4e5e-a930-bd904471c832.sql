CREATE OR REPLACE FUNCTION public.claim_next_job()
 RETURNS SETOF capture_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Return abandoned runs (claimed but silent for 30+ minutes) to the queue.
  UPDATE public.capture_jobs
  SET status = 'queued',
      claimed_at = NULL,
      warnings = coalesce(warnings, '{}') || ARRAY['Run was abandoned and re-queued automatically']
  WHERE status = 'running'
    AND claimed_at < now() - interval '30 minutes'
    AND coalesce(updated_at, claimed_at) < now() - interval '30 minutes';

  RETURN QUERY
  UPDATE public.capture_jobs j
  SET status = 'running', claimed_at = now()
  WHERE j.id = (
    SELECT id FROM public.capture_jobs
    WHERE status = 'queued'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING j.*;
END; $function$;