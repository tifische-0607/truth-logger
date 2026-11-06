-- U1 Membership tiers and user seats. Additive; reuses U2 billing_tiers and seat limits.

-- 1. Client user roles: administrators (issued by FridayAnalytics) and users (added by administrators).
UPDATE public.client_users SET role='client_admin' WHERE role IS NULL OR role NOT IN ('client_admin','client_user');
ALTER TABLE public.client_users ADD CONSTRAINT client_users_role_u1 CHECK (role IN ('client_admin','client_user'));

-- 2. Membership helpers. portal_is_member = any active client login; portal_is_admin now also requires the administrator role.
CREATE OR REPLACE FUNCTION public.portal_is_member(u uuid, c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.client_users a JOIN public.clients b ON b.id=a.client_id WHERE a.user_id=u AND a.client_id=c AND a.status='active' AND b.portal_enabled AND b.status='active') AND NOT public.portal_is_staff(u); $$;
CREATE OR REPLACE FUNCTION public.portal_is_admin(u uuid, c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.client_users a JOIN public.clients b ON b.id=a.client_id WHERE a.user_id=u AND a.client_id=c AND a.status='active' AND a.role='client_admin' AND b.portal_enabled AND b.status='active') AND NOT public.portal_is_staff(u); $$;

-- 3. The real seat rule: a seat is held by an active login or by a pending invitation that has not expired.
CREATE OR REPLACE FUNCTION public.u1_holds_seat(status text, expires timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
 SELECT status='active' OR (status='pending' AND expires IS NOT NULL AND expires>now()); $$;
CREATE OR REPLACE FUNCTION public.billing_seats_used(c uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT count(*)::int FROM public.client_users WHERE client_id=c AND public.u1_holds_seat(status,invite_expires_at); $$;

CREATE OR REPLACE FUNCTION public.portal_client_user_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.billing_tiers; used int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text,0));
 IF NEW.user_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,1)); END IF;
 IF TG_OP='UPDATE' AND (NEW.client_id<>OLD.client_id OR NEW.email<>OLD.email) THEN RAISE EXCEPTION 'Client and invitation email cannot change.'; END IF;
 IF TG_OP='UPDATE' AND NEW.role<>OLD.role THEN RAISE EXCEPTION 'A client login''s role cannot change. Invite the person again with the other role.'; END IF;
 IF NEW.role='client_admin' AND NEW.status IN ('pending','active') AND (SELECT count(*) FROM public.client_users WHERE client_id=NEW.client_id AND role='client_admin' AND status IN ('pending','active') AND id<>NEW.id)>=2 THEN RAISE EXCEPTION 'A client can have at most 2 administrators.'; END IF;
 IF public.u1_holds_seat(NEW.status,NEW.invite_expires_at) AND (TG_OP='INSERT' OR NOT public.u1_holds_seat(OLD.status,OLD.invite_expires_at)) THEN
  SELECT b.* INTO t FROM public.billing_tiers b JOIN public.clients c ON c.tier_id=b.id WHERE c.id=NEW.client_id;
  IF t.id IS NULL THEN
   IF NEW.role='client_user' THEN RAISE EXCEPTION 'This client has no tier yet, so only administrators can be added. Ask FridayAnalytics to set a tier.'; END IF;
  ELSIF t.seat_limit IS NOT NULL THEN
   SELECT count(*) INTO used FROM public.client_users WHERE client_id=NEW.client_id AND id<>NEW.id AND public.u1_holds_seat(status,invite_expires_at);
   IF used >= t.seat_limit THEN RAISE EXCEPTION 'Seat limit reached: % of % seats are in use on %. Deactivate a user or ask FridayAnalytics about a larger tier.', used, t.seat_limit, t.name; END IF;
  END IF;
 END IF;
 IF NEW.user_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM public.project_members WHERE user_id=NEW.user_id)) THEN RAISE EXCEPTION 'A client administrator cannot have a staff role or engagement membership.'; END IF;
 IF NEW.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND lower(email)=NEW.email) THEN RAISE EXCEPTION 'The account email must match the invitation.'; END IF;
 RETURN NEW;
END $$;

