\set ON_ERROR_STOP 1
\set QUIET 1
CREATE OR REPLACE FUNCTION public.t_expect_error(q text, pat text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* pat THEN RAISE EXCEPTION 'expected error ~ "%" for [%], got: %', pat, left(q, 160), SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error ~ "%" for [%], but it succeeded', pat, left(q, 160);
END $$;
CREATE OR REPLACE FUNCTION public.t_eq(got bigint, want bigint, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF got IS DISTINCT FROM want THEN RAISE EXCEPTION '%: got %, want %', what, got, want; END IF; END $$;
CREATE OR REPLACE FUNCTION public.as_user(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || u, false) $$;
GRANT EXECUTE ON FUNCTION public.t_expect_error(text,text), public.t_eq(bigint,bigint,text), public.as_user(text) TO authenticated;

INSERT INTO auth.users(id,email) SELECT ('00000000-0000-0000-0000-0000000000' || u)::uuid, u || '@x' FROM unnest(ARRAY['a1','a2','a3','a4','a5','a6','a7','a8','a9','b0','b1']) u;
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('a2@x','b0@x'));
UPDATE user_roles SET role='analyst' WHERE user_id IN (SELECT id FROM auth.users WHERE email <> 'a1@x') AND role='owner';
INSERT INTO user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-0000000000a2','curator') ON CONFLICT DO NOTHING;
INSERT INTO user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-0000000000a1','owner')
 ON CONFLICT DO NOTHING;
INSERT INTO user_roles(user_id, role) SELECT ('00000000-0000-0000-0000-0000000000' || u)::uuid, 'analyst' FROM unnest(ARRAY['a3','a4','a5','a6','a7','a8','a9','b1']) u ON CONFLICT DO NOTHING;
INSERT INTO cases(id) VALUES ('2026-201'),('2026-202');
INSERT INTO incidents(id, case_id, incident_id) VALUES ('10000000-0000-0000-0000-000000000001','2026-201','I1'),('10000000-0000-0000-0000-000000000002','2026-202','I2');
INSERT INTO accounts(id, incident_uuid, handle) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','h1'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','h2');
INSERT INTO items(id, account_id, item_code, item_type) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','C-1','comment'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','C-2','comment'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','C-3','comment'),
 ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','C-4','comment'),
 ('30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000002','X-1','comment');

SET ROLE authenticated;
-- client by owner; project by the engagement lead
SELECT as_user('a3'); SELECT t_expect_error($q$INSERT INTO clients(code,name) VALUES ('ACME','Acme')$q$, 'row-level security');
SELECT as_user('a1'); INSERT INTO clients(id,code,name) VALUES ('50000000-0000-0000-0000-000000000001','ACME','Acme Berhad');
SELECT as_user('a3');
INSERT INTO projects(id, client_id, code, name) VALUES ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','ACME-2026-01','Mobilisation watch');
SELECT t_eq((SELECT count(*) FROM project_members WHERE role='engagement_lead'),1,'creator is engagement lead');
INSERT INTO project_members(project_id,user_id,role) VALUES
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4','lead_analyst'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a5','analyst'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a6','analyst'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a7','evidence_officer'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a8','data_steward'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a9','collection_operator'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','reviewer'),
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b0','client_viewer');
SELECT t_expect_error($q$INSERT INTO project_members(project_id,user_id,role) VALUES ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2','analyst')$q$, 'Curator is a global role');
SELECT as_user('a2'); SELECT t_eq((SELECT count(*) FROM projects),1,'curator sees every engagement');

-- before G0/G1: nothing downstream
SELECT as_user('a3');
SELECT t_expect_error($q$INSERT INTO project_cases(project_id,case_id) VALUES ('60000000-0000-0000-0000-000000000001','2026-201')$q$, 'mandate is confirmed');
SELECT t_expect_error($q$UPDATE projects SET status='active' WHERE id='60000000-0000-0000-0000-000000000001'$q$, 'only after the mandate');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate) VALUES ('60000000-0000-0000-0000-000000000001','G1')$q$, 'signed by: curator');

