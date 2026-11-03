DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.project_output_guard()'::regprocedure) INTO definition;
  definition := regexp_replace(definition, 'Produced by FridayAnalytics[.]org[^'']*', 'Produced by FridayAnalytics.org', 'g');
  EXECUTE definition;
END
$migration$;
COMMENT ON COLUMN public.project_outputs.attribution_checked IS 'Every generated document carries exactly: Produced by FridayAnalytics.org';