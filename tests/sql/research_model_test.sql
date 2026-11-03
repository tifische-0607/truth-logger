-- Phase 4 exit checks: Research data model and rules. Runs as a privileged session and ROLLS BACK.
-- Fixture rows are labelled "Sample" and never kept. Gate/brief/design fixtures are inserted with
-- their user triggers switched off inside this transaction only, so the research rules are tested alone.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE results(check_name text, ok boolean, detail text) ON COMMIT DROP;

ALTER TABLE public.project_gates DISABLE TRIGGER USER;
ALTER TABLE public.project_briefs DISABLE TRIGGER USER;
ALTER TABLE public.project_design_sheets DISABLE TRIGGER USER;
ALTER TABLE public.project_cycles DISABLE TRIGGER USER;
ALTER TABLE public.project_targets DISABLE TRIGGER USER;
ALTER TABLE public.projects DISABLE TRIGGER USER;
ALTER TABLE public.clients DISABLE TRIGGER USER;

INSERT INTO public.clients(id, code, name) VALUES ('00000000-0000-4000-a000-000000000001', 'SAMPLE-RES', 'Sample research client');
INSERT INTO public.projects(id, client_id, code, name) VALUES ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'SAMPLE-RES-1', 'Sample research engagement');
INSERT INTO public.project_briefs(project_id, version, kind) VALUES ('00000000-0000-4000-a000-000000000002', 1, 'draft');
INSERT INTO public.project_gates(project_id, gate) VALUES ('00000000-0000-4000-a000-000000000002', 'G0'), ('00000000-0000-4000-a000-000000000002', 'G1');
INSERT INTO public.project_design_sheets(project_id, version, lexicon_version, lexicon, exclusion_codes, sample_rule, comment_cap, comment_order, traces)
  VALUES ('00000000-0000-4000-a000-000000000002', 1, 'LEX-1', '{"ms":["sampleterm"]}', ARRAY['NOT_HOSTILE'], 'Sample', 10, 'top', '[{"choice":"x","source":"S4"}]');
INSERT INTO public.project_cycles(project_id, cycle_no, kind) VALUES ('00000000-0000-4000-a000-000000000002', 0, 'baseline');
INSERT INTO public.project_targets(project_id, target_key, platform, handle, identity_resolved) VALUES ('00000000-0000-4000-a000-000000000002', 'facebook:in_target', 'facebook', 'in_target', true);
INSERT INTO public.sources(id, name, kind, enabled) VALUES ('sample-home', 'Sample home vault', 'home_vault', true) ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE plan_args AS SELECT '00000000-0000-4000-a000-000000000002'::uuid AS e;
CREATE OR REPLACE FUNCTION pg_temp.try_plan() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.research_plans(engagement_id, cycle, design_version, brief_version, lexicon_version, approved_sources, job_types, window_from, window_to, cadence)
  VALUES ('00000000-0000-4000-a000-000000000002', 0, 0, 0, 'x', ARRAY['facebook'], ARRAY['monitor'], '2026-01-01', '2026-01-31', 'Sample daily');
  RETURN 'created';
EXCEPTION WHEN others THEN RETURN SQLERRM; END $$;

