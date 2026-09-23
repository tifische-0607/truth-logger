
CREATE TABLE IF NOT EXISTS public.case_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.case_assignments TO authenticated;
GRANT ALL ON public.case_assignments TO service_role;
ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_case(_user_id uuid, _case_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _case_id IS NOT NULL AND (
    public.has_role(_user_id, 'owner')
    OR EXISTS (
      SELECT 1 FROM public.case_assignments a
      WHERE a.case_id = _case_id AND a.user_id = _user_id
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_case(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "assignments readable" ON public.case_assignments;
CREATE POLICY "assignments readable" ON public.case_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));
DROP POLICY IF EXISTS "owner assigns cases" ON public.case_assignments;
CREATE POLICY "owner assigns cases" ON public.case_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
DROP POLICY IF EXISTS "owner unassigns cases" ON public.case_assignments;
CREATE POLICY "owner unassigns cases" ON public.case_assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- owner can grant / revoke investigator roles
GRANT INSERT, DELETE ON public.user_roles TO authenticated;
DROP POLICY IF EXISTS "owner grants roles" ON public.user_roles;
CREATE POLICY "owner grants roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
DROP POLICY IF EXISTS "owner revokes roles" ON public.user_roles;
CREATE POLICY "owner revokes roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') AND user_id <> auth.uid());

-- cases / incidents scoped to assignment
DROP POLICY IF EXISTS "investigators manage cases" ON public.cases;
CREATE POLICY "assigned investigators read cases" ON public.cases FOR SELECT TO authenticated
  USING (public.can_access_case(auth.uid(), id));
CREATE POLICY "investigators create cases" ON public.cases FOR INSERT TO authenticated
  WITH CHECK (public.is_investigator(auth.uid()));
CREATE POLICY "assigned investigators update cases" ON public.cases FOR UPDATE TO authenticated
  USING (public.can_access_case(auth.uid(), id)) WITH CHECK (public.can_access_case(auth.uid(), id));
CREATE POLICY "owner deletes cases" ON public.cases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "investigators manage incidents" ON public.incidents;
CREATE POLICY "assigned investigators manage incidents" ON public.incidents FOR ALL TO authenticated
  USING (public.can_access_case(auth.uid(), case_id))
  WITH CHECK (public.can_access_case(auth.uid(), case_id));

-- assign every existing case to the owner so nothing is orphaned
INSERT INTO public.case_assignments (case_id, user_id)
SELECT c.id, r.user_id FROM public.cases c
CROSS JOIN (SELECT user_id FROM public.user_roles WHERE role = 'owner') r
ON CONFLICT (case_id, user_id) DO NOTHING;
