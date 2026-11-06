-- U7 Early warning platform. Additive. Alerts go to analysts first; clients only see confirmed notices.

CREATE OR REPLACE FUNCTION public.ew_is_analyst(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_investigator(u) AND NOT public.portal_has_client_identity(u) $$;
CREATE OR REPLACE FUNCTION public.ew_is_settings_editor(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (public.has_role(u,'owner') OR public.has_role(u,'management') OR public.has_role(u,'curator')) AND NOT public.portal_has_client_identity(u) $$;
CREATE OR REPLACE FUNCTION public.ew_level_channels(_level text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _level WHEN 'watch' THEN ARRAY['portal'] WHEN 'warning' THEN ARRAY['portal','email'] WHEN 'urgent' THEN ARRAY['portal','email','telegram'] ELSE ARRAY[]::text[] END $$;

CREATE TABLE public.ew_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal text NOT NULL CHECK (signal IN ('volume_spike','call_to_gather','named_date_location','new_accounts','coordinated_posting')),
  level text NOT NULL CHECK (level IN ('watch','warning','urgent')),
  value numeric CHECK (value IS NULL OR value >= 0),
  set_by uuid, set_at timestamptz NOT NULL DEFAULT now(), note text
);
GRANT SELECT ON public.ew_thresholds TO authenticated; GRANT ALL ON public.ew_thresholds TO service_role;
ALTER TABLE public.ew_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_thresholds_staff_read ON public.ew_thresholds FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER ew_thresholds_append_only BEFORE UPDATE OR DELETE ON public.ew_thresholds FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('email','telegram')),
  user_id uuid NOT NULL,
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 200),
  active boolean NOT NULL,
  set_by uuid, set_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_recipients TO authenticated; GRANT ALL ON public.ew_recipients TO service_role;
ALTER TABLE public.ew_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_recipients_editor_read ON public.ew_recipients FOR SELECT TO authenticated USING (public.ew_is_settings_editor(auth.uid()) OR user_id = auth.uid());
CREATE TRIGGER ew_recipients_append_only BEFORE UPDATE OR DELETE ON public.ew_recipients FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  signal text NOT NULL CHECK (signal IN ('volume_spike','call_to_gather','named_date_location','new_accounts','coordinated_posting')),
  score numeric NOT NULL CHECK (score >= 0),
  framework_code text NOT NULL CHECK (framework_code IN ('RABAT','DSP','UN-FAAC')),
  framework_version_id uuid NOT NULL REFERENCES public.framework_versions(id) ON DELETE RESTRICT,
  capture_ids uuid[] NOT NULL CHECK (cardinality(capture_ids) > 0),
  outcome text NOT NULL CHECK (outcome IN ('alert','below_threshold','threshold_not_set')),
  note text, recorded_by uuid, recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_signals TO authenticated; GRANT ALL ON public.ew_signals TO service_role;
ALTER TABLE public.ew_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_signals_staff_read ON public.ew_signals FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER ew_signals_append_only BEFORE UPDATE OR DELETE ON public.ew_signals FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL UNIQUE REFERENCES public.ew_signals(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  level text NOT NULL CHECK (level IN ('watch','warning','urgent')),
  threshold_value numeric NOT NULL,
  raised_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_alerts TO authenticated; GRANT ALL ON public.ew_alerts TO service_role;
ALTER TABLE public.ew_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_alerts_staff_read ON public.ew_alerts FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id));
CREATE TRIGGER ew_alerts_append_only BEFORE UPDATE OR DELETE ON public.ew_alerts FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.ew_alerts(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('portal','email','telegram')),
  recipient_id uuid REFERENCES public.ew_recipients(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('shown_in_portal','held_channel_not_configured','no_recipients')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_dispatches TO authenticated; GRANT ALL ON public.ew_dispatches TO service_role;
ALTER TABLE public.ew_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_dispatches_staff_read ON public.ew_dispatches FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ew_alerts a WHERE a.id = alert_id AND public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), a.project_id)));
CREATE TRIGGER ew_dispatches_append_only BEFORE UPDATE OR DELETE ON public.ew_dispatches FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.ew_dispatch_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lvl text;
BEGIN
  SELECT level INTO lvl FROM public.ew_alerts WHERE id = NEW.alert_id;
  IF NOT (NEW.channel = ANY (public.ew_level_channels(lvl))) THEN
    RAISE EXCEPTION 'A % alert does not use the % channel.', initcap(lvl), NEW.channel;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ew_dispatch_level_guard BEFORE INSERT ON public.ew_dispatches FOR EACH ROW EXECUTE FUNCTION public.ew_dispatch_guard();

