-- U14 Executive agent gateway (portal side only): access list, question-and-answer log, read scope for the home agent.
-- The agent (Hermes stack on the Mac Studio, via Telegram) is built outside Lovable and has no write access to anything except this log, through the service role.

CREATE OR REPLACE FUNCTION public.exec_is_admin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (public.has_role(u,'owner') OR public.has_role(u,'management')) AND NOT public.portal_has_client_identity(u) $$;

CREATE TABLE public.exec_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('granted','revoked')),
  project_ids uuid[] NOT NULL DEFAULT '{}',
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  actor uuid NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'revoked' OR cardinality(project_ids) > 0)
);
GRANT SELECT ON public.exec_access TO authenticated; GRANT ALL ON public.exec_access TO service_role;
ALTER TABLE public.exec_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec_access_read ON public.exec_access FOR SELECT TO authenticated USING (public.exec_is_admin(auth.uid()) OR user_id = auth.uid());
CREATE TRIGGER exec_access_append_only BEFORE UPDATE OR DELETE ON public.exec_access FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.exec_access_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.exec_is_admin(NEW.actor) THEN RAISE EXCEPTION 'Only the owner or Management can change executive agent access.'; END IF;
  IF NEW.status='granted' AND (NOT public.portal_is_staff(NEW.user_id) OR public.portal_has_client_identity(NEW.user_id)) THEN
    RAISE EXCEPTION 'Only FridayAnalytics staff can be given executive agent access.'; END IF;
  IF NEW.status='granted' AND EXISTS (SELECT 1 FROM unnest(NEW.project_ids) p WHERE NOT public.can_access_project(NEW.user_id, p)) THEN
    RAISE EXCEPTION 'The agent can only see engagements this executive can already see.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exec_access_check BEFORE INSERT ON public.exec_access FOR EACH ROW EXECUTE FUNCTION public.exec_access_guard();

CREATE TABLE public.exec_qa_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_id uuid NOT NULL REFERENCES public.exec_access(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel = 'telegram'),
  question_sha256 text NOT NULL CHECK (question_sha256 ~ '^[0-9a-f]{64}$'),
  answer_sha256 text NOT NULL CHECK (answer_sha256 ~ '^[0-9a-f]{64}$'),
  darknight_ref text NOT NULL CHECK (public.lnk_ident_ok(darknight_ref)),
  project_ids uuid[] NOT NULL,
  cited_captures uuid[] NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low','none')),
  standard_version_id uuid NOT NULL REFERENCES public.framework_versions(id) ON DELETE RESTRICT,
  asked_at timestamptz NOT NULL, answered_at timestamptz NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (confidence = 'none' OR cardinality(cited_captures) > 0)
);
GRANT SELECT ON public.exec_qa_log TO authenticated; GRANT ALL ON public.exec_qa_log TO service_role;
ALTER TABLE public.exec_qa_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec_qa_read ON public.exec_qa_log FOR SELECT TO authenticated USING (public.exec_is_admin(auth.uid()) OR user_id = auth.uid());
CREATE TRIGGER exec_qa_append_only BEFORE UPDATE OR DELETE ON public.exec_qa_log FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.exec_current_access(_user uuid) RETURNS public.exec_access LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.exec_access WHERE user_id=_user ORDER BY at DESC, id DESC LIMIT 1 $$;

