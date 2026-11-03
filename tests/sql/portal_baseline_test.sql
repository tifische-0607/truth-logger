-- Read-only baseline checks; no widened production privileges required.
-- Run with a privileged test connection when available.
\set ON_ERROR_STOP 1
DO $$
DECLARE body text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.project_output_guard()'::regprocedure;
 IF position('An output that has passed QA is fixed; create a new output instead' IN body)=0 THEN
  RAISE EXCEPTION 'Immutable output correction guard missing';
 END IF;
 IF position('Release only happens through gate G5 (written Curator approval)' IN body)=0 THEN
  RAISE EXCEPTION 'G5 release guard missing';
 END IF;
 RAISE NOTICE 'PORTAL BASELINE IMMUTABILITY AND RELEASE CHECKS PASSED';
END $$;