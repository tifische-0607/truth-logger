-- STATUS 6 Nov 2026
-- Part A (structure) RUN and passed through the read-only database tool:
--   A1 RLS on lnk_merge_decisions, lnk_released_graphs, lnk_thresholds, lnk_events; append-only trigger on each;
--      authenticated cannot INSERT; anon cannot SELECT.
--   A2 lnk_ident_ok('acc-001') = true; lnk_ident_ok('John Smith lives at') = false (only identifiers can be stored).
--   A3 lnk_release_report_guard present; coordination thresholds start empty ("Threshold not set").
--   A4 anon cannot execute lnk_decide_merge.
--   A5 No table holds node labels, edge contents or measures — only identifiers, hashes and decisions (by design; see docs/link-analysis/gateway-contract.md).
-- Part B (behaviour) NOT RUN: needs a privileged test connection that can create auth users, a released report fixture,
--   and an approved FA-USTD version (the universal standard v1 is still a Sample awaiting Curator approval).
BEGIN;

-- B1: merges need analyst confirmation — a direct insert by an authenticated user is refused (no INSERT privilege).
--   SET LOCAL ROLE authenticated; INSERT INTO public.lnk_merge_decisions(...) → expect "permission denied".

-- B2: a graph cannot be attached to a report that is not released.
DO $$ DECLARE o public.project_outputs; sv uuid := (SELECT id FROM public.framework_versions LIMIT 1); BEGIN
  SELECT * INTO o FROM public.project_outputs WHERE status <> 'released' LIMIT 1;
  IF o.id IS NULL OR sv IS NULL THEN RAISE NOTICE 'B2 SKIPPED: no unreleased output fixture'; RETURN; END IF;
  BEGIN
    INSERT INTO public.lnk_released_graphs(project_id,output_id,graph_ref,snapshot_sha256,standard_version_id,released_by)
      VALUES (o.project_id,o.id,'graph-1',repeat('a',64),sv,gen_random_uuid());
    RAISE EXCEPTION 'B2 FAILED: graph attached to an unreleased report';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'A graph can be shown to the client only inside a released report.' THEN RAISE; END IF;
  END;
END $$;

-- B3: names/content refused — lnk_decide_merge(project,'John Smith','acc-2',true,'r',null) →
--   'Entity identifiers only — no names or content may be stored.'

-- B4: clients see only graphs released in reports — as a client user, portal_released_graphs() returns rows only
--   for outputs with status='released' AND shared_with_client.

ROLLBACK;
