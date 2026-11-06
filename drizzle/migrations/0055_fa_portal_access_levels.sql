-- Five access levels (SuperAdmin, FA Staff, Client Admin, Client Staff, Members), account section and user administration.
-- Additive: existing roles, client logins, gates, approvals and RLS keep working. Levels are derived from existing data and kept in sync by triggers.

-- 1. Level per login (current state) and append-only logs.
CREATE TABLE public.account_access (
  user_id uuid PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('superadmin','fa_staff','client_admin','client_staff','member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  member_tier_id uuid REFERENCES public.billing_tiers(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_access TO authenticated;
GRANT ALL ON public.account_access TO service_role;
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_level_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_level text, to_level text, from_status text, to_status text,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.access_level_log TO authenticated;
GRANT ALL ON public.access_level_log TO service_role;
ALTER TABLE public.access_level_log ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER access_level_log_append_only BEFORE UPDATE OR DELETE ON public.access_level_log FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.account_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid DEFAULT auth.uid(),
  target uuid NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_admin_events TO authenticated;
GRANT ALL ON public.account_admin_events TO service_role;
ALTER TABLE public.account_admin_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER account_admin_events_append_only BEFORE UPDATE OR DELETE ON public.account_admin_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- 2. Helpers.
CREATE OR REPLACE FUNCTION public.access_level_of(u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT level FROM public.account_access WHERE user_id=u; $$;
CREATE OR REPLACE FUNCTION public.access_active(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT NOT EXISTS (SELECT 1 FROM public.account_access WHERE user_id=u AND status='inactive'); $$;
CREATE OR REPLACE FUNCTION public.access_is_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.account_access WHERE user_id=u AND level='superadmin' AND status='active'); $$;
CREATE OR REPLACE FUNCTION public.access_is_member(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.account_access WHERE user_id=u AND level='member' AND status='active'); $$;

CREATE POLICY account_access_read ON public.account_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.access_is_superadmin(auth.uid()));
CREATE POLICY access_level_log_read ON public.access_level_log FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.access_is_superadmin(auth.uid()));
CREATE POLICY account_admin_events_read ON public.account_admin_events FOR SELECT TO authenticated USING (target = auth.uid() OR actor = auth.uid() OR public.access_is_superadmin(auth.uid()));

-- Deactivated logins lose staff rights everywhere (has_role / portal_is_staff are used by every staff policy).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) AND public.access_active(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.portal_is_staff(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u) AND public.access_active(u); $$;

-- 3. Last active SuperAdmin can never be removed or deactivated.
CREATE OR REPLACE FUNCTION public.access_last_superadmin_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF OLD.level='superadmin' AND OLD.status='active' AND (TG_OP='DELETE' OR NEW.level<>'superadmin' OR NEW.status<>'active')
    AND NOT EXISTS (SELECT 1 FROM public.account_access WHERE level='superadmin' AND status='active' AND user_id<>OLD.user_id) THEN
  RAISE EXCEPTION 'At least one active SuperAdmin must remain. Make another person SuperAdmin before removing or deactivating this one.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 NEW.updated_at := now();
 RETURN NEW;
END $$;
CREATE TRIGGER account_access_last_superadmin BEFORE UPDATE OR DELETE ON public.account_access FOR EACH ROW EXECUTE FUNCTION public.access_last_superadmin_guard();

-- 4. Keep the level in step with roles and client logins; every change is logged.
CREATE OR REPLACE FUNCTION public.access_recompute(u uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE want text; st text; cu public.client_users; m public.account_access;
BEGIN
 IF u IS NULL THEN RETURN; END IF;
 SELECT * INTO m FROM public.account_access WHERE user_id=u;
 IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=u AND role='owner') THEN want:='superadmin';
 ELSIF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=u) THEN want:='fa_staff';
 ELSE
  SELECT * INTO cu FROM public.client_users WHERE user_id=u;
  IF cu.id IS NOT NULL THEN
   want := CASE cu.role WHEN 'client_admin' THEN 'client_admin' ELSE 'client_staff' END;
   st := CASE WHEN cu.status='active' THEN 'active' ELSE 'inactive' END;
  END IF;
 END IF;
 IF want IS NULL THEN
  IF m.level IN ('superadmin','fa_staff','client_admin','client_staff') THEN
   DELETE FROM public.account_access WHERE user_id=u;
   INSERT INTO public.access_level_log(user_id,from_level,to_level,from_status,to_status) VALUES (u,m.level,NULL,m.status,NULL);
  END IF;
  RETURN;
 END IF;
 IF m.level='member' THEN RAISE EXCEPTION 'A Member login cannot also hold an FA staff or client login.'; END IF;
 IF m.user_id IS NULL THEN
  INSERT INTO public.account_access(user_id,level,status) VALUES (u,want,COALESCE(st,'active'));
  INSERT INTO public.access_level_log(user_id,from_level,to_level,from_status,to_status) VALUES (u,NULL,want,NULL,COALESCE(st,'active'));
 ELSIF m.level<>want OR (st IS NOT NULL AND m.status<>st) THEN
  UPDATE public.account_access SET level=want, status=COALESCE(st,m.status) WHERE user_id=u;
  INSERT INTO public.access_level_log(user_id,from_level,to_level,from_status,to_status) VALUES (u,m.level,want,m.status,COALESCE(st,m.status));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.access_user_roles_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE target uuid := COALESCE(NEW.user_id, OLD.user_id); r text := COALESCE(NEW.role, OLD.role)::text;