-- 1. Plan blocked before G2
INSERT INTO results SELECT 'plan blocked before G2', r = 'Research needs the design approved (G2)', r FROM pg_temp.try_plan() r;
INSERT INTO public.project_gates(project_id, gate, design_version) VALUES ('00000000-0000-4000-a000-000000000002', 'G2', 1);
-- 2. Plan blocked when the design is stale
UPDATE public.projects SET design_stale = true WHERE id = '00000000-0000-4000-a000-000000000002';
INSERT INTO results SELECT 'plan blocked when stale', r LIKE 'The design is stale%', r FROM pg_temp.try_plan() r;
UPDATE public.projects SET design_stale = false WHERE id = '00000000-0000-4000-a000-000000000002';
-- 3. Plan blocked with a pending amendment
INSERT INTO public.project_briefs(id, project_id, version, kind, amendment_no) VALUES ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000002', 2, 'amendment', 1);
INSERT INTO results SELECT 'plan blocked with pending amendment', r LIKE 'An amendment is awaiting the Curator%', r FROM pg_temp.try_plan() r;
ALTER TABLE public.project_amendment_approvals DISABLE TRIGGER USER;
INSERT INTO public.project_amendment_approvals(project_id, brief_id, decision) VALUES ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-0000000000a1', 'approved');
-- 4. Plan blocked with the home vault offline
INSERT INTO public.research_vault_reports(source_id, online, note) VALUES ('sample-home', false, 'Sample');
INSERT INTO results SELECT 'plan blocked with home vault offline', r LIKE 'The home vault is not reported online%', r FROM pg_temp.try_plan() r;
INSERT INTO public.research_vault_reports(source_id, online, note, reported_at) VALUES ('sample-home', true, 'Sample', now() + interval '1 second');
INSERT INTO results SELECT 'plan created when ready', r = 'created', r FROM pg_temp.try_plan() r;
INSERT INTO results SELECT 'second active plan in cycle refused', r = 'This cycle already has an active research plan', r FROM pg_temp.try_plan() r;

-- Start (as service session: role checks skip, rules still apply), lock and hash
DO $$ DECLARE p uuid; h text; BEGIN
  SELECT id INTO p FROM public.research_plans WHERE engagement_id = '00000000-0000-4000-a000-000000000002';
  h := public.research_start_plan(p);
  INSERT INTO results SELECT 'start records hash and queues', status = 'queued' AND plan_sha256 = h, status FROM public.research_plans WHERE id = p;
  BEGIN UPDATE public.research_plans SET cadence = 'changed' WHERE id = p; INSERT INTO results VALUES ('locked plan cannot be edited', false, 'edit accepted');
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('locked plan cannot be edited', SQLERRM LIKE 'This plan is locked%', SQLERRM); END;
END $$;

