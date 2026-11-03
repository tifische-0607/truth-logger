-- Phase 7: SOP and clock engine. Additive only.

CREATE TABLE public.sop_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase integer NOT NULL CHECK (phase BETWEEN 0 AND 10),
  version integer NOT NULL,
  owner_role text NOT NULL CHECK (owner_role IN ('engagement_lead','curator','analyst','evidence_officer','lead_analyst','management')),
  target_working_days integer NOT NULL CHECK (target_working_days BETWEEN 1 AND 60),
  warn_pct integer NOT NULL DEFAULT 80 CHECK (warn_pct BETWEEN 50 AND 99),
  escalation_chain text[] NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_sample boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase, version)
);
GRANT SELECT ON public.sop_definitions TO authenticated;
GRANT ALL ON public.sop_definitions TO service_role;
ALTER TABLE public.sop_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read sops" ON public.sop_definitions FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()));
CREATE TRIGGER sop_definitions_append_only BEFORE UPDATE OR DELETE ON public.sop_definitions
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.sla_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  weekend_dows integer[] NOT NULL DEFAULT '{0,6}',
  time_zone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  holidays_set boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sla_settings (id) VALUES (true);
GRANT SELECT ON public.sla_settings TO authenticated;
GRANT ALL ON public.sla_settings TO service_role;
ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read sla settings" ON public.sla_settings FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()));

CREATE TABLE public.sla_holidays (
  day date PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sla_holidays TO authenticated;
GRANT ALL ON public.sla_holidays TO service_role;
ALTER TABLE public.sla_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read holidays" ON public.sla_holidays FOR SELECT TO authenticated
  USING (public.portal_is_staff(auth.uid()));

CREATE TABLE public.phase_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase integer NOT NULL CHECK (phase BETWEEN 0 AND 10),
  cycle_no integer,
  sop_id uuid NOT NULL REFERENCES public.sop_definitions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  at_risk_alerted boolean NOT NULL DEFAULT false,
  breach_alerted boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX phase_clocks_one_open ON public.phase_clocks(project_id) WHERE completed_at IS NULL;
GRANT SELECT ON public.phase_clocks TO authenticated;
GRANT ALL ON public.phase_clocks TO service_role;
ALTER TABLE public.phase_clocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads clocks" ON public.phase_clocks FOR SELECT TO authenticated
  USING (NOT public.portal_has_client_identity(auth.uid())
    AND (public.can_access_project(auth.uid(), project_id) OR public.has_role(auth.uid(),'management')));

CREATE TABLE public.clock_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clock_id uuid NOT NULL REFERENCES public.phase_clocks(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('waiting_on_sponsor_readback','client_documents','client_approval')),
  note text,
  paused_by uuid NOT NULL,
  paused_at timestamptz NOT NULL DEFAULT now(),
  resumed_by uuid,
  resumed_at timestamptz
);
CREATE UNIQUE INDEX clock_pauses_one_open ON public.clock_pauses(clock_id) WHERE resumed_at IS NULL;
GRANT SELECT ON public.clock_pauses TO authenticated;
GRANT ALL ON public.clock_pauses TO service_role;
ALTER TABLE public.clock_pauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads pauses" ON public.clock_pauses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.phase_clocks c WHERE c.id = clock_id
    AND NOT public.portal_has_client_identity(auth.uid())
    AND (public.can_access_project(auth.uid(), c.project_id) OR public.has_role(auth.uid(),'management'))));

CREATE TABLE public.sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  clock_id uuid REFERENCES public.phase_clocks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('clock_started','clock_stopped','paused','resumed','at_risk','breached','sop_version','holiday_added','holiday_removed','holidays_confirmed')),
  to_roles text[] NOT NULL DEFAULT '{}',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sla_events TO authenticated;
