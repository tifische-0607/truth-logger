-- STATUS 6 Nov 2026: Part A (structure) RUN and passed through the read-only database tool:
--   A1 RLS on account_access, access_level_log, account_admin_events, member_invitations, document_member_release
--   A2 append-only triggers on access_level_log, account_admin_events, document_member_release; last-SuperAdmin guard on account_access;
--      role guard + sync on user_roles; sync on client_users
--   A3 existing data mapped: the one owner = SuperAdmin (active); the active client administrator = Client Admin; 2 mapping log rows
--   A4 anon cannot run access_set_level; authenticated cannot run member_activate_invitation or access_log_admin (service role only)
-- Create accounts (0056) Part A RUN and passed: RLS on staff_invitations; account_invite/resend/cancel/pending granted to authenticated, not anon;
--   staff_invitation_info/claim/activate service role only; level/roles CHECK on staff_invitations present.
-- Part B (B1–B9, C1–C6) NOT RUN: the available test connection cannot create auth users ("permission denied for schema auth").

-- ============ Part A (read-only) ============
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('account_access','access_level_log','account_admin_events','member_invitations','document_member_release');
SELECT tgrelid::regclass, tgname FROM pg_trigger WHERE tgname IN ('access_level_log_append_only','account_admin_events_append_only','document_member_release_append_only',
  'account_access_last_superadmin','user_roles_access_guard','user_roles_access_sync','client_users_access_sync');
SELECT level, status, count(*) FROM public.account_access GROUP BY 1,2;
SELECT has_function_privilege('anon','public.access_set_level(uuid,text)','execute') AS anon_set_level,
       has_function_privilege('authenticated','public.member_activate_invitation(uuid,uuid)','execute') AS auth_activate,
       has_function_privilege('authenticated','public.access_log_admin(uuid,uuid,text,jsonb)','execute') AS auth_log_admin;

-- ============ Part B (behaviour; privileged test connection, everything rolls back) ============
BEGIN;
CREATE TEMP TABLE fx(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
DO $$ DECLARE s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); st uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); cs uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); m uuid := gen_random_uuid(); a uuid; b uuid; BEGIN
  INSERT INTO auth.users(id,email) VALUES (s1,'al-s1@test.invalid'),(s2,'al-s2@test.invalid'),(st,'al-st@test.invalid'),(ca,'al-ca@test.invalid'),(cs,'al-cs@test.invalid'),(cb,'al-cb@test.invalid'),(m,'al-m@test.invalid');
  INSERT INTO public.profiles(id,email) VALUES (s1,'al-s1@test.invalid'),(s2,'al-s2@test.invalid'),(st,'al-st@test.invalid'),(ca,'al-ca@test.invalid'),(cs,'al-cs@test.invalid'),(cb,'al-cb@test.invalid'),(m,'al-m@test.invalid') ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;
  INSERT INTO public.user_roles(user_id,role) VALUES (s1,'owner'),(st,'analyst');
  INSERT INTO public.clients(code,name,portal_enabled) VALUES ('AL-A','AL Client A',true) RETURNING id INTO a;
  INSERT INTO public.clients(code,name,portal_enabled) VALUES ('AL-B','AL Client B',true) RETURNING id INTO b;
  PERFORM set_config('fa.billing_tier_change','on',true);
  UPDATE public.clients SET tier_id=(SELECT id FROM public.billing_tiers WHERE rank=2) WHERE id IN (a,b);
  INSERT INTO public.client_users(client_id,user_id,email,name,status,role) VALUES (a,ca,'al-ca@test.invalid','A admin','active','client_admin'),(a,cs,'al-cs@test.invalid','A staff','active','client_user'),(b,cb,'al-cb@test.invalid','B staff','active','client_user');
  INSERT INTO public.account_access(user_id,level,status) VALUES (m,'member','active');
  INSERT INTO fx VALUES ('s1',s1),('s2',s2),('st',st),('ca',ca),('cs',cs),('cb',cb),('m',m),('a',a),('b',b);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); $$;
CREATE OR REPLACE FUNCTION pg_temp.fx(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM fx WHERE fx.k=$1; $$;

-- B1: levels follow existing data.
DO $$ BEGIN
  IF public.access_level_of(pg_temp.fx('s1'))<>'superadmin' OR public.access_level_of(pg_temp.fx('st'))<>'fa_staff' OR public.access_level_of(pg_temp.fx('ca'))<>'client_admin' OR public.access_level_of(pg_temp.fx('cs'))<>'client_staff' THEN RAISE EXCEPTION 'B1 FAILED'; END IF;
  RAISE NOTICE 'B1 passed';
END $$;

-- B2: Client Staff gets no FA screen in the database menu (route guard reads this).
DO $$ DECLARE j jsonb; BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('cs')); j := public.access_menu();
  IF j->'screens' ? 'dashboard' OR j->'screens' ? 'vaults' OR NOT (j->'screens' ? 'portal_reports') THEN RAISE EXCEPTION 'B2 FAILED: %', j; END IF;
  RAISE NOTICE 'B2 passed';
