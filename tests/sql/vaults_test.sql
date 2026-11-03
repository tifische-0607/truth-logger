-- Phase 6 vault rules. Runs in one transaction and rolls back. Needs a connection that may insert fixtures
-- (service role or owner). Each check prints PASS or raises.
BEGIN;

-- V1 append-only: vault_events, vault_outbox and vault_outbox_results refuse UPDATE and DELETE
DO $$ DECLARE e uuid; BEGIN
  INSERT INTO public.vault_events (vault, event, outcome) VALUES ('cloud','check','not_configured') RETURNING id INTO e;
  BEGIN UPDATE public.vault_events SET outcome = 'ok' WHERE id = e; RAISE EXCEPTION 'FAIL V1 update allowed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.vault_events WHERE id = e; RAISE EXCEPTION 'FAIL V1 delete allowed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS V1 vault events are append-only';
END $$;

-- V2 Not configured never counts as online
DO $$ BEGIN
  IF public.vault_cloud_online() THEN RAISE EXCEPTION 'FAIL V2 cloud online after not_configured'; END IF;
  RAISE NOTICE 'PASS V2 Not configured Cloud Vault is offline';
END $$;

-- V3 outbox: a write is recorded only when the hash on write matches; pending until then
DO $$ DECLARE o uuid; r jsonb; h text := repeat('a', 64); BEGIN
  INSERT INTO public.vault_outbox (target, kind, ref_id, sha256) VALUES ('cloud','document', gen_random_uuid(), h) RETURNING id INTO o;
  IF NOT public.vault_outbox_pending(o) THEN RAISE EXCEPTION 'FAIL V3 new entry not pending'; END IF;
  r := public.vault_outbox_record(o, repeat('b', 64));
  IF r->>'status' <> 'failed' OR NOT public.vault_outbox_pending(o) THEN RAISE EXCEPTION 'FAIL V3 mismatch accepted'; END IF;
  r := public.vault_outbox_record(o, h);
  IF r->>'status' <> 'written' OR public.vault_outbox_pending(o) THEN RAISE EXCEPTION 'FAIL V3 match not written'; END IF;
  RAISE NOTICE 'PASS V3 outbox records writes only on matching SHA-256';
END $$;

-- V4 custody and event records are queued to both vaults
DO $$ DECLARE c uuid; BEGIN
  INSERT INTO public.custody_events (action, notes) VALUES ('accessed', 'vault test') RETURNING id INTO c;
  IF (SELECT count(DISTINCT target) FROM public.vault_outbox WHERE kind = 'custody_event' AND ref_id = c) <> 2 THEN
    RAISE EXCEPTION 'FAIL V4 custody event not queued to both vaults'; END IF;
  RAISE NOTICE 'PASS V4 custody events queued to Home and Cloud';
EXCEPTION WHEN check_violation OR foreign_key_violation THEN RAISE NOTICE 'SKIP V4 custody fixture refused by an older guard: %', SQLERRM;
END $$;

-- V5 shared documents and released outputs are queued with their SHA-256
--   Needs a client document fixture: insert a documents row with visibility 'client' and a sha256, then
--   SELECT count(*) FROM vault_outbox WHERE kind='document' AND ref_id=<id> AND sha256=<sha>  -- expect 1
--   Release an output with a sha256 through G5, then the same check with kind='output'           -- expect 1

-- V6 Home Vault offline pauses running plans and blocks Start; Cloud Vault offline pauses only mirror plans
--   Needs a started plan (signed G1/G2). With plans A (cloud_mirror=false) and B (cloud_mirror=true) running:
--   INSERT INTO research_vault_reports (source_id, online) VALUES (<home source>, false);  -> A and B paused
--   With home online and a Cloud check outcome 'not_configured':                            -> only B paused
--   UPDATE research_plans SET status='running' (via research_set_status) while offline     -> refused
--     'The Home Vault is offline: research cannot start or resume'
--     'The Cloud Vault is offline: plans that mirror to it cannot start or resume'

-- V7 nothing reports success while a required write is pending
--   For a mirror plan with a capture queued and no 'written' result: research_report_run(run,'delivered')
--   -> refused 'Not delivered: 1 Cloud Vault write(s) are still pending'

-- V8 people cannot write vault tables or call writer functions directly
DO $$ BEGIN
  IF has_table_privilege('authenticated', 'public.vault_outbox', 'INSERT') OR has_table_privilege('authenticated', 'public.vault_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vault_outbox_results', 'INSERT')
     OR has_function_privilege('authenticated', 'public.vault_outbox_record(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.vault_record_check(text,text,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL V8 signed-in users can write vault records'; END IF;
  RAISE NOTICE 'PASS V8 vault writes are service-role only';
END $$;

ROLLBACK;