GRANT ALL ON public.sla_events TO service_role;
ALTER TABLE public.sla_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads sla events" ON public.sla_events FOR SELECT TO authenticated
  USING (NOT public.portal_has_client_identity(auth.uid()) AND (
    public.has_role(auth.uid(),'management')
    OR (project_id IS NOT NULL AND public.can_access_project(auth.uid(), project_id))
    OR (project_id IS NULL AND public.portal_is_staff(auth.uid()))));
CREATE TRIGGER sla_events_append_only BEFORE UPDATE OR DELETE ON public.sla_events
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- Sample SOP targets (labelled Sample until Management edits them)
INSERT INTO public.sop_definitions (phase, version, owner_role, target_working_days, warn_pct, escalation_chain, steps, is_sample) VALUES
 (0,1,'engagement_lead',2,80,'{curator,management}','["Open the engagement file","Send the pre-brief pack","Agree the G0 brief"]',true),
 (1,1,'engagement_lead',10,80,'{curator,management}','["Discovery interviews","Situation analysis","Research questions"]',true),
 (2,1,'engagement_lead',5,80,'{curator,management}','["Mandate and design sheet","Sign G2"]',true),
 (3,1,'curator',3,80,'{management}','["Open the cycle","Screen candidates"]',true),
 (4,1,'curator',7,80,'{management}','["Curate candidates","Sign G3"]',true),
 (5,1,'engagement_lead',14,80,'{curator,management}','["Collect within the brief","Read and decide"]',true),
 (6,1,'analyst',5,80,'{engagement_lead,curator}','["Analysis"]',true),
 (7,1,'evidence_officer',3,80,'{engagement_lead,curator}','["Evidence load report","Sign G4"]',true),
 (8,1,'engagement_lead',7,80,'{curator,management}','["Draft outputs"]',true),
 (9,1,'curator',2,80,'{management}','["QA review","Release decision"]',true),
 (10,1,'engagement_lead',5,80,'{curator,management}','["Close-out","Retention"]',true);

-- Working days between two instants (dates after a, up to and including b), skipping weekends and holidays.
CREATE OR REPLACE FUNCTION public.sla_working_days(_a timestamptz, _b timestamptz)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT weekend_dows, time_zone FROM public.sla_settings LIMIT 1)
  SELECT CASE WHEN _b <= _a THEN 0 ELSE (
    SELECT count(*)::integer FROM s, generate_series((_a AT TIME ZONE s.time_zone)::date + 1,
                                                      (_b AT TIME ZONE s.time_zone)::date, interval '1 day') g(d)
    WHERE NOT (extract(dow FROM g.d)::integer = ANY (s.weekend_dows))
      AND NOT EXISTS (SELECT 1 FROM public.sla_holidays h WHERE h.day = g.d::date)) END
$$;

-- The engagement's current FA-CEF phase, mirroring the screen's rule.
CREATE OR REPLACE FUNCTION public.sla_project_phase(_project uuid, OUT phase integer, OUT cycle_no integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g0 boolean; g1 boolean; g2 boolean; stale boolean; lastc integer;
BEGIN
  SELECT design_stale INTO stale FROM public.projects WHERE id = _project;
  g0 := EXISTS (SELECT 1 FROM public.project_gates WHERE project_id=_project AND gate='G0' AND cycle_no=0 AND output_id IS NULL);
  g1 := EXISTS (SELECT 1 FROM public.project_gates WHERE project_id=_project AND gate='G1' AND cycle_no=0 AND output_id IS NULL);
  g2 := EXISTS (SELECT 1 FROM public.project_gates WHERE project_id=_project AND gate='G2' AND cycle_no=0 AND output_id IS NULL);
  cycle_no := NULL;
  IF NOT g0 OR NOT g1 THEN phase := 0; RETURN; END IF;
  IF NOT g2 OR coalesce(stale,false) THEN phase := 1; RETURN; END IF;
  SELECT max(c.cycle_no) INTO lastc FROM public.project_cycles c WHERE c.project_id=_project;
  IF lastc IS NULL THEN phase := 2; RETURN; END IF;
  cycle_no := lastc;
  IF NOT EXISTS (SELECT 1 FROM public.project_gates WHERE project_id=_project AND gate='G3' AND project_gates.cycle_no=lastc) THEN
    phase := CASE WHEN EXISTS (SELECT 1 FROM public.project_items i WHERE i.project_id=_project AND i.cycle_no=lastc AND i.voided_at IS NULL) THEN 4 ELSE 3 END;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_gates WHERE project_id=_project AND gate='G4' AND project_gates.cycle_no=lastc) THEN
    phase := CASE WHEN EXISTS (SELECT 1 FROM public.project_load_reports l WHERE l.project_id=_project AND l.cycle_no=lastc) THEN 7 ELSE 5 END;
    RETURN;
  END IF;
  cycle_no := NULL;
  IF NOT EXISTS (SELECT 1 FROM public.project_outputs o WHERE o.project_id=_project AND o.status='released') THEN
    phase := CASE WHEN EXISTS (SELECT 1 FROM public.project_outputs o WHERE o.project_id=_project) THEN 9 ELSE 8 END;
    RETURN;
  END IF;
  phase := 10;