-- brief: only the engagement lead writes it; G0 refuses an incomplete brief and names the gaps
SELECT as_user('a5'); SELECT t_expect_error($q$INSERT INTO project_briefs(project_id, situation) VALUES ('60000000-0000-0000-0000-000000000001','x')$q$, 'Your role cannot');
SELECT as_user('a3');
INSERT INTO project_briefs(id, project_id, version, situation) VALUES ('70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001', 9, 'Calls to gather are spreading');
SELECT t_eq((SELECT version FROM project_briefs WHERE id='70000000-0000-0000-0000-000000000001'),1,'version assigned');
SELECT t_expect_error($q$INSERT INTO project_briefs(project_id, facts) VALUES ('60000000-0000-0000-0000-000000000001','[{"statement":"x","class":"GUESS"}]')$q$, 'check constraint');
INSERT INTO project_briefs(id, project_id, version, situation, facts, unknowns, purpose_decisions, objectives, ranked_asks, audiences, platforms, languages, window_from, window_to,
  sample_rule, caps, in_scope, out_of_scope, held_groups, response_parameters, constraints_risks, governance) VALUES
 ('70000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001', 0, 'Calls to gather are spreading online since 20 Oct',
  '[{"statement":"Client saw 3 posts","source":"sponsor","class":"REPORTED"}]', '{"Who is behind it"}', 'Decide whether to extend monitoring', '{"Extend monitoring?"}',
  '[{"rank":1,"ask":"Weekly count by severity","need":"need"}]', '{"affected":"Residents","recipients":"Client security lead","approver":"Sponsor"}',
  '{facebook,tiktok}', '{ms,en}', '2026-10-01','2026-11-30','last 30 posts','50 comments per post','public pages named in the target list','private groups','domestic political groups',
  '{"who_may_act":"Client security lead","approval_chain":"Sponsor then Curator","red_lines":"No contact with accounts","notify":[{"severity":"CRITICAL","who":"Security lead","how_fast":"same day","route":"phone"}]}',
  '{"legal":"CMA 1998 reviewed","data_handling":"Public content only","retention_years":5}', '{"contacts":"Sponsor, security lead","rhythm":"Weekly","signoff_roles":"Sponsor and engagement lead"}');
SELECT t_eq(cardinality(brief_missing('70000000-0000-0000-0000-000000000002')),0,'brief complete');
SELECT as_user('a2');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,sponsor_name,read_back_on) VALUES ('60000000-0000-0000-0000-000000000001','G0','Sponsor','2026-11-01')$q$, 'signed by: owner or engagement_lead');
SELECT as_user('a3');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate) VALUES ('60000000-0000-0000-0000-000000000001','G0')$q$, 'record the client sponsor');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,sponsor_name,read_back_on) VALUES ('60000000-0000-0000-0000-000000000001','G0','Sponsor','2026-11-01')$q$, 'no discovery interview');

-- discovery records
SELECT t_expect_error($q$INSERT INTO project_interviews(project_id,interviewee,interviewee_role,held_at,interviewer,note_taker) VALUES ('60000000-0000-0000-0000-000000000001','S','Sponsor',now(),'00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3')$q$, 'check constraint');
INSERT INTO project_interviews(project_id,interviewee,interviewee_role,held_at,duration_min,interviewer,note_taker,key_statements,readback_confirmed)
 VALUES ('60000000-0000-0000-0000-000000000001','Sponsor','Client sponsor',now(),60,'00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4','[{"text":"We want a weekly count","class":"FIRST_HAND"}]',true);
SELECT t_expect_error($q$INSERT INTO project_intake_items(project_id,description,received_on,sha256,sensitivity,personal_data,claim_status,use_class) VALUES ('60000000-0000-0000-0000-000000000001','Prior report',current_date,'abc','public',false,'CLIENT_CLAIM','SEED')$q$, 'check constraint');
INSERT INTO project_intake_items(project_id,description,received_on,sha256,sensitivity,personal_data,claim_status,use_class)
 VALUES ('60000000-0000-0000-0000-000000000001','Prior report',current_date,repeat('a',64),'client_confidential',false,'CLIENT_CLAIM','SEED');
