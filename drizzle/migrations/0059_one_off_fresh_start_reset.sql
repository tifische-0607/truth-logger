-- One-off fresh-start reset approved by the owner on 2026-11-11.
-- Keeps evidence chain (cases, incidents, accounts, items, artefacts, custody, sources, U3 move records),
-- configuration and the owner login. Guards are disabled only inside this transaction and re-enabled below.
ALTER TABLE public.project_events DISABLE TRIGGER USER;
ALTER TABLE public.sla_events DISABLE TRIGGER USER;
ALTER TABLE public.phase_clocks DISABLE TRIGGER USER;
ALTER TABLE public.project_members DISABLE TRIGGER USER;
ALTER TABLE public.projects DISABLE TRIGGER USER;
ALTER TABLE public.client_access_events DISABLE TRIGGER USER;
ALTER TABLE public.client_users DISABLE TRIGGER USER;
ALTER TABLE public.clients DISABLE TRIGGER USER;
ALTER TABLE public.capture_jobs DISABLE TRIGGER USER;
ALTER TABLE public.housekeeping_deletions DISABLE TRIGGER USER;
ALTER TABLE public.access_level_log DISABLE TRIGGER USER;
ALTER TABLE public.account_admin_events DISABLE TRIGGER USER;
ALTER TABLE public.account_access DISABLE TRIGGER USER;
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.user_roles DISABLE TRIGGER USER;

DELETE FROM public.project_events WHERE id IS NOT NULL;
DELETE FROM public.sla_events WHERE id IS NOT NULL;
DELETE FROM public.phase_clocks WHERE id IS NOT NULL;
DELETE FROM public.project_members WHERE user_id IS NOT NULL;
DELETE FROM public.projects WHERE id IS NOT NULL;
DELETE FROM public.client_access_events WHERE id IS NOT NULL;
DELETE FROM public.client_users WHERE id IS NOT NULL;
DELETE FROM public.clients WHERE id IS NOT NULL;
DELETE FROM public.capture_jobs WHERE id IS NOT NULL;
DELETE FROM public.housekeeping_deletions WHERE id IS NOT NULL;
DELETE FROM public.access_level_log WHERE id IS NOT NULL;
DELETE FROM public.account_admin_events WHERE id IS NOT NULL;
DELETE FROM public.account_access WHERE user_id <> 'e1498da3-6db0-4855-bcee-0150dfe25e57';
DELETE FROM public.profiles WHERE id <> 'e1498da3-6db0-4855-bcee-0150dfe25e57';
DELETE FROM public.user_roles WHERE user_id <> 'e1498da3-6db0-4855-bcee-0150dfe25e57';
DELETE FROM auth.users WHERE id <> 'e1498da3-6db0-4855-bcee-0150dfe25e57';

ALTER TABLE public.project_events ENABLE TRIGGER USER;
ALTER TABLE public.sla_events ENABLE TRIGGER USER;
ALTER TABLE public.phase_clocks ENABLE TRIGGER USER;
ALTER TABLE public.project_members ENABLE TRIGGER USER;
ALTER TABLE public.projects ENABLE TRIGGER USER;
ALTER TABLE public.client_access_events ENABLE TRIGGER USER;
ALTER TABLE public.client_users ENABLE TRIGGER USER;
ALTER TABLE public.clients ENABLE TRIGGER USER;
ALTER TABLE public.capture_jobs ENABLE TRIGGER USER;
ALTER TABLE public.housekeeping_deletions ENABLE TRIGGER USER;
ALTER TABLE public.access_level_log ENABLE TRIGGER USER;
ALTER TABLE public.account_admin_events ENABLE TRIGGER USER;
ALTER TABLE public.account_access ENABLE TRIGGER USER;
ALTER TABLE public.profiles ENABLE TRIGGER USER;
ALTER TABLE public.user_roles ENABLE TRIGGER USER;