-- 5. Out-of-plan job and capture refused and logged, not queued
DO $$ DECLARE p uuid; r jsonb; run uuid; BEGIN
  SELECT id INTO p FROM public.research_plans WHERE engagement_id = '00000000-0000-4000-a000-000000000002';
  r := public.research_submit_job(p, 'monitor', 'twitter', 'facebook:in_target', ARRAY['sampleterm'], 'k1');
  INSERT INTO results VALUES ('job from unapproved source refused', r->>'status' = 'refused', r->>'reason');
  r := public.research_submit_job(p, 'monitor', 'facebook', 'facebook:not_in_register', ARRAY['sampleterm'], 'k2');
  INSERT INTO results VALUES ('job for target not marked in refused', r->>'status' = 'refused', r->>'reason');
  r := public.research_submit_job(p, 'monitor', 'facebook', 'facebook:in_target', ARRAY['offlexicon'], 'k3');
  INSERT INTO results VALUES ('job outside lexicon refused', r->>'status' = 'refused', r->>'reason');
  INSERT INTO results SELECT 'refusals logged, nothing queued', (SELECT count(*) FROM public.research_refusals WHERE plan_id = p) = 3
    AND (SELECT count(*) FROM public.research_jobs WHERE plan_id = p) = 0, NULL;
  r := public.research_submit_job(p, 'monitor', 'facebook', 'facebook:in_target', ARRAY['sampleterm'], 'k4');
  INSERT INTO results VALUES ('in-plan job queued', r->>'status' = 'queued', r::text);
  INSERT INTO public.research_runs(plan_id, type, expected) VALUES (p, 'monitor', 2) RETURNING id INTO run;
  r := public.research_submit_capture(run, 'SAMPLE-1', 'facebook', 'facebook:other', ARRAY['sampleterm'], repeat('a', 64), 'FA-STD-001 Sample');
  INSERT INTO results VALUES ('out-of-plan capture refused', r->>'status' = 'refused', r->>'reason');
  PERFORM public.research_submit_capture(run, 'SAMPLE-1', 'facebook', 'facebook:in_target', ARRAY['sampleterm'], repeat('a', 64), 'FA-STD-001 Sample', '00000000-0000-4000-a000-0000000000c1');
  PERFORM public.research_submit_capture(run, 'SAMPLE-2', 'facebook', 'facebook:in_target', ARRAY['sampleterm'], repeat('b', 64), 'FA-STD-001 Sample', '00000000-0000-4000-a000-0000000000c1');

  -- 6. Run cannot deliver unless captured = in_vault
  UPDATE public.research_captures SET sha256_on_write = sha256_at_capture, vault_write_verified = true WHERE run_id = run AND item_ref = 'SAMPLE-1';
  BEGIN UPDATE public.research_runs SET status = 'delivered' WHERE id = run; INSERT INTO results VALUES ('delivery blocked until counts match', false, 'delivered');
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('delivery blocked until counts match', SQLERRM LIKE 'A run is delivered only when captured%', SQLERRM); END;
  BEGIN UPDATE public.research_captures SET sha256_on_write = repeat('f', 64), vault_write_verified = true WHERE run_id = run AND item_ref = 'SAMPLE-2';
    INSERT INTO results VALUES ('vault write with wrong hash refused', false, 'accepted');
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('vault write with wrong hash refused', SQLERRM LIKE 'Vault write not verified%', SQLERRM); END;
  UPDATE public.research_captures SET sha256_on_write = sha256_at_capture, vault_write_verified = true WHERE run_id = run AND item_ref = 'SAMPLE-2';
  UPDATE public.research_runs SET status = 'delivered' WHERE id = run;
  INSERT INTO results SELECT 'run delivers when counts match', status = 'delivered' AND captured = 2 AND in_vault = 2, status FROM public.research_runs WHERE id = run;

  -- 7. Proof tier needs a different person's check
  BEGIN UPDATE public.research_captures SET tier = 'FA_STD_001_V2' WHERE run_id = run AND item_ref = 'SAMPLE-1';
    INSERT INTO results VALUES ('V2 tier without second check refused', false, 'accepted');
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('V2 tier without second check refused', SQLERRM LIKE 'FA-STD-001 V2 needs%', SQLERRM); END;
  BEGIN UPDATE public.research_captures SET second_check_by = captured_by WHERE run_id = run AND item_ref = 'SAMPLE-1';
    INSERT INTO results VALUES ('capturer cannot do the second check', false, 'accepted');
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('capturer cannot do the second check', SQLERRM LIKE '%second-person check must be done by someone other%' OR SQLSTATE = '23514', SQLERRM); END;
  BEGIN UPDATE public.research_captures SET second_check_by = '00000000-0000-4000-a000-0000000000c2' WHERE run_id = run AND item_ref = 'SAMPLE-1';
    INSERT INTO results VALUES ('second check needs an evidence officer', false, 'accepted');
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('second check needs an evidence officer', SQLERRM LIKE '%must be done by an evidence officer', SQLERRM); END;
END $$;

-- 8. The browser cannot call the worker entry points
INSERT INTO results SELECT 'browser cannot submit captures', NOT has_function_privilege('authenticated',
  'public.research_submit_capture(uuid,text,text,text,text[],text,text,uuid,uuid,jsonb)', 'EXECUTE'), NULL;
INSERT INTO results SELECT 'browser cannot write runs', NOT has_table_privilege('authenticated', 'public.research_runs', 'INSERT'), NULL;

SELECT CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END || check_name || coalesce(' — ' || detail, '') FROM results;
SELECT CASE WHEN bool_and(ok) THEN 'ALL RESEARCH CHECKS PASSED' ELSE 'RESEARCH CHECKS FAILED' END FROM results;
ROLLBACK;
