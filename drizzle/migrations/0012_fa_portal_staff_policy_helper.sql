CREATE FUNCTION public.portal_has_client_identity(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.client_users WHERE user_id=u); $$;
REVOKE ALL ON FUNCTION public.portal_has_client_identity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_has_client_identity(uuid) TO authenticated,service_role;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('client_users','client_access_events') LOOP
 EXECUTE format('ALTER POLICY "Clients cannot access staff data" ON public.%I USING (NOT public.portal_has_client_identity(auth.uid())) WITH CHECK (NOT public.portal_has_client_identity(auth.uid()))',t.tablename);
 END LOOP;
END $$;