BEGIN
 IF auth.uid() IS NOT NULL AND target = auth.uid() AND r='owner' THEN RAISE EXCEPTION 'You cannot change your own access level.'; END IF;
 IF TG_OP='INSERT' AND (EXISTS (SELECT 1 FROM public.client_users WHERE user_id=NEW.user_id) OR public.access_level_of(NEW.user_id)='member') THEN
  RAISE EXCEPTION 'A client or Member login cannot also hold an FA staff role.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_roles_access_guard BEFORE INSERT OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.access_user_roles_guard();

CREATE OR REPLACE FUNCTION public.access_sync_roles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 PERFORM public.access_recompute(COALESCE(NEW.user_id, OLD.user_id));
 IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN PERFORM public.access_recompute(OLD.user_id); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER user_roles_access_sync AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.access_sync_roles();
CREATE TRIGGER client_users_access_sync AFTER INSERT OR UPDATE ON public.client_users FOR EACH ROW EXECUTE FUNCTION public.access_sync_roles();

-- Map existing data.
INSERT INTO public.account_access(user_id,level,status)
 SELECT DISTINCT ON (user_id) user_id, CASE WHEN bool_or(role='owner') OVER (PARTITION BY user_id) THEN 'superadmin' ELSE 'fa_staff' END, 'active'
 FROM public.user_roles ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.account_access(user_id,level,status)
 SELECT user_id, CASE role WHEN 'client_admin' THEN 'client_admin' ELSE 'client_staff' END, CASE WHEN status='active' THEN 'active' ELSE 'inactive' END
 FROM public.client_users WHERE user_id IS NOT NULL ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.access_level_log(user_id,from_level,to_level,from_status,to_status,actor)
 SELECT user_id,NULL,level,NULL,status,NULL FROM public.account_access;

-- 5. Profile fields for the Account section.
ALTER TABLE public.profiles ADD COLUMN full_name text;
ALTER TABLE public.profiles ADD COLUMN phone text;
ALTER TABLE public.profiles ADD COLUMN job_title text;
ALTER TABLE public.profiles ADD COLUMN language text;
ALTER TABLE public.profiles ADD COLUMN preferred_theme text;

-- 6. Members: invited only by SuperAdmin or Management; no client organisation, no seats.
CREATE TABLE public.member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(trim(email))),
  name text NOT NULL CHECK (length(trim(name))>0),
  tier_id uuid REFERENCES public.billing_tiers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled')),
  invited_by uuid DEFAULT auth.uid(),
  invite_token_hash text CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$'),
  invite_expires_at timestamptz,
  invite_used_at timestamptz,
  user_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.member_invitations TO authenticated;
GRANT ALL ON public.member_invitations TO service_role;
ALTER TABLE public.member_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_invitations_read ON public.member_invitations FOR SELECT TO authenticated USING (public.access_is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'management'));

