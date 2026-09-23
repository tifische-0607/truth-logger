
-- 1. roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner','analyst');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_investigator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_investigator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_investigator(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "own roles readable" ON public.user_roles;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));

-- backfill existing accounts so nothing breaks
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, CASE WHEN p.is_owner THEN 'owner'::public.app_role ELSE 'analyst'::public.app_role END
FROM public.profiles p
ON CONFLICT (user_id, role) DO NOTHING;

-- first account keeps becoming the owner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  INSERT INTO public.profiles (id, email, display_name, is_owner)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), first_user);
  IF first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- 2. replace tautology policies with role checks
DROP POLICY IF EXISTS "authed full access" ON public.cases;
CREATE POLICY "investigators manage cases" ON public.cases FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.incidents;
CREATE POLICY "investigators manage incidents" ON public.incidents FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.accounts;
CREATE POLICY "investigators manage accounts" ON public.accounts FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.account_snapshots;
CREATE POLICY "investigators manage snapshots" ON public.account_snapshots FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.items;
CREATE POLICY "investigators manage items" ON public.items FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.subject_profiles;
CREATE POLICY "investigators manage subject profiles" ON public.subject_profiles FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.analyst_assessments;
CREATE POLICY "investigators manage assessments" ON public.analyst_assessments FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.capture_jobs;
CREATE POLICY "investigators manage capture jobs" ON public.capture_jobs FOR ALL TO authenticated
  USING (public.is_investigator(auth.uid())) WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed full access" ON public.worker_status;
CREATE POLICY "investigators read worker status" ON public.worker_status FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid()));
CREATE POLICY "owner updates worker status" ON public.worker_status FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- append-only tables
DROP POLICY IF EXISTS "authed read" ON public.artefacts;
DROP POLICY IF EXISTS "authed insert" ON public.artefacts;
CREATE POLICY "investigators read artefacts" ON public.artefacts FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid()));
CREATE POLICY "investigators add artefacts" ON public.artefacts FOR INSERT TO authenticated
  WITH CHECK (public.is_investigator(auth.uid()));

DROP POLICY IF EXISTS "authed read" ON public.custody_events;
DROP POLICY IF EXISTS "authed insert" ON public.custody_events;
CREATE POLICY "investigators read custody events" ON public.custody_events FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid()));
CREATE POLICY "investigators add custody events" ON public.custody_events FOR INSERT TO authenticated
  WITH CHECK (public.is_investigator(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "profiles readable by authed" ON public.profiles;
CREATE POLICY "own profile or owner readable" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'owner'));

-- 3. storage: evidence bucket limited to investigators
DROP POLICY IF EXISTS "authed read evidence" ON storage.objects;
DROP POLICY IF EXISTS "authed write evidence" ON storage.objects;
CREATE POLICY "investigators read evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND public.is_investigator(auth.uid()));
CREATE POLICY "investigators upload evidence" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence' AND public.is_investigator(auth.uid()));