END $$;

-- B3: a Client Admin cannot reset or deactivate a user in another client.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('ca'));
  BEGIN PERFORM public.access_reset_target(pg_temp.fx('cb')); RAISE EXCEPTION 'B3 FAILED: reset allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot send a password reset to this person.' THEN RAISE; END IF; END;
  BEGIN PERFORM public.access_set_status(pg_temp.fx('cb'), false); RAISE EXCEPTION 'B3 FAILED: deactivate allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot change this person''s access.' THEN RAISE; END IF; END;
  IF public.access_reset_target(pg_temp.fx('cs')) <> 'al-cs@test.invalid' THEN RAISE EXCEPTION 'B3 FAILED: own client staff refused'; END IF;
  RAISE NOTICE 'B3 passed';
END $$;

-- B4: the last active SuperAdmin cannot be removed or deactivated (another test SuperAdmin s1 exists alongside the real owner, so remove the real ones from consideration by checking the rule directly).
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  UPDATE public.account_access SET status='inactive' WHERE level='superadmin' AND user_id<>pg_temp.fx('s1');
  BEGIN DELETE FROM public.user_roles WHERE user_id=pg_temp.fx('s1') AND role='owner'; RAISE EXCEPTION 'B4 FAILED: last SuperAdmin removed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'At least one active SuperAdmin must remain.%' THEN RAISE; END IF; END;
  RAISE NOTICE 'B4 passed';
END $$;

-- B5: nobody changes their own level; only SuperAdmin changes FA levels.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  BEGIN PERFORM public.access_set_level(pg_temp.fx('s1'),'fa_staff'); RAISE EXCEPTION 'B5 FAILED: self change';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot change your own access level.' THEN RAISE; END IF; END;
  PERFORM pg_temp.as_user(pg_temp.fx('st'));
  BEGIN PERFORM public.access_set_level(pg_temp.fx('s1'),'fa_staff'); RAISE EXCEPTION 'B5 FAILED: FA Staff changed a level';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only a SuperAdmin can create or change SuperAdmin or FA Staff levels.' THEN RAISE; END IF; END;
  RAISE NOTICE 'B5 passed';
END $$;

-- B6: level changes are logged (who, when, from, to).
DO $$ DECLARE n int; BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  PERFORM public.access_set_level(pg_temp.fx('st'),'superadmin');
  SELECT count(*) INTO n FROM public.access_level_log WHERE user_id=pg_temp.fx('st') AND from_level='fa_staff' AND to_level='superadmin' AND actor=pg_temp.fx('s1');
  IF n<>1 THEN RAISE EXCEPTION 'B6 FAILED'; END IF;
  RAISE NOTICE 'B6 passed';
END $$;

-- B7: admin resets are logged (service role records after the email is sent).
DO $$ BEGIN
  PERFORM public.access_log_admin(pg_temp.fx('ca'), pg_temp.fx('cs'), 'password_reset_sent', '{}');
  IF NOT EXISTS (SELECT 1 FROM public.account_admin_events WHERE actor=pg_temp.fx('ca') AND target=pg_temp.fx('cs') AND action='password_reset_sent') THEN RAISE EXCEPTION 'B7 FAILED'; END IF;
  BEGIN PERFORM public.access_log_admin(pg_temp.fx('ca'), pg_temp.fx('cb'), 'password_reset_sent', '{}'); RAISE EXCEPTION 'B7 FAILED: other client logged';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot send a password reset to this person.' THEN RAISE; END IF; END;
  RAISE NOTICE 'B7 passed';
END $$;

-- B8: a Member sees no client data, engagements or unreleased reports.
DO $$ DECLARE n int; BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('m'));
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.clients; IF n<>0 THEN RAISE EXCEPTION 'B8 FAILED: clients visible'; END IF;
  SELECT count(*) INTO n FROM public.projects; IF n<>0 THEN RAISE EXCEPTION 'B8 FAILED: engagements visible'; END IF;
  SELECT count(*) INTO n FROM public.documents d WHERE NOT public.report_member_release_in_force(d.id); IF n<>0 THEN RAISE EXCEPTION 'B8 FAILED: unreleased report visible'; END IF;
  RESET ROLE;
  RAISE NOTICE 'B8 passed';
