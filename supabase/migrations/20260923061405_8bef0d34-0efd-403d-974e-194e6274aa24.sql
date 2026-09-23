
-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  default_handler text,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  INSERT INTO public.profiles (id, email, display_name, is_owner)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), first_user);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.signup_open()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles);
$$;
GRANT EXECUTE ON FUNCTION public.signup_open() TO anon, authenticated;

-- cases
CREATE TABLE public.cases (
  id text PRIMARY KEY,
  opened_on date NOT NULL DEFAULT current_date,
  target_of_complaint text,
  offence_alleged text,
  jurisdiction_agency text,
  lead_handler text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filed','closed')),
  related_cases text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  incident_id text NOT NULL,
  start_date date,
  end_date date,
  narrative_themes text[] NOT NULL DEFAULT '{}',
  escalation_stage text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, incident_id)
);

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_uuid uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'FB',
  handle text NOT NULL,
  display_name text,
  profile_url text,
  platform_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_uuid, platform, handle)
);

CREATE TABLE public.account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  display_name text,
  followers bigint,
  following bigint,
  verified boolean,
  bio_verbatim text,
  created text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('post','comment','reply')),
  parent_item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  url text,
  platform_item_id text,
  author_name text,
  author_handle text,
  author_url text,
  published_at timestamptz,
  text_original text,
  text_en text,
  translator_statement text,
  engagement jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  folder_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, item_code)
);
CREATE INDEX items_parent_idx ON public.items(parent_item_id);

CREATE TABLE public.artefacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  filename text NOT NULL,
  kind text NOT NULL,
  storage_path text NOT NULL,
  sha256 text,
  size_bytes bigint,
  mime_type text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artefacts_item_idx ON public.artefacts(item_id);

CREATE TABLE public.custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artefact_id uuid REFERENCES public.artefacts(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  filename text,
  sha256 text,
  action text NOT NULL CHECK (action IN ('captured','accessed','transferred','exported','re-hashed')),
  handler text,
  tool_version text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custody_item_idx ON public.custody_events(item_id);
CREATE INDEX custody_artefact_idx ON public.custody_events(artefact_id);

CREATE TABLE public.subject_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('poster','commenter')),
  stated jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed jsonb NOT NULL DEFAULT '{}'::jsonb,
  insufficient_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analyst_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_profile_id uuid REFERENCES public.subject_profiles(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  assessment text NOT NULL,
  analyst text,
  assessed_on date NOT NULL DEFAULT current_date,
  basis text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.capture_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  case_id text,
  incident_id text,
  incident_date date,
  handler text,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  case_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  incident_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  log text[] NOT NULL DEFAULT '{}',
  warnings text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX capture_jobs_status_idx ON public.capture_jobs(status, created_at);

CREATE TABLE public.worker_status (
  id text PRIMARY KEY DEFAULT 'worker',
  last_seen timestamptz,
  version text,
  hostname text,
  info jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO public.worker_status (id) VALUES ('worker');

-- grants + RLS for evidence tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cases','incidents','accounts','account_snapshots','items','subject_profiles','analyst_assessments','capture_jobs','worker_status'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "authed full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['artefacts','custody_events'] LOOP
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "authed read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "authed insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
  END LOOP;
END $$;

-- append-only enforcement
CREATE OR REPLACE FUNCTION public.block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not permitted. Add a new row instead.', TG_TABLE_NAME, TG_OP;
END; $$;

CREATE TRIGGER artefacts_append_only BEFORE UPDATE OR DELETE ON public.artefacts
FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER custody_events_append_only BEFORE UPDATE OR DELETE ON public.custody_events
FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER cases_touch BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER incidents_touch BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER accounts_touch BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER jobs_touch BEFORE UPDATE ON public.capture_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- atomic job claim for the worker
CREATE OR REPLACE FUNCTION public.claim_next_job()
RETURNS SETOF public.capture_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
END; $$;

CREATE OR REPLACE FUNCTION public.append_job_log(p_job_id uuid, p_lines text[], p_warnings text[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.capture_jobs
  SET log = log || COALESCE(p_lines,'{}'), warnings = warnings || COALESCE(p_warnings,'{}')
  WHERE id = p_job_id;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.capture_jobs;
