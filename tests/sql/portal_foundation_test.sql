-- Stage 1 rollback-only checks. Run with a privileged test database connection:
-- psql -X -v ON_ERROR_STOP=1 -f tests/sql/portal_foundation_test.sql
\set ON_ERROR_STOP 1
BEGIN;
DO $$
DECLARE c uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.clients(id,code,name) VALUES(c,'TEST-P-'||substr(c::text,1,8),'TEST Portal foundation');
 BEGIN
  UPDATE public.clients SET portal_enabled=true WHERE id=c;
  RAISE EXCEPTION 'Portal enabled without administrators';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'Invite at least one administrator before enabling the portal.' THEN RAISE; END IF;
 END;
 INSERT INTO public.client_users(id,client_id,name,email) VALUES(a,c,'TEST One','test-one@example.invalid'),(b,c,'TEST Two','test-two@example.invalid');
 UPDATE public.clients SET portal_enabled=true WHERE id=c;
 BEGIN
  INSERT INTO public.client_users(id,client_id,name,email) VALUES(d,c,'TEST Three','test-three@example.invalid');
  RAISE EXCEPTION 'Third administrator allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'A client can have at most 2 administrators.' THEN RAISE; END IF;
 END;
 UPDATE public.client_users SET status='inactive' WHERE id=b;
 INSERT INTO public.client_users(id,client_id,name,email) VALUES(d,c,'TEST Three','test-three@example.invalid');
 BEGIN
  UPDATE public.client_users SET status='pending' WHERE id=b;
  RAISE EXCEPTION 'Reactivation above cap allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'A client can have at most 2 administrators.' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'PORTAL FOUNDATION CAP AND ENABLE CHECKS PASSED';
END $$;
ROLLBACK;