CREATE TABLE public.ew_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL UNIQUE REFERENCES public.ew_alerts(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('confirmed','dismissed')),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  decided_by uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_decisions TO authenticated; GRANT ALL ON public.ew_decisions TO service_role;
ALTER TABLE public.ew_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_decisions_staff_read ON public.ew_decisions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ew_alerts a WHERE a.id = alert_id AND public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), a.project_id)));
CREATE TRIGGER ew_decisions_append_only BEFORE UPDATE OR DELETE ON public.ew_decisions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_client_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL UNIQUE REFERENCES public.ew_alerts(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  level text NOT NULL CHECK (level IN ('watch','warning','urgent')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_client_notices TO authenticated; GRANT ALL ON public.ew_client_notices TO service_role;
ALTER TABLE public.ew_client_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_notices_read ON public.ew_client_notices FOR SELECT TO authenticated USING (
  (public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), project_id))
  OR (public.portal_is_member(auth.uid(), client_id) AND EXISTS (SELECT 1 FROM public.ew_decisions d WHERE d.alert_id = ew_client_notices.alert_id AND d.decision = 'confirmed')));
CREATE TRIGGER ew_notices_append_only BEFORE UPDATE OR DELETE ON public.ew_client_notices FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.ew_notice_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ew_decisions WHERE alert_id = NEW.alert_id AND decision = 'confirmed') THEN
    RAISE EXCEPTION 'An alert reaches a client only after an analyst confirms it.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ew_notice_confirmed_guard BEFORE INSERT ON public.ew_client_notices FOR EACH ROW EXECUTE FUNCTION public.ew_notice_guard();

CREATE TABLE public.ew_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL REFERENCES public.ew_client_notices(id) ON DELETE RESTRICT,
  home_source_id text NOT NULL REFERENCES public.sources(id) ON DELETE RESTRICT,
  home_path text NOT NULL CHECK (length(home_path) <= 400 AND home_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' AND home_path !~ '\.\.' AND home_path !~ '//'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text,
  registered_by uuid NOT NULL, registered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_briefings TO authenticated; GRANT ALL ON public.ew_briefings TO service_role;
ALTER TABLE public.ew_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_briefings_staff_read ON public.ew_briefings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ew_client_notices n WHERE n.id = notice_id AND public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), n.project_id)));
CREATE TRIGGER ew_briefings_append_only BEFORE UPDATE OR DELETE ON public.ew_briefings FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL REFERENCES public.ew_client_notices(id) ON DELETE RESTRICT,
  handed_to text NOT NULL CHECK (length(trim(handed_to)) BETWEEN 1 AND 160),
  handed_at timestamptz NOT NULL,
  note text,
  recorded_by uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_handovers TO authenticated; GRANT ALL ON public.ew_handovers TO service_role;
