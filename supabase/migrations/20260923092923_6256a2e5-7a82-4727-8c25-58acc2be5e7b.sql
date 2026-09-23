CREATE TABLE public.capture_settings (
  id text PRIMARY KEY DEFAULT 'default',
  fb_account_label text,
  proxy_url text,
  timeout_seconds integer NOT NULL DEFAULT 180,
  expand_comments boolean NOT NULL DEFAULT true,
  save_pdf boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.capture_settings TO authenticated;
GRANT ALL ON public.capture_settings TO service_role;
ALTER TABLE public.capture_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investigators read capture settings" ON public.capture_settings
  FOR SELECT TO authenticated USING (public.is_investigator(auth.uid()));
CREATE POLICY "owner writes capture settings" ON public.capture_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner updates capture settings" ON public.capture_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE TRIGGER capture_settings_touch BEFORE UPDATE ON public.capture_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.capture_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

CREATE TABLE public.case_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  offence_alleged text,
  jurisdiction_agency text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_artefacts text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_templates TO authenticated;
GRANT ALL ON public.case_templates TO service_role;
ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investigators read templates" ON public.case_templates
  FOR SELECT TO authenticated USING (public.is_investigator(auth.uid()));
CREATE POLICY "owner manages templates insert" ON public.case_templates
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner manages templates update" ON public.case_templates
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner manages templates delete" ON public.case_templates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE TRIGGER case_templates_touch BEFORE UPDATE ON public.case_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();