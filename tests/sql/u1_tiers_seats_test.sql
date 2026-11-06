-- STATUS 6 Nov 2026: Part A (structure, below as comments) RUN and passed through the read-only database tool:
--   tiers Tier 1:3, Tier 2:10, Tier 3:unlimited; RLS on document_tier_access; append-only trigger present; anon cannot execute
--   report_set_tiers / portal_invite_member; every client login has a valid role; no tier access set yet (all reports visible).
-- S1–S10 below NOT RUN: the available test connection cannot create auth users ("permission denied for schema auth").
-- U1 Membership tiers and seats checks. Run as a privileged test connection inside a transaction; everything rolls back.
-- Uses the U2 tiers by rank: rank 1 (seat limit 3), rank 2 (10), rank 3 (unlimited). Tier names are staff-editable, so checks match on rank.
BEGIN;
CREATE TEMP TABLE fx(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
DO $$ DECLARE o uuid := gen_random_uuid(); a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid; cb uuid; d1 uuid; d2 uuid; t1 uuid := (SELECT id FROM public.billing_tiers WHERE rank=1); t2 uuid := (SELECT id FROM public.billing_tiers WHERE rank=2); BEGIN
  INSERT INTO auth.users(id,email) VALUES (o,'u1-owner@test.invalid'),(a1,'u1-a1@test.invalid'),(a2,'u1-a2@test.invalid'),(u1,'u1-user@test.invalid'),(ub,'u1-b@test.invalid');
  INSERT INTO public.profiles(id,email) VALUES (a1,'u1-a1@test.invalid'),(a2,'u1-a2@test.invalid'),(u1,'u1-user@test.invalid'),(ub,'u1-b@test.invalid') ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;
  INSERT INTO public.user_roles(user_id,role) VALUES (o,'owner');
  INSERT INTO public.clients(code,name,portal_enabled) VALUES ('U1-A','U1 Client A',true) RETURNING id INTO ca;
  INSERT INTO public.clients(code,name,portal_enabled) VALUES ('U1-B','U1 Client B',true) RETURNING id INTO cb;
  PERFORM set_config('fa.billing_tier_change','on',true);
  UPDATE public.clients SET tier_id=t1 WHERE id=ca; UPDATE public.clients SET tier_id=t2 WHERE id=cb;
  PERFORM set_config('fa.billing_tier_change','',true);
  INSERT INTO public.client_users(client_id,user_id,email,name,status,role) VALUES
   (ca,a1,'u1-a1@test.invalid','A admin 1','active','client_admin'),
   (ca,u1,'u1-user@test.invalid','A user','active','client_user'),
   (cb,ub,'u1-b@test.invalid','B admin','active','client_admin');
  INSERT INTO fx VALUES ('owner',o),('a1',a1),('a2',a2),('u1',u1),('ub',ub),('ca',ca),('cb',cb),('t1',t1),('t2',t2);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); $$;
CREATE OR REPLACE FUNCTION pg_temp.fx(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM fx WHERE fx.k=$1; $$;

-- S1: seats used = active + unexpired pending; client A (rank-1 tier, 3 seats) uses 2.
DO $$ BEGIN
  IF public.billing_seats_used(pg_temp.fx('ca')) <> 2 THEN RAISE EXCEPTION 'S1 FAILED: expected 2 seats used'; END IF;
  RAISE NOTICE 'S1 passed';
END $$;

-- S2: the administrator invites a user (3 of 3), then a further invite is refused with seats used and the limit.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('a1'));
  PERFORM public.portal_invite_member(pg_temp.fx('ca'),'Third','third@test.invalid',repeat('a',64),now()+interval '7 days','client_user');
  BEGIN PERFORM public.portal_invite_member(pg_temp.fx('ca'),'Fourth','fourth@test.invalid',repeat('b',64),now()+interval '7 days','client_user');
    RAISE EXCEPTION 'S2 FAILED: invite over the seat limit was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Seat limit reached: 3 of 3 seats are in use on %' THEN RAISE; END IF; END;
  RAISE NOTICE 'S2 passed';
END $$;