CREATE OR REPLACE FUNCTION public.member_invite(n text, e text, h text, expires timestamptz, tier uuid DEFAULT NULL, existing uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid; em text := lower(trim(e)); x public.member_invitations;
BEGIN
 IF NOT (public.access_is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'management')) THEN RAISE EXCEPTION 'Only a SuperAdmin or Management can invite Members.'; END IF;
 IF expires<=now() OR expires>now()+interval '8 days' THEN RAISE EXCEPTION 'Invitation expiry is invalid.'; END IF;
 IF existing IS NULL THEN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email)=em) THEN RAISE EXCEPTION 'This email already has a FA Portal login. Members need their own new login.'; END IF;
  IF EXISTS (SELECT 1 FROM public.member_invitations WHERE email=em AND status IN ('pending','active')) THEN RAISE EXCEPTION 'This email already has a Member invitation or login.'; END IF;
  IF tier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_tiers WHERE id=tier) THEN RAISE EXCEPTION 'Tier not found.'; END IF;
  INSERT INTO public.member_invitations(email,name,tier_id,invite_token_hash,invite_expires_at) VALUES (em,trim(n),tier,h,expires) RETURNING id INTO rid;
 ELSE
  SELECT * INTO x FROM public.member_invitations WHERE id=existing FOR UPDATE;
  IF NOT FOUND OR x.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be resent.'; END IF;
  UPDATE public.member_invitations SET invite_token_hash=h, invite_expires_at=expires, invite_used_at=NULL WHERE id=existing;
  rid := existing;
 END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (rid, CASE WHEN existing IS NULL THEN 'member_invited' ELSE 'member_invite_resent' END, jsonb_build_object('email',COALESCE(x.email,em)));
 RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.member_cancel_invite(rid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE x public.member_invitations;
BEGIN
 IF NOT (public.access_is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'management')) THEN RAISE EXCEPTION 'Only a SuperAdmin or Management can cancel Member invitations.'; END IF;
 SELECT * INTO x FROM public.member_invitations WHERE id=rid FOR UPDATE;
 IF NOT FOUND OR x.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be cancelled.'; END IF;
 UPDATE public.member_invitations SET status='cancelled', invite_token_hash=NULL, invite_expires_at=NULL WHERE id=rid;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (rid,'member_invite_cancelled',jsonb_build_object('email',x.email));
END $$;

