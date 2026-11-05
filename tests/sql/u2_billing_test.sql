-- U2 Pricing, upgrade requests and billing checks. Run as a privileged test connection inside a transaction; rolls back.
BEGIN;
-- Fixtures: owner, analyst, two client organisations (A, B) each with an active client administrator.
CREATE TEMP TABLE fx(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
DO $$ DECLARE o uuid := gen_random_uuid(); an uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ca uuid; cb uuid; BEGIN
  INSERT INTO auth.users(id,email) VALUES (o,'u2-owner@test.invalid'),(an,'u2-analyst@test.invalid'),(ua,'u2-a@test.invalid'),(ub,'u2-b@test.invalid');
  INSERT INTO public.user_roles(user_id,role) VALUES (o,'owner'),(an,'analyst');
  INSERT INTO public.clients(code,name) VALUES ('U2-A','U2 Client A') RETURNING id INTO ca;
  INSERT INTO public.clients(code,name) VALUES ('U2-B','U2 Client B') RETURNING id INTO cb;
  UPDATE public.clients SET portal_enabled=true WHERE id IN (ca,cb);
  INSERT INTO public.client_users(client_id,user_id,email,name,status) VALUES (ca,ua,'u2-a@test.invalid','A admin','active'),(cb,ub,'u2-b@test.invalid','B admin','active');
  INSERT INTO fx VALUES ('owner',o),('analyst',an),('ua',ua),('ub',ub),('ca',ca),('cb',cb);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',u)::text, true); $$;

-- B1: an analyst cannot change prices, settings or tiers
DO $$ DECLARE t uuid := (SELECT id FROM public.billing_tiers WHERE rank=1); BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='analyst'));
  BEGIN PERFORM public.billing_update_tier(t,'X',1,3,'{}'); RAISE EXCEPTION 'B1 FAILED: analyst edited a tier';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only the owner or Management can change pricing.' THEN RAISE; END IF; END;
  BEGIN PERFORM public.billing_change_tier((SELECT v FROM fx WHERE k='ca'),t,NULL,NULL); RAISE EXCEPTION 'B1 FAILED: analyst changed a tier';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only the owner or Management can change a client''s tier.' THEN RAISE; END IF; END;
  RAISE NOTICE 'B1 passed';
END $$;

-- B2: a direct UPDATE of clients.tier_id is refused even for the owner
DO $$ BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='owner'));
  BEGIN UPDATE public.clients SET tier_id=(SELECT id FROM public.billing_tiers WHERE rank=1) WHERE id=(SELECT v FROM fx WHERE k='ca'); RAISE EXCEPTION 'B2 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A client''s tier can only be changed in Billing%' THEN RAISE; END IF; END;
  RAISE NOTICE 'B2 passed';
END $$;

-- B3: owner edits price and assigns first tier; edit is logged
DO $$ DECLARE t uuid := (SELECT id FROM public.billing_tiers WHERE rank=1); BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='owner'));
  PERFORM public.billing_update_tier(t,'Tier 1',100,3,'{}');
  IF NOT EXISTS (SELECT 1 FROM public.billing_price_log WHERE tier_id=t AND field='price') THEN RAISE EXCEPTION 'B3 FAILED: price edit not logged'; END IF;
  PERFORM public.billing_change_tier((SELECT v FROM fx WHERE k='ca'),t,NULL,'initial');
  PERFORM public.billing_change_tier((SELECT v FROM fx WHERE k='cb'),t,NULL,'initial');
  RAISE NOTICE 'B3 passed';
END $$;

-- B4: logs cannot be edited or deleted
DO $$ BEGIN
  BEGIN UPDATE public.billing_price_log SET field='x'; RAISE EXCEPTION 'B4 FAILED price log'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'B4 FAILED%' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.client_tier_log; RAISE EXCEPTION 'B4 FAILED tier log'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'B4 FAILED%' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.billing_events; RAISE EXCEPTION 'B4 FAILED events'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'B4 FAILED%' THEN RAISE; END IF; END;
  RAISE NOTICE 'B4 passed';
END $$;

