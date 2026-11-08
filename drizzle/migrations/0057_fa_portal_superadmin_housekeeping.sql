CREATE TABLE public.housekeeping_deletions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('project','capture_job')),
 record_id uuid NOT NULL,
 actor uuid NOT NULL,
 label text NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
 deleted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,record_id)
);
GRANT SELECT ON public.housekeeping_deletions TO authenticated;
GRANT ALL ON public.housekeeping_deletions TO service_role;
ALTER TABLE public.housekeeping_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins read deletion history" ON public.housekeeping_deletions FOR SELECT TO authenticated USING (public.access_is_superadmin(auth.uid()));
CREATE TRIGGER housekeeping_deletions_append_only BEFORE UPDATE OR DELETE ON public.housekeeping_deletions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE FUNCTION public.housekeeping_is_deleted(_kind text, _id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.housekeeping_deletions WHERE kind=_kind AND record_id=_id);
$$;
REVOKE ALL ON FUNCTION public.housekeeping_is_deleted(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_is_deleted(text,uuid) TO authenticated, service_role;
CREATE POLICY "Hide deleted projects" ON public.projects AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.housekeeping_is_deleted('project',id));
CREATE POLICY "Hide deleted capture jobs" ON public.capture_jobs AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.housekeeping_is_deleted('capture_job',id));
CREATE FUNCTION public.housekeeping_deletion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _label text; _status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only a SuperAdmin can delete projects or capture jobs.'; END IF;
 NEW.actor := auth.uid(); NEW.deleted_at := now();
 IF NEW.kind='project' THEN
  SELECT code || ' · ' || name INTO _label FROM public.projects WHERE id=NEW.record_id FOR UPDATE;
 ELSIF NEW.kind='capture_job' THEN
  SELECT id::text, status INTO _label, _status FROM public.capture_jobs WHERE id=NEW.record_id FOR UPDATE;
  IF _status='running' THEN RAISE EXCEPTION 'Stop the running capture job before deleting it.'; END IF;
 END IF;
 IF _label IS NULL THEN RAISE EXCEPTION 'Project or capture job not found.'; END IF;
 IF public.housekeeping_is_deleted(NEW.kind,NEW.record_id) THEN RAISE EXCEPTION 'This record has already been deleted.'; END IF;
 IF NEW.reason IS NULL OR length(btrim(NEW.reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Enter a deletion reason (1 to 1000 characters).'; END IF;
 NEW.reason := btrim(NEW.reason); NEW.label := _label;
 INSERT INTO public.account_admin_events(actor,target,action,detail) VALUES (NEW.actor,NEW.actor,'housekeeping_deleted',jsonb_build_object('kind',NEW.kind,'record_id',NEW.record_id,'label',NEW.label,'reason',NEW.reason,'deleted_at',NEW.deleted_at));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.housekeeping_deletion_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER housekeeping_deletion_guard BEFORE INSERT ON public.housekeeping_deletions FOR EACH ROW EXECUTE FUNCTION public.housekeeping_deletion_guard();
CREATE FUNCTION public.housekeeping_delete(_kind text,_id uuid,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _deletion uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only a SuperAdmin can delete projects or capture jobs.'; END IF;
 IF _kind NOT IN ('project','capture_job') OR _kind IS NULL THEN RAISE EXCEPTION 'Only projects and capture jobs can be deleted here.'; END IF;
 INSERT INTO public.housekeeping_deletions(kind,record_id,actor,label,reason) VALUES (_kind,_id,auth.uid(),'pending',_reason) RETURNING id INTO _deletion;
 RETURN _deletion;
END;
$$;
REVOKE ALL ON FUNCTION public.housekeeping_delete(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_delete(text,uuid,text) TO authenticated;
CREATE FUNCTION public.housekeeping_original_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use SuperAdmin housekeeping deletion; original records and evidence must be retained.'; END IF;
 IF public.housekeeping_is_deleted('capture_job',OLD.id) THEN RAISE EXCEPTION 'This capture job has been deleted for housekeeping.'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.housekeeping_original_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER housekeeping_project_original_guard BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.housekeeping_original_guard();
CREATE TRIGGER housekeeping_job_original_guard BEFORE DELETE OR UPDATE ON public.capture_jobs FOR EACH ROW EXECUTE FUNCTION public.housekeeping_original_guard();
CREATE OR REPLACE FUNCTION public.claim_next_job() RETURNS SETOF public.capture_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.capture_jobs SET status='queued',claimed_at=NULL,warnings=coalesce(warnings,'{}') || ARRAY['Run was abandoned and re-queued automatically']
 WHERE status='running' AND claimed_at < now()-interval '30 minutes' AND coalesce(updated_at,claimed_at)<now()-interval '30 minutes' AND NOT public.housekeeping_is_deleted('capture_job',id);
 RETURN QUERY UPDATE public.capture_jobs j SET status='running',claimed_at=now()
 WHERE j.id=(SELECT id FROM public.capture_jobs WHERE status='queued' AND NOT public.housekeeping_is_deleted('capture_job',id) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING j.*;
END;
$$;