ALTER TABLE public.ew_handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_handovers_staff_read ON public.ew_handovers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ew_client_notices n WHERE n.id = notice_id AND public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), n.project_id)));
CREATE TRIGGER ew_handovers_append_only BEFORE UPDATE OR DELETE ON public.ew_handovers FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.ew_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid REFERENCES public.ew_alerts(id) ON DELETE RESTRICT,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ew_events TO authenticated; GRANT ALL ON public.ew_events TO service_role;
ALTER TABLE public.ew_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_events_staff_read ON public.ew_events FOR SELECT TO authenticated USING (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid()));
CREATE TRIGGER ew_events_append_only BEFORE UPDATE OR DELETE ON public.ew_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.ew_threshold(_signal text, _level text) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT value FROM public.ew_thresholds WHERE signal=_signal AND level=_level ORDER BY set_at DESC, id DESC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.ew_set_threshold(_signal text, _level text, _value numeric, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old numeric := public.ew_threshold(_signal,_level);
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can change alert thresholds.'; END IF;
  INSERT INTO public.ew_thresholds(signal,level,value,set_by,note) VALUES (_signal,_level,_value,auth.uid(),nullif(trim(_note),''));
  INSERT INTO public.ew_events(action,detail,actor) VALUES ('threshold_set', jsonb_build_object('signal',_signal,'level',_level,'old',old,'new',_value), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.ew_set_recipient(_channel text, _user uuid, _address text, _active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can change alert recipients.'; END IF;
  IF NOT public.ew_is_analyst(_user) THEN RAISE EXCEPTION 'Alert recipients must be FridayAnalytics analysts.'; END IF;
  IF _channel = 'email' AND _address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid email address.'; END IF;
  INSERT INTO public.ew_recipients(channel,user_id,address,active,set_by) VALUES (_channel,_user,trim(_address),_active,auth.uid());
  INSERT INTO public.ew_events(action,detail,actor) VALUES ('recipient_set', jsonb_build_object('channel',_channel,'user',_user,'active',_active), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.ew_active_recipients(_channel text) RETURNS SETOF public.ew_recipients LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.* FROM (SELECT DISTINCT ON (user_id) * FROM public.ew_recipients WHERE channel=_channel ORDER BY user_id, set_at DESC, id DESC) r WHERE r.active $$;

CREATE OR REPLACE FUNCTION public.ew_record_signal(_project uuid, _signal text, _score numeric, _framework text, _captures uuid[], _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE fv uuid; eid uuid; sid uuid; aid uuid; lvl text; thr numeric; t numeric; any_set boolean := false; ch text; r public.ew_recipients; n int; outc text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), _project)) THEN
    RAISE EXCEPTION 'Only analysts on this engagement can record early-warning signals.';
  END IF;
  IF _captures IS NULL OR cardinality(_captures) = 0 THEN RAISE EXCEPTION 'A signal must cite at least one capture.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_captures) c WHERE NOT EXISTS (SELECT 1 FROM public.research_captures rc WHERE rc.id = c AND rc.project_id = _project)) THEN
    RAISE EXCEPTION 'Every cited capture must belong to this engagement.';
  END IF;
  SELECT id INTO eid FROM public.framework_entries WHERE code = _framework;
  fv := CASE WHEN eid IS NULL THEN NULL ELSE public.fw_active_version(eid) END;
  IF fv IS NULL THEN RAISE EXCEPTION 'The % framework has no Curator-approved version in force in the Frameworks library, so signals cannot be scored against it.', _framework; END IF;
  FOREACH ch IN ARRAY ARRAY['urgent','warning','watch'] LOOP
    t := public.ew_threshold(_signal, ch);
    IF t IS NOT NULL THEN any_set := true; IF _score >= t THEN thr := t; lvl := ch; EXIT; END IF; END IF;
  END LOOP;
  IF thr IS NOT NULL THEN
    outc := 'alert';
  ELSIF any_set THEN outc := 'below_threshold'; ELSE outc := 'threshold_not_set'; END IF;
  INSERT INTO public.ew_signals(project_id,signal,score,framework_code,framework_version_id,capture_ids,outcome,note,recorded_by)
    VALUES (_project,_signal,_score,_framework,fv,_captures,outc,nullif(trim(_note),''),auth.uid()) RETURNING id INTO sid;
  IF outc <> 'alert' THEN
    INSERT INTO public.ew_events(action,detail,actor) VALUES ('signal_recorded', jsonb_build_object('signal_id',sid,'outcome',outc), auth.uid());
    RETURN jsonb_build_object('signal_id',sid,'outcome',outc);
  END IF;
  INSERT INTO public.ew_alerts(signal_id,project_id,level,threshold_value) VALUES (sid,_project,lvl,thr) RETURNING id INTO aid;
  INSERT INTO public.ew_events(alert_id,action,detail,actor) VALUES (aid,'alert_raised', jsonb_build_object('signal_id',sid,'level',lvl,'score',_score,'threshold',thr), auth.uid());
  FOREACH ch IN ARRAY public.ew_level_channels(lvl) LOOP
    IF ch = 'portal' THEN
      INSERT INTO public.ew_dispatches(alert_id,channel,state) VALUES (aid,'portal','shown_in_portal');
    ELSE
      n := 0;
      FOR r IN SELECT * FROM public.ew_active_recipients(ch) LOOP
        INSERT INTO public.ew_dispatches(alert_id,channel,recipient_id,state) VALUES (aid,ch,r.id,'held_channel_not_configured'); n := n + 1;
      END LOOP;
      IF n = 0 THEN INSERT INTO public.ew_dispatches(alert_id,channel,state) VALUES (aid,ch,'no_recipients'); END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('signal_id',sid,'outcome',outc,'alert_id',aid,'level',lvl);
END $$;

CREATE OR REPLACE FUNCTION public.ew_decide(_alert uuid, _confirm boolean, _reason text, _title text, _body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.ew_alerts; p public.projects; nid uuid;
BEGIN
  SELECT * INTO a FROM public.ew_alerts WHERE id=_alert;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert not found.'; END IF;
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), a.project_id)) THEN RAISE EXCEPTION 'Only analysts on this engagement can confirm or dismiss alerts.'; END IF;
  IF EXISTS (SELECT 1 FROM public.ew_decisions WHERE alert_id=_alert) THEN RAISE EXCEPTION 'This alert has already been decided.'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'Give a reason for the decision.'; END IF;
  IF _confirm AND (_title IS NULL OR length(trim(_title))=0 OR _body IS NULL OR length(trim(_body))=0) THEN RAISE EXCEPTION 'Write the notice title and text the client will see.'; END IF;
  INSERT INTO public.ew_decisions(alert_id,decision,reason,decided_by) VALUES (_alert, CASE WHEN _confirm THEN 'confirmed' ELSE 'dismissed' END, trim(_reason), auth.uid());
  INSERT INTO public.ew_events(alert_id,action,detail,actor) VALUES (_alert, CASE WHEN _confirm THEN 'confirmed' ELSE 'dismissed' END, jsonb_build_object('reason',trim(_reason)), auth.uid());
  IF NOT _confirm THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.projects WHERE id=a.project_id;
  INSERT INTO public.ew_client_notices(alert_id,client_id,project_id,level,title,body,created_by) VALUES (_alert,p.client_id,a.project_id,a.level,trim(_title),trim(_body),auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.ew_events(alert_id,action,detail,actor) VALUES (_alert,'client_notice_created', jsonb_build_object('notice_id',nid), auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.ew_register_briefing(_notice uuid, _source text, _path text, _sha256 text, _file_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.ew_client_notices; s public.sources; bid uuid;
BEGIN
  SELECT * INTO n FROM public.ew_client_notices WHERE id=_notice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notice not found.'; END IF;
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), n.project_id)) THEN RAISE EXCEPTION 'Only analysts on this engagement can register a briefing.'; END IF;
  SELECT * INTO s FROM public.sources WHERE id=_source;
  IF NOT FOUND OR s.kind <> 'home_vault' THEN RAISE EXCEPTION 'Briefing documents must stay on DarkNight (a home vault source).'; END IF;
  INSERT INTO public.ew_briefings(notice_id,home_source_id,home_path,sha256,file_name,registered_by) VALUES (_notice,_source,trim(_path),lower(trim(_sha256)),nullif(trim(_file_name),''),auth.uid()) RETURNING id INTO bid;
  INSERT INTO public.ew_events(alert_id,action,detail,actor) VALUES (n.alert_id,'briefing_registered', jsonb_build_object('briefing_id',bid,'path',trim(_path)), auth.uid());
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.ew_briefing_file(_notice uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.ew_client_notices; b public.ew_briefings; s public.sources;
BEGIN
  SELECT * INTO n FROM public.ew_client_notices WHERE id=_notice;
  IF NOT FOUND OR NOT ((public.ew_is_analyst(auth.uid()) AND public.can_access_project(auth.uid(), n.project_id)) OR public.portal_is_member(auth.uid(), n.client_id)) THEN RAISE EXCEPTION 'Notice not found.'; END IF;
  SELECT * INTO b FROM public.ew_briefings WHERE notice_id=_notice ORDER BY registered_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No briefing document has been registered for this notice yet.'; END IF;
  SELECT * INTO s FROM public.sources WHERE id=b.home_source_id;
  RETURN jsonb_build_object('gateway_url', CASE WHEN s.enabled THEN s.gateway_url END, 'path', b.home_path, 'sha256', b.sha256, 'file_name', b.file_name);
END $$;

CREATE OR REPLACE FUNCTION public.ew_record_handover(_notice uuid, _to text, _at timestamptz, _note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.ew_client_notices; hid uuid;
BEGIN
  SELECT * INTO n FROM public.ew_client_notices WHERE id=_notice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notice not found.'; END IF;
  IF NOT (public.ew_is_analyst(auth.uid()) AND public.can_work_project(auth.uid(), n.project_id)) THEN RAISE EXCEPTION 'Only analysts on this engagement can record a hand-over.'; END IF;
  IF _at IS NULL OR _at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'The hand-over time cannot be in the future.'; END IF;
  INSERT INTO public.ew_handovers(notice_id,handed_to,handed_at,note,recorded_by) VALUES (_notice,trim(_to),_at,nullif(trim(_note),''),auth.uid()) RETURNING id INTO hid;
  INSERT INTO public.ew_events(alert_id,action,detail,actor) VALUES (n.alert_id,'handed_over', jsonb_build_object('handover_id',hid,'to',trim(_to)), auth.uid());
  RETURN hid;
END $$;

CREATE OR REPLACE FUNCTION public.ew_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.ew_is_analyst(auth.uid()) OR public.ew_is_settings_editor(auth.uid())) THEN RAISE EXCEPTION 'Early warning is for FridayAnalytics staff only.'; END IF;
  RETURN jsonb_build_object(
    'can_edit_settings', public.ew_is_settings_editor(auth.uid()),
    'thresholds', (SELECT jsonb_agg(jsonb_build_object('signal',s,'level',l,'value',public.ew_threshold(s,l))) FROM unnest(ARRAY['volume_spike','call_to_gather','named_date_location','new_accounts','coordinated_posting']) s, unnest(ARRAY['watch','warning','urgent']) l),
    'frameworks', (SELECT jsonb_agg(jsonb_build_object('code',e.code,'name',e.name,'version_id',public.fw_active_version(e.id),'version',(SELECT version FROM public.framework_versions WHERE id=public.fw_active_version(e.id)))) FROM public.framework_entries e WHERE e.code IN ('RABAT','DSP','UN-FAAC')),
    'recipients', CASE WHEN public.ew_is_settings_editor(auth.uid()) THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',r.channel,'user_id',r.user_id,'address',r.address,'name',(SELECT display_name FROM public.profiles WHERE id=r.user_id))) FROM (SELECT * FROM public.ew_active_recipients('email') UNION ALL SELECT * FROM public.ew_active_recipients('telegram')) r),'[]'::jsonb) ELSE '[]'::jsonb END,
    'alerts', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'raised_at' DESC) FROM (
      SELECT jsonb_build_object('id',a.id,'project_id',a.project_id,'project',p.name,'level',a.level,'threshold',a.threshold_value,'raised_at',a.raised_at,
        'signal',sg.signal,'score',sg.score,'framework',sg.framework_code,'capture_ids',sg.capture_ids,'note',sg.note,
        'decision',(SELECT jsonb_build_object('decision',d.decision,'reason',d.reason,'at',d.decided_at) FROM public.ew_decisions d WHERE d.alert_id=a.id),
        'dispatches',(SELECT jsonb_agg(jsonb_build_object('channel',ds.channel,'state',ds.state)) FROM public.ew_dispatches ds WHERE ds.alert_id=a.id),
        'notice',(SELECT jsonb_build_object('id',n.id,'title',n.title,
           'briefing',(SELECT jsonb_build_object('path',b.home_path,'sha256',b.sha256) FROM public.ew_briefings b WHERE b.notice_id=n.id ORDER BY b.registered_at DESC LIMIT 1),
           'handovers',(SELECT jsonb_agg(jsonb_build_object('to',h.handed_to,'at',h.handed_at)) FROM public.ew_handovers h WHERE h.notice_id=n.id)) FROM public.ew_client_notices n WHERE n.alert_id=a.id)) x
      FROM public.ew_alerts a JOIN public.ew_signals sg ON sg.id=a.signal_id JOIN public.projects p ON p.id=a.project_id
      WHERE public.can_access_project(auth.uid(), a.project_id) LIMIT 200) q),'[]'::jsonb),
    'signals', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'project',p.name,'signal',s.signal,'score',s.score,'outcome',s.outcome,'at',s.recorded_at) ORDER BY s.recorded_at DESC)
      FROM (SELECT * FROM public.ew_signals WHERE outcome<>'alert' AND public.can_access_project(auth.uid(), project_id) ORDER BY recorded_at DESC LIMIT 50) s JOIN public.projects p ON p.id=s.project_id),'[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.portal_ew_notices(c uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid := public.portal_resolve_client(c);
