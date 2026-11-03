ALTER TABLE public.clients ADD COLUMN kind text NOT NULL DEFAULT 'organization' CHECK (kind IN ('individual','organization'));
ALTER TABLE public.clients ADD COLUMN display_name text;
UPDATE public.clients SET display_name = name WHERE display_name IS NULL;

CREATE TABLE public.client_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 user_id uuid, email text NOT NULL CHECK (email = lower(trim(email))), name text NOT NULL CHECK(length(trim(name))>0),
 role text NOT NULL DEFAULT 'client_admin' CHECK(role='client_admin'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','inactive')),
 invited_by uuid DEFAULT auth.uid(), invite_token_hash text, invite_expires_at timestamptz,
 invite_used_at timestamptz, last_sign_in timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,email), UNIQUE(user_id), CHECK(invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$')
);
GRANT ALL ON public.client_users TO service_role;
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 client_user_id uuid REFERENCES public.client_users(id), actor uuid DEFAULT auth.uid(), action text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_access_events TO authenticated;
GRANT ALL ON public.client_access_events TO service_role;
ALTER TABLE public.client_access_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER client_access_events_immutable BEFORE UPDATE OR DELETE ON public.client_access_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.portal_is_staff(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u); $$;
CREATE OR REPLACE FUNCTION public.portal_is_admin(u uuid,c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.client_users WHERE user_id=u AND client_id=c AND status='active') AND NOT public.portal_is_staff(u); $$;
REVOKE ALL ON FUNCTION public.portal_is_staff(uuid),public.portal_is_admin(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_is_staff(uuid),public.portal_is_admin(uuid,uuid) TO authenticated,service_role;
CREATE POLICY "staff and own client activity" ON public.client_access_events FOR SELECT TO authenticated USING(public.portal_is_staff(auth.uid()) OR public.portal_is_admin(auth.uid(),client_id));

CREATE OR REPLACE FUNCTION public.portal_client_user_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text,0));
 IF NEW.status IN ('pending','active') AND (SELECT count(*) FROM public.client_users WHERE client_id=NEW.client_id AND status IN ('pending','active') AND id<>NEW.id)>=2 THEN
  RAISE EXCEPTION 'A client can have at most 2 administrators.';
 END IF;
 IF NEW.user_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM public.project_members WHERE user_id=NEW.user_id)) THEN
  RAISE EXCEPTION 'A client administrator cannot have a staff role or engagement membership.';
 END IF;
 IF NEW.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND lower(email)=NEW.email) THEN RAISE EXCEPTION 'The account email must match the invitation.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.client_id<>OLD.client_id OR NEW.email<>OLD.email) THEN RAISE EXCEPTION 'Client and invitation email cannot change.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER client_users_guard BEFORE INSERT OR UPDATE ON public.client_users FOR EACH ROW EXECUTE FUNCTION public.portal_client_user_guard();
CREATE TRIGGER client_users_no_delete BEFORE DELETE ON public.client_users FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.portal_client_enable_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text,0));
 IF NEW.portal_enabled AND NOT EXISTS(SELECT 1 FROM public.client_users WHERE client_id=NEW.id AND status IN ('pending','active')) THEN RAISE EXCEPTION 'Invite at least one administrator before enabling the portal.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clients_portal_enable BEFORE INSERT OR UPDATE OF portal_enabled ON public.clients FOR EACH ROW EXECUTE FUNCTION public.portal_client_enable_guard();
