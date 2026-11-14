ALTER TABLE public.clients ADD COLUMN database_name text, ADD COLUMN database_schema text, ADD COLUMN database_url text;
CREATE TABLE public.client_detail_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id), actor uuid NOT NULL DEFAULT auth.uid(), before_details jsonb NOT NULL, after_details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.client_detail_events TO authenticated;
GRANT ALL ON public.client_detail_events TO service_role;
ALTER TABLE public.client_detail_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SuperAdmins read client edits" ON public.client_detail_events FOR SELECT TO authenticated USING (public.access_is_superadmin(auth.uid()));
CREATE TRIGGER immutable_client_detail_events BEFORE UPDATE OR DELETE ON public.client_detail_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE FUNCTION public.client_details_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['updated_at','tier_id','portal_enabled']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','tier_id','portal_enabled']) THEN
  IF NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only an active SuperAdmin can edit client details and database links.'; END IF;
  IF NEW.database_url IS NOT NULL AND (NEW.database_url !~ '^https://[^/@?#[:space:]]+([/?#]|$)' OR NEW.database_url ~ '[?#]') THEN RAISE EXCEPTION 'Database link must be HTTPS without credentials, query parameters or fragments.'; END IF;
  IF NEW.database_schema IS NOT NULL AND NEW.database_schema !~ '^[a-z_][a-z0-9_]{0,62}$' THEN RAISE EXCEPTION 'Use a valid lowercase schema name.'; END IF;
  INSERT INTO public.client_detail_events(client_id,actor,before_details,after_details) VALUES (OLD.id,auth.uid(),to_jsonb(OLD)-ARRAY['updated_at'],to_jsonb(NEW)-ARRAY['updated_at']);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER client_details_superadmin_guard BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.client_details_guard();
CREATE FUNCTION public.client_admin_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.access_active(auth.uid()) OR NOT (public.access_is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'management')) THEN RAISE EXCEPTION 'Client administration is for SuperAdmin and Management only.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('seats_used',public.billing_seats_used(c.id)) ORDER BY c.name) FROM public.clients c),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.client_admin_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_admin_list() TO authenticated;
CREATE FUNCTION public.client_admin_save(_client uuid, _details jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only an active SuperAdmin can edit client details and database links.'; END IF;
 IF nullif(trim(_details->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Client name is required.'; END IF;
 IF coalesce(_details->>'kind','organization') NOT IN ('organization','individual') THEN RAISE EXCEPTION 'Invalid client type.'; END IF;
 UPDATE public.clients SET name=trim(_details->>'name'),display_name=coalesce(nullif(trim(_details->>'display_name'),''),trim(_details->>'name')),kind=coalesce(_details->>'kind','organization'),legal_name=nullif(trim(_details->>'legal_name'),''),sector=nullif(trim(_details->>'sector'),''),contact_name=nullif(trim(_details->>'contact_name'),''),contact_email=nullif(trim(_details->>'contact_email'),''),phone=nullif(trim(_details->>'phone'),''),time_zone=nullif(trim(_details->>'time_zone'),''),notes=nullif(trim(_details->>'notes'),''),database_name=nullif(trim(_details->>'database_name'),''),database_schema=nullif(trim(_details->>'database_schema'),''),database_url=nullif(trim(_details->>'database_url'),'') WHERE id=_client;
 IF NOT FOUND THEN RAISE EXCEPTION 'Client not found.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.client_admin_save(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_admin_save(uuid,jsonb) TO authenticated;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.access_menu()'::regprocedure) INTO def;
 def := replace(def,'''users_access'',''vaults''','''users_access'',''client_admin'',''vaults''');
 def := replace(def,'''management'',''billing'',''users_access'']','''management'',''billing'',''users_access'',''client_admin'']');
 EXECUTE def;
END $$;