END $$;

-- Paused working days on a clock
CREATE OR REPLACE FUNCTION public.sla_paused_days(_clock uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(public.sla_working_days(p.paused_at, coalesce(p.resumed_at, c.completed_at, now()))),0)::integer
  FROM public.clock_pauses p JOIN public.phase_clocks c ON c.id = p.clock_id WHERE p.clock_id = _clock
$$;

-- Clock status in words: On track, At risk, Breached, Paused, Closed
CREATE OR REPLACE FUNCTION public.sla_clock_status(_clock uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.phase_clocks; s public.sop_definitions; used integer; paused integer; st text; pct numeric;
BEGIN
  SELECT * INTO c FROM public.phase_clocks WHERE id=_clock;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.sop_definitions WHERE id=c.sop_id;
  paused := public.sla_paused_days(_clock);
  used := greatest(public.sla_working_days(c.started_at, coalesce(c.completed_at, now())) - paused, 0);
  pct := round(100.0 * used / s.target_working_days, 1);
  IF c.completed_at IS NOT NULL THEN st := 'closed';
  ELSIF EXISTS (SELECT 1 FROM public.clock_pauses WHERE clock_id=_clock AND resumed_at IS NULL) THEN st := 'paused';
  ELSIF used > s.target_working_days THEN st := 'breached';
  ELSIF pct >= s.warn_pct THEN st := 'at_risk';
  ELSE st := 'on_track'; END IF;
  RETURN jsonb_build_object('status', st, 'used', used, 'paused', paused, 'target', s.target_working_days,
    'warn_pct', s.warn_pct, 'pct', pct, 'on_time', CASE WHEN c.completed_at IS NULL THEN NULL ELSE used <= s.target_working_days END);
END $$;

-- Raise at-risk / breach alerts once per clock, as in-app alerts in the event log
CREATE OR REPLACE FUNCTION public.sla_check_alerts(_clock uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.phase_clocks; s public.sop_definitions; st jsonb; nxt text;
BEGIN
  SELECT * INTO c FROM public.phase_clocks WHERE id=_clock AND completed_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO s FROM public.sop_definitions WHERE id=c.sop_id;
  st := public.sla_clock_status(_clock);
  IF st->>'status' IN ('at_risk','breached') AND NOT c.at_risk_alerted THEN
    UPDATE public.phase_clocks SET at_risk_alerted=true WHERE id=_clock;
    INSERT INTO public.sla_events(project_id, clock_id, kind, to_roles, detail)
      VALUES (c.project_id, _clock, 'at_risk', ARRAY[s.owner_role], st || jsonb_build_object('phase', c.phase));
    INSERT INTO public.project_events(project_id, action, detail, actor_name)
      VALUES (c.project_id, 'sla_at_risk', st || jsonb_build_object('phase', c.phase, 'to_roles', ARRAY[s.owner_role]), 'Clock engine');
  END IF;
  IF st->>'status' = 'breached' AND NOT c.breach_alerted THEN
    nxt := s.escalation_chain[1];
    UPDATE public.phase_clocks SET breach_alerted=true WHERE id=_clock;
    INSERT INTO public.sla_events(project_id, clock_id, kind, to_roles, detail)
      VALUES (c.project_id, _clock, 'breached', array_remove(ARRAY[s.owner_role, nxt], NULL), st || jsonb_build_object('phase', c.phase));
    INSERT INTO public.project_events(project_id, action, detail, actor_name)
      VALUES (c.project_id, 'sla_breached', st || jsonb_build_object('phase', c.phase, 'to_roles', array_remove(ARRAY[s.owner_role, nxt], NULL)), 'Clock engine');
  END IF;
END $$;

-- Start/stop clocks so they follow the engagement's phase
CREATE OR REPLACE FUNCTION public.sla_sync(_project uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur record; open_c public.phase_clocks; sop uuid; pstatus text;
BEGIN
  SELECT status INTO pstatus FROM public.projects WHERE id=_project;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO cur FROM public.sla_project_phase(_project);
  SELECT * INTO open_c FROM public.phase_clocks WHERE project_id=_project AND completed_at IS NULL FOR UPDATE;
  IF FOUND AND (pstatus = 'closed' OR open_c.phase <> cur.phase OR open_c.cycle_no IS DISTINCT FROM cur.cycle_no) THEN
    UPDATE public.clock_pauses SET resumed_at=now() WHERE clock_id=open_c.id AND resumed_at IS NULL;
    UPDATE public.phase_clocks SET completed_at=now() WHERE id=open_c.id;
    INSERT INTO public.sla_events(project_id, clock_id, kind, detail)
      VALUES (_project, open_c.id, 'clock_stopped', public.sla_clock_status(open_c.id) || jsonb_build_object('phase', open_c.phase, 'cycle_no', open_c.cycle_no));
    open_c := NULL;
  END IF;
  IF open_c.id IS NULL AND pstatus <> 'closed' THEN
    SELECT id INTO sop FROM public.sop_definitions WHERE phase=cur.phase ORDER BY version DESC LIMIT 1;
    INSERT INTO public.phase_clocks(project_id, phase, cycle_no, sop_id) VALUES (_project, cur.phase, cur.cycle_no, sop)
      RETURNING * INTO open_c;
    INSERT INTO public.sla_events(project_id, clock_id, kind, detail)
      VALUES (_project, open_c.id, 'clock_started', jsonb_build_object('phase', cur.phase, 'cycle_no', cur.cycle_no));
  ELSIF open_c.id IS NOT NULL THEN
    PERFORM public.sla_check_alerts(open_c.id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sla_sync_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sla_sync(CASE WHEN TG_TABLE_NAME='projects' THEN NEW.id ELSE NEW.project_id END);
  RETURN NULL;
END $$;

CREATE TRIGGER sla_sync_projects AFTER INSERT OR UPDATE OF status, design_stale ON public.projects FOR EACH ROW EXECUTE FUNCTION public.sla_sync_trigger();
CREATE TRIGGER sla_sync_gates AFTER INSERT ON public.project_gates FOR EACH ROW EXECUTE FUNCTION public.sla_sync_trigger();
CREATE TRIGGER sla_sync_cycles AFTER INSERT ON public.project_cycles FOR EACH ROW EXECUTE FUNCTION public.sla_sync_trigger();
CREATE TRIGGER sla_sync_items AFTER INSERT OR UPDATE OF voided_at ON public.project_items FOR EACH ROW EXECUTE FUNCTION public.sla_sync_trigger();
CREATE TRIGGER sla_sync_loads AFTER INSERT ON public.project_load_reports FOR EACH ROW EXECUTE FUNCTION public.sla_sync_trigger();
CREATE TRIGGER sla_sync_outputs AFTER INSERT OR UPDATE OF status ON public.project_outputs FOR EACH ROW EXECUTE FUNCTION public.sla_sync_trigger();

-- People-facing actions
CREATE OR REPLACE FUNCTION public.sla_refresh(_project uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.portal_has_client_identity(auth.uid()) OR NOT (public.can_access_project(auth.uid(), _project) OR public.has_role(auth.uid(),'management')) THEN
    RAISE EXCEPTION 'You do not have access to this engagement.';
  END IF;
  PERFORM public.sla_sync(_project);
END $$;

CREATE OR REPLACE FUNCTION public.sla_pause(_clock uuid, _reason text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.phase_clocks;
BEGIN
  SELECT * INTO c FROM public.phase_clocks WHERE id=_clock;
  IF NOT FOUND OR c.completed_at IS NOT NULL THEN RAISE EXCEPTION 'This clock is closed.'; END IF;
  IF NOT (public.has_role(auth.uid(),'management') OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id=c.project_id AND m.user_id=auth.uid() AND m.role='engagement_lead')) THEN
    RAISE EXCEPTION 'Only the engagement lead or Management can pause a clock.';
  END IF;
  IF _reason IS NULL OR _reason NOT IN ('waiting_on_sponsor_readback','client_documents','client_approval') THEN
    RAISE EXCEPTION 'A clock can only be paused while waiting on the client (sponsor read-back, client documents or client approval). Time waiting on FridayAnalytics staff never pauses the clock.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clock_pauses WHERE clock_id=_clock AND resumed_at IS NULL) THEN
    RAISE EXCEPTION 'This clock is already paused.';
  END IF;
  INSERT INTO public.clock_pauses(clock_id, reason, note, paused_by) VALUES (_clock, _reason, nullif(trim(_note),''), auth.uid());
  INSERT INTO public.sla_events(project_id, clock_id, kind, detail, actor)
    VALUES (c.project_id, _clock, 'paused', jsonb_build_object('reason', _reason, 'note', _note, 'phase', c.phase), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.sla_resume(_clock uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.phase_clocks;
BEGIN
  SELECT * INTO c FROM public.phase_clocks WHERE id=_clock;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clock not found.'; END IF;
  IF NOT (public.has_role(auth.uid(),'management') OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id=c.project_id AND m.user_id=auth.uid() AND m.role='engagement_lead')) THEN
    RAISE EXCEPTION 'Only the engagement lead or Management can resume a clock.';
  END IF;
  UPDATE public.clock_pauses SET resumed_at=now(), resumed_by=auth.uid() WHERE clock_id=_clock AND resumed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This clock is not paused.'; END IF;
  INSERT INTO public.sla_events(project_id, clock_id, kind, detail, actor)
    VALUES (c.project_id, _clock, 'resumed', jsonb_build_object('phase', c.phase), auth.uid());
  PERFORM public.sla_check_alerts(_clock);
END $$;

CREATE OR REPLACE FUNCTION public.sop_save(_phase integer, _target integer, _warn integer, _owner text, _chain text[], _steps jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer; nid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'management') THEN RAISE EXCEPTION 'Only Management can edit an SOP.'; END IF;
  IF _target IS NULL OR _target < 1 OR _target > 60 THEN RAISE EXCEPTION 'The target must be between 1 and 60 working days.'; END IF;
  IF _warn IS NULL OR _warn NOT IN (70,80,90) THEN RAISE EXCEPTION 'Warn at 70, 80 or 90 per cent of the target.'; END IF;
  SELECT coalesce(max(version),0)+1 INTO v FROM public.sop_definitions WHERE phase=_phase;
  INSERT INTO public.sop_definitions(phase, version, owner_role, target_working_days, warn_pct, escalation_chain, steps, is_sample, created_by)
    VALUES (_phase, v, _owner, _target, _warn, coalesce(_chain,'{}'), coalesce(_steps,'[]'::jsonb), false, auth.uid()) RETURNING id INTO nid;
  INSERT INTO public.sla_events(kind, detail, actor) VALUES ('sop_version', jsonb_build_object('phase',_phase,'version',v,'target',_target,'warn_pct',_warn), auth.uid());
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.sla_set_holiday(_day date, _name text, _remove boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'management') THEN RAISE EXCEPTION 'Only Management can edit the working-day calendar.'; END IF;
  IF coalesce(_remove,false) THEN
    DELETE FROM public.sla_holidays WHERE day=_day;
    INSERT INTO public.sla_events(kind, detail, actor) VALUES ('holiday_removed', jsonb_build_object('day',_day), auth.uid());
  ELSE
    IF _name IS NULL OR length(trim(_name))=0 THEN RAISE EXCEPTION 'Give the holiday a name.'; END IF;
    INSERT INTO public.sla_holidays(day, name, added_by) VALUES (_day, trim(_name), auth.uid())
      ON CONFLICT (day) DO UPDATE SET name=excluded.name;
    INSERT INTO public.sla_events(kind, detail, actor) VALUES ('holiday_added', jsonb_build_object('day',_day,'name',_name), auth.uid());
  END IF;
  UPDATE public.sla_settings SET holidays_set=true, updated_by=auth.uid(), updated_at=now();
END $$;

-- KPIs computed from records, never typed
CREATE OR REPLACE FUNCTION public.sla_kpis(_phase integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.portal_is_staff(auth.uid()) OR public.portal_has_client_identity(auth.uid()) THEN RAISE EXCEPTION 'Staff only.'; END IF;
  WITH done AS (
    SELECT c.*, public.sla_clock_status(c.id) st FROM public.phase_clocks c
    WHERE c.completed_at IS NOT NULL AND (_phase IS NULL OR c.phase=_phase)
  ), rework AS (
    SELECT count(*) n FROM (SELECT project_id, phase, coalesce(cycle_no,-1) cy, count(*) k FROM public.phase_clocks
      WHERE _phase IS NULL OR phase=_phase GROUP BY 1,2,3 HAVING count(*)>1) x
  )
  SELECT jsonb_build_object(
    'completed', (SELECT count(*) FROM done),
    'median_days', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (st->>'used')::int) FROM done),
    'p90_days', (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY (st->>'used')::int) FROM done),
    'on_time_rate', (SELECT round(100.0*avg(CASE WHEN (st->>'on_time')::boolean THEN 1 ELSE 0 END),1) FROM done),
    'breach_count', (SELECT count(*) FROM public.sla_events e JOIN public.phase_clocks c ON c.id=e.clock_id WHERE e.kind='breached' AND (_phase IS NULL OR c.phase=_phase)),
    'paused_days', (SELECT coalesce(sum((st->>'paused')::int),0) FROM done),
    'rework', (SELECT n FROM rework),
    'gate_wait_days', (SELECT coalesce(sum((st->>'used')::int),0) FROM done WHERE phase IN (0,1,4,7,9))
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.sla_sync(uuid), public.sla_check_alerts(uuid), public.sla_sync_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_refresh(uuid), public.sla_pause(uuid,text,text), public.sla_resume(uuid),
  public.sop_save(integer,integer,integer,text,text[],jsonb), public.sla_set_holiday(date,text,boolean), public.sla_kpis(integer),
  public.sla_clock_status(uuid), public.sla_working_days(timestamptz,timestamptz), public.sla_paused_days(uuid), public.sla_project_phase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sla_refresh(uuid), public.sla_pause(uuid,text,text), public.sla_resume(uuid),
  public.sop_save(integer,integer,integer,text,text[],jsonb), public.sla_set_holiday(date,text,boolean), public.sla_kpis(integer),
  public.sla_clock_status(uuid), public.sla_working_days(timestamptz,timestamptz) TO authenticated;

-- Start clocks for engagements that already exist
SELECT public.sla_sync(id) FROM public.projects;
