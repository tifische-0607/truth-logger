CREATE OR REPLACE FUNCTION public.sla_sync_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := to_jsonb(NEW);
BEGIN
  PERFORM public.sla_sync(CASE WHEN TG_TABLE_NAME='projects' THEN (r->>'id')::uuid ELSE (r->>'project_id')::uuid END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sla_sync_trigger() FROM PUBLIC, anon, authenticated;