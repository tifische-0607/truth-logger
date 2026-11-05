CREATE OR REPLACE FUNCTION public.billing_clients() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Billing is open to the owner and Management only.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'code',c.code,'tier_id',c.tier_id,'seats_used',public.billing_seats_used(c.id)) ORDER BY c.name)
  FROM public.clients c WHERE c.status='active'),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.billing_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_clients() TO authenticated, service_role;