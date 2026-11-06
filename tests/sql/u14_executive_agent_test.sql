-- U14 Executive agent gateway — SQL checks
-- Part A (structure): RUN 6 Nov 2026 through the read-only database tool — results in roadmap.md.
-- Part B (behaviour): NOT RUN — needs owner, Management, staff and client test accounts and an approved universal standard.

-- A1 RLS + append-only; authenticated cannot write either table; anon cannot read
SELECT c.relname, c.relrowsecurity, EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname LIKE '%append_only') ao,
  has_table_privilege('authenticated',c.oid,'INSERT') ins, has_table_privilege('anon',c.oid,'SELECT') anon_sel
FROM pg_class c WHERE c.relname IN ('exec_access','exec_qa_log');
-- A2 The agent's only write path is service-role: authenticated cannot call exec_log_exchange or exec_scope
SELECT has_function_privilege('authenticated','public.exec_log_exchange(uuid,jsonb)','EXECUTE') AS log_auth,   -- false
       has_function_privilege('authenticated','public.exec_scope(uuid)','EXECUTE') AS scope_auth;              -- false
-- A3 Access list starts empty → "No executives have access"
SELECT count(*) FROM public.exec_access; -- 0

BEGIN;
-- B1 exec_set_access by a Curator/analyst → 'Only the owner or Management can change executive agent access.'
-- B2 Grant to a client login → 'Only FridayAnalytics staff can be given executive agent access.'
-- B3 Grant an engagement the person cannot see → 'The agent can only see engagements this executive can already see.'
-- B4 Log entry after revoke → 'This executive has no current agent access.'
-- B5 Log entry citing a capture from another engagement → 'Every cited capture must belong to an engagement this executive may see.'
-- B6 Log entry with confidence 'high' and no citations → check constraint violation.
ROLLBACK;
