CREATE OR REPLACE FUNCTION public.portal_client_user_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text,0));
 IF NEW.user_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,1)); END IF;
 IF NEW.status IN ('pending','active') AND (SELECT count(*) FROM public.client_users WHERE client_id=NEW.client_id AND status IN ('pending','active') AND id<>NEW.id)>=2 THEN RAISE EXCEPTION 'A client can have at most 2 administrators.'; END IF;
 IF NEW.user_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM public.project_members WHERE user_id=NEW.user_id)) THEN RAISE EXCEPTION 'A client administrator cannot have a staff role or engagement membership.'; END IF;
 IF NEW.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND lower(email)=NEW.email) THEN RAISE EXCEPTION 'The account email must match the invitation.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.client_id<>OLD.client_id OR NEW.email<>OLD.email) THEN RAISE EXCEPTION 'Client and invitation email cannot change.'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.portal_is_admin(u uuid,c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.client_users a JOIN public.clients b ON b.id=a.client_id WHERE a.user_id=u AND a.client_id=c AND a.status='active' AND b.portal_enabled AND b.status='active') AND NOT public.portal_is_staff(u); $$;
CREATE OR REPLACE FUNCTION public.portal_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,1));
 IF EXISTS(SELECT 1 FROM public.client_users WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'A client administrator cannot have a staff role or engagement membership.'; END IF;
 IF TG_TABLE_NAME='project_members' THEN
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND role='management') THEN RAISE EXCEPTION 'FA Management cannot hold an engagement role.'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND id<>NEW.id AND (role='management' OR NEW.role='management')) THEN RAISE EXCEPTION 'FA Management must be a separate read-only role.'; END IF;
  IF NEW.role='management' AND EXISTS(SELECT 1 FROM public.project_members WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'FA Management cannot hold an engagement role.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.portal_invite(c uuid,n text,e text,h text,expires timestamptz,existing uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; r public.client_users;
BEGIN
 IF NOT (public.has_role(auth.uid(),'owner') OR public.portal_is_admin(auth.uid(),c)) THEN RAISE EXCEPTION 'Only the owner or an active client administrator can invite.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,0));
 IF expires<=now() OR expires>now()+interval '8 days' THEN RAISE EXCEPTION 'Invitation expiry is invalid.'; END IF;
 IF existing IS NULL THEN
  INSERT INTO public.client_users(client_id,name,email,invite_token_hash,invite_expires_at) VALUES(c,trim(n),lower(trim(e)),h,expires) RETURNING id INTO rid;
 ELSE
  SELECT * INTO r FROM public.client_users WHERE id=existing AND client_id=c FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be resent.'; END IF;
  IF r.invite_used_at IS NOT NULL AND r.invite_used_at>now()-interval '5 minutes' THEN RAISE EXCEPTION 'This invitation is being accepted. Try again shortly.'; END IF;
  UPDATE public.client_users SET invite_token_hash=h,invite_expires_at=expires,invite_used_at=NULL WHERE id=existing;
  rid:=existing;
 END IF;
 INSERT INTO public.client_access_events(client_id,client_user_id,action,detail) VALUES(c,rid,CASE WHEN existing IS NULL THEN 'invited' ELSE 'resent' END,jsonb_build_object('email',lower(trim(e))));
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.portal_admin_action(rid uuid,a text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.client_users; cid uuid;
BEGIN
 SELECT client_id INTO cid FROM public.client_users WHERE id=rid;
 IF cid IS NULL THEN RAISE EXCEPTION 'Administrator not found.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text,0));
 SELECT * INTO r FROM public.client_users WHERE id=rid FOR UPDATE;
 IF NOT public.has_role(auth.uid(),'owner') AND NOT(public.portal_is_admin(auth.uid(),r.client_id) AND a='cancel' AND r.status='pending') THEN RAISE EXCEPTION 'Only the owner can deactivate or reactivate administrators.'; END IF;
 IF r.status='pending' AND r.invite_used_at IS NOT NULL AND r.invite_used_at>now()-interval '5 minutes' THEN RAISE EXCEPTION 'This invitation is being accepted. Try again shortly.'; END IF;
 IF a='cancel' AND r.status='pending' THEN UPDATE public.client_users SET status='inactive',invite_token_hash=NULL,invite_expires_at=NULL WHERE id=rid;
 ELSIF a='deactivate' AND r.status='active' THEN UPDATE public.client_users SET status='inactive' WHERE id=rid;
 ELSIF a='reactivate' AND r.status='inactive' AND r.user_id IS NOT NULL THEN UPDATE public.client_users SET status='active' WHERE id=rid;
 ELSE RAISE EXCEPTION 'This administrator action is not available.'; END IF;
 INSERT INTO public.client_access_events(client_id,client_user_id,action) VALUES(r.client_id,r.id,a);
END $$;
CREATE OR REPLACE FUNCTION public.portal_home(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; u public.client_users; cl public.clients; staff boolean:=public.portal_is_staff(auth.uid());
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF staff THEN cid:=c; ELSE SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active'; cid:=u.client_id; END IF;
 IF cid IS NULL THEN RETURN jsonb_build_object('preview',staff,'clients',CASE WHEN staff THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',COALESCE(display_name,name))) FROM public.clients),'[]'::jsonb) ELSE '[]'::jsonb END); END IF;
 SELECT * INTO cl FROM public.clients WHERE id=cid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Client not found.'; END IF;
 IF NOT staff AND (NOT cl.portal_enabled OR cl.status<>'active') THEN RETURN jsonb_build_object('preview',false,'portal_enabled',false,'access_disabled',true); END IF;
 RETURN jsonb_build_object('client_id',cid,'client_name',COALESCE(cl.display_name,cl.name),'kind',cl.kind,'portal_enabled',cl.portal_enabled,'name',u.name,'last_sign_in',u.last_sign_in,'admins',public.portal_access_list(cid),'preview',staff,'clients',CASE WHEN staff THEN (SELECT jsonb_agg(jsonb_build_object('id',id,'name',COALESCE(display_name,name))) FROM public.clients) ELSE '[]'::jsonb END);
END $$;
CREATE OR REPLACE FUNCTION public.portal_activate_invitation(rid uuid,uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.client_users; cid uuid;
BEGIN
 SELECT client_id INTO cid FROM public.client_users WHERE id=rid;
 IF cid IS NULL THEN RAISE EXCEPTION 'Invitation was not claimed.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,1));
 SELECT * INTO u FROM public.client_users WHERE id=rid AND status='pending' AND invite_used_at IS NOT NULL AND invite_used_at>now()-interval '5 minutes' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation was not claimed.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=uid AND lower(email)=u.email) THEN RAISE EXCEPTION 'The account email must match the invitation.'; END IF;
 UPDATE public.client_users SET user_id=uid,status='active' WHERE id=rid;
 INSERT INTO public.client_access_events(client_id,client_user_id,actor,action) VALUES(u.client_id,u.id,uid,'accepted');
END $$;
CREATE OR REPLACE FUNCTION public.portal_log_client_setting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.portal_enabled IS DISTINCT FROM OLD.portal_enabled THEN INSERT INTO public.client_access_events(client_id,action,detail) VALUES(NEW.id,CASE WHEN NEW.portal_enabled THEN 'portal_enabled' ELSE 'portal_disabled' END,'{}'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clients_portal_setting_log AFTER UPDATE OF portal_enabled ON public.clients FOR EACH ROW EXECUTE FUNCTION public.portal_log_client_setting();
REVOKE ALL ON FUNCTION public.portal_log_client_setting() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('client_users','client_access_events') LOOP
 EXECUTE format('CREATE POLICY "FA Management cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.has_role(auth.uid(), ''management''))',t.tablename);
 EXECUTE format('CREATE POLICY "Clients cannot access staff data" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT EXISTS (SELECT 1 FROM public.client_users a WHERE a.user_id = auth.uid())) WITH CHECK (NOT EXISTS (SELECT 1 FROM public.client_users a WHERE a.user_id = auth.uid()))',t.tablename);
 END LOOP;
END $$;