CREATE OR REPLACE FUNCTION public.member_invitation_info(h text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT jsonb_build_object('kind','member','client_name','FridayAnalytics Members','name',m.name,'email',m.email,'existing_account',EXISTS(SELECT 1 FROM public.profiles p WHERE lower(p.email)=m.email))
 FROM public.member_invitations m WHERE m.invite_token_hash=h AND m.status='pending' AND m.invite_used_at IS NULL AND m.invite_expires_at>now(); $$;

CREATE OR REPLACE FUNCTION public.member_claim_invitation(h text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.member_invitations;
BEGIN
 SELECT * INTO m FROM public.member_invitations WHERE invite_token_hash=h AND status='pending' AND invite_used_at IS NULL AND invite_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is invalid, expired or already used.'; END IF;
 UPDATE public.member_invitations SET invite_used_at=now(), invite_token_hash=NULL WHERE id=m.id;
 RETURN jsonb_build_object('id',m.id,'email',m.email,'name',m.name);
END $$;

CREATE OR REPLACE FUNCTION public.member_activate_invitation(rid uuid, uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.member_invitations;
BEGIN
 SELECT * INTO m FROM public.member_invitations WHERE id=rid AND status='pending' AND invite_used_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation was not claimed.'; END IF;
 IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=uid) OR EXISTS (SELECT 1 FROM public.client_users WHERE user_id=uid) OR EXISTS (SELECT 1 FROM public.account_access WHERE user_id=uid) THEN
  RAISE EXCEPTION 'A Member login cannot also hold an FA staff or client login.'; END IF;
 UPDATE public.member_invitations SET status='active', user_id=uid WHERE id=rid;
 INSERT INTO public.account_access(user_id,level,status,member_tier_id) VALUES (uid,'member','active',m.tier_id);
 INSERT INTO public.access_level_log(user_id,from_level,to_level,from_status,to_status,actor) VALUES (uid,NULL,'member',NULL,'active',uid);
 INSERT INTO public.account_admin_events(actor,target,action,detail) VALUES (uid,uid,'member_accepted',jsonb_build_object('invitation',rid));
END $$;

-- 7. Reports released to Members (a Library tick box). Append-only versions; latest wins; none = not released.
CREATE TABLE public.document_member_release (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id),
  released boolean NOT NULL,
  set_by uuid NOT NULL DEFAULT auth.uid(),
  set_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_member_release TO authenticated;
GRANT ALL ON public.document_member_release TO service_role;
ALTER TABLE public.document_member_release ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_member_release_staff_read ON public.document_member_release FOR SELECT TO authenticated USING (public.portal_is_staff(auth.uid()));
CREATE TRIGGER document_member_release_append_only BEFORE UPDATE OR DELETE ON public.document_member_release FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE INDEX document_member_release_doc ON public.document_member_release(document_id, set_at DESC);

CREATE OR REPLACE FUNCTION public.report_member_release_in_force(doc uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT COALESCE((SELECT released FROM public.document_member_release WHERE document_id=doc ORDER BY set_at DESC, id DESC LIMIT 1), false); $$;

CREATE OR REPLACE FUNCTION public.report_set_members(doc uuid, released boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.documents;
BEGIN
 IF NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'curator') OR public.has_role(auth.uid(),'management')) THEN
  RAISE EXCEPTION 'Only the owner, a Curator or Management can release a report to Members.'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=doc;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF d.source='client' THEN RAISE EXCEPTION 'Client uploads can never be released to Members.'; END IF;
 IF released = public.report_member_release_in_force(doc) THEN RAISE EXCEPTION 'This Members setting is already in force for this report.'; END IF;
 INSERT INTO public.document_member_release(document_id,released) VALUES (doc,released);
 PERFORM public.library_log(doc, CASE WHEN released THEN 'members_released' ELSE 'members_withdrawn' END, NULL, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.report_tier_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.portal_is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff only.'; END IF;
 RETURN jsonb_build_object('any_set',EXISTS(SELECT 1 FROM public.document_tier_access),
  'docs',COALESCE((SELECT jsonb_object_agg(document_id::text, t) FROM (SELECT DISTINCT ON (document_id) document_id, tier_ids t FROM public.document_tier_access ORDER BY document_id, set_at DESC, id DESC) s),'{}'::jsonb),
  'members',COALESCE((SELECT jsonb_object_agg(document_id::text, r) FROM (SELECT DISTINCT ON (document_id) document_id, released r FROM public.document_member_release ORDER BY document_id, set_at DESC, id DESC) s),'{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.library_can_read(u uuid, d public.documents) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT public.portal_is_staff(u)
  OR (d.visibility='client' AND NOT d.voided AND public.portal_is_member(u,d.client_id) AND public.report_tier_allows(d))
  OR (d.visibility='client' AND NOT d.voided AND d.source<>'client' AND public.access_is_member(u) AND public.report_member_release_in_force(d.id)
      AND (cardinality(public.report_tiers_in_force(d.id))=0 OR (SELECT member_tier_id FROM public.account_access WHERE user_id=u) = ANY(public.report_tiers_in_force(d.id)))) $$;

-- Members' report list: no client names, engagements or research.
CREATE OR REPLACE FUNCTION public.member_reports() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.access_is_member(auth.uid()) THEN RAISE EXCEPTION 'Only an active Member can open the Members reports.'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'kind',d.kind,'file_name',d.file_name,'size_bytes',d.size_bytes,'sha256',d.sha256,'version',d.version,'created_at',d.created_at,'available',d.home_path IS NOT NULL AND NOT d.manifest_only) ORDER BY d.created_at DESC)
   FROM public.documents d WHERE public.library_can_read(auth.uid(), d) AND public.access_is_member(auth.uid())),'[]'::jsonb);
END $$;

-- 8. Identity now carries the level; inactive logins are signed out of every screen.
CREATE OR REPLACE FUNCTION public.portal_identity() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u public.client_users; role_name text; a public.account_access;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT * INTO a FROM public.account_access WHERE user_id=auth.uid();
 IF a.status='inactive' THEN RETURN jsonb_build_object('kind','none','destination','/auth','level',a.level,'inactive',true); END IF;
 SELECT role::text INTO role_name FROM public.user_roles WHERE user_id=auth.uid() ORDER BY CASE role::text WHEN 'owner' THEN 0 WHEN 'curator' THEN 1 WHEN 'management' THEN 2 ELSE 3 END LIMIT 1;
 IF role_name IS NOT NULL THEN RETURN jsonb_build_object('kind','staff','role',role_name,'level',COALESCE(a.level,'fa_staff'),'destination',CASE role_name WHEN 'curator' THEN '/inbox' WHEN 'management' THEN '/management' ELSE '/dashboard' END); END IF;
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active';
 IF FOUND THEN RETURN jsonb_build_object('kind','client','destination','/portal','client_id',u.client_id,'level',CASE u.role WHEN 'client_admin' THEN 'client_admin' ELSE 'client_staff' END); END IF;
 IF a.level='member' THEN RETURN jsonb_build_object('kind','member','destination','/portal','level','member'); END IF;
 RETURN jsonb_build_object('kind','none','destination','/auth');
END $$;

-- 9. Menu and screen access by level plus job role. Route guards read this; data rules stay in RLS and guarded functions.
CREATE OR REPLACE FUNCTION public.access_menu() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE lvl text; st text; roles text[]; s text[];
 base text[] := ARRAY['dashboard','engagements','search','cases','collect','integrity','research','early_warning','links','narratives','evidence_search','library','frameworks','client_preview','sources','templates','document_samples','account'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT level, status INTO lvl, st FROM public.account_access WHERE user_id=auth.uid();
 SELECT COALESCE(array_agg(role::text ORDER BY role::text),'{}') INTO roles FROM public.user_roles WHERE user_id=auth.uid();
 IF st='inactive' THEN RETURN jsonb_build_object('level',lvl,'status',st,'roles',roles,'screens','[]'::jsonb); END IF;
 IF lvl='superadmin' THEN
  s := base || ARRAY['curator_inbox','management','billing','users_access','vaults','connectors','executive_agent','team','settings'];
 ELSIF lvl='fa_staff' THEN
  s := base;
  IF 'curator' = ANY(roles) THEN s := s || ARRAY['curator_inbox','connectors']; END IF;
  IF 'management' = ANY(roles) THEN s := s || ARRAY['management','billing','users_access']; END IF;
 ELSIF lvl='client_admin' THEN s := ARRAY['portal_dashboard','portal_reports','portal_engagements','portal_team','portal_pricing','portal_billing','account'];
 ELSIF lvl='client_staff' THEN s := ARRAY['portal_dashboard','portal_reports','portal_engagements','portal_notices','account'];
 ELSIF lvl='member' THEN s := ARRAY['portal_reports','portal_notices','account'];
 ELSE s := ARRAY['account']; END IF;
 RETURN jsonb_build_object('level',lvl,'status',COALESCE(st,'active'),'roles',roles,'screens',to_jsonb(s));
END $$;

-- 10. Who may act on another person.
CREATE OR REPLACE FUNCTION public.access_can_manage(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT actor IS NOT NULL AND target IS NOT NULL AND actor<>target AND public.access_active(actor) AND (
   public.access_is_superadmin(actor)
   OR EXISTS (SELECT 1 FROM public.client_users t WHERE t.user_id=target AND t.role='client_user' AND public.portal_is_admin(actor,t.client_id))); $$;

CREATE OR REPLACE FUNCTION public.access_set_level(target uuid, lvl text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cur text;
BEGIN
 IF target = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own access level.'; END IF;
 IF NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only a SuperAdmin can create or change SuperAdmin or FA Staff levels.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fa.access_levels',0));
 cur := public.access_level_of(target);
 IF cur IS NULL THEN RAISE EXCEPTION 'User not found.'; END IF;
 IF lvl NOT IN ('superadmin','fa_staff') OR cur NOT IN ('superadmin','fa_staff') THEN
  RAISE EXCEPTION 'Only SuperAdmin and FA Staff levels can be switched here. Client Admin, Client Staff and Member levels come from their invitation.'; END IF;
 IF cur = lvl THEN RAISE EXCEPTION 'This person already has that level.'; END IF;
 IF lvl='superadmin' THEN
  INSERT INTO public.user_roles(user_id,role) VALUES (target,'owner') ON CONFLICT DO NOTHING;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=target AND role<>'owner') THEN INSERT INTO public.user_roles(user_id,role) VALUES (target,'analyst'); END IF;
  DELETE FROM public.user_roles WHERE user_id=target AND role='owner';
 END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (target,'level_changed',jsonb_build_object('from',cur,'to',lvl));
END $$;

CREATE OR REPLACE FUNCTION public.access_set_status(target uuid, make_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.account_access; cu public.client_users;
BEGIN
 IF target = auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate or reactivate yourself.'; END IF;
 IF NOT public.access_can_manage(auth.uid(), target) THEN RAISE EXCEPTION 'You cannot change this person''s access.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fa.access_levels',0));
 SELECT * INTO a FROM public.account_access WHERE user_id=target FOR UPDATE;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'User not found.'; END IF;
 IF (a.status='active') = make_active THEN RAISE EXCEPTION 'This person is already %.', CASE WHEN make_active THEN 'active' ELSE 'inactive' END; END IF;
 IF a.level IN ('client_admin','client_staff') THEN
  SELECT * INTO cu FROM public.client_users WHERE user_id=target;
  PERFORM public.portal_admin_action(cu.id, CASE WHEN make_active THEN 'reactivate' ELSE 'deactivate' END);
 ELSE
  UPDATE public.account_access SET status=CASE WHEN make_active THEN 'active' ELSE 'inactive' END WHERE user_id=target;
  INSERT INTO public.access_level_log(user_id,from_level,to_level,from_status,to_status) VALUES (target,a.level,a.level,a.status,CASE WHEN make_active THEN 'active' ELSE 'inactive' END);
 END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (target,CASE WHEN make_active THEN 'reactivated' ELSE 'deactivated' END,jsonb_build_object('level',a.level));
END $$;

-- 11. Profiles: self, SuperAdmin for anyone, Client Admin for their own Client Staff.
CREATE OR REPLACE FUNCTION public.account_profile(target uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid := COALESCE(target, auth.uid()); p public.profiles; a public.account_access;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF t<>auth.uid() AND NOT public.access_can_manage(auth.uid(), t) THEN RAISE EXCEPTION 'You cannot view this person''s profile.'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=t;
 SELECT * INTO a FROM public.account_access WHERE user_id=t;
 RETURN jsonb_build_object('user_id',t,'email',p.email,'full_name',p.full_name,'display_name',p.display_name,'phone',p.phone,'job_title',p.job_title,
  'language',p.language,'preferred_theme',p.preferred_theme,'level',a.level,'status',COALESCE(a.status,'active'),
  'roles',(SELECT COALESCE(jsonb_agg(role::text),'[]') FROM public.user_roles WHERE user_id=t));
END $$;

CREATE OR REPLACE FUNCTION public.account_update_profile(target uuid, p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.profiles; k text; v text; changed jsonb := '{}';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF target<>auth.uid() AND NOT public.access_can_manage(auth.uid(), target) THEN RAISE EXCEPTION 'You cannot edit this person''s profile.'; END IF;
 SELECT * INTO o FROM public.profiles WHERE id=target FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'Profile not found.'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF k NOT IN ('full_name','display_name','phone','job_title','language','preferred_theme') THEN RAISE EXCEPTION 'Unknown profile field: %', k; END IF;
  v := nullif(trim(COALESCE(p->>k,'')),'');
  IF v IS NOT NULL AND length(v)>120 THEN RAISE EXCEPTION 'Keep each profile field under 120 characters.'; END IF;
  IF k='language' AND v IS NOT NULL AND v NOT IN ('en','ms') THEN RAISE EXCEPTION 'Choose English or Bahasa Melayu.'; END IF;
  IF k='preferred_theme' AND v IS NOT NULL AND v NOT IN ('light','dark','high-contrast','system') THEN RAISE EXCEPTION 'Choose Light, Dark, High contrast or System.'; END IF;
  IF k='phone' AND v IS NOT NULL AND v !~ '^[0-9+() -]{6,30}$' THEN RAISE EXCEPTION 'Enter a phone number using digits, spaces, +, ( ) or -.'; END IF;
  IF k='display_name' AND v IS NULL THEN RAISE EXCEPTION 'Display name cannot be empty.'; END IF;
  IF (to_jsonb(o)->>k) IS DISTINCT FROM v THEN changed := changed || jsonb_build_object(k, jsonb_build_object('from',to_jsonb(o)->>k,'to',v)); END IF;
 END LOOP;
 IF changed = '{}'::jsonb THEN RAISE EXCEPTION 'Nothing changed.'; END IF;
 UPDATE public.profiles SET
  full_name = CASE WHEN p ? 'full_name' THEN nullif(trim(COALESCE(p->>'full_name','')),'') ELSE full_name END,
  display_name = CASE WHEN p ? 'display_name' THEN trim(p->>'display_name') ELSE display_name END,
  phone = CASE WHEN p ? 'phone' THEN nullif(trim(COALESCE(p->>'phone','')),'') ELSE phone END,
  job_title = CASE WHEN p ? 'job_title' THEN nullif(trim(COALESCE(p->>'job_title','')),'') ELSE job_title END,
  language = CASE WHEN p ? 'language' THEN nullif(trim(COALESCE(p->>'language','')),'') ELSE language END,
  preferred_theme = CASE WHEN p ? 'preferred_theme' THEN nullif(trim(COALESCE(p->>'preferred_theme','')),'') ELSE preferred_theme END
 WHERE id=target;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (target,'profile_updated',changed);
END $$;

-- Self-service events (password changed, other sessions signed out, email change requested).
CREATE OR REPLACE FUNCTION public.account_log_self(a text, detail jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF a NOT IN ('password_changed','signed_out_other_sessions','email_change_requested') THEN RAISE EXCEPTION 'Unknown account action.'; END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (auth.uid(),a,COALESCE(detail,'{}'));
END $$;

-- Reset links: the caller's right is checked here; the server records the send only after it succeeds.
CREATE OR REPLACE FUNCTION public.access_reset_target(target uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.access_can_manage(auth.uid(), target) THEN RAISE EXCEPTION 'You cannot send a password reset to this person.'; END IF;
 RETURN (SELECT email FROM public.profiles WHERE id=target);
END $$;
CREATE OR REPLACE FUNCTION public.access_log_admin(actor uuid, target uuid, a text, detail jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF a NOT IN ('password_reset_sent') THEN RAISE EXCEPTION 'Unknown admin action.'; END IF;
 IF NOT public.access_can_manage(actor, target) THEN RAISE EXCEPTION 'You cannot send a password reset to this person.'; END IF;
 INSERT INTO public.account_admin_events(actor,target,action,detail) VALUES (actor,target,a,COALESCE(detail,'{}'));
END $$;

-- 12. Users and access list and User activity.
CREATE OR REPLACE FUNCTION public.access_users() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); sa boolean := public.access_is_superadmin(auth.uid()); mg boolean := public.has_role(auth.uid(),'management'); cid uuid;
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT client_id INTO cid FROM public.client_users WHERE user_id=me AND role='client_admin' AND status='active';
 IF NOT (sa OR mg OR (cid IS NOT NULL AND public.portal_is_admin(me,cid))) THEN RAISE EXCEPTION 'You cannot open Users and access.'; END IF;
 RETURN jsonb_build_object('scope',CASE WHEN sa THEN 'all' WHEN mg THEN 'members' ELSE 'client' END,
  'users',COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',COALESCE(p.display_name,p.email),'full_name',p.full_name,'email',p.email,'level',a.level,'status',a.status,
     'roles',(SELECT COALESCE(jsonb_agg(role::text ORDER BY role::text),'[]') FROM public.user_roles r WHERE r.user_id=a.user_id),
     'client',(SELECT COALESCE(c.display_name,c.name) FROM public.client_users x JOIN public.clients c ON c.id=x.client_id WHERE x.user_id=a.user_id),
     'member_tier',(SELECT name FROM public.billing_tiers WHERE id=a.member_tier_id),
     'last_sign_in',(SELECT last_sign_in_at FROM auth.users au WHERE au.id=a.user_id),
     'is_me',a.user_id=me,'can_manage',public.access_can_manage(me,a.user_id))
    ORDER BY array_position(ARRAY['superadmin','fa_staff','client_admin','client_staff','member'],a.level), COALESCE(p.display_name,p.email))
   FROM public.account_access a LEFT JOIN public.profiles p ON p.id=a.user_id
   WHERE sa OR (mg AND NOT sa AND a.level='member') OR (NOT sa AND NOT mg AND a.level='client_staff' AND EXISTS (SELECT 1 FROM public.client_users x WHERE x.user_id=a.user_id AND x.client_id=cid))),'[]'::jsonb),
  'member_invitations',CASE WHEN sa OR mg THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'status',status,'expires',invite_expires_at,'tier',(SELECT name FROM public.billing_tiers WHERE id=tier_id)) ORDER BY created_at DESC) FROM public.member_invitations WHERE status='pending'),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION public.access_activity() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); sa boolean := public.access_is_superadmin(auth.uid()); mg boolean := public.has_role(auth.uid(),'management'); cid uuid;
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT client_id INTO cid FROM public.client_users WHERE user_id=me AND role='client_admin' AND status='active';
 IF cid IS NOT NULL AND NOT public.portal_is_admin(me,cid) THEN cid := NULL; END IF;
 RETURN COALESCE((SELECT jsonb_agg(row_to_json(x) ORDER BY x.at DESC) FROM (
   SELECT * FROM (
    SELECT e.created_at at, e.action, e.detail, e.actor, e.target,
      (SELECT COALESCE(display_name,email) FROM public.profiles WHERE id=e.actor) actor_name,
      COALESCE((SELECT COALESCE(display_name,email) FROM public.profiles WHERE id=e.target),(SELECT email FROM public.member_invitations WHERE id=e.target)) target_name
    FROM public.account_admin_events e
    WHERE sa OR e.target=me OR e.actor=me
      OR (mg AND (public.access_level_of(e.target)='member' OR EXISTS (SELECT 1 FROM public.member_invitations WHERE id=e.target)))
      OR (cid IS NOT NULL AND EXISTS (SELECT 1 FROM public.client_users x WHERE x.user_id=e.target AND x.client_id=cid AND x.role='client_user'))
    UNION ALL
    SELECT l.created_at, 'level_log', jsonb_build_object('from_level',l.from_level,'to_level',l.to_level,'from_status',l.from_status,'to_status',l.to_status), l.actor, l.user_id,
      (SELECT COALESCE(display_name,email) FROM public.profiles WHERE id=l.actor), (SELECT COALESCE(display_name,email) FROM public.profiles WHERE id=l.user_id)
    FROM public.access_level_log l
    WHERE sa OR l.user_id=me OR (mg AND public.access_level_of(l.user_id)='member')
      OR (cid IS NOT NULL AND EXISTS (SELECT 1 FROM public.client_users x WHERE x.user_id=l.user_id AND x.client_id=cid AND x.role='client_user'))
   ) y ORDER BY at DESC LIMIT 300) x),'[]'::jsonb);
