-- Phase 3 exit checks (run as a privileged test session; rolls back). Replace :client_a/:client_b/:admin_a with fixture ids.
BEGIN;
-- 1. A client admin of A cannot read B's documents or any staff-only document.
SET LOCAL role authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin_a')::text, true);
SELECT CASE WHEN count(*)=0 THEN 'PASS isolation' ELSE 'FAIL isolation' END FROM public.documents WHERE client_id = :'client_b' OR visibility <> 'client';
-- 2. Counts exclude hidden rows: RLS count equals the client-visible predicate.
SELECT CASE WHEN (SELECT count(*) FROM public.documents) = (SELECT count(*) FROM public.documents WHERE client_id = :'client_a' AND visibility='client' AND NOT voided) THEN 'PASS counts' ELSE 'FAIL counts' END;
-- 3. Other clients are refused by the portal functions.
DO $$ BEGIN PERFORM public.portal_engagements(current_setting('test.client_b')::uuid); RAISE NOTICE 'FAIL cross-client'; EXCEPTION WHEN others THEN RAISE NOTICE 'PASS cross-client: %', SQLERRM; END $$;
RESET role;
-- 4. A third administrator is refused with the exact message.
DO $$ BEGIN
  INSERT INTO public.client_users(client_id,name,email) SELECT current_setting('test.client_a')::uuid,'Third','third@example.invalid';
  RAISE NOTICE 'FAIL cap';
EXCEPTION WHEN others THEN
  IF SQLERRM = 'A client can have at most 2 administrators.' THEN RAISE NOTICE 'PASS cap'; ELSE RAISE NOTICE 'FAIL cap: %', SQLERRM; END IF;
END $$;
ROLLBACK;
