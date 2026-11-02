-- Evidence Hub: clients and projects.
--
-- FridayAnalytics works for several clients, each with several projects. A project
-- has a versioned brief with its own criteria, draws on the shared evidence pool
-- (cases, cloud items, home-vault references) by linking, never copying, and
-- produces outputs: an evidence bundle, a report, a live dashboard or a dataset.
--
--   clients ─< projects ─< project_briefs ─< project_criteria
--                     │ ─< project_members        (lead / analyst / reviewer / client_viewer)
--                     │ ─< project_cases  >─ cases
--                     │ ─< project_items  >─ items | evidence_refs
--                     │ ─< project_assessments    (item × criterion, append-only)
--                     │ ─< project_outputs        (tied to the brief version it answers)
--                     └─< project_events          (append-only log of everything above)
--
-- Client access is designed in but off: client_viewer members have no app role, see
-- nothing unless clients.portal_enabled is true, and then only the project, its
-- current brief and outputs that are delivered and shared with the client.

-- ---- clients -------------------------------------------------------------------------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  legal_name text,
  sector text,
  contact_name text,
  contact_email text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  portal_enabled boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- projects ------------------------------------------------------------------------
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  summary text,
  status text NOT NULL DEFAULT 'scoping'
    CHECK (status IN ('scoping', 'active', 'paused', 'delivered', 'closed')),
  opened_on date NOT NULL DEFAULT current_date,
  due_on date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_client_idx ON public.projects (client_id);
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lead', 'analyst', 'reviewer', 'client_viewer')),
  added_by uuid DEFAULT auth.uid(),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON public.project_members (user_id);

-- ---- access helpers ---------------------------------------------------------------------
-- Internal access: the owner, or a member in an FA role (not client_viewer) who is
-- also an investigator.
CREATE OR REPLACE FUNCTION public.project_role(_user_id uuid, _project_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _project_id IS NULL THEN NULL
    WHEN public.has_role(_user_id, 'owner') THEN 'owner'
    ELSE (SELECT m.role FROM public.project_members m
          WHERE m.project_id = _project_id AND m.user_id = _user_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.project_role(_user_id, _project_id) IN ('owner', 'lead', 'analyst', 'reviewer'), false)
     AND public.is_investigator(_user_id);
$$;

-- Lead or owner: edit the project, its brief and members; approve and deliver outputs.
CREATE OR REPLACE FUNCTION public.can_manage_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.project_role(_user_id, _project_id) IN ('owner', 'lead'), false)
     AND public.is_investigator(_user_id);
$$;

-- Lead, analyst or owner: link evidence, assess it, draft outputs.
CREATE OR REPLACE FUNCTION public.can_work_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.project_role(_user_id, _project_id) IN ('owner', 'lead', 'analyst'), false)
     AND public.is_investigator(_user_id);
$$;