END $$;

-- 13. Privileges.
REVOKE ALL ON FUNCTION public.access_level_of(uuid), public.access_active(uuid), public.access_is_superadmin(uuid), public.access_is_member(uuid),
  public.access_recompute(uuid), public.access_last_superadmin_guard(), public.access_user_roles_guard(), public.access_sync_roles(),
  public.member_invite(text,text,text,timestamptz,uuid,uuid), public.member_cancel_invite(uuid), public.member_invitation_info(text), public.member_claim_invitation(text), public.member_activate_invitation(uuid,uuid),
  public.report_member_release_in_force(uuid), public.report_set_members(uuid,boolean), public.member_reports(), public.access_menu(), public.access_can_manage(uuid,uuid),
  public.access_set_level(uuid,text), public.access_set_status(uuid,boolean), public.account_profile(uuid), public.account_update_profile(uuid,jsonb), public.account_log_self(text,jsonb),
  public.access_reset_target(uuid), public.access_log_admin(uuid,uuid,text,jsonb), public.access_users(), public.access_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.access_recompute(uuid), public.member_invitation_info(text), public.member_claim_invitation(text), public.member_activate_invitation(uuid,uuid), public.access_log_admin(uuid,uuid,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.access_level_of(uuid), public.access_active(uuid), public.access_is_superadmin(uuid), public.access_is_member(uuid),
  public.member_invite(text,text,text,timestamptz,uuid,uuid), public.member_cancel_invite(uuid), public.report_member_release_in_force(uuid), public.report_set_members(uuid,boolean), public.member_reports(),
  public.access_menu(), public.access_can_manage(uuid,uuid), public.access_set_level(uuid,text), public.access_set_status(uuid,boolean), public.account_profile(uuid), public.account_update_profile(uuid,jsonb),
  public.account_log_self(text,jsonb), public.access_reset_target(uuid), public.access_users(), public.access_activity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_level_of(uuid), public.access_active(uuid), public.access_is_superadmin(uuid), public.access_is_member(uuid), public.access_recompute(uuid),
  public.member_invitation_info(text), public.member_claim_invitation(text), public.member_activate_invitation(uuid,uuid), public.report_member_release_in_force(uuid),
  public.access_can_manage(uuid,uuid), public.access_log_admin(uuid,uuid,text,jsonb) TO service_role;