SELECT t_eq((SELECT count(*) FROM project_latest_intake WHERE item_ref='RC-001'),1,'intake ref RC-001');
SELECT t_expect_error($q$INSERT INTO project_intake_items(project_id,description,received_on,sha256,sensitivity,personal_data,claim_status,use_class,declined) VALUES ('60000000-0000-0000-0000-000000000001','Leaked list',current_date,repeat('b',64),'public',true,'UNVERIFIED_THIRD_PARTY','SEED',true)$q$, 'check constraint');
SELECT as_user('a4');
INSERT INTO project_research_questions(project_id,rq_no,question,hypothesis,brief_section) VALUES ('60000000-0000-0000-0000-000000000001','RQ1','Are gatherings organised online?','Yes, via 3 pages',1);
SELECT as_user('a3');
INSERT INTO project_scenarios(project_id,scenario_no,scenario_type,name,situation,trigger_indicators,threshold,response_options,decision_owner,approver,time_frame,fa_will_say,fa_will_not_say)
 VALUES ('60000000-0000-0000-0000-000000000001','S3','mobilization','Mobilisation','INCITEMENT items name a place and date','INCITEMENT at HIGH or CRITICAL','3 per cycle (client)',
 '[{"action":"Start V2 capture","kind":"FA-INTERNAL"},{"action":"Protect the named place","kind":"CLIENT-DECISION"}]','Security lead','Curator','same day','Counts and quotes','Who is behind it');
SELECT t_expect_error($q$INSERT INTO project_scenarios(project_id,scenario_no,scenario_type,name,situation,trigger_indicators,threshold,probability,response_options,decision_owner,approver,time_frame,fa_will_say,fa_will_not_say)
 VALUES ('60000000-0000-0000-0000-000000000001','S4','narrative_spike','x','x','x','x','30%','[{"action":"a","kind":"FA-INTERNAL"}]','o','a','t','s','n')$q$, 'check constraint');
SELECT t_expect_error($q$INSERT INTO project_success_measures(project_id,measure_no,level,measure) VALUES ('60000000-0000-0000-0000-000000000001','M1','objectives','Decide on monitoring')$q$, 'check constraint');
INSERT INTO project_success_measures(project_id,measure_no,level,measure,baseline,baseline_source,target,data_source) VALUES
 ('60000000-0000-0000-0000-000000000001','M1','objectives','Decision to extend monitoring taken','none','first_window','Decision by 15 Dec','Client record'),
 ('60000000-0000-0000-0000-000000000001','M2','outputs','Comments read and flagged by severity','0','first_window','All candidates read','FA database');
SELECT t_expect_error($q$INSERT INTO project_success_measures(project_id,measure_no,level,measure,baseline,baseline_source,target,data_source) VALUES ('60000000-0000-0000-0000-000000000001','M3','impact','Effect of actions','x','client_data','y','Client')$q$, 'check constraint');
INSERT INTO project_success_measures(project_id,measure_no,level,measure,baseline,baseline_source,target,data_source,client_figure) VALUES ('60000000-0000-0000-0000-000000000001','M3','impact','Client-reported effect of its actions','x','client_data','y','Client records',true);
INSERT INTO project_success_measures(project_id,measure_no,level,measure,observable) VALUES ('60000000-0000-0000-0000-000000000001','M4','out_takes','Private-group sentiment',false);
SELECT t_expect_error($q$INSERT INTO project_success_measures(project_id,measure_no,level,measure,observable,target) VALUES ('60000000-0000-0000-0000-000000000001','M5','out_takes','Estimated sentiment',false,'guess')$q$, 'check constraint');

-- G0 signed by the engagement lead (client sponsor read back and signed)
INSERT INTO project_gates(project_id,gate,sponsor_name,sponsor_role,read_back_on,note) VALUES ('60000000-0000-0000-0000-000000000001','G0','A. Sponsor','Client sponsor','2026-11-01','Read back in plain language');
SELECT t_eq((SELECT version FROM project_briefs WHERE id = project_current_brief_id('60000000-0000-0000-0000-000000000001')),2,'baseline brief v2 in force');
SELECT t_expect_error($q$UPDATE project_briefs SET situation='changed'$q$, 'append-only|permission denied');

-- after G0: only through a numbered, Curator-approved amendment
SELECT t_expect_error($q$INSERT INTO project_success_measures(project_id,measure_no,level,measure,baseline,baseline_source,target,data_source) VALUES ('60000000-0000-0000-0000-000000000001','M6','outputs','New','0','first_window','x','y')$q$, 'need an approved amendment');
SELECT t_expect_error($q$INSERT INTO project_briefs(project_id, situation) VALUES ('60000000-0000-0000-0000-000000000001','x')$q$, 'what changed, why, and who asked');
INSERT INTO project_briefs(id, project_id, situation, change_summary, change_reason, requested_by, scope_changed, platforms, languages)
 VALUES ('70000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','Same situation','Add Threads','Client asked','Sponsor',true,'{facebook,tiktok,threads}','{ms,en}');