-- Future client portal: a client_viewer of a client whose portal is switched on.
CREATE OR REPLACE FUNCTION public.can_view_project_as_client(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members m
    JOIN public.projects p ON p.id = m.project_id
    JOIN public.clients c ON c.id = p.client_id
    WHERE m.project_id = _project_id AND m.user_id = _user_id
      AND m.role = 'client_viewer' AND c.portal_enabled AND c.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.case_of_item(_item_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.case_id FROM public.items it
  JOIN public.accounts a ON a.id = it.account_id
  JOIN public.incidents i ON i.id = a.incident_uuid
  WHERE it.id = _item_id;
$$;

REVOKE ALL ON FUNCTION public.project_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_work_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_project_as_client(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.case_of_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_work_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_project_as_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.case_of_item(uuid) TO authenticated, service_role;

-- ---- briefs and criteria (versioned, append-only) ------------------------------------------
-- A brief is never edited: a change is a new version. Criteria belong to one brief
-- version, so an output always points at the exact question and tests it answered.
CREATE TABLE public.project_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version int NOT NULL,
  question text NOT NULL CHECK (length(trim(question)) > 0),
  background text,
  scope text,
  out_of_scope text,
  period_from date,
  period_to date,
  platforms text[] NOT NULL DEFAULT '{}',
  audience text,
  output_kinds text[] NOT NULL DEFAULT '{}'
    CHECK (output_kinds <@ ARRAY['evidence_bundle', 'report', 'dashboard', 'dataset']),
  constraints text,
  change_note text,
  authored_by uuid DEFAULT auth.uid(),
  authored_by_name text,
  authored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  CHECK (period_to IS NULL OR period_from IS NULL OR period_to >= period_from)
);

CREATE TABLE public.project_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.project_briefs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('inclusion', 'exclusion', 'assessment', 'threshold')),
  label text NOT NULL CHECK (length(trim(label)) > 0),
  description text,
  required boolean NOT NULL DEFAULT false,
  weight numeric CHECK (weight IS NULL OR weight >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_criteria_brief_idx ON public.project_criteria (brief_id, position);

-- Version numbers are assigned by the database, one after the last.
CREATE OR REPLACE FUNCTION public.project_brief_next_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  SELECT coalesce(max(version), 0) + 1 INTO NEW.version
    FROM public.project_briefs WHERE project_id = NEW.project_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_briefs_version BEFORE INSERT ON public.project_briefs
  FOR EACH ROW EXECUTE FUNCTION public.project_brief_next_version();

-- Criteria may only be added to the latest brief version, and must match its project.
CREATE OR REPLACE FUNCTION public.project_criteria_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT project_id, version INTO b FROM public.project_briefs WHERE id = NEW.brief_id;
  IF b.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Criterion project does not match its brief';
  END IF;
  IF b.version < (SELECT max(version) FROM public.project_briefs WHERE project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Brief version % is superseded; add criteria to the latest version', b.version;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_criteria_check BEFORE INSERT ON public.project_criteria
  FOR EACH ROW EXECUTE FUNCTION public.project_criteria_check();

CREATE TRIGGER project_briefs_append_only BEFORE UPDATE OR DELETE ON public.project_briefs
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER project_criteria_append_only BEFORE UPDATE OR DELETE ON public.project_criteria
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE VIEW public.project_current_briefs WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_id) * FROM public.project_briefs
  ORDER BY project_id, version DESC;

-- ---- evidence linked to a project (shared pool) -------------------------------------------
CREATE TABLE public.project_cases (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  case_id text NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  note text,
  linked_by uuid DEFAULT auth.uid(),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, case_id)
);
CREATE INDEX project_cases_case_idx ON public.project_cases (case_id);

CREATE TABLE public.project_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('cloud_item', 'home_ref')),
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  evidence_ref_id uuid REFERENCES public.evidence_refs(id) ON DELETE CASCADE,
  note text,
  linked_by uuid DEFAULT auth.uid(),
  linked_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((item_kind = 'cloud_item' AND item_id IS NOT NULL AND evidence_ref_id IS NULL)
      OR (item_kind = 'home_ref' AND evidence_ref_id IS NOT NULL AND item_id IS NULL))
);
CREATE UNIQUE INDEX project_items_cloud_uniq ON public.project_items (project_id, item_id)
  WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX project_items_home_uniq ON public.project_items (project_id, evidence_ref_id)
  WHERE evidence_ref_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_item_case(_kind text, _item_id uuid, _evidence_ref_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _kind = 'cloud_item' THEN public.case_of_item(_item_id)
              ELSE (SELECT case_id FROM public.evidence_refs WHERE id = _evidence_ref_id) END;
$$;
REVOKE ALL ON FUNCTION public.project_item_case(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_item_case(text, uuid, uuid) TO authenticated, service_role;

-- Each item is assessed against the criteria of a brief version. Append-only: a
-- re-assessment is a new row; the latest per item and criterion counts.
CREATE TABLE public.project_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.project_criteria(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('meets', 'does_not_meet', 'unclear', 'not_applicable')),
  note text,
  assessed_by uuid DEFAULT auth.uid(),
  assessed_by_name text,
  assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_assessments_item_idx ON public.project_assessments (project_item_id, criterion_id, assessed_at DESC);
CREATE TRIGGER project_assessments_append_only BEFORE UPDATE OR DELETE ON public.project_assessments
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.project_assessment_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_items WHERE id = NEW.project_item_id AND project_id = NEW.project_id)
     OR NOT EXISTS (SELECT 1 FROM public.project_criteria WHERE id = NEW.criterion_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Assessment item and criterion must belong to the same project';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_assessments_check BEFORE INSERT ON public.project_assessments
  FOR EACH ROW EXECUTE FUNCTION public.project_assessment_check();

-- ---- outputs ---------------------------------------------------------------------------
CREATE TABLE public.project_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL REFERENCES public.project_briefs(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('evidence_bundle', 'report', 'dashboard', 'dataset')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'delivered', 'withdrawn')),
  -- what the output was built from: filters, criteria used, item ids, format
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_count int,
  file_name text,
  size_bytes bigint,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  -- a link (dashboard URL, artifact, or a storage path in the cloud vault)
  location text,
  shared_with_client boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  delivered_at timestamptz,
  CHECK (NOT shared_with_client OR status = 'delivered')
);
CREATE INDEX project_outputs_project_idx ON public.project_outputs (project_id, created_at DESC);

