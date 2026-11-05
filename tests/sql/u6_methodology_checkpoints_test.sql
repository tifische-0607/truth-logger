-- U6 methodology checkpoints (migrations 0036, 0037). Exit checks from section 5 of
-- docs/planning/U6-Methodology-Checkpoints-Build-Checklist.md.
-- Part A (structure and privileges) — RUN 5 Nov 2026, all passed.
-- Part B (behaviour) needs a fixture engagement (:project) with a stored capture (:cap) that passes V1 and a
-- second capture (:bad) that does not, a report output (:out), an analyst author (:author), a second analyst
-- (:second) and the Curator (:curator) — NOT RUN: test access cannot impersonate signed-in users or sign gates.
-- Every Part B row is labelled Sample and rolled back.

-- ===== Part A (run) =====
SELECT count(*) = 12 AS append_only FROM pg_trigger WHERE tgname LIKE '%append_only' AND tgrelid::regclass::text IN
  ('checkpoint_results','verification_records','finding_items','finding_reviews','collection_measures','negative_results',
   'report_figures','report_statements','report_statement_approvals','conflict_declarations','staff_exposure_log','staff_training_records');
SELECT bool_and(relrowsecurity) AS rls_on FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN
  ('checkpoint_definitions','checkpoint_results','verification_records','findings','finding_items','finding_reviews','collection_measures',
   'negative_results','report_figures','report_statements','report_statement_approvals','conflict_declarations','staff_exposure_log','staff_training_records');
-- "A user cannot set a checkpoint to passed": no table writes for people, recorder function not callable, passed requires the system
SELECT bool_and(NOT has_table_privilege('authenticated','public.'||t,'INSERT') AND NOT has_table_privilege('authenticated','public.'||t,'UPDATE')
  AND NOT has_table_privilege('authenticated','public.'||t,'DELETE')) AS no_direct_writes
  FROM unnest(ARRAY['checkpoint_results','verification_records','findings','finding_items','finding_reviews','report_statements','report_statement_approvals','conflict_declarations']) t;
SELECT NOT has_function_privilege('authenticated','public.u6_record(uuid,text,uuid,text,text,text,jsonb,text)','EXECUTE') AS recorder_is_system_only;
SELECT count(*) = 2 AS passed_only_by_system FROM pg_constraint WHERE conrelid = 'public.checkpoint_results'::regclass AND pg_get_constraintdef(oid) LIKE '%system%';
-- "Possible or Unverified cannot support a finding" (row-level constraint as well as the function)
SELECT count(*) = 1 AS support_only_confirmed_probable FROM pg_constraint WHERE conrelid = 'public.finding_items'::regclass AND pg_get_constraintdef(oid) LIKE '%Probable%';
-- Q2: a figure's value equals the number of items it lists
SELECT count(*) = 1 AS figure_equals_items FROM pg_constraint WHERE conrelid = 'public.report_figures'::regclass AND pg_get_constraintdef(oid) LIKE '%cardinality%';
-- G0, G4, G5 and release guards installed
SELECT count(*) = 2 AS gate_guards FROM pg_trigger WHERE tgname IN ('project_gates_u6','project_outputs_u6_release');
-- "Past results are never altered by later framework edits": results store a version id, versions and results are append-only
SELECT count(*) >= 1 AS framework_versions_guarded FROM pg_trigger WHERE tgrelid = 'public.framework_versions'::regclass AND NOT tgisinternal;
SELECT is_nullable = 'NO' AS result_records_version FROM information_schema.columns WHERE table_name = 'checkpoint_results' AND column_name = 'standard_version';

