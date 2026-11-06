-- U11 Narrative and coordination detection — SQL checks
-- Part A (structure): RUN 6 Nov 2026 through the read-only database tool. Results recorded in roadmap.md.
-- Part B (behaviour): NOT RUN — needs a test connection that can create auth users, analyst fixtures, engagement captures
--   and a Curator-approved universal-standard version (v1 is still a Sample).

-- A1 RLS on every U11 table and append-only triggers present
SELECT c.relname, c.relrowsecurity,
  EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname LIKE '%append_only') AS append_only
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('nar_thresholds','nar_narratives','nar_coordination','nar_events') ORDER BY 1;
-- expect 4 rows, all true/true

-- A2 People cannot write the tables directly; anon cannot read them
SELECT has_table_privilege('authenticated','public.nar_coordination','INSERT') AS auth_insert,   -- expect false
       has_table_privilege('anon','public.nar_coordination','SELECT') AS anon_select,             -- expect false
       has_function_privilege('anon','public.nar_decide_coordination(uuid,text,text,boolean,text[],uuid[],text)','EXECUTE') AS anon_exec, -- false
       has_function_privilege('authenticated','public.nar_confirmed_coordination(uuid)','EXECUTE') AS auth_gateway_feed; -- false (service role only)

-- A3 Guards on every insert (analyst, captures cited, standard version recorded)
SELECT tgname FROM pg_trigger WHERE tgname IN ('nar_narratives_guard','nar_coordination_guard') ORDER BY 1; -- expect 2

-- A4 Thresholds start empty → "Threshold not set"
SELECT count(*) AS threshold_rows FROM public.nar_thresholds; -- expect 0 before any setting

-- A5 Columns: only identifiers, decisions and references (no text/content columns besides analyst name/reason)
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='nar_coordination' ORDER BY ordinal_position;

BEGIN;
-- B1 Direct insert of a "confirmed" row by a non-analyst is refused by nar_row_guard:
--   INSERT INTO public.nar_coordination(..., decided_by => <non-analyst uuid>) → 'Only an analyst can confirm or reject a finding.'
-- B2 Unset thresholds: nar_decide_coordination(...) → 'Threshold not set: nothing can be labelled coordinated until the coordination thresholds are set.'
-- B3 No captures: → 'Every finding must cite captures from this engagement.'
-- B4 Fewer accounts than threshold with _confirm=true → 'Fewer accounts than the coordination threshold; this cannot be labelled coordinated.'
-- B5 nar_set_threshold('coord_window_minutes', 5000) → 'A time window must be from 1 minute to 72 hours.'
--    nar_set_threshold('similarity_min', 0) → 'A threshold must be a whole number from 1 to 20.'
-- B6 Confirmed coordination writes lnk_events 'coordination_confirmed' and an ew_signals row (or records the refusal in nar_events).
ROLLBACK;
