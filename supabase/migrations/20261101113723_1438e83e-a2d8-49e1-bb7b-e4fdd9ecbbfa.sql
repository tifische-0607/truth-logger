CREATE TABLE public.watch_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  platform text NOT NULL DEFAULT 'facebook',
  label text,
  case_id text NOT NULL REFERENCES public.cases(id),
  interval_minutes integer NOT NULL DEFAULT 60 CHECK (interval_minutes >= 15),
  active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_found integer,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (url, case_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_targets TO authenticated;
GRANT ALL ON public.watch_targets TO service_role;
ALTER TABLE public.watch_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members manage watch targets" ON public.watch_targets FOR ALL TO authenticated
  USING (public.can_access_case(auth.uid(), case_id)) WITH CHECK (public.can_access_case(auth.uid(), case_id));

CREATE TABLE public.watch_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.watch_targets(id) ON DELETE CASCADE,
  post_url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  baseline boolean NOT NULL DEFAULT false,
  job_id uuid,
  UNIQUE (target_id, post_url)
);
GRANT SELECT ON public.watch_seen TO authenticated;
GRANT ALL ON public.watch_seen TO service_role;
ALTER TABLE public.watch_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members read watch history" ON public.watch_seen FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.watch_targets t WHERE t.id = target_id AND public.can_access_case(auth.uid(), t.case_id)));