BEGIN
  IF cid IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (public.portal_is_member(auth.uid(), cid) OR public.portal_is_staff(auth.uid())) THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'level',n.level,'title',n.title,'body',n.body,'created_at',n.created_at,
      'has_briefing', EXISTS (SELECT 1 FROM public.ew_briefings b WHERE b.notice_id=n.id)) ORDER BY n.created_at DESC)
    FROM public.ew_client_notices n
    WHERE n.client_id=cid AND EXISTS (SELECT 1 FROM public.ew_decisions d WHERE d.alert_id=n.alert_id AND d.decision='confirmed')),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.ew_is_analyst(uuid), public.ew_is_settings_editor(uuid), public.ew_threshold(text,text),
  public.ew_set_threshold(text,text,numeric,text), public.ew_set_recipient(text,uuid,text,boolean), public.ew_active_recipients(text),
  public.ew_record_signal(uuid,text,numeric,text,uuid[],text), public.ew_decide(uuid,boolean,text,text,text),
  public.ew_register_briefing(uuid,text,text,text,text), public.ew_briefing_file(uuid), public.ew_record_handover(uuid,text,timestamptz,text),
  public.ew_overview(), public.portal_ew_notices(uuid), public.ew_dispatch_guard(), public.ew_notice_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ew_active_recipients(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ew_is_analyst(uuid), public.ew_is_settings_editor(uuid), public.ew_threshold(text,text),
  public.ew_set_threshold(text,text,numeric,text), public.ew_set_recipient(text,uuid,text,boolean),
  public.ew_record_signal(uuid,text,numeric,text,uuid[],text), public.ew_decide(uuid,boolean,text,text,text),
  public.ew_register_briefing(uuid,text,text,text,text), public.ew_briefing_file(uuid), public.ew_record_handover(uuid,text,timestamptz,text),
  public.ew_overview(), public.portal_ew_notices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ew_record_signal(uuid,text,numeric,text,uuid[],text), public.ew_active_recipients(text) TO service_role;