-- Outputs move forward only; approval and delivery need the lead. Once approved,
-- what was approved (brief, kind, params, file and hash) cannot change.
CREATE OR REPLACE FUNCTION public.project_output_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rank_old int; rank_new int;
  order_ text[] := ARRAY['draft', 'in_review', 'approved', 'delivered'];
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT project_id FROM public.project_briefs WHERE id = NEW.brief_id) IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Output brief belongs to another project';
    END IF;
    IF NEW.status NOT IN ('draft', 'in_review') THEN
      RAISE EXCEPTION 'A new output starts as draft or in review';
    END IF;
    NEW.shared_with_client := false;
    NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.delivered_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.project_id <> OLD.project_id OR NEW.kind <> OLD.kind OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'project, kind and author of an output cannot change';
  END IF;
  IF OLD.status IN ('approved', 'delivered', 'withdrawn')
     AND (NEW.brief_id <> OLD.brief_id OR NEW.params IS DISTINCT FROM OLD.params
          OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.file_name IS DISTINCT FROM OLD.file_name
          OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.item_count IS DISTINCT FROM OLD.item_count
          OR NEW.title <> OLD.title) THEN
    RAISE EXCEPTION 'An approved output is fixed; create a new output instead';
  END IF;
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    RAISE EXCEPTION 'A withdrawn output cannot be reinstated';
  END IF;
  IF NEW.status <> OLD.status AND NEW.status <> 'withdrawn' THEN
    rank_old := array_position(order_, OLD.status);
    rank_new := array_position(order_, NEW.status);
    -- one step forward, or back from review to draft
    IF NOT (rank_new = rank_old + 1 OR (OLD.status = 'in_review' AND NEW.status = 'draft')) THEN
      RAISE EXCEPTION 'Output status cannot go from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  IF NEW.status IN ('approved', 'delivered') AND NEW.status <> OLD.status THEN
    IF uid IS NOT NULL AND NOT public.can_manage_project(uid, NEW.project_id) THEN
      RAISE EXCEPTION 'Only the project lead can approve or deliver an output';
    END IF;
    IF NEW.kind IN ('evidence_bundle', 'dataset') AND NEW.sha256 IS NULL THEN
      RAISE EXCEPTION 'A % needs its file hash before it is approved', NEW.kind;
    END IF;
  END IF;
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    NEW.approved_by := uid; NEW.approved_at := now();
  ELSE
    NEW.approved_by := OLD.approved_by; NEW.approved_at := OLD.approved_at;
  END IF;
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    NEW.delivered_at := now();
  ELSE
    NEW.delivered_at := OLD.delivered_at;
  END IF;
  IF NEW.shared_with_client IS DISTINCT FROM OLD.shared_with_client
     AND uid IS NOT NULL AND NOT public.can_manage_project(uid, NEW.project_id) THEN
    RAISE EXCEPTION 'Only the project lead can share an output with the client';
  END IF;
  IF NEW.status = 'withdrawn' THEN NEW.shared_with_client := false; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_outputs_guard BEFORE INSERT OR UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.project_output_guard();
CREATE TRIGGER project_outputs_touch BEFORE UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER project_outputs_no_delete BEFORE DELETE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- project log (append-only) ----------------------------------------------------------
CREATE TABLE public.project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  output_id uuid REFERENCES public.project_outputs(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'created', 'updated', 'member_added', 'member_removed', 'brief_versioned',
    'case_linked', 'case_unlinked', 'item_linked', 'item_unlinked', 'assessed',
    'output_created', 'output_status', 'output_shared', 'output_unshared', 'output_downloaded'
  )),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(),
  actor_name text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_events_project_idx ON public.project_events (project_id, at DESC);