-- The engagements the agent may read for this executive right now: the granted list, narrowed to what the executive can still access.
CREATE OR REPLACE FUNCTION public.exec_scope(_user uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN a.status='granted' AND public.portal_is_staff(_user) AND NOT public.portal_has_client_identity(_user)
    THEN ARRAY(SELECT p FROM unnest(a.project_ids) p WHERE public.can_access_project(_user, p)) ELSE '{}'::uuid[] END
  FROM public.exec_current_access(_user) a $$;

CREATE OR REPLACE FUNCTION public.exec_qa_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.exec_access; scope uuid[] := coalesce(public.exec_scope(NEW.user_id),'{}');
BEGIN
  a := public.exec_current_access(NEW.user_id);
  IF a.id IS NULL OR a.status <> 'granted' OR a.id <> NEW.access_id THEN RAISE EXCEPTION 'This executive has no current agent access.'; END IF;
  IF NOT (NEW.project_ids <@ scope) THEN RAISE EXCEPTION 'The answer used engagements outside this executive''s access.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.cited_captures) c WHERE NOT EXISTS (SELECT 1 FROM public.research_captures rc WHERE rc.id=c AND rc.project_id = ANY(scope))) THEN
    RAISE EXCEPTION 'Every cited capture must belong to an engagement this executive may see.'; END IF;
  IF NEW.standard_version_id IS DISTINCT FROM public.lnk_standard_in_force() THEN RAISE EXCEPTION 'Answers must follow the universal standard version in force.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exec_qa_check BEFORE INSERT ON public.exec_qa_log FOR EACH ROW EXECUTE FUNCTION public.exec_qa_guard();

CREATE OR REPLACE FUNCTION public.exec_set_access(_user uuid, _grant boolean, _projects uuid[], _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid;
BEGIN
  IF NOT public.exec_is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can change executive agent access.'; END IF;
  INSERT INTO public.exec_access(user_id,status,project_ids,reason,actor)
    VALUES (_user, CASE WHEN _grant THEN 'granted' ELSE 'revoked' END, CASE WHEN _grant THEN coalesce(_projects,'{}') ELSE '{}' END, trim(coalesce(_reason,'')), auth.uid()) RETURNING exec_access.id INTO id;
  RETURN id;
END $$;

CREATE OR REPLACE FUNCTION public.exec_log_exchange(_user uuid, _item jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.exec_access; lid uuid;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Only the home agent gateway can write the log.'; END IF;
  a := public.exec_current_access(_user);
  INSERT INTO public.exec_qa_log(user_id,access_id,channel,question_sha256,answer_sha256,darknight_ref,project_ids,cited_captures,confidence,standard_version_id,asked_at,answered_at)
    VALUES (_user, a.id, 'telegram', lower(_item->>'question_sha256'), lower(_item->>'answer_sha256'), _item->>'darknight_ref',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(_item->'project_ids','[]')))::uuid[],
      ARRAY(SELECT jsonb_array_elements_text(coalesce(_item->'cited_captures','[]')))::uuid[],
      _item->>'confidence', nullif(_item->>'standard_version_id','')::uuid, (_item->>'asked_at')::timestamptz, (_item->>'answered_at')::timestamptz)
    RETURNING id INTO lid;
  RETURN lid;
END $$;

CREATE OR REPLACE FUNCTION public.exec_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.exec_is_admin(auth.uid()) THEN RAISE EXCEPTION 'Executive agent access is managed by the owner or Management only.'; END IF;
  RETURN jsonb_build_object(
    'access', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',coalesce(p.display_name,p.email,a.user_id::text),'status',a.status,'projects',a.project_ids,'scope',public.exec_scope(a.user_id),'reason',a.reason,'at',a.at) ORDER BY a.at DESC)
      FROM (SELECT DISTINCT ON (user_id) * FROM public.exec_access ORDER BY user_id, at DESC, id DESC) a LEFT JOIN public.profiles p ON p.id=a.user_id), '[]'::jsonb),
    'log', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'at') DESC) FROM (SELECT jsonb_build_object('user',coalesce(p.display_name,p.email),'confidence',l.confidence,'citations',cardinality(l.cited_captures),'ref',l.darknight_ref,'at',l.answered_at) x
      FROM public.exec_qa_log l LEFT JOIN public.profiles p ON p.id=l.user_id ORDER BY l.answered_at DESC LIMIT 100) q), '[]'::jsonb),
    'candidates', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.display_name,p.email)) ORDER BY coalesce(p.display_name,p.email))
      FROM public.profiles p WHERE public.portal_is_staff(p.id) AND NOT public.portal_has_client_identity(p.id)), '[]'::jsonb)
  );
END $$;

REVOKE ALL ON public.exec_access, public.exec_qa_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.exec_access, public.exec_qa_log FROM authenticated;
REVOKE ALL ON FUNCTION public.exec_is_admin(uuid), public.exec_access_guard(), public.exec_current_access(uuid), public.exec_scope(uuid), public.exec_qa_guard(),
  public.exec_set_access(uuid,boolean,uuid[],text), public.exec_log_exchange(uuid,jsonb), public.exec_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_is_admin(uuid), public.exec_set_access(uuid,boolean,uuid[],text), public.exec_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_scope(uuid), public.exec_log_exchange(uuid,jsonb) TO service_role;