-- 4. Invitations: administrators are issued only by the owner; client administrators invite users.
CREATE OR REPLACE FUNCTION public.portal_invite_member(c uuid, n text, e text, h text, expires timestamptz, r text, existing uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid; x public.client_users; owner boolean := public.has_role(auth.uid(),'owner'); adm boolean := public.portal_is_admin(auth.uid(),c);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,0));
 IF expires<=now() OR expires>now()+interval '8 days' THEN RAISE EXCEPTION 'Invitation expiry is invalid.'; END IF;
 IF existing IS NULL THEN
  IF r NOT IN ('client_admin','client_user') THEN RAISE EXCEPTION 'Choose administrator or user.'; END IF;
  IF r='client_admin' AND NOT owner THEN RAISE EXCEPTION 'Only FridayAnalytics can issue client administrator logins.'; END IF;
  IF r='client_user' AND NOT (owner OR adm) THEN RAISE EXCEPTION 'Only the owner or an active client administrator can invite users.'; END IF;
  INSERT INTO public.client_users(client_id,name,email,role,invite_token_hash,invite_expires_at) VALUES(c,trim(n),lower(trim(e)),r,h,expires) RETURNING id INTO rid;
 ELSE
  IF NOT (owner OR adm) THEN RAISE EXCEPTION 'Only the owner or an active client administrator can resend invitations.'; END IF;
  SELECT * INTO x FROM public.client_users WHERE id=existing AND client_id=c FOR UPDATE;
  IF NOT FOUND OR x.status<>'pending' THEN RAISE EXCEPTION 'Only a pending invitation can be resent.'; END IF;
  IF x.invite_used_at IS NOT NULL AND x.invite_used_at>now()-interval '5 minutes' THEN RAISE EXCEPTION 'This invitation is being accepted. Try again shortly.'; END IF;
  UPDATE public.client_users SET invite_token_hash=h,invite_expires_at=expires WHERE id=existing;
  rid:=existing;
 END IF;
 INSERT INTO public.client_access_events(client_id,client_user_id,action,detail) VALUES(c,rid,CASE WHEN existing IS NULL THEN 'invited' ELSE 'resent' END,jsonb_build_object('email',lower(trim(e)),'role',COALESCE(x.role,r)));
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.portal_invite(c uuid, n text, e text, h text, expires timestamptz, existing uuid DEFAULT NULL) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT public.portal_invite_member(c,n,e,h,expires,'client_admin',existing); $$;

-- 5. Deactivate / reactivate / cancel. Administrators manage users of their own client (not other administrators, not themselves).
CREATE OR REPLACE FUNCTION public.portal_admin_action(rid uuid, a text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.client_users; cid uuid; owner boolean; adm boolean;
BEGIN
 SELECT client_id INTO cid FROM public.client_users WHERE id=rid;
 IF cid IS NULL THEN RAISE EXCEPTION 'Client login not found.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text,0));
 SELECT * INTO r FROM public.client_users WHERE id=rid FOR UPDATE;
 owner := public.has_role(auth.uid(),'owner'); adm := public.portal_is_admin(auth.uid(),r.client_id);
 IF NOT owner THEN
  IF NOT adm THEN RAISE EXCEPTION 'Only the owner or an active client administrator can change client logins.'; END IF;
  IF r.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own login. Contact FridayAnalytics.'; END IF;
  IF r.role='client_admin' AND NOT (a='cancel' AND r.status='pending') THEN RAISE EXCEPTION 'Only the owner can deactivate or reactivate administrators.'; END IF;
 END IF;
 IF r.status='pending' AND r.invite_used_at IS NOT NULL AND r.invite_used_at>now()-interval '5 minutes' THEN RAISE EXCEPTION 'This invitation is being accepted. Try again shortly.'; END IF;
 IF a='cancel' AND r.status='pending' THEN UPDATE public.client_users SET status='inactive',invite_token_hash=NULL,invite_expires_at=NULL WHERE id=rid;
 ELSIF a='deactivate' AND r.status='active' THEN UPDATE public.client_users SET status='inactive' WHERE id=rid;
 ELSIF a='reactivate' AND r.status='inactive' AND r.user_id IS NOT NULL THEN UPDATE public.client_users SET status='active' WHERE id=rid;
 ELSE RAISE EXCEPTION 'This action is not available for this login.'; END IF;
 INSERT INTO public.client_access_events(client_id,client_user_id,actor,action,detail) VALUES(r.client_id,r.id,auth.uid(),a,jsonb_build_object('role',r.role));
END $$;

CREATE OR REPLACE FUNCTION public.portal_access_list(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT (public.portal_is_staff(auth.uid()) OR public.portal_is_admin(auth.uid(),c)) THEN RAISE EXCEPTION 'You cannot access this client.'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name,'role',role,'status',status,'user_id',user_id,'last_sign_in',last_sign_in,'invite_expires_at',invite_expires_at,
   'holds_seat',public.u1_holds_seat(status,invite_expires_at)) ORDER BY created_at) FROM public.client_users WHERE client_id=c),'[]');