CREATE TRIGGER project_events_append_only BEFORE UPDATE OR DELETE ON public.project_events
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.log_project_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; act text; d jsonb := '{}'::jsonb; out_id uuid; pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_TABLE_NAME = 'projects' THEN pid := r.id; ELSE pid := r.project_id; END IF;
  CASE TG_TABLE_NAME
    WHEN 'projects' THEN
      act := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;
      d := jsonb_build_object('status', NEW.status, 'name', NEW.name);
    WHEN 'project_members' THEN
      act := CASE WHEN TG_OP = 'DELETE' THEN 'member_removed' ELSE 'member_added' END;
      d := jsonb_build_object('user_id', r.user_id, 'role', r.role);
    WHEN 'project_briefs' THEN
      act := 'brief_versioned'; d := jsonb_build_object('version', NEW.version, 'note', NEW.change_note);
    WHEN 'project_cases' THEN
      act := CASE WHEN TG_OP = 'DELETE' THEN 'case_unlinked' ELSE 'case_linked' END;
      d := jsonb_build_object('case_id', r.case_id);
    WHEN 'project_items' THEN
      act := CASE WHEN TG_OP = 'DELETE' THEN 'item_unlinked' ELSE 'item_linked' END;
      d := jsonb_build_object('item_kind', r.item_kind, 'item_id', r.item_id, 'evidence_ref_id', r.evidence_ref_id);
    WHEN 'project_assessments' THEN
      act := 'assessed';
      d := jsonb_build_object('project_item_id', NEW.project_item_id, 'criterion_id', NEW.criterion_id, 'result', NEW.result);
    WHEN 'project_outputs' THEN
      out_id := NEW.id;
      IF TG_OP = 'INSERT' THEN
        act := 'output_created'; d := jsonb_build_object('kind', NEW.kind, 'title', NEW.title);
      ELSIF NEW.status <> OLD.status THEN
        act := 'output_status'; d := jsonb_build_object('from', OLD.status, 'to', NEW.status, 'sha256', NEW.sha256);
      ELSIF NEW.shared_with_client <> OLD.shared_with_client THEN
        act := CASE WHEN NEW.shared_with_client THEN 'output_shared' ELSE 'output_unshared' END;
      ELSE
        RETURN NULL;
      END IF;
  END CASE;
  -- a project being deleted takes its log with it; nothing to record
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = pid) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.project_events(project_id, output_id, action, detail, actor)
    VALUES (pid, out_id, act, d, auth.uid());
  RETURN NULL;
END; $$;

CREATE TRIGGER projects_log AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();
CREATE TRIGGER project_members_log AFTER INSERT OR DELETE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();
CREATE TRIGGER project_briefs_log AFTER INSERT ON public.project_briefs
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();
CREATE TRIGGER project_cases_log AFTER INSERT OR DELETE ON public.project_cases
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();
CREATE TRIGGER project_items_log AFTER INSERT OR DELETE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();
CREATE TRIGGER project_assessments_log AFTER INSERT ON public.project_assessments
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();
CREATE TRIGGER project_outputs_log AFTER INSERT OR UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.log_project_event();

-- The person who creates a project becomes its lead.
CREATE OR REPLACE FUNCTION public.project_creator_is_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.project_members(project_id, user_id, role, added_by)
      VALUES (NEW.id, auth.uid(), 'lead', auth.uid()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER projects_creator_lead AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_creator_is_lead();

-- A project must keep at least one lead.
CREATE OR REPLACE FUNCTION public.project_keeps_a_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'lead' AND (TG_OP = 'DELETE' OR NEW.role <> 'lead') AND EXISTS (SELECT 1 FROM public.projects WHERE id = OLD.project_id)
     AND NOT EXISTS (SELECT 1 FROM public.project_members
                     WHERE project_id = OLD.project_id AND role = 'lead' AND user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'A project needs at least one lead';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER project_members_keep_lead BEFORE DELETE OR UPDATE OF role ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.project_keeps_a_lead();

-- client_viewer is for people without an FA role; FA staff get FA roles.
CREATE OR REPLACE FUNCTION public.project_member_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'client_viewer' AND public.is_investigator(NEW.user_id) THEN
    RAISE EXCEPTION 'FridayAnalytics staff join a project as lead, analyst or reviewer';
  END IF;
  IF NEW.role <> 'client_viewer' AND NOT public.is_investigator(NEW.user_id) THEN
    RAISE EXCEPTION 'Only investigators can be lead, analyst or reviewer';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_members_check BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.project_member_check();

-- ---- cases: project members can open the cases linked to their project ------------------------
CREATE OR REPLACE FUNCTION public.can_access_case(_user_id uuid, _case_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _case_id IS NOT NULL AND (
    public.has_role(_user_id, 'owner')
    OR EXISTS (
      SELECT 1 FROM public.case_assignments a
      WHERE a.case_id = _case_id AND a.user_id = _user_id
    )
    OR (public.is_investigator(_user_id) AND EXISTS (
      SELECT 1 FROM public.project_cases pc
      JOIN public.project_members m ON m.project_id = pc.project_id
      WHERE pc.case_id = _case_id AND m.user_id = _user_id AND m.role <> 'client_viewer'
    ))
  );
$$;

-- ---- row level security ---------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.clients, public.projects, public.project_outputs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.project_cases, public.project_items TO authenticated;
GRANT SELECT, INSERT ON public.project_briefs, public.project_criteria, public.project_assessments,
  public.project_events TO authenticated;
GRANT SELECT ON public.project_current_briefs TO authenticated;

-- clients: FA staff read; the owner creates and edits. A client viewer sees their own client.
CREATE POLICY "investigators read clients" ON public.clients FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid())
         OR EXISTS (SELECT 1 FROM public.projects p
                    WHERE p.client_id = clients.id AND public.can_view_project_as_client(auth.uid(), p.id)));
CREATE POLICY "owner creates clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner edits clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- projects
CREATE POLICY "members read projects" ON public.projects FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), id) OR public.can_view_project_as_client(auth.uid(), id)
         -- the creator, before the lead row the insert trigger adds is visible
         OR (created_by = auth.uid() AND public.is_investigator(auth.uid())));
