-- U12 Unified evidence search — SQL checks
-- Part A (structure): RUN 6 Nov 2026 through the read-only database tool.
-- Part B (behaviour): NOT RUN — needs a test connection that can sign in as two different staff users and a client user,
--   plus captures in two engagements.

-- A1 RLS + append-only on every U12 table; authenticated cannot insert; anon cannot read
SELECT c.relname, c.relrowsecurity, EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname LIKE '%append_only') ao,
  has_table_privilege('authenticated',c.oid,'INSERT') ins, has_table_privilege('anon',c.oid,'SELECT') anon_sel
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'srch\_%' AND c.relkind='r';
-- expect 4 rows: true, true, false, false

-- A2 Access filter runs as the caller (SECURITY INVOKER) so row-level rules apply
SELECT proname, prosecdef FROM pg_proc WHERE proname='srch_visible'; -- expect prosecdef = false

-- A3 Content types start empty → "No content types chosen yet"
SELECT public.srch_current_types(); -- expect {}

-- A4 Approval requires a register requirement (table check)
SELECT conname FROM pg_constraint WHERE conrelid='public.srch_promotions'::regclass AND contype='c';

-- B1 As analyst A (engagement 1 only): srch_visible('[{"key":"x","project_id":"<engagement 2>","capture":{"kind":"research","id":"<capture in 2>"}}]') → []
-- B2 As a client user: srch_visible(...) → [] for any input
-- B3 Hit citing a capture id that belongs to another engagement than its project_id → dropped
-- B4 srch_decide_promotion by a non-Curator → 'Only the Curator can approve a saved search as a monitoring requirement.'
-- B5 Approve without a requirement → 'Choose an active requirement from this engagement''s register.'