SELECT t_eq((SELECT amendment_no FROM project_briefs WHERE id='70000000-0000-0000-0000-000000000003'),1,'amendment A1');
SELECT t_eq((SELECT version FROM project_briefs WHERE id = project_current_brief_id('60000000-0000-0000-0000-000000000001')),2,'A1 not in force until approved');
SELECT t_expect_error($q$INSERT INTO project_amendment_approvals(project_id,brief_id,decision) VALUES ('60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','approved')$q$, 'Your role cannot');
SELECT as_user('a2');
INSERT INTO project_amendment_approvals(project_id,brief_id,decision,note) VALUES ('60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','approved','Approved by the Curator');
SELECT t_eq((SELECT version FROM project_briefs WHERE id = project_current_brief_id('60000000-0000-0000-0000-000000000001')),3,'A1 in force');
SELECT t_eq((SELECT count(*) FROM projects WHERE design_stale),1,'scope change makes the design stale');
SELECT as_user('a3');
INSERT INTO project_success_measures(project_id,measure_no,level,measure,baseline,baseline_source,target,data_source,amendment_id) VALUES ('60000000-0000-0000-0000-000000000001','M6','outputs','Threads comments read','0','first_window','All','FA database','70000000-0000-0000-0000-000000000003');

-- G1: the Curator completes the scope sheet and signs the mandate
SELECT t_expect_error($q$INSERT INTO project_scope_sheets(project_id,scope_summary) VALUES ('60000000-0000-0000-0000-000000000001','x')$q$, 'Your role cannot');
SELECT as_user('a2');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate) VALUES ('60000000-0000-0000-0000-000000000001','G1')$q$, 'scope sheet');
INSERT INTO project_scope_sheets(project_id,scope_summary,risk_screen,risk_screen_done,legal_note,mandate) VALUES ('60000000-0000-0000-0000-000000000001','Public pages only','[{"risk":"misattribution","rating":"medium","mitigation":"two readers"}]',true,'Reviewed under CMA 1998','external_release_allowed');
INSERT INTO project_gates(project_id,gate,note) VALUES ('60000000-0000-0000-0000-000000000001','G1','Scope sheet signed after risk screen');
SELECT as_user('a3'); UPDATE projects SET status='active' WHERE id='60000000-0000-0000-0000-000000000001';

-- Phase 1 design -> G2
SELECT as_user('a4');
SELECT t_expect_error($q$INSERT INTO project_design_sheets(project_id,version,lexicon_version,lexicon,exclusion_codes,sample_rule,comment_cap,comment_order,traces) VALUES ('60000000-0000-0000-0000-000000000001',0,'v1','{"ms":["x"]}','{NOT_HOSTILE}','L5',50,'newest','[{"choice":"cap","source":"S11"}]')$q$, 'name its brief section');
INSERT INTO project_design_sheets(id,project_id,version,lexicon_version,lexicon,lexicon_sample_tested,obfuscated_spellings_tested,exclusion_codes,sample_rule,comment_cap,comment_order,traces)
 VALUES ('80000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',0,'v1','{"ms":["term1"],"en":["term2"]}',true,true,'{NO_TARGET_GROUP,AMBIGUOUS_REFERENT,NOT_HOSTILE,AIMED_AT_AUTHORITIES,OUT_OF_MANDATE_HELD}','last 30 posts',50,'newest first',
 '[{"choice":"platforms","source":"S4"},{"choice":"severity wording","source":"ASSUMPTION"}]');