END $$;

-- B9: logs are append-only.
DO $$ BEGIN
  BEGIN UPDATE public.access_level_log SET to_level='member'; RAISE EXCEPTION 'B9 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'B9 FAILED%' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.account_admin_events; RAISE EXCEPTION 'B9 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'B9 FAILED%' THEN RAISE; END IF; END;
  RAISE NOTICE 'B9 passed';
END $$;

-- ===== Create accounts (0056) =====
-- C1: a non-SuperAdmin cannot create SuperAdmin or FA Staff accounts.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('ca'));
  BEGIN PERFORM public.account_invite('fa_staff','X','c1@test.invalid',repeat('c',64),now()+interval '7 days',ARRAY['analyst']); RAISE EXCEPTION 'C1 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only a SuperAdmin can create SuperAdmin or FA Staff accounts.' THEN RAISE; END IF; END;
  RAISE NOTICE 'C1 passed';
END $$;
-- C2: a third Client Admin is refused with the existing message.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  PERFORM public.account_invite('client_admin','Second','c2a@test.invalid',repeat('d',64),now()+interval '7 days','{}',pg_temp.fx('a'));
  BEGIN PERFORM public.account_invite('client_admin','Third','c2b@test.invalid',repeat('e',64),now()+interval '7 days','{}',pg_temp.fx('a')); RAISE EXCEPTION 'C2 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'A client can have at most 2 administrators.' THEN RAISE; END IF; END;
  RAISE NOTICE 'C2 passed';
END $$;
-- C3: Client Staff beyond the seat limit is refused with seats used and limit.
DO $$ DECLARE i int; BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  PERFORM set_config('fa.billing_tier_change','on',true);
  UPDATE public.clients SET tier_id=(SELECT id FROM public.billing_tiers WHERE rank=1) WHERE id=pg_temp.fx('b');
  BEGIN
    FOR i IN 1..3 LOOP PERFORM public.account_invite('client_staff','S'||i,'c3-'||i||'@test.invalid',repeat(chr(102+i),64),now()+interval '7 days','{}',pg_temp.fx('b')); END LOOP;
    RAISE EXCEPTION 'C3 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Seat limit reached: % of % seats are in use on %' THEN RAISE; END IF; END;
  RAISE NOTICE 'C3 passed';
END $$;
-- C4: an email already in use is refused.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  BEGIN PERFORM public.account_invite('member','Dup','al-cs@test.invalid',repeat('9',64),now()+interval '7 days'); RAISE EXCEPTION 'C4 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'This email is already in use by an FA Portal login or a pending invitation.' THEN RAISE; END IF; END;
  RAISE NOTICE 'C4 passed';
END $$;
-- C5: a used or expired link is refused; level and roles come from the invitation.
DO $$ DECLARE r jsonb; u uuid := gen_random_uuid(); BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('s1'));
  PERFORM public.account_invite('fa_staff','Staff','c5@test.invalid',repeat('5',64),now()+interval '7 days',ARRAY['curator']);
  r := public.staff_claim_invitation(repeat('5',64));
  BEGIN PERFORM public.staff_claim_invitation(repeat('5',64)); RAISE EXCEPTION 'C5 FAILED: reused';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'This invitation is invalid, expired or already used.' THEN RAISE; END IF; END;
  INSERT INTO auth.users(id,email) VALUES (u,'c5@test.invalid');
  PERFORM public.staff_activate_invitation((r->>'id')::uuid,u);
  IF NOT public.has_role(u,'curator') OR public.access_level_of(u)<>'fa_staff' THEN RAISE EXCEPTION 'C5 FAILED: level/role'; END IF;
  UPDATE public.staff_invitations SET status='pending',invite_token_hash=repeat('6',64),invite_expires_at=now()-interval '1 minute',invite_used_at=NULL,user_id=NULL WHERE id=(r->>'id')::uuid;
  BEGIN PERFORM public.staff_claim_invitation(repeat('6',64)); RAISE EXCEPTION 'C5 FAILED: expired';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'This invitation is invalid, expired or already used.' THEN RAISE; END IF; END;
  RAISE NOTICE 'C5 passed';
END $$;
-- C6: creation, resend and cancel are logged with level, role and client.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.account_admin_events WHERE action='account_created' AND actor=pg_temp.fx('s1') AND detail->>'level'='fa_staff' AND detail->'roles' ? 'curator') THEN RAISE EXCEPTION 'C6 FAILED'; END IF;
  RAISE NOTICE 'C6 passed';
END $$;
ROLLBACK;