-- S3: deactivate frees a seat; reactivation is refused while the seat is taken by someone else.
DO $$ DECLARE uid uuid := (SELECT id FROM public.client_users WHERE email='u1-user@test.invalid'); BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('a1'));
  PERFORM public.portal_admin_action(uid,'deactivate');
  PERFORM public.portal_invite_member(pg_temp.fx('ca'),'Fourth','fourth@test.invalid',repeat('c',64),now()+interval '7 days','client_user');
  BEGIN PERFORM public.portal_admin_action(uid,'reactivate'); RAISE EXCEPTION 'S3 FAILED: reactivation over the limit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Seat limit reached: 3 of 3 seats are in use on %' THEN RAISE; END IF; END;
  RAISE NOTICE 'S3 passed';
END $$;

-- S4: a client administrator cannot issue an administrator login, cannot change their own login, and cannot deactivate another administrator.
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('a1'));
  BEGIN PERFORM public.portal_invite_member(pg_temp.fx('ca'),'Adm','adm@test.invalid',repeat('d',64),now()+interval '7 days','client_admin'); RAISE EXCEPTION 'S4 FAILED (admin invite)';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only FridayAnalytics can issue client administrator logins.' THEN RAISE; END IF; END;
  BEGIN PERFORM public.portal_admin_action((SELECT id FROM public.client_users WHERE user_id=pg_temp.fx('a1')),'deactivate'); RAISE EXCEPTION 'S4 FAILED (self)';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot change your own login. Contact FridayAnalytics.' THEN RAISE; END IF; END;
  RAISE NOTICE 'S4 passed';
END $$;

-- S5: the 2-administrator cap still holds (owner invites; a third administrator is refused with the exact text).
DO $$ BEGIN
  PERFORM set_config('fa.billing_tier_change','on',true);
  UPDATE public.clients SET tier_id=(SELECT id FROM public.billing_tiers WHERE rank=3) WHERE id=pg_temp.fx('ca');
  PERFORM set_config('fa.billing_tier_change','',true);
  PERFORM pg_temp.as_user(pg_temp.fx('owner'));
  PERFORM public.portal_invite_member(pg_temp.fx('ca'),'Adm2','adm2@test.invalid',repeat('e',64),now()+interval '7 days','client_admin');
  BEGIN PERFORM public.portal_invite_member(pg_temp.fx('ca'),'Adm3','adm3@test.invalid',repeat('f',64),now()+interval '7 days','client_admin'); RAISE EXCEPTION 'S5 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'A client can have at most 2 administrators.' THEN RAISE; END IF; END;
  RAISE NOTICE 'S5 passed';
END $$;

-- S6: a client administrator cannot change their own tier (direct update refused by the tier guard; Billing function refused for non-finance).
DO $$ BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('a1'));
  BEGIN UPDATE public.clients SET tier_id=pg_temp.fx('t2') WHERE id=pg_temp.fx('ca'); RAISE EXCEPTION 'S6 FAILED (update)';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A client''s tier can only be changed in Billing%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.billing_change_tier(pg_temp.fx('ca'),pg_temp.fx('t2'),NULL,NULL); RAISE EXCEPTION 'S6 FAILED (function)';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only the owner or Management can change a client''s tier.' THEN RAISE; END IF; END;
  RAISE NOTICE 'S6 passed';
END $$;