INSERT INTO project_targets(project_id,platform,handle,target_group,identity_resolved) VALUES ('60000000-0000-0000-0000-000000000001','facebook','Page One','Group A',true);
INSERT INTO project_targets(project_id,platform,handle,identity_resolved) VALUES ('60000000-0000-0000-0000-000000000001','facebook','Internal handle',false);
SELECT t_expect_error($q$INSERT INTO project_targets(project_id,platform,handle,identity_resolved,curator_confirmed) VALUES ('60000000-0000-0000-0000-000000000001','facebook','Internal handle',false,true)$q$, 'Only the Curator confirms');
SELECT t_expect_error($q$INSERT INTO project_cycles(project_id,cycle_no,kind) VALUES ('60000000-0000-0000-0000-000000000001',0,'baseline')$q$, 'no collection until the design is approved');
SELECT as_user('a2');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate) VALUES ('60000000-0000-0000-0000-000000000001','G2')$q$, 'assumptions');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,note) VALUES ('60000000-0000-0000-0000-000000000001','G2','Accepted')$q$, 'unresolved');
INSERT INTO project_targets(project_id,platform,handle,identity_resolved,curator_confirmed,note) VALUES ('60000000-0000-0000-0000-000000000001','facebook','Internal handle',false,true,'Confirmed real account');
INSERT INTO project_gates(project_id,gate,note) VALUES ('60000000-0000-0000-0000-000000000001','G2','Curator accepts the severity wording assumption');
SELECT t_eq((SELECT count(*) FROM projects WHERE design_stale),0,'G2 clears stale');
SELECT t_eq((SELECT design_version FROM project_gates WHERE gate='G2'),1,'G2 records design version');

-- Phase 2-3: cases linked (scope control), cycle 0, candidates
SELECT as_user('a9');
INSERT INTO project_cases(project_id,case_id) VALUES ('60000000-0000-0000-0000-000000000001','2026-201');
INSERT INTO project_cycles(project_id,cycle_no,kind,tag) VALUES ('60000000-0000-0000-0000-000000000001',7,'delta','baseline run');
SELECT t_eq((SELECT cycle_no FROM project_cycles),0,'first cycle is the baseline');
SELECT t_expect_error($q$INSERT INTO project_items(project_id,cycle_no,item_kind,item_id) VALUES ('60000000-0000-0000-0000-000000000001',0,'cloud_item','30000000-0000-0000-0000-000000000009')$q$, 'not linked to this engagement');
INSERT INTO project_items(id,project_id,cycle_no,item_kind,item_id,screen_score,matched_terms,source_line,chunk_no) VALUES
 ('90000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',0,'cloud_item','30000000-0000-0000-0000-000000000001',9.5,'{term1}','line 1',1),
 ('90000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001',0,'cloud_item','30000000-0000-0000-0000-000000000002',4,'{term2}','line 2',1),
 ('90000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001',0,'cloud_item','30000000-0000-0000-0000-000000000003',2,'{term2}','line 3',1),
 ('90000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000001',0,'cloud_item','30000000-0000-0000-0000-000000000004',1,'{term2}','dup of 3',1);
SELECT t_expect_error($q$DELETE FROM project_items$q$, 'append-only|permission denied');
SELECT t_expect_error($q$UPDATE project_items SET voided_at=now() WHERE id='90000000-0000-0000-0000-000000000004'$q$, 'needs a note');
UPDATE project_items SET voided_at=now(), void_note='Duplicate of candidate 3' WHERE id='90000000-0000-0000-0000-000000000004';
SELECT t_expect_error($q$UPDATE project_items SET note='x' WHERE id='90000000-0000-0000-0000-000000000001'$q$, 'only be voided');

