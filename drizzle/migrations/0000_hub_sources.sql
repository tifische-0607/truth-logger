CREATE TABLE public.sources (id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('cloud_vault','home_vault')), description text, gateway_url text, enabled boolean NOT NULL DEFAULT false, settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(gateway_url IS NULL OR gateway_url ~ '^https://'));
GRANT SELECT,INSERT,UPDATE ON public.sources TO authenticated; GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY sources_read ON public.sources FOR SELECT TO authenticated USING(public.is_investigator(auth.uid()));
CREATE POLICY sources_insert ON public.sources FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'owner'));
CREATE POLICY sources_update ON public.sources FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'owner')) WITH CHECK(public.has_role(auth.uid(),'owner'));
CREATE TRIGGER sources_touch BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();