END $$;

-- 6. Portal reads for every client login; administration stays with administrators.
CREATE OR REPLACE FUNCTION public.portal_resolve_client(c uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF public.portal_is_staff(auth.uid()) THEN IF c IS NULL THEN RAISE EXCEPTION 'Choose a client to preview.'; END IF; RETURN c; END IF;
 SELECT client_id INTO cid FROM public.client_users WHERE user_id=auth.uid() AND status='active';
 IF cid IS NULL OR NOT public.portal_is_member(auth.uid(),cid) THEN RAISE EXCEPTION 'Your client portal is not enabled yet. Contact FridayAnalytics.'; END IF;
 IF c IS NOT NULL AND c<>cid THEN RAISE EXCEPTION 'Client not found.'; END IF;
 RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.portal_home(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid; u public.client_users; cl public.clients; staff boolean:=public.portal_is_staff(auth.uid());
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF staff THEN cid:=c; ELSE SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active'; cid:=u.client_id; END IF;
 IF cid IS NULL THEN RETURN jsonb_build_object('preview',staff,'clients',CASE WHEN staff THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',COALESCE(display_name,name))) FROM public.clients),'[]'::jsonb) ELSE '[]'::jsonb END); END IF;
 SELECT * INTO cl FROM public.clients WHERE id=cid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Client not found.'; END IF;
 IF NOT staff AND (NOT cl.portal_enabled OR cl.status<>'active') THEN RETURN jsonb_build_object('preview',false,'portal_enabled',false,'access_disabled',true); END IF;
 RETURN jsonb_build_object('client_id',cid,'client_name',COALESCE(cl.display_name,cl.name),'kind',cl.kind,'portal_enabled',cl.portal_enabled,'name',u.name,'last_sign_in',u.last_sign_in,
  'admins',CASE WHEN staff OR public.portal_is_admin(auth.uid(),cid) THEN public.portal_access_list(cid) ELSE '[]'::jsonb END,'preview',staff,
  'clients',CASE WHEN staff THEN (SELECT jsonb_agg(jsonb_build_object('id',id,'name',COALESCE(display_name,name))) FROM public.clients) ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION public.portal_dashboard(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid := public.portal_resolve_client(c); u public.client_users; prev timestamptz; cl public.clients; t public.billing_tiers;
BEGIN
 SELECT * INTO cl FROM public.clients WHERE id=cid;
 SELECT * INTO t FROM public.billing_tiers WHERE id=cl.tier_id;
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND client_id=cid AND status='active';
 IF u.id IS NOT NULL THEN
  SELECT (detail->>'previous_sign_in')::timestamptz INTO prev FROM public.client_access_events WHERE client_user_id=u.id AND action='signed_in' ORDER BY created_at DESC LIMIT 1;
 END IF;
 RETURN jsonb_build_object('client_id',cid,'client_name',COALESCE(cl.display_name,cl.name),'kind',cl.kind,'name',u.name,'email',u.email,
  'role',COALESCE(u.role,'staff_preview'),'is_admin',public.portal_is_admin(auth.uid(),cid),
  'previous_sign_in',prev,'last_sign_in',u.last_sign_in,'notify',u.notify,
  'organisation',jsonb_build_object('display_name',COALESCE(cl.display_name,cl.name),'legal_name',cl.legal_name,'kind',cl.kind,
    'contact_name',cl.contact_name,'contact_email',cl.contact_email,'phone',cl.phone,'time_zone',cl.time_zone),
  'tier_name',t.name,'seat_limit',t.seat_limit,'seats_used',public.billing_seats_used(cid),
  'admins_used',(SELECT count(*) FROM public.client_users WHERE client_id=cid AND role='client_admin' AND status IN ('pending','active')),
  'pending_invites',(SELECT count(*) FROM public.client_users WHERE client_id=cid AND status='pending'));
END $$;

CREATE OR REPLACE FUNCTION public.portal_set_notifications(prefs jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u public.client_users;
BEGIN
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active';
 IF u.id IS NULL OR NOT public.portal_is_member(auth.uid(),u.client_id) THEN RAISE EXCEPTION 'Only an active client login has notification preferences.'; END IF;
 UPDATE public.client_users SET notify=jsonb_build_object('new_documents',COALESCE((prefs->>'new_documents')::boolean,true),
   'engagement_updates',COALESCE((prefs->>'engagement_updates')::boolean,true),'team_changes',COALESCE((prefs->>'team_changes')::boolean,true)) WHERE id=u.id;
 INSERT INTO public.client_access_events(client_id,client_user_id,actor,action) VALUES(u.client_id,u.id,auth.uid(),'notifications_updated');
END $$;

-- 7. Report access by tier. Append-only versions; the latest version per document is in force.
--    No version, or an empty tier list, means "not yet set": visible to every tier.
CREATE TABLE public.document_tier_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id),
  tier_ids uuid[] NOT NULL DEFAULT '{}',
  set_by uuid NOT NULL DEFAULT auth.uid(),
  set_at timestamptz NOT NULL DEFAULT now(),
  note text
);
GRANT SELECT ON public.document_tier_access TO authenticated;
GRANT ALL ON public.document_tier_access TO service_role;
ALTER TABLE public.document_tier_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_tier_access_staff_read ON public.document_tier_access FOR SELECT TO authenticated USING (public.portal_is_staff(auth.uid()));
CREATE TRIGGER document_tier_access_append_only BEFORE UPDATE OR DELETE ON public.document_tier_access FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE INDEX document_tier_access_doc ON public.document_tier_access(document_id, set_at DESC);

CREATE OR REPLACE FUNCTION public.report_tiers_in_force(doc uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT COALESCE((SELECT tier_ids FROM public.document_tier_access WHERE document_id=doc ORDER BY set_at DESC, id DESC LIMIT 1),'{}'::uuid[]); $$;
CREATE OR REPLACE FUNCTION public.report_tier_allows(d public.documents) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT d.source='client' OR cardinality(public.report_tiers_in_force(d.id))=0
   OR (SELECT tier_id FROM public.clients WHERE id=d.client_id) = ANY(public.report_tiers_in_force(d.id)); $$;

CREATE OR REPLACE FUNCTION public.report_set_tiers(doc uuid, tiers uuid[], note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.documents; clean uuid[];
BEGIN
 IF NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'curator') OR public.has_role(auth.uid(),'management')) THEN
  RAISE EXCEPTION 'Only the owner, a Curator or Management can set which tiers see a report.'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=doc;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF d.source='client' THEN RAISE EXCEPTION 'Client uploads are always visible to their own client; tier access applies to FridayAnalytics reports only.'; END IF;
 SELECT COALESCE(array_agg(DISTINCT x),'{}') INTO clean FROM unnest(COALESCE(tiers,'{}')) x;
 IF EXISTS (SELECT 1 FROM unnest(clean) x WHERE NOT EXISTS (SELECT 1 FROM public.billing_tiers b WHERE b.id=x)) THEN RAISE EXCEPTION 'Tier not found.'; END IF;
 IF clean = public.report_tiers_in_force(doc) THEN RAISE EXCEPTION 'These tiers are already in force for this report.'; END IF;
 INSERT INTO public.document_tier_access(document_id,tier_ids,note) VALUES (doc,clean,nullif(trim(coalesce(note,'')),''));
 PERFORM public.library_log(doc,'tiers_set',nullif(trim(coalesce(note,'')),''),jsonb_build_object('tiers',(SELECT COALESCE(jsonb_agg(name ORDER BY rank),'[]') FROM public.billing_tiers WHERE id=ANY(clean))));
END $$;

CREATE OR REPLACE FUNCTION public.report_tier_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.portal_is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff only.'; END IF;
 RETURN jsonb_build_object('any_set',EXISTS(SELECT 1 FROM public.document_tier_access),
  'docs',COALESCE((SELECT jsonb_object_agg(document_id::text, t) FROM (SELECT DISTINCT ON (document_id) document_id, tier_ids t FROM public.document_tier_access ORDER BY document_id, set_at DESC, id DESC) s),'{}'::jsonb));
END $$;

-- Client-side tier summary: whether staff have set any tier access, and which current documents are tier-limited.
CREATE OR REPLACE FUNCTION public.portal_report_access_note() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 RETURN jsonb_build_object('any_set',EXISTS(SELECT 1 FROM public.document_tier_access WHERE cardinality(tier_ids)>0));
END $$;

-- 8. Reading documents: every active client login, limited by tier.
CREATE OR REPLACE FUNCTION public.library_can_read(u uuid, d public.documents) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT public.portal_is_staff(u) OR (d.visibility='client' AND NOT d.voided AND public.portal_is_member(u,d.client_id) AND public.report_tier_allows(d)) $$;

CREATE OR REPLACE FUNCTION public.library_home_file_for(doc uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.documents; s public.sources;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = doc;
  IF d.id IS NOT NULL AND NOT public.portal_is_staff(auth.uid()) AND d.visibility='client' AND NOT d.voided AND public.portal_is_member(auth.uid(),d.client_id) AND NOT public.report_tier_allows(d) THEN
    RAISE EXCEPTION 'This report is not included in your tier. Ask your administrator about an upgrade.'; END IF;
  IF d.id IS NULL OR NOT public.library_can_read(auth.uid(), d) THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.manifest_only THEN RAISE EXCEPTION 'This bundle holds home-vault files: only its manifest and hash are listed, with no download'; END IF;
  IF d.home_path IS NULL THEN RAISE EXCEPTION 'This document is not yet available on DarkNight'; END IF;
  SELECT * INTO s FROM public.sources WHERE id = d.home_source_id;
  RETURN jsonb_build_object('gateway_url', CASE WHEN s.enabled THEN s.gateway_url END, 'path', d.home_path, 'sha256', d.sha256, 'file_name', d.file_name);
END $$;

DROP POLICY IF EXISTS "staff read all documents; client admins read s" ON public.documents;
DO $$ DECLARE p text; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND cmd='SELECT' AND policyname LIKE 'staff read all documents%' LOOP
    EXECUTE format('DROP POLICY %I ON public.documents', p); END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='document_events' AND cmd='SELECT' AND policyname LIKE 'staff read document log%' LOOP
    EXECUTE format('DROP POLICY %I ON public.document_events', p); END LOOP;
END $$;
CREATE POLICY "staff read all documents; client logins read shared within tier" ON public.documents FOR SELECT TO authenticated USING (public.library_can_read(auth.uid(), documents));
CREATE POLICY "staff read document log; clients read their own entries" ON public.document_events FOR SELECT TO authenticated USING (
  public.portal_is_staff(auth.uid()) OR (actor = auth.uid() AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id=document_events.document_id AND public.library_can_read(auth.uid(), d))));

-- 9. Privileges.
REVOKE ALL ON FUNCTION public.portal_is_member(uuid,uuid), public.u1_holds_seat(text,timestamptz), public.portal_invite_member(uuid,text,text,text,timestamptz,text,uuid),
  public.report_tiers_in_force(uuid), public.report_tier_allows(public.documents), public.report_set_tiers(uuid,uuid[],text), public.report_tier_overview(), public.portal_report_access_note() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_is_member(uuid,uuid), public.u1_holds_seat(text,timestamptz), public.portal_invite_member(uuid,text,text,text,timestamptz,text,uuid),
  public.report_tiers_in_force(uuid), public.report_tier_allows(public.documents), public.report_set_tiers(uuid,uuid[],text), public.report_tier_overview(), public.portal_report_access_note() TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_is_member(uuid,uuid), public.u1_holds_seat(text,timestamptz), public.report_tiers_in_force(uuid), public.report_tier_allows(public.documents) TO service_role;