-- Phase 4: reading, with the two-person rule
SELECT as_user('a8'); SELECT t_expect_error($q$INSERT INTO project_decisions(project_id,project_item_id,decision,exclusion_code,reason) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','exclude','NOT_HOSTILE','x')$q$, 'Only analysts');
SELECT as_user('a5');
SELECT t_expect_error($q$INSERT INTO project_decisions(project_id,project_item_id,decision,category,severity) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','flag','INCITEMENT','HIGH')$q$, 'check constraint');
INSERT INTO project_decisions(id,project_id,project_item_id,decision,category,severity,target_group,note,judgement_call,judgement_note) VALUES
 ('a0000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','flag','INCITEMENT','HIGH','Group A','Calls to raid a market',true,'Referent from the post thread');
INSERT INTO project_decisions(project_id,project_item_id,decision,exclusion_code,reason) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','exclude','NOT_HOSTILE','A question, not hostile');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate) VALUES ('60000000-0000-0000-0000-000000000001','G3')$q$, 'signed by');
SELECT as_user('a4');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G3',0)$q$, 'no decision');
SELECT as_user('a5');
INSERT INTO project_decisions(project_id,project_item_id,decision,category,severity,target_group,note) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','flag','GENERAL_HOSTILITY','LOW','Group A','Insult without a call to act');
SELECT as_user('a4');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G3',0)$q$, 'second reader');
SELECT as_user('a5'); SELECT t_expect_error($q$INSERT INTO project_confirmations(project_id,decision_id,result) VALUES ('60000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','confirm')$q$, 'second reader must confirm');
SELECT as_user('a6'); INSERT INTO project_confirmations(project_id,decision_id,result) VALUES ('60000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','confirm');
SELECT t_eq((SELECT count(*) FROM project_latest_decisions WHERE second_reader_confirmed),1,'second reader recorded');
SELECT as_user('a4'); INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G3',0);
SELECT as_user('a5');
SELECT t_expect_error($q$INSERT INTO project_decisions(project_id,project_item_id,decision,exclusion_code,reason) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','exclude','NOT_HOSTILE','changed my mind')$q$, 'only a Curator ruling');
SELECT t_expect_error($q$INSERT INTO project_items(project_id,cycle_no,item_kind,item_id) VALUES ('60000000-0000-0000-0000-000000000001',0,'cloud_item','30000000-0000-0000-0000-000000000009')$q$, 'read-complete|not linked');
SELECT as_user('a2');
INSERT INTO project_decisions(project_id,project_item_id,decision,category,severity,target_group,note) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','flag','GENERAL_HOSTILITY','MEDIUM','Group A','Curator ruling: expulsion wording');
SELECT t_eq((SELECT count(*) FROM project_decisions WHERE ruling),1,'curator ruling recorded');

-- Phase 5-7: evidence, tiers, load, then G4
SELECT as_user('a7');
SELECT t_expect_error($q$INSERT INTO project_captures(project_id,project_item_id,url_bar_clock_visible,screenshot_sha256,archive_link,captured_at_utc,custody_logged) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002',true,repeat('c',64),'https://archive','2026-11-02T01:00Z',true)$q$, 'Only flagged items');
INSERT INTO project_captures(project_id,project_item_id,url_bar_clock_visible,screenshot_sha256,archive_link,captured_at_utc,custody_logged) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',true,repeat('c',64),'https://archive/1','2026-11-02T01:00Z',true);
SELECT t_expect_error($q$INSERT INTO project_item_tiers(project_id,project_item_id,tier) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','FA_STD_001_V2')$q$, 'two-person check');
INSERT INTO project_captures(project_id,project_item_id,url_bar_clock_visible,screenshot_sha256,archive_link,captured_at_utc,custody_logged,second_person_check_by) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',true,repeat('c',64),'https://archive/1','2026-11-02T01:05Z',true,'00000000-0000-0000-0000-0000000000a4');
INSERT INTO project_item_tiers(project_id,project_item_id,tier) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','FA_STD_001_V2');
SELECT as_user('a8');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G4',0)$q$, 'no reconciled');
INSERT INTO project_load_reports(project_id,cycle_no,counts_before,counts_after,expected_new,single_transaction,case_folder_ref,manifest_sha256,register_entry_ref) VALUES ('60000000-0000-0000-0000-000000000001',0,'{"comments":100}','{"comments":103}','{"comments":2}',true,'01_Intake/CASE_x',repeat('d',64),'CASE_REGISTER#7');
SELECT t_eq((SELECT count(*) FROM project_load_reports WHERE reconciled),0,'counts do not reconcile');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G4',0)$q$, 'no reconciled');
INSERT INTO project_load_reports(project_id,cycle_no,counts_before,counts_after,expected_new,single_transaction,case_folder_ref,manifest_sha256,register_entry_ref) VALUES ('60000000-0000-0000-0000-000000000001',0,'{"comments":100}','{"comments":103}','{"comments":3}',true,'01_Intake/CASE_x',repeat('d',64),'CASE_REGISTER#7');
SELECT t_eq((SELECT count(*) FROM project_load_reports WHERE reconciled),1,'counts reconcile');
SELECT as_user('a7'); SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G4',0)$q$, 'no evidence tier');
INSERT INTO project_item_tiers(project_id,project_item_id,tier,note) VALUES ('60000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','API_RAW_ONLY','API text only');
INSERT INTO project_gates(project_id,gate,cycle_no) VALUES ('60000000-0000-0000-0000-000000000001','G4',0);

-- Phase 8: executive brief must report against the brief
SELECT as_user('a4');
INSERT INTO project_outputs(id,project_id,brief_id,kind,title,cycle_nos) VALUES ('b0000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
  project_current_brief_id('60000000-0000-0000-0000-000000000001'),'executive_brief','Executive brief – cycle 0','{0}');
SELECT t_expect_error($q$UPDATE project_outputs SET status='qa_review' WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'attribution');
UPDATE project_outputs SET attribution_checked=true WHERE id='b0000000-0000-0000-0000-000000000001';
SELECT t_expect_error($q$UPDATE project_outputs SET status='qa_review' WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'file');
UPDATE project_outputs SET sha256=repeat('e',64), file_name='brief.pdf' WHERE id='b0000000-0000-0000-0000-000000000001';
SELECT t_expect_error($q$UPDATE project_outputs SET status='qa_review' WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'RQ1');
INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,finding,counts) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','research_question','RQ1','Calls to gather appear in 2 flagged items',' {"flagged":2}');
INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,finding) VALUES
 ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M1','Decision pending: baseline none, target 15 Dec'),
 ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M2','3 of 3 candidates read'),
 ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M6','0 Threads comments in cycle 0');
SELECT t_expect_error($q$INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,finding) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M3','Estimated impact')$q$, 'client-supplied');
INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,finding,client_figure) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M3','Client reports X (client figure)',true);
SELECT t_expect_error($q$INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,finding) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M4','Estimated sentiment')$q$, 'out of reach');
INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,out_of_reach) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','success_measure','M4',true);
SELECT t_expect_error($q$UPDATE project_outputs SET status='qa_review' WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'S3');
SELECT t_expect_error($q$INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,met) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','scenario_watch','S3',false)$q$, 'counts and the tier');
INSERT INTO project_report_entries(project_id,output_id,entry_kind,ref_key,met,counts,evidence_tier) VALUES ('60000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','scenario_watch','S3',false,'{"incitement_high_critical":1}','FA_STD_001_V2');
UPDATE project_outputs SET status='qa_review' WHERE id='b0000000-0000-0000-0000-000000000001';
SELECT t_expect_error($q$UPDATE project_outputs SET status='held' WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'not by the author');
SELECT as_user('a3');
UPDATE project_outputs SET status='held' WHERE id='b0000000-0000-0000-0000-000000000001';
SELECT t_expect_error($q$UPDATE project_outputs SET sha256=repeat('f',64) WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'fixed');
SELECT t_expect_error($q$UPDATE project_outputs SET status='released' WHERE id='b0000000-0000-0000-0000-000000000001'$q$, 'only happens through gate G5');
SELECT as_user('a4');
INSERT INTO project_outputs(id,project_id,brief_id,kind,title,cycle_nos,attribution_checked,sha256,file_name) VALUES ('b0000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001',
  project_current_brief_id('60000000-0000-0000-0000-000000000001'),'release_pack','Release pack','{0}',true,repeat('1',64),'pack.zip');
UPDATE project_outputs SET attribution_checked=true, sha256=repeat('1',64), file_name='pack.zip' WHERE id='b0000000-0000-0000-0000-000000000002';
SELECT t_expect_error($q$UPDATE project_outputs SET status='qa_review' WHERE id='b0000000-0000-0000-0000-000000000002'$q$, 'limits statement');

-- Phase 9: G5 (Curator, written approval); default state is HELD
SELECT as_user('a3');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,output_id) VALUES ('60000000-0000-0000-0000-000000000001','G5','b0000000-0000-0000-0000-000000000001')$q$, 'signed by: curator');
SELECT as_user('a2');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,output_id) VALUES ('60000000-0000-0000-0000-000000000001','G5','b0000000-0000-0000-0000-000000000001')$q$, 'recipient');
SELECT t_expect_error($q$INSERT INTO project_gates(project_id,gate,output_id,recipient,written_approval_ref) VALUES ('60000000-0000-0000-0000-000000000001','G5','b0000000-0000-0000-0000-000000000002','Client sponsor','EMAIL-2026-11-02')$q$, 'must have passed QA|HELD');
INSERT INTO project_gates(project_id,gate,output_id,recipient,written_approval_ref,note) VALUES ('60000000-0000-0000-0000-000000000001','G5','b0000000-0000-0000-0000-000000000001','Client sponsor, A. Sponsor','EMAIL-2026-11-02 Curator approval','Logged with file hash');
SELECT t_eq((SELECT count(*) FROM project_outputs WHERE status='released' AND released_at IS NOT NULL),1,'released through G5');
SELECT as_user('a3'); UPDATE projects SET status='delivered' WHERE id='60000000-0000-0000-0000-000000000001';
UPDATE project_outputs SET shared_with_client=true WHERE id='b0000000-0000-0000-0000-000000000001';

