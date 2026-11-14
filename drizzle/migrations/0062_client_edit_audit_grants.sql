REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.client_detail_events FROM authenticated, anon;
GRANT SELECT ON public.client_detail_events TO authenticated;
REVOKE ALL ON FUNCTION public.client_details_guard() FROM PUBLIC, anon, authenticated;