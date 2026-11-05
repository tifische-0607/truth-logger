-- U4: the register and its marks change only through research_* SECURITY DEFINER functions.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.research_requirements, public.research_register_marks FROM authenticated, anon;
REVOKE ALL ON public.research_requirements, public.research_register_marks FROM anon;