-- client portal is off: the client viewer sees nothing
SELECT as_user('b0');
SELECT t_eq((SELECT count(*) FROM projects),0,'portal off: no engagement');
SELECT t_eq((SELECT count(*) FROM project_outputs),0,'portal off: no outputs');
SELECT t_eq((SELECT count(*) FROM project_decisions),0,'client never sees decisions');
SELECT as_user('a1'); UPDATE clients SET portal_enabled=true;
SELECT as_user('b0');
SELECT t_eq((SELECT count(*) FROM projects),1,'portal on: engagement visible');
SELECT t_eq((SELECT count(*) FROM project_current_briefs),1,'portal on: brief in force only');
SELECT t_eq((SELECT count(*) FROM project_briefs),1,'portal on: not the drafts');
SELECT t_eq((SELECT count(*) FROM project_outputs),1,'portal on: released and shared output');
SELECT t_eq((SELECT count(*) FROM project_items),0,'portal on: no candidates');
SELECT t_eq((SELECT count(*) FROM project_events),0,'portal on: no log');

-- reviewers read, never write
SELECT as_user('b1');
SELECT t_eq((SELECT count(*) FROM project_decisions),4,'reviewer reads');
SELECT t_expect_error($q$INSERT INTO project_research_questions(project_id,rq_no,question,brief_section) VALUES ('60000000-0000-0000-0000-000000000001','RQ9','x',1)$q$, 'Your role cannot');

