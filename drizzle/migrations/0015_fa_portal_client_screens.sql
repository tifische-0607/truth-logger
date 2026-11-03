-- Phase 3: client portal screens. Additive only: two client columns, one client_users column, client-safe read functions.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur';
ALTER TABLE public.client_users ADD COLUMN IF NOT EXISTS notify jsonb NOT NULL DEFAULT '{"new_documents": true, "engagement_updates": true, "team_changes": true}'::jsonb;

-- Which client the caller may view: staff preview any client; a client admin only their own, active and portal-enabled.
CREATE OR REPLACE FUNCTION public.portal_resolve_client(c uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF public.portal_is_staff(auth.uid()) THEN
  IF c IS NULL THEN RAISE EXCEPTION 'Choose a client to preview.'; END IF;
  RETURN c;
 END IF;
 SELECT client_id INTO cid FROM public.client_users WHERE user_id=auth.uid() AND status='active';
 IF cid IS NULL OR NOT public.portal_is_admin(auth.uid(),cid) THEN RAISE EXCEPTION 'Your client portal is not enabled yet. Contact FridayAnalytics.'; END IF;
 IF c IS NOT NULL AND c<>cid THEN RAISE EXCEPTION 'Client not found.'; END IF;
 RETURN cid;
END $$;

-- Plain five-stage position (1 Planning=phases 0-4, 2 Collecting=5, 3 Analysing=6-7, 4 Reporting=8-9, 5 Complete=10). Gates are never returned.
CREATE OR REPLACE FUNCTION public.portal_engagement_stage(p uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pr public.projects; lastc integer; ph integer;
BEGIN
 SELECT * INTO pr FROM public.projects WHERE id=p;
 IF pr.id IS NULL THEN RETURN NULL; END IF;
 IF pr.status='closed' OR EXISTS(SELECT 1 FROM public.project_closeouts WHERE project_id=p) THEN RETURN 5; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_gates WHERE project_id=p AND gate='G0') OR NOT EXISTS(SELECT 1 FROM public.project_gates WHERE project_id=p AND gate='G1') THEN ph:=0;
 ELSIF NOT EXISTS(SELECT 1 FROM public.project_gates WHERE project_id=p AND gate='G2') OR pr.design_stale THEN ph:=1;
 ELSE
  SELECT max(cycle_no) INTO lastc FROM public.project_cycles WHERE project_id=p;
  IF lastc IS NULL THEN ph:=2;
  ELSIF NOT EXISTS(SELECT 1 FROM public.project_gates WHERE project_id=p AND gate='G3' AND cycle_no=lastc) THEN ph:=4;
  ELSIF NOT EXISTS(SELECT 1 FROM public.project_gates WHERE project_id=p AND gate='G4' AND cycle_no=lastc) THEN
   ph:=CASE WHEN EXISTS(SELECT 1 FROM public.project_load_reports WHERE project_id=p AND cycle_no=lastc) THEN 7 ELSE 5 END;
  ELSIF NOT EXISTS(SELECT 1 FROM public.project_outputs WHERE project_id=p AND status='released') THEN ph:=8;
  ELSE ph:=10; END IF;
 END IF;
 RETURN CASE WHEN ph<=4 THEN 1 WHEN ph=5 THEN 2 WHEN ph<=7 THEN 3 WHEN ph<=9 THEN 4 ELSE 5 END;
END $$;

-- Engagements of the client, client-safe fields only.
CREATE OR REPLACE FUNCTION public.portal_engagements(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid := public.portal_resolve_client(c);
BEGIN
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'status',p.status,'opened_on',p.opened_on,'due_on',p.due_on,
   'stage',public.portal_engagement_stage(p.id)) ORDER BY p.opened_on DESC) FROM public.projects p WHERE p.client_id=cid),'[]'::jsonb);
END $$;

-- Briefs the client may read: only versions whose library document is shared (signed G0 brief and approved amendments).
CREATE OR REPLACE FUNCTION public.portal_engagement_briefs(p uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; pc uuid;
BEGIN
 SELECT client_id INTO pc FROM public.projects WHERE id=p;
 IF pc IS NULL THEN RAISE EXCEPTION 'Engagement not found.'; END IF;
 cid := public.portal_resolve_client(pc);
 IF cid<>pc THEN RAISE EXCEPTION 'Engagement not found.'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('version',b.version,'kind',b.kind,'amendment_no',b.amendment_no,'situation',b.situation,
   'objectives',b.objectives,'platforms',b.platforms,'languages',b.languages,'window_from',b.window_from,'window_to',b.window_to,
   'in_scope',b.in_scope,'out_of_scope',b.out_of_scope,'change_summary',b.change_summary,'authored_at',b.authored_at) ORDER BY b.version)
  FROM public.project_briefs b WHERE b.project_id=p AND EXISTS(SELECT 1 FROM public.documents d WHERE d.brief_id=b.id AND d.visibility='client' AND NOT d.voided)),'[]'::jsonb);
END $$;