CREATE POLICY "investigators create projects" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_investigator(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "leads edit projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_manage_project(auth.uid(), id)) WITH CHECK (public.can_manage_project(auth.uid(), id));

-- members
CREATE POLICY "members read members" ON public.project_members FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id) OR user_id = auth.uid());
CREATE POLICY "leads add members" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "leads change members" ON public.project_members FOR UPDATE TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id))
  WITH CHECK (public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "leads remove members" ON public.project_members FOR DELETE TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id));

-- briefs and criteria: the team reads; the lead writes; a client viewer reads the brief.
CREATE POLICY "members read briefs" ON public.project_briefs FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id) OR public.can_view_project_as_client(auth.uid(), project_id));
CREATE POLICY "leads write briefs" ON public.project_briefs FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "members read criteria" ON public.project_criteria FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id) OR public.can_view_project_as_client(auth.uid(), project_id));
CREATE POLICY "leads write criteria" ON public.project_criteria FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_project(auth.uid(), project_id));

-- evidence links: linking needs both project work rights and access to the case.
CREATE POLICY "members read project cases" ON public.project_cases FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY "workers link cases" ON public.project_cases FOR INSERT TO authenticated
  WITH CHECK (public.can_work_project(auth.uid(), project_id) AND public.can_access_case(auth.uid(), case_id));
CREATE POLICY "leads unlink cases" ON public.project_cases FOR DELETE TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id));

CREATE POLICY "members read project items" ON public.project_items FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY "workers link items" ON public.project_items FOR INSERT TO authenticated
  WITH CHECK (public.can_work_project(auth.uid(), project_id)
              AND public.can_access_case(auth.uid(), public.project_item_case(item_kind, item_id, evidence_ref_id)));
CREATE POLICY "leads unlink items" ON public.project_items FOR DELETE TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id));

CREATE POLICY "members read assessments" ON public.project_assessments FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY "workers assess" ON public.project_assessments FOR INSERT TO authenticated
  WITH CHECK (public.can_work_project(auth.uid(), project_id) AND assessed_by = auth.uid());

-- outputs: the team reads all; a client viewer reads only delivered, shared outputs.
CREATE POLICY "members read outputs" ON public.project_outputs FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id)
         OR (shared_with_client AND status = 'delivered'
             AND public.can_view_project_as_client(auth.uid(), project_id)));
CREATE POLICY "workers create outputs" ON public.project_outputs FOR INSERT TO authenticated
  WITH CHECK (public.can_work_project(auth.uid(), project_id));
CREATE POLICY "workers update outputs" ON public.project_outputs FOR UPDATE TO authenticated
  USING (public.can_work_project(auth.uid(), project_id))
  WITH CHECK (public.can_work_project(auth.uid(), project_id));

-- log: the team reads; anyone on the project may add a 'downloaded' entry (triggers add the rest).
CREATE POLICY "members read project log" ON public.project_events FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY "members log downloads" ON public.project_events FOR INSERT TO authenticated
  WITH CHECK (action = 'output_downloaded' AND actor = auth.uid()
              AND (public.can_access_project(auth.uid(), project_id)
                   OR public.can_view_project_as_client(auth.uid(), project_id)));