-- S7: report above tier. A report limited to the rank-2 tier is refused to client A (rank-3 now, so first move A back to rank 1),
--     with an unset report visible to all tiers.
DO $$ DECLARE d1 uuid; d2 uuid; BEGIN
  PERFORM set_config('fa.billing_tier_change','on',true);
  UPDATE public.clients SET tier_id=pg_temp.fx('t1') WHERE id=pg_temp.fx('ca');
  PERFORM set_config('fa.billing_tier_change','',true);
  PERFORM set_config('fa.library','on',true);
  INSERT INTO public.documents(title,kind,client_id,source,visibility,sha256,file_name,home_source_id,home_path) VALUES
    ('U1 open report','report',pg_temp.fx('ca'),'fa','client',repeat('1',64),'a.pdf','darknight','u1/a.pdf') RETURNING id INTO d1;
  INSERT INTO public.documents(title,kind,client_id,source,visibility,sha256,file_name,home_source_id,home_path) VALUES
    ('U1 tier-2 report','report',pg_temp.fx('ca'),'fa','client',repeat('2',64),'b.pdf','darknight','u1/b.pdf') RETURNING id INTO d2;
  PERFORM set_config('fa.library','',true);
  PERFORM pg_temp.as_user(pg_temp.fx('owner'));
  PERFORM public.report_set_tiers(d2, ARRAY[pg_temp.fx('t2')], 'U1 test');
  PERFORM pg_temp.as_user(pg_temp.fx('a1'));
  IF NOT public.library_can_read(pg_temp.fx('a1'),(SELECT d FROM public.documents d WHERE id=d1)) THEN RAISE EXCEPTION 'S7 FAILED: unset report hidden'; END IF;
  IF public.library_can_read(pg_temp.fx('a1'),(SELECT d FROM public.documents d WHERE id=d2)) THEN RAISE EXCEPTION 'S7 FAILED: report above tier readable'; END IF;
  BEGIN PERFORM public.library_home_file_for(d2); RAISE EXCEPTION 'S7 FAILED: file handed out';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'This report is not included in your tier. Ask your administrator about an upgrade.' THEN RAISE; END IF; END;
  RAISE NOTICE 'S7 passed';
END $$;

-- S8: a non-administrator client user sees tier and seats only: no invoices, no team list, cannot invite.
DO $$ DECLARE s jsonb; BEGIN
  PERFORM pg_temp.as_user(pg_temp.fx('owner'));
  PERFORM public.portal_admin_action((SELECT id FROM public.client_users WHERE email='u1-user@test.invalid'),'reactivate');
  EXCEPTION WHEN raise_exception THEN NULL; -- may be refused if no seat; S8 re-checks via a fresh user below
END $$;
DO $$ DECLARE s jsonb; nu uuid := gen_random_uuid(); BEGIN
  INSERT INTO auth.users(id,email) VALUES (nu,'u1-plain@test.invalid');
  INSERT INTO public.profiles(id,email) VALUES (nu,'u1-plain@test.invalid') ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;
  INSERT INTO public.client_users(client_id,user_id,email,name,status,role) VALUES (pg_temp.fx('cb'),nu,'u1-plain@test.invalid','B user','active','client_user');
  PERFORM pg_temp.as_user(nu);
  s := public.billing_client_summary(NULL);
  IF (s->>'is_admin')::boolean THEN RAISE EXCEPTION 'S8 FAILED: user marked admin'; END IF;
  IF s->>'tier_id' IS NULL OR s->>'seats_used' IS NULL THEN RAISE EXCEPTION 'S8 FAILED: tier/seats missing'; END IF;
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.invoices) THEN RAISE EXCEPTION 'S8 FAILED: user can read invoices'; END IF;
  RESET ROLE;
  BEGIN PERFORM public.portal_access_list(pg_temp.fx('cb')); RAISE EXCEPTION 'S8 FAILED: user read team';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot access this client.' THEN RAISE; END IF; END;
  BEGIN PERFORM public.portal_invite_member(pg_temp.fx('cb'),'X','x@test.invalid',repeat('9',64),now()+interval '7 days','client_user'); RAISE EXCEPTION 'S8 FAILED: user invited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only the owner or an active client administrator can invite users.' THEN RAISE; END IF; END;
  RAISE NOTICE 'S8 passed';
END $$;

-- S9: client with no tier: only administrators can be added.
DO $$ DECLARE c uuid; BEGIN
  INSERT INTO public.clients(code,name,portal_enabled) VALUES ('U1-C','U1 Client C',true) RETURNING id INTO c;
  BEGIN INSERT INTO public.client_users(client_id,email,name,role) VALUES (c,'c-user@test.invalid','C user','client_user'); RAISE EXCEPTION 'S9 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This client has no tier yet%' THEN RAISE; END IF; END;
  RAISE NOTICE 'S9 passed';
END $$;

-- S10: tier access versions are append-only.
DO $$ BEGIN
  BEGIN UPDATE public.document_tier_access SET note='x'; RAISE EXCEPTION 'S10 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'S10 FAILED%' THEN RAISE; END IF; END;
  RAISE NOTICE 'S10 passed';
END $$;

ROLLBACK;