CREATE OR REPLACE FUNCTION public.portal_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,1));
 IF EXISTS(SELECT 1 FROM public.client_users WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'A client administrator cannot have a staff role or engagement membership.'; END IF;
 IF TG_TABLE_NAME='project_members' AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND role='management') THEN RAISE EXCEPTION 'FA Management cannot hold an engagement role.'; END IF;
 IF TG_TABLE_NAME='user_roles' AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND id<>NEW.id AND (role='management' OR NEW.role='management')) THEN RAISE EXCEPTION 'FA Management must be a separate read-only role.'; END IF;
 IF TG_TABLE_NAME='user_roles' AND NEW.role='management' AND EXISTS(SELECT 1 FROM public.project_members WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'FA Management cannot hold an engagement role.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_roles_portal_guard BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.portal_identity_guard();
CREATE TRIGGER project_members_portal_guard BEFORE INSERT OR UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.portal_identity_guard();

CREATE OR REPLACE FUNCTION public.is_investigator(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role<>'management'); $$;
CREATE OR REPLACE FUNCTION public.can_access_project(_user_id uuid,_project_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(_user_id,'management') OR public.has_project_role(_user_id,_project_id,ARRAY['owner','curator','engagement_lead','lead_analyst','analyst','collection_operator','evidence_officer','data_steward','reviewer']); $$;
CREATE OR REPLACE FUNCTION public.project_role(_user_id uuid,_project_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT CASE WHEN public.has_role(_user_id,'management') THEN 'management' WHEN public.has_role(_user_id,'owner') THEN 'owner' WHEN public.has_role(_user_id,'curator') THEN 'curator' ELSE (SELECT role FROM public.project_members WHERE user_id=_user_id AND project_id=_project_id) END; $$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('client_users','client_access_events') LOOP
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t.tablename);
 EXECUTE format('CREATE POLICY "FA Management reads" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''management''))',t.tablename);
 EXECUTE format('CREATE POLICY "FA Management cannot write" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (NOT public.has_role(auth.uid(), ''management''))',t.tablename);
 END LOOP;
END $$;
CREATE POLICY "FA Management evidence reads" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='evidence' AND public.has_role(auth.uid(),'management'));
CREATE POLICY "FA Management no storage writes" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(true) WITH CHECK(NOT public.has_role(auth.uid(),'management'));

CREATE OR REPLACE FUNCTION public.portal_access_list(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.portal_is_staff(auth.uid()) OR public.portal_is_admin(auth.uid(),c)) THEN RAISE EXCEPTION 'You cannot access this client.'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name,'status',status,'user_id',user_id,'last_sign_in',last_sign_in,'invite_expires_at',invite_expires_at) ORDER BY created_at) FROM public.client_users WHERE client_id=c),'[]');
END $$;
CREATE OR REPLACE FUNCTION public.portal_invite(c uuid,n text,e text,h text,expires timestamptz,existing uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; r public.client_users;
BEGIN
 IF NOT (public.has_role(auth.uid(),'owner') OR public.portal_is_admin(auth.uid(),c)) THEN RAISE EXCEPTION 'Only the owner or an active client administrator can invite.'; END IF;
 IF expires<=now() OR expires>now()+interval '8 days' THEN RAISE EXCEPTION 'Invitation expiry is invalid.'; END IF;
 IF existing IS NULL THEN
 INSERT INTO public.client_users(client_id,name,email,invite_token_hash,invite_expires_at) VALUES(c,trim(n),lower(trim(e)),h,expires) RETURNING id INTO rid;
 ELSE
 SELECT * INTO r FROM public.client_users WHERE id=existing AND client_id=c FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be resent.'; END IF;
 UPDATE public.client_users SET invite_token_hash=h,invite_expires_at=expires,invite_used_at=NULL WHERE id=existing;
 rid:=existing;
 END IF;
 INSERT INTO public.client_access_events(client_id,client_user_id,action,detail) VALUES(c,rid,CASE WHEN existing IS NULL THEN 'invited' ELSE 'resent' END,jsonb_build_object('email',lower(trim(e))));
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.portal_admin_action(rid uuid,a text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.client_users;
BEGIN
 SELECT * INTO r FROM public.client_users WHERE id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator not found.'; END IF;
 IF NOT public.has_role(auth.uid(),'owner') AND NOT(public.portal_is_admin(auth.uid(),r.client_id) AND a='cancel' AND r.status='pending') THEN RAISE EXCEPTION 'Only the owner can deactivate or reactivate administrators.'; END IF;
 IF a='cancel' AND r.status='pending' THEN UPDATE public.client_users SET status='inactive',invite_token_hash=NULL,invite_expires_at=NULL WHERE id=rid;
 ELSIF a='deactivate' AND r.status='active' THEN UPDATE public.client_users SET status='inactive' WHERE id=rid;
 ELSIF a='reactivate' AND r.status='inactive' AND r.user_id IS NOT NULL THEN UPDATE public.client_users SET status='active' WHERE id=rid;
 ELSE RAISE EXCEPTION 'This administrator action is not available.'; END IF;
 INSERT INTO public.client_access_events(client_id,client_user_id,action) VALUES(r.client_id,r.id,a);
END $$;
CREATE OR REPLACE FUNCTION public.portal_invitation_info(h text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('client_name',COALESCE(c.display_name,c.name),'name',u.name,'email',u.email,'existing_account',EXISTS(SELECT 1 FROM public.profiles p WHERE lower(p.email)=u.email)) FROM public.client_users u JOIN public.clients c ON c.id=u.client_id WHERE u.invite_token_hash=h AND u.status='pending' AND u.invite_used_at IS NULL AND u.invite_expires_at>now(); $$;
CREATE OR REPLACE FUNCTION public.portal_claim_invitation(h text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.client_users;
BEGIN
 SELECT * INTO u FROM public.client_users WHERE invite_token_hash=h AND status='pending' AND invite_used_at IS NULL AND invite_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is invalid, expired or already used.'; END IF;
 UPDATE public.client_users SET invite_used_at=now(),invite_token_hash=NULL WHERE id=u.id;
 RETURN jsonb_build_object('id',u.id,'client_id',u.client_id,'email',u.email,'name',u.name);
END $$;
CREATE OR REPLACE FUNCTION public.portal_activate_invitation(rid uuid,uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.client_users;
BEGIN
 SELECT * INTO u FROM public.client_users WHERE id=rid AND status='pending' AND invite_used_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation was not claimed.'; END IF;
 UPDATE public.client_users SET user_id=uid,status='active' WHERE id=rid;
 INSERT INTO public.client_access_events(client_id,client_user_id,actor,action) VALUES(u.client_id,u.id,uid,'accepted');
END $$;
CREATE OR REPLACE FUNCTION public.portal_identity() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.client_users; role_name text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT role::text INTO role_name FROM public.user_roles WHERE user_id=auth.uid() ORDER BY CASE role::text WHEN 'owner' THEN 0 WHEN 'curator' THEN 1 WHEN 'management' THEN 2 ELSE 3 END LIMIT 1;
 IF role_name IS NOT NULL THEN RETURN jsonb_build_object('kind','staff','role',role_name,'destination',CASE role_name WHEN 'curator' THEN '/inbox' WHEN 'management' THEN '/management' ELSE '/dashboard' END); END IF;
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active';
 IF FOUND THEN RETURN jsonb_build_object('kind','client','destination','/portal','client_id',u.client_id); END IF;
 RETURN jsonb_build_object('kind','none','destination','/auth');
END $$;
CREATE OR REPLACE FUNCTION public.portal_home(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; u public.client_users; cl public.clients;
BEGIN
 IF public.portal_is_staff(auth.uid()) THEN cid:=c;
 ELSE SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active'; cid:=u.client_id; END IF;
 IF cid IS NULL THEN RETURN jsonb_build_object('preview',public.portal_is_staff(auth.uid()),'clients',CASE WHEN public.portal_is_staff(auth.uid()) THEN (SELECT jsonb_agg(jsonb_build_object('id',id,'name',COALESCE(display_name,name))) FROM public.clients) ELSE '[]'::jsonb END); END IF;
 SELECT * INTO cl FROM public.clients WHERE id=cid;
 RETURN jsonb_build_object('client_id',cid,'client_name',COALESCE(cl.display_name,cl.name),'kind',cl.kind,'portal_enabled',cl.portal_enabled,'name',u.name,'last_sign_in',u.last_sign_in,'admins',public.portal_access_list(cid),'preview',public.portal_is_staff(auth.uid()));
END $$;
CREATE OR REPLACE FUNCTION public.portal_record_sign_in() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.client_users;
BEGIN
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active' FOR UPDATE;
 IF FOUND THEN INSERT INTO public.client_access_events(client_id,client_user_id,action,detail) VALUES(u.client_id,u.id,'signed_in',jsonb_build_object('previous_sign_in',u.last_sign_in)); UPDATE public.client_users SET last_sign_in=now() WHERE id=u.id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.portal_client_user_guard(),public.portal_client_enable_guard(),public.portal_identity_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.portal_access_list(uuid),public.portal_invite(uuid,text,text,text,timestamptz,uuid),public.portal_admin_action(uuid,text),public.portal_identity(),public.portal_home(uuid),public.portal_record_sign_in() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_access_list(uuid),public.portal_invite(uuid,text,text,text,timestamptz,uuid),public.portal_admin_action(uuid,text),public.portal_identity(),public.portal_home(uuid),public.portal_record_sign_in() TO authenticated;
REVOKE ALL ON FUNCTION public.portal_invitation_info(text),public.portal_claim_invitation(text),public.portal_activate_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_invitation_info(text),public.portal_claim_invitation(text),public.portal_activate_invitation(uuid,uuid) TO service_role;