-- Phase 10: delta cycle after G4; re-run same day gets a tag; close-out
SELECT as_user('a9'); INSERT INTO project_cycles(project_id,cycle_no,kind,tag) VALUES ('60000000-0000-0000-0000-000000000001',0,'baseline','delta 2 – 14:00');
SELECT t_eq((SELECT max(cycle_no) FROM project_cycles),1,'delta cycle 1');
SELECT as_user('a3');
SELECT t_expect_error($q$INSERT INTO project_closeouts(project_id,design_frozen_version,archive_ref,archive_manifest_sha256,lessons_learned) VALUES ('60000000-0000-0000-0000-000000000001',1,'archive/x',repeat('9',64),'Lessons')$q$, 'G4');
SELECT t_expect_error($q$UPDATE projects SET status='closed' WHERE id='60000000-0000-0000-0000-000000000001'$q$, 'close-out');
SELECT t_expect_error($q$UPDATE projects SET design_stale=true$q$, 'managed by');

-- design change after G2 needs G2 again
SELECT as_user('a4');
INSERT INTO project_design_sheets(project_id,version,lexicon_version,lexicon,lexicon_sample_tested,obfuscated_spellings_tested,exclusion_codes,sample_rule,comment_cap,comment_order,traces)
 VALUES ('60000000-0000-0000-0000-000000000001',0,'v2','{"ms":["term1","term3"]}',true,true,'{NOT_HOSTILE}','last 30 posts',50,'newest first','[{"choice":"new term","source":"S4"}]');
SELECT t_eq((SELECT count(*) FROM projects WHERE design_stale),1,'new design version needs G2 again');
SELECT as_user('a5'); SELECT t_expect_error($q$INSERT INTO project_items(project_id,cycle_no,item_kind,item_id) VALUES ('60000000-0000-0000-0000-000000000001',1,'cloud_item','30000000-0000-0000-0000-000000000004')$q$, 'design is approved and current');
SELECT as_user('a2'); INSERT INTO project_gates(project_id,gate) VALUES ('60000000-0000-0000-0000-000000000001','G2');
SELECT t_eq((SELECT count(*) FROM project_gates WHERE gate='G2'),2,'G2 signed for v2');
SELECT t_expect_error($q$UPDATE project_gates SET note='x'$q$, 'append-only|permission denied');

-- the engagement log
SELECT as_user('a3');
SELECT t_eq((SELECT count(*) FROM project_events WHERE action='gates:insert'),7,'every gate signature is logged (G0-G5 and the second G2)');
RESET ROLE;
SELECT 'ALL ENGAGEMENT CHECKS PASSED' AS result;
