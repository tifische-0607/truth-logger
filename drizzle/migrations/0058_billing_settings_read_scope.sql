DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings
  FOR SELECT TO authenticated
  USING (public.access_active(auth.uid()));
REVOKE SELECT ON public.billing_settings FROM anon, authenticated;
GRANT SELECT (id, currency, billing_period, updated_at) ON public.billing_settings TO authenticated;