-- B5: invoice lifecycle; numbers assigned on issue and never reused after void
DO $$ DECLARE i1 uuid; i2 uuid; n1 text; n2 text; BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='owner'));
  i1 := public.billing_create_invoice((SELECT v FROM fx WHERE k='ca'),'[{"description":"Sample","quantity":1,"unit_price":100}]',NULL,NULL,NULL);
  n1 := public.billing_issue_invoice(i1);
  PERFORM public.billing_void_invoice(i1,'test');
  i2 := public.billing_create_invoice((SELECT v FROM fx WHERE k='ca'),'[{"description":"Sample","quantity":2,"unit_price":50}]',NULL,NULL,(SELECT id FROM public.billing_tiers WHERE rank=2));
  n2 := public.billing_issue_invoice(i2);
  IF n1 = n2 THEN RAISE EXCEPTION 'B5 FAILED: number reused'; END IF;
  BEGIN PERFORM public.billing_record_payment(i2,current_date,'bank','REF1',99); RAISE EXCEPTION 'B5 FAILED: wrong amount accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'The amount paid must equal%' THEN RAISE; END IF; END;
  PERFORM public.billing_record_payment(i2,current_date,'bank','REF1',100);
  BEGIN PERFORM public.billing_void_invoice(i2,'x'); RAISE EXCEPTION 'B5 FAILED: paid voided';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only a draft or issued invoice can be voided.' THEN RAISE; END IF; END;
  -- an unpaid invoice draft for client B, never visible to clients
  PERFORM public.billing_create_invoice((SELECT v FROM fx WHERE k='cb'),'[{"description":"B draft","quantity":1,"unit_price":1}]',NULL,NULL,NULL);
  INSERT INTO fx VALUES ('i2',i2);
  RAISE NOTICE 'B5 passed';
END $$;

-- B6: seat limit respected: tier change below seats used is refused
DO $$ DECLARE t uuid := (SELECT id FROM public.billing_tiers WHERE rank=2); BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='owner'));
  INSERT INTO public.client_users(client_id,email,name,status) SELECT (SELECT v FROM fx WHERE k='ca'),'seat'||g||'@test.invalid','Seat '||g,'pending' FROM generate_series(1,1) g; -- 2 seats used (admin cap)
  PERFORM public.billing_update_tier(t,'Tier 2',NULL,1,'{}') ; -- refused only if a client on Tier 2 exceeds it; none yet
  BEGIN PERFORM public.billing_change_tier((SELECT v FROM fx WHERE k='ca'),t,(SELECT v FROM fx WHERE k='i2'),NULL); RAISE EXCEPTION 'B6 FAILED: tier below seats used accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Remove users first or choose a larger tier.' THEN RAISE; END IF; END;
  RAISE NOTICE 'B6 passed';
END $$;

-- B7: two-client isolation: A sees only A's invoices/requests; B sees none of A's, and no drafts
DO $$ DECLARE r uuid; n int; BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='ua')); SET LOCAL ROLE authenticated;
  r := public.billing_request_upgrade((SELECT id FROM public.billing_tiers WHERE rank=3),'please');
  SELECT count(*) INTO n FROM public.invoices WHERE client_id <> (SELECT v FROM fx WHERE k='ca'); IF n <> 0 THEN RAISE EXCEPTION 'B7 FAILED: A sees other invoices'; END IF;
  SELECT count(*) INTO n FROM public.invoices; IF n <> 2 THEN RAISE EXCEPTION 'B7 FAILED: A should see its 2 issued invoices, saw %', n; END IF;
  RESET ROLE;
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='ub')); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.invoices; IF n <> 0 THEN RAISE EXCEPTION 'B7 FAILED: B sees invoices (draft or A''s)'; END IF;
  SELECT count(*) INTO n FROM public.upgrade_requests; IF n <> 0 THEN RAISE EXCEPTION 'B7 FAILED: B sees A''s request'; END IF;
  SELECT count(*) INTO n FROM public.billing_price_log; IF n <> 0 THEN RAISE EXCEPTION 'B7 FAILED: client reads price log'; END IF;
  RESET ROLE;
  RAISE NOTICE 'B7 passed';
END $$;

-- B8: only a higher tier can be requested, one open request at a time
DO $$ BEGIN
  PERFORM pg_temp.as_user((SELECT v FROM fx WHERE k='ua'));
  BEGIN PERFORM public.billing_request_upgrade((SELECT id FROM public.billing_tiers WHERE rank=3),NULL); RAISE EXCEPTION 'B8 FAILED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You already have an upgrade request waiting for FridayAnalytics.' THEN RAISE; END IF; END;
  RAISE NOTICE 'B8 passed';
END $$;
ROLLBACK;
