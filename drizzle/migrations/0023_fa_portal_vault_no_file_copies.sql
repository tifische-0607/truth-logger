-- U3 correction: no report, evidence or document file is copied to the Cloud Vault. The file feeds are inert;
-- the outbox table stays (custody and event records only). Existing triggers now do nothing.
CREATE OR REPLACE FUNCTION public.vault_feed_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.vault_feed_output() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.vault_feed_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.vault_cloud_copy_for(doc uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT NULL::jsonb $$;
COMMENT ON FUNCTION public.vault_feed_document() IS 'DEPRECATED (U3): inert, documents are never copied to the Cloud Vault';
COMMENT ON FUNCTION public.vault_feed_output() IS 'DEPRECATED (U3): inert, reports are never copied to the Cloud Vault';
COMMENT ON FUNCTION public.vault_feed_capture() IS 'DEPRECATED (U3): inert, evidence is never copied to the Cloud Vault';
COMMENT ON FUNCTION public.vault_cloud_copy_for(uuid) IS 'DEPRECATED (U3): always NULL, no Cloud Vault file copies exist';
