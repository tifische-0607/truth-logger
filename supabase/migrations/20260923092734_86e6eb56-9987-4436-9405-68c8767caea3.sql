ALTER TABLE public.worker_status REPLICA IDENTITY FULL;
ALTER TABLE public.custody_events REPLICA IDENTITY FULL;
ALTER TABLE public.artefacts REPLICA IDENTITY FULL;
ALTER TABLE public.capture_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.custody_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.artefacts;