-- ===== Part B (not run) =====
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'author')::text, true);
-- B1 an item without V1 cannot be verified
SELECT public.u6_verify(:'bad', 'Sample', 'Sample', 'Sample', 'Confirmed', 'Sample');
--   expect: "This item has not passed V1 integrity, so it cannot be verified. Re-collect it."
-- B2 an item without V2 cannot be cited
SELECT public.u6_check_v1(:'cap');                       -- expect result passed
-- (needs Q1 first, see B4)
-- B3 analysis cannot start without Q1
SELECT public.u6_create_finding(:'project', 'Sample finding', 'Sample alternatives', true);
--   expect: "Analysis cannot start until Q1 collection measures pass for this engagement"
-- B4 record measures for every requirement, run Q1, then create the finding
SELECT public.u6_record_measure(r.id, 3, 100, r.window_from, r.window_to, 'Sample: Facebook pages') FROM public.research_requirements r WHERE r.project_id = :'project';
SELECT public.u6_check_q1(:'project');                    -- expect passed
SELECT public.u6_create_finding(:'project', 'Sample finding naming Sample Org', 'Sample: coincidence ruled out', true) AS finding \gset
SELECT public.u6_link_item(:'finding', :'cap', 'support');
--   expect: "This item has no verification record (V2), so it cannot be cited"
-- B5 a Possible item cannot support a finding
SELECT public.u6_verify(:'cap', 'Sample', 'Sample', 'Sample', 'Possible', 'Sample');
SELECT public.u6_link_item(:'finding', :'cap', 'support');
--   expect: "Only Confirmed or Probable items can support a finding; this Possible item may appear only as a labelled lead"
SELECT public.u6_link_item(:'finding', :'cap', 'lead');   -- allowed, labelled lead
SELECT public.u6_verify(:'cap', 'Sample', 'Sample', 'Sample', 'Confirmed', 'Sample');
-- B6 R: author cannot review; G4 refused without a second reviewer
SELECT public.u6_send_for_review(:'finding');
--   expect refusal: needs a supporting item (only a lead is linked) — link another Confirmed item, then resend → 'in_review'
SELECT public.u6_review(:'finding', true, NULL);
--   expect: "The author cannot review their own finding"
INSERT INTO public.project_gates (project_id, gate, cycle_no) VALUES (:'project', 'G4', 1);
--   expect: "G4: 1 finding(s) naming a person or organisation still need an approved second review (R)"
-- B7 a report cannot be released without Q2, statement and Curator approval
UPDATE public.project_outputs SET status = 'released' WHERE id = :'out';
--   expect: "The report cannot be released: the report figures have not passed Q2 reproducible counts"
SELECT public.u6_add_figure(:'out', 'Sample count', ARRAY[:'cap']::uuid[], 'Confirmed');
SELECT public.u6_check_q2(:'out');                        -- expect passed
UPDATE public.project_outputs SET status = 'released' WHERE id = :'out';
--   expect: "... the methodology statement is missing (C)"
SELECT public.u6_write_statement(:'out', 'Sample statement', 'Sample window', ARRAY['facebook'], 'Sample limits', 'Sample confidence') AS stmt \gset
SELECT public.u6_approve_statement(:'stmt', NULL);
--   expect: "Only the Curator can approve the methodology statement"
-- B8 G0 cannot be signed without a conflict declaration (on a fresh engagement with no declaration)
INSERT INTO public.project_gates (project_id, gate, sponsor_name, read_back_on) VALUES (:'project', 'G0', 'Sample', current_date);
--   expect: 'G0: record a conflict of interest declaration first (it may be "None declared")'
-- B9 a user cannot set a checkpoint to passed; reopening creates a new row
INSERT INTO public.checkpoint_results (project_id, subject_kind, subject_id, checkpoint, result, standard_version)
  VALUES (:'project', 'item', :'cap', 'V1', 'passed', public.u6_standard_version());   -- expect: permission denied
UPDATE public.checkpoint_results SET result = 'passed' WHERE subject_id = :'bad';       -- expect: permission denied
SELECT count(*) AS before FROM public.checkpoint_results WHERE subject_id = :'cap' AND checkpoint = 'V1';
SELECT public.u6_reopen(:'project', 'item', :'cap', 'V1', 'Sample reopen');
SELECT count(*) AS after_is_before_plus_one FROM public.checkpoint_results WHERE subject_id = :'cap' AND checkpoint = 'V1';
ROLLBACK;