-- Dashboard facts that are not plain document counts (those are counted by the browser through the documents RLS policy).
CREATE OR REPLACE FUNCTION public.portal_dashboard(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid := public.portal_resolve_client(c); u public.client_users; prev timestamptz; cl public.clients;
BEGIN
 SELECT * INTO cl FROM public.clients WHERE id=cid;
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND client_id=cid AND status='active';
 IF u.id IS NOT NULL THEN
  SELECT (detail->>'previous_sign_in')::timestamptz INTO prev FROM public.client_access_events WHERE client_user_id=u.id AND action='signed_in' ORDER BY created_at DESC LIMIT 1;
 END IF;
 RETURN jsonb_build_object('client_id',cid,'client_name',COALESCE(cl.display_name,cl.name),'kind',cl.kind,'name',u.name,'email',u.email,
  'previous_sign_in',prev,'last_sign_in',u.last_sign_in,'notify',u.notify,
  'organisation',jsonb_build_object('display_name',COALESCE(cl.display_name,cl.name),'legal_name',cl.legal_name,'kind',cl.kind,
    'contact_name',cl.contact_name,'contact_email',cl.contact_email,'phone',cl.phone,'time_zone',cl.time_zone),
  'admins_used',(SELECT count(*) FROM public.client_users WHERE client_id=cid AND status IN ('pending','active')),
  'pending_invites',(SELECT count(*) FROM public.client_users WHERE client_id=cid AND status='pending'));
END $$;

-- Client-safe activity: document sharing/uploads/downloads on currently shared documents, and administrator/access events.
CREATE OR REPLACE FUNCTION public.portal_activity(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid := public.portal_resolve_client(c);
BEGIN
 RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
  SELECT jsonb_build_object('id',e.id,'at',e.at,'type','document','action',e.action,'subject',d.title,'code',d.code,
    'person',CASE WHEN e.actor_kind='client' THEN COALESCE((SELECT name FROM public.client_users WHERE user_id=e.actor AND client_id=cid LIMIT 1),'Client administrator') ELSE 'FridayAnalytics' END) x
  FROM public.document_events e JOIN public.documents d ON d.id=e.document_id
  WHERE d.client_id=cid AND d.visibility='client' AND NOT d.voided AND e.action IN ('shared','uploaded','downloaded','download_refused')
  UNION ALL
  SELECT jsonb_build_object('id',a.id,'at',a.created_at,'type','access','action',a.action,'subject',t.name,'code',NULL,
    'person',CASE WHEN a.actor IS NULL OR public.portal_is_staff(a.actor) THEN 'FridayAnalytics' ELSE COALESCE((SELECT name FROM public.client_users WHERE user_id=a.actor AND client_id=cid LIMIT 1),'Client administrator') END)
  FROM public.client_access_events a LEFT JOIN public.client_users t ON t.id=a.client_user_id
  WHERE a.client_id=cid AND a.action IN ('invited','resent','accepted','cancel','deactivate','reactivate','signed_in','portal_enabled','organisation_updated','notifications_updated')
  ORDER BY 1 DESC LIMIT 500) s),'[]'::jsonb);
END $$;

-- A client administrator edits the organisation contact details. Client type and legal name stay with FridayAnalytics.
CREATE OR REPLACE FUNCTION public.portal_update_organisation(c uuid, display text, contact text, contact_mail text, tel text, tz text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.portal_is_admin(auth.uid(),c) THEN RAISE EXCEPTION 'Only an active administrator of this client can change these details.'; END IF;
 IF length(trim(coalesce(display,'')))=0 THEN RAISE EXCEPTION 'A display name is required.'; END IF;
 IF coalesce(contact_mail,'')<>'' AND contact_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid contact email.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RAISE EXCEPTION 'Choose a valid time zone.'; END IF;
 UPDATE public.clients SET display_name=trim(display),contact_name=NULLIF(trim(contact),''),contact_email=NULLIF(lower(trim(contact_mail)),''),phone=NULLIF(trim(tel),''),time_zone=tz WHERE id=c;
 INSERT INTO public.client_access_events(client_id,actor,action,detail) VALUES(c,auth.uid(),'organisation_updated','{}');
END $$;

CREATE OR REPLACE FUNCTION public.portal_set_notifications(prefs jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.client_users;
BEGIN
 SELECT * INTO u FROM public.client_users WHERE user_id=auth.uid() AND status='active';
 IF u.id IS NULL OR NOT public.portal_is_admin(auth.uid(),u.client_id) THEN RAISE EXCEPTION 'Only an active client administrator has notification preferences.'; END IF;
 UPDATE public.client_users SET notify=jsonb_build_object('new_documents',COALESCE((prefs->>'new_documents')::boolean,true),
   'engagement_updates',COALESCE((prefs->>'engagement_updates')::boolean,true),'team_changes',COALESCE((prefs->>'team_changes')::boolean,true)) WHERE id=u.id;
 INSERT INTO public.client_access_events(client_id,client_user_id,actor,action) VALUES(u.client_id,u.id,auth.uid(),'notifications_updated');
END $$;

REVOKE ALL ON FUNCTION public.portal_engagement_stage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_resolve_client(uuid), public.portal_engagements(uuid), public.portal_engagement_briefs(uuid), public.portal_dashboard(uuid),
  public.portal_activity(uuid), public.portal_update_organisation(uuid,text,text,text,text,text), public.portal_set_notifications(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_resolve_client(uuid), public.portal_engagements(uuid), public.portal_engagement_briefs(uuid), public.portal_dashboard(uuid),
  public.portal_activity(uuid), public.portal_update_organisation(uuid,text,text,text,text,text), public.portal_set_notifications(jsonb) TO authenticated;