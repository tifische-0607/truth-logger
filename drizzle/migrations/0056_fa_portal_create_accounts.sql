-- SuperAdmins create accounts of any level through recorded single-use invitations. Additive.
CREATE TABLE public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(trim(email))),
  name text NOT NULL CHECK (length(trim(name))>0),
  level text NOT NULL CHECK (level IN ('superadmin','fa_staff')),
  roles text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled')),
  invited_by uuid DEFAULT auth.uid(),
  invite_token_hash text CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$'),
  invite_expires_at timestamptz,
  invite_used_at timestamptz,
  user_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (level='superadmin' OR (cardinality(roles)>0 AND roles <@ ARRAY['analyst','curator','management']))
);
GRANT SELECT ON public.staff_invitations TO authenticated;
GRANT ALL ON public.staff_invitations TO service_role;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_invitations_read ON public.staff_invitations FOR SELECT TO authenticated USING (public.access_is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.account_email_in_use(em text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email)=lower(trim(em)))
  OR EXISTS (SELECT 1 FROM public.staff_invitations WHERE email=lower(trim(em)) AND status='pending')
  OR EXISTS (SELECT 1 FROM public.member_invitations WHERE email=lower(trim(em)) AND status='pending')
  OR EXISTS (SELECT 1 FROM public.client_users WHERE email=lower(trim(em)) AND status IN ('pending','active')); $$;

-- One entry point for every level. Caps (2 administrators, seats, tier) stay in portal_client_user_guard.
CREATE OR REPLACE FUNCTION public.account_invite(lvl text, n text, e text, h text, expires timestamptz, roles text[] DEFAULT '{}', client uuid DEFAULT NULL, tier uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid; em text := lower(trim(e)); clean text[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF lvl NOT IN ('superadmin','fa_staff','client_admin','client_staff','member') THEN RAISE EXCEPTION 'Choose an access level.'; END IF;
 IF lvl IN ('superadmin','fa_staff','client_admin') AND NOT public.access_is_superadmin(auth.uid()) THEN
  RAISE EXCEPTION '%', CASE WHEN lvl='client_admin' THEN 'Only a SuperAdmin can create Client Admin accounts.' ELSE 'Only a SuperAdmin can create SuperAdmin or FA Staff accounts.' END; END IF;
 IF em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid email address.'; END IF;
 IF public.account_email_in_use(em) THEN RAISE EXCEPTION 'This email is already in use by an FA Portal login or a pending invitation.'; END IF;
 IF expires<=now() OR expires>now()+interval '8 days' THEN RAISE EXCEPTION 'Invitation expiry is invalid.'; END IF;
 IF lvl IN ('superadmin','fa_staff') THEN
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x),'{}') INTO clean FROM unnest(COALESCE(roles,'{}')) x;
  IF lvl='fa_staff' AND (cardinality(clean)=0 OR NOT clean <@ ARRAY['analyst','curator','management']) THEN RAISE EXCEPTION 'Choose at least one job role: analyst, Curator or Management.'; END IF;
  IF lvl='superadmin' THEN clean := '{}'; END IF;
  INSERT INTO public.staff_invitations(email,name,level,roles,invite_token_hash,invite_expires_at) VALUES (em,trim(n),lvl,clean,h,expires) RETURNING id INTO rid;
 ELSIF lvl IN ('client_admin','client_staff') THEN
  IF client IS NULL THEN RAISE EXCEPTION 'Choose a client.'; END IF;
  rid := public.portal_invite_member(client,n,em,h,expires,CASE lvl WHEN 'client_admin' THEN 'client_admin' ELSE 'client_user' END,NULL);
 ELSE
  rid := public.member_invite(n,em,h,expires,tier,NULL);
 END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (rid,'account_created',jsonb_build_object('email',em,'level',lvl,'roles',to_jsonb(COALESCE(clean,'{}'::text[])),
   'client',(SELECT COALESCE(display_name,name) FROM public.clients WHERE id=client),'tier',(SELECT name FROM public.billing_tiers WHERE id=tier)));
 RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.account_invite_kind(rid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT CASE WHEN EXISTS (SELECT 1 FROM public.staff_invitations WHERE id=rid) THEN 'staff'
  WHEN EXISTS (SELECT 1 FROM public.member_invitations WHERE id=rid) THEN 'member'
  WHEN EXISTS (SELECT 1 FROM public.client_users WHERE id=rid) THEN 'client' END; $$;

CREATE OR REPLACE FUNCTION public.account_invite_resend(rid uuid, h text, expires timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text := public.account_invite_kind(rid); s public.staff_invitations; c public.client_users;
BEGIN
 IF k='staff' THEN
  IF NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only a SuperAdmin can resend SuperAdmin or FA Staff invitations.'; END IF;
  SELECT * INTO s FROM public.staff_invitations WHERE id=rid FOR UPDATE;
  IF s.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be resent.'; END IF;
  IF expires<=now() OR expires>now()+interval '8 days' THEN RAISE EXCEPTION 'Invitation expiry is invalid.'; END IF;
  UPDATE public.staff_invitations SET invite_token_hash=h, invite_expires_at=expires, invite_used_at=NULL WHERE id=rid;
 ELSIF k='member' THEN PERFORM public.member_invite('x','x@x.x',h,expires,NULL,rid);
 ELSIF k='client' THEN SELECT * INTO c FROM public.client_users WHERE id=rid; PERFORM public.portal_invite_member(c.client_id,c.name,c.email,h,expires,c.role,rid);
 ELSE RAISE EXCEPTION 'Invitation not found.'; END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (rid,'account_invite_resent',jsonb_build_object('kind',k));
END $$;

CREATE OR REPLACE FUNCTION public.account_invite_cancel(rid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text := public.account_invite_kind(rid); s public.staff_invitations;
BEGIN
 IF k='staff' THEN
  IF NOT public.access_is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Only a SuperAdmin can cancel SuperAdmin or FA Staff invitations.'; END IF;
  SELECT * INTO s FROM public.staff_invitations WHERE id=rid FOR UPDATE;
  IF s.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be cancelled.'; END IF;
  UPDATE public.staff_invitations SET status='cancelled', invite_token_hash=NULL, invite_expires_at=NULL WHERE id=rid;
 ELSIF k='member' THEN PERFORM public.member_cancel_invite(rid);
 ELSIF k='client' THEN PERFORM public.portal_admin_action(rid,'cancel');
 ELSE RAISE EXCEPTION 'Invitation not found.'; END IF;
 INSERT INTO public.account_admin_events(target,action,detail) VALUES (rid,'account_invite_cancelled',jsonb_build_object('kind',k));
END $$;

-- Pending invitations of every level (SuperAdmin all; Management Members only).
CREATE OR REPLACE FUNCTION public.account_pending_invites() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sa boolean := public.access_is_superadmin(auth.uid()); mg boolean := public.has_role(auth.uid(),'management');
BEGIN
 IF NOT (sa OR mg) THEN RAISE EXCEPTION 'You cannot view invitations.'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC) FROM (
  SELECT jsonb_build_object('id',id,'name',name,'email',email,'level',level,'roles',to_jsonb(roles),'client',NULL,'tier',NULL,'expires',invite_expires_at,'created_at',created_at) x FROM public.staff_invitations WHERE sa AND status='pending'
  UNION ALL SELECT jsonb_build_object('id',m.id,'name',m.name,'email',m.email,'level','member','roles','[]'::jsonb,'client',NULL,'tier',(SELECT name FROM public.billing_tiers WHERE id=m.tier_id),'expires',m.invite_expires_at,'created_at',m.created_at) FROM public.member_invitations m WHERE m.status='pending'
  UNION ALL SELECT jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'level',CASE u.role WHEN 'client_admin' THEN 'client_admin' ELSE 'client_staff' END,'roles','[]'::jsonb,'client',(SELECT COALESCE(display_name,name) FROM public.clients WHERE id=u.client_id),'tier',NULL,'expires',u.invite_expires_at,'created_at',u.created_at) FROM public.client_users u WHERE sa AND u.status='pending'
 ) s),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.staff_invitation_info(h text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT jsonb_build_object('kind','staff','client_name','FridayAnalytics','name',s.name,'email',s.email,'existing_account',EXISTS(SELECT 1 FROM public.profiles p WHERE lower(p.email)=s.email))
 FROM public.staff_invitations s WHERE s.invite_token_hash=h AND s.status='pending' AND s.invite_used_at IS NULL AND s.invite_expires_at>now(); $$;
CREATE OR REPLACE FUNCTION public.staff_claim_invitation(h text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.staff_invitations;
BEGIN
 SELECT * INTO s FROM public.staff_invitations WHERE invite_token_hash=h AND status='pending' AND invite_used_at IS NULL AND invite_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is invalid, expired or already used.'; END IF;
 UPDATE public.staff_invitations SET invite_used_at=now(), invite_token_hash=NULL WHERE id=s.id;
 RETURN jsonb_build_object('id',s.id,'email',s.email,'name',s.name);
END $$;
-- Level and roles come only from the recorded invitation.
CREATE OR REPLACE FUNCTION public.staff_activate_invitation(rid uuid, uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.staff_invitations; r text;
BEGIN
 SELECT * INTO s FROM public.staff_invitations WHERE id=rid AND status='pending' AND invite_used_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation was not claimed.'; END IF;
 IF EXISTS (SELECT 1 FROM public.account_access WHERE user_id=uid) OR EXISTS (SELECT 1 FROM public.client_users WHERE user_id=uid) THEN RAISE EXCEPTION 'This login already has an access level.'; END IF;
 UPDATE public.staff_invitations SET status='active', user_id=uid WHERE id=rid;
 IF s.level='superadmin' THEN INSERT INTO public.user_roles(user_id,role) VALUES (uid,'owner');
 ELSE FOREACH r IN ARRAY s.roles LOOP INSERT INTO public.user_roles(user_id,role) VALUES (uid,r::app_role) ON CONFLICT DO NOTHING; END LOOP; END IF;
 INSERT INTO public.account_admin_events(actor,target,action,detail) VALUES (uid,uid,'account_accepted',jsonb_build_object('invitation',rid,'level',s.level,'roles',to_jsonb(s.roles)));
END $$;

REVOKE ALL ON FUNCTION public.account_email_in_use(text), public.account_invite(text,text,text,text,timestamptz,text[],uuid,uuid), public.account_invite_kind(uuid),
  public.account_invite_resend(uuid,text,timestamptz), public.account_invite_cancel(uuid), public.account_pending_invites(),
  public.staff_invitation_info(text), public.staff_claim_invitation(text), public.staff_activate_invitation(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_invitation_info(text), public.staff_claim_invitation(text), public.staff_activate_invitation(uuid,uuid), public.account_email_in_use(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.account_invite(text,text,text,text,timestamptz,text[],uuid,uuid), public.account_invite_kind(uuid), public.account_invite_resend(uuid,text,timestamptz),
  public.account_invite_cancel(uuid), public.account_pending_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_invitation_info(text), public.staff_claim_invitation(text), public.staff_activate_invitation(uuid,uuid), public.account_email_in_use(text) TO service_role;