-- Evidence Hub: clients and engagements, built on FA-CEF V1.10 (Client Engagement Framework).
--
--   Phase 0 Brief, discovery and intake   G0 brief signed (client sponsor)   G1 mandate (Curator)
--   Phase 1 Design                        G2 design approved (Curator)
--   Phase 2-3 Collection, screening       (cycles: cycle 0 baseline, then delta cycles)
--   Phase 4 Analyst reading               G3 read complete (lead analyst)
--   Phase 5-7 Evidence, enrich, load      G4 evidence and QA (evidence officer / data steward)
--   Phase 8-9 Report, deliver             G5 release (Curator, written; default HELD)
--   Phase 10 Monitor and close-out
--
-- The database enforces the order: nothing downstream can be written until its gate is
-- signed, gates check their own pass conditions, history is append-only, and nothing is
-- deleted (items are voided with a note). Client access is designed in but off.

-- SQL helper functions below refer to tables created later in this file.
SET check_function_bodies = off;

-- ---- clients ---------------------------------------------------------------------------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  legal_name text, sector text, contact_name text, contact_email text, notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  portal_enabled boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- engagements (projects) --------------------------------------------------------------
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  summary text,
  sponsor_name text,
  status text NOT NULL DEFAULT 'scoping'
    CHECK (status IN ('scoping', 'active', 'paused', 'delivered', 'closed')),
  opened_on date NOT NULL DEFAULT current_date,
  due_on date,
  -- true while a scope-changing amendment or a new design sheet awaits G2 (re-)approval
  design_stale boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_client_idx ON public.projects (client_id);
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Roles follow FA-CEF Appendix D. The Curator is not a project role: it is the global
-- app_role 'curator', with read access to every engagement.
CREATE TABLE public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('engagement_lead', 'lead_analyst', 'analyst', 'collection_operator',
    'evidence_officer', 'data_steward', 'reviewer', 'client_viewer')),
  added_by uuid DEFAULT auth.uid(),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON public.project_members (user_id);

-- ---- access helpers ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_project_role(_user_id uuid, _project_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _project_id IS NOT NULL AND public.is_investigator(_user_id) AND (
    ('owner' = ANY(_roles) AND public.has_role(_user_id, 'owner'))
    OR ('curator' = ANY(_roles) AND public.has_role(_user_id, 'curator'))
    OR EXISTS (SELECT 1 FROM public.project_members m
               WHERE m.project_id = _project_id AND m.user_id = _user_id AND m.role = ANY(_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.project_role(_user_id uuid, _project_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _project_id IS NULL THEN NULL
    WHEN public.has_role(_user_id, 'owner') THEN 'owner'
    WHEN public.has_role(_user_id, 'curator') THEN 'curator'
    ELSE (SELECT m.role FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id)
  END;
$$;

-- read access: owner, Curator and every internal role
CREATE OR REPLACE FUNCTION public.can_access_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_project_role(_user_id, _project_id, ARRAY['owner','curator','engagement_lead','lead_analyst',
    'analyst','collection_operator','evidence_officer','data_steward','reviewer']);
$$;
CREATE OR REPLACE FUNCTION public.can_manage_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_project_role(_user_id, _project_id, ARRAY['owner','engagement_lead']);
$$;
CREATE OR REPLACE FUNCTION public.can_work_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_project_role(_user_id, _project_id, ARRAY['owner','engagement_lead','lead_analyst',
    'analyst','collection_operator','evidence_officer','data_steward']);
$$;
CREATE OR REPLACE FUNCTION public.can_view_project_as_client(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members m
    JOIN public.projects p ON p.id = m.project_id
    JOIN public.clients c ON c.id = p.client_id
    WHERE m.project_id = _project_id AND m.user_id = _user_id
      AND m.role = 'client_viewer' AND c.portal_enabled AND c.status = 'active');
$$;
CREATE OR REPLACE FUNCTION public.case_of_item(_item_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.case_id FROM public.items it JOIN public.accounts a ON a.id = it.account_id
  JOIN public.incidents i ON i.id = a.incident_uuid WHERE it.id = _item_id;
$$;

-- Trigger helper: the caller must hold one of the roles in TG_ARGV[0] (comma separated).
-- A NULL auth.uid() (service role, maintenance) skips the check; conditions still apply.
CREATE OR REPLACE FUNCTION public.project_require_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; roles text[] := string_to_array(TG_ARGV[0], ',');
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  pid := (to_jsonb(NEW)->>'project_id')::uuid;
  IF NOT public.has_project_role(auth.uid(), pid, roles) THEN
    RAISE EXCEPTION 'Your role cannot do this on %: needs one of %', TG_TABLE_NAME, TG_ARGV[0];
  END IF;
  RETURN NEW;
END; $$;

-- Gate state helpers
CREATE OR REPLACE FUNCTION public.gate_signed(_project uuid, _gate text, _cycle int DEFAULT 0, _output uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_gates g
    WHERE g.project_id = _project AND g.gate = _gate AND g.cycle_no = _cycle
      AND g.output_id IS NOT DISTINCT FROM _output);
$$;
-- design is usable only while G2 is signed and nothing is waiting for re-approval
CREATE OR REPLACE FUNCTION public.design_ready(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gate_signed(_project, 'G2') AND NOT (SELECT design_stale FROM public.projects WHERE id = _project);
$$;
CREATE OR REPLACE FUNCTION public.project_mandate(_project uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT s.mandate FROM public.project_scope_sheets s WHERE s.project_id = _project
                   ORDER BY s.completed_at DESC, s.id LIMIT 1), 'internal_read_only');
$$;

REVOKE ALL ON FUNCTION public.has_project_role(uuid, uuid, text[]), public.project_role(uuid, uuid),
  public.can_access_project(uuid, uuid), public.can_manage_project(uuid, uuid), public.can_work_project(uuid, uuid),
  public.can_view_project_as_client(uuid, uuid), public.case_of_item(uuid),
  public.gate_signed(uuid, text, int, uuid), public.design_ready(uuid), public.project_mandate(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, text[]), public.project_role(uuid, uuid),
  public.can_access_project(uuid, uuid), public.can_manage_project(uuid, uuid), public.can_work_project(uuid, uuid),
  public.can_view_project_as_client(uuid, uuid), public.case_of_item(uuid),
  public.gate_signed(uuid, text, int, uuid), public.design_ready(uuid), public.project_mandate(uuid)
  TO authenticated, service_role;

-- Revision numbers: append-only registers keep every revision; the latest per key counts.
CREATE OR REPLACE FUNCTION public.assign_rev()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  EXECUTE format('SELECT coalesce(max(rev), 0) + 1 FROM public.%I WHERE project_id = $1 AND %I = $2',
                 TG_TABLE_NAME, TG_ARGV[0])
    INTO n USING NEW.project_id, to_jsonb(NEW)->>TG_ARGV[0];
  NEW.rev := n;
  RETURN NEW;
END; $$;

-- Once G0 is signed the brief, scenarios and success plan change only through an approved
-- amendment (FA-CEF Appendix H amendment rule).
CREATE OR REPLACE FUNCTION public.require_amendment_after_g0()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.gate_signed(NEW.project_id, 'G0') THEN
    IF NEW.amendment_id IS NULL THEN
      RAISE EXCEPTION 'The brief is signed (G0): changes to % need an approved amendment', TG_TABLE_NAME;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_amendment_approvals a
                   JOIN public.project_briefs b ON b.id = a.brief_id
                   WHERE a.brief_id = NEW.amendment_id AND b.project_id = NEW.project_id
                     AND a.decision = 'approved') THEN
      RAISE EXCEPTION 'Amendment is not approved by the Curator';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Append-only registers: no updates, no deletes.
-- (block_mutation() exists from the first migrations.)

-- ---- gates (append-only; Appendix: G0 .. G5) --------------------------------------------------
CREATE TABLE public.project_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gate text NOT NULL CHECK (gate IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  cycle_no int NOT NULL DEFAULT 0,          -- G3 and G4 are signed per cycle
  output_id uuid,                            -- G5 is signed per output
  design_version int,                        -- G2: the design sheet version approved
  brief_id uuid,                             -- G0: the brief version read back and signed
  sponsor_name text, sponsor_role text,      -- G0: client sponsor
  read_back_on date,                         -- G0: date the brief was read back
  signed_document_sha256 text CHECK (signed_document_sha256 IS NULL OR signed_document_sha256 ~ '^[0-9a-f]{64}$'),
  recipient text, written_approval_ref text, -- G5: who receives it; reference of the written approval
  note text,
  signed_by uuid DEFAULT auth.uid(),
  signed_by_name text,
  signed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_gates_once ON public.project_gates
  (project_id, gate, cycle_no, coalesce(output_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(design_version, 0));
CREATE TRIGGER project_gates_append_only BEFORE UPDATE OR DELETE ON public.project_gates
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- brief (Appendix H, FA-CEF-T02), versioned; after G0 only through amendments ---------------
CREATE OR REPLACE FUNCTION public.brief_facts_ok(_facts jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(_facts) = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_facts) f
    WHERE length(trim(coalesce(f->>'statement', ''))) = 0
       OR coalesce(f->>'class', '') NOT IN ('FIRST_HAND', 'REPORTED', 'ASSUMED'));
$$;

CREATE OR REPLACE FUNCTION public.statements_ok(_s jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(_s) = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_s) f
    WHERE length(trim(coalesce(f->>'text', ''))) = 0
       OR coalesce(f->>'class', '') NOT IN ('FIRST_HAND', 'REPORTED', 'ASSUMED'));
$$;

CREATE TABLE public.project_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version int NOT NULL,
  kind text NOT NULL DEFAULT 'draft' CHECK (kind IN ('draft', 'amendment')),
  amendment_no int,                                  -- A1, A2 ...
  -- 1 Situation: facts attributed and marked FIRST_HAND / REPORTED / ASSUMED; unknowns listed
  situation text,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.brief_facts_ok(facts)),
  unknowns text[] NOT NULL DEFAULT '{}',
  -- 2 Purpose and decisions
  purpose_decisions text,
  objectives text[] NOT NULL DEFAULT '{}' CHECK (cardinality(objectives) <= 2),
  ranked_asks jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{rank, ask, need: "need"|"nice"}]
  -- 3 Audiences and stakeholders
  audiences jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {affected, recipients, protectee_or_target, approver}
  -- 4 Scope and exclusions
  platforms text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  window_from date, window_to date,
  sample_rule text, caps text, in_scope text, out_of_scope text, held_groups text,
  -- 5 Research content supplied: the intake register (project_intake_items) holds the list
  research_content_note text,
  -- 6 Response parameters
  response_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 7 Scenarios and 8 Success measures live in their own registers (T04, T05)
  -- 9 Constraints and risks
  constraints_risks jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 10 Governance
  governance jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- amendment fields (numbered amendment rule)
  change_summary text, change_reason text, requested_by text,
  scope_changed boolean NOT NULL DEFAULT false,
  authored_by uuid DEFAULT auth.uid(),
  authored_by_name text,
  authored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  CHECK (window_to IS NULL OR window_from IS NULL OR window_to >= window_from)
);
CREATE TRIGGER project_briefs_append_only BEFORE UPDATE OR DELETE ON public.project_briefs
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.project_brief_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  SELECT coalesce(max(version), 0) + 1 INTO NEW.version FROM public.project_briefs WHERE project_id = NEW.project_id;
  IF public.gate_signed(NEW.project_id, 'G0') THEN
    NEW.kind := 'amendment';
    SELECT coalesce(max(amendment_no), 0) + 1 INTO NEW.amendment_no
      FROM public.project_briefs WHERE project_id = NEW.project_id;
    IF length(trim(coalesce(NEW.change_summary, ''))) = 0 OR length(trim(coalesce(NEW.change_reason, ''))) = 0
       OR length(trim(coalesce(NEW.requested_by, ''))) = 0 THEN
      RAISE EXCEPTION 'An amendment must say what changed, why, and who asked';
    END IF;
  ELSE
    NEW.kind := 'draft'; NEW.amendment_no := NULL; NEW.scope_changed := false;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_briefs_a_roles BEFORE INSERT ON public.project_briefs
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead');
CREATE TRIGGER project_briefs_b_version BEFORE INSERT ON public.project_briefs
  FOR EACH ROW EXECUTE FUNCTION public.project_brief_before_insert();

-- The Curator approves or rejects each amendment; only an approved amendment takes effect.
CREATE TABLE public.project_amendment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL UNIQUE REFERENCES public.project_briefs(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text,
  decided_by uuid DEFAULT auth.uid(),
  decided_by_name text,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER project_amendment_approvals_append_only BEFORE UPDATE OR DELETE ON public.project_amendment_approvals
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER project_amendment_approvals_roles BEFORE INSERT ON public.project_amendment_approvals
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('curator');
CREATE OR REPLACE FUNCTION public.project_amendment_approval_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM public.project_briefs WHERE id = NEW.brief_id;
  IF b.project_id IS DISTINCT FROM NEW.project_id OR b.kind <> 'amendment' THEN
    RAISE EXCEPTION 'Only an amendment of this project can be approved';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_amendment_approvals_check BEFORE INSERT ON public.project_amendment_approvals
  FOR EACH ROW EXECUTE FUNCTION public.project_amendment_approval_check();
CREATE OR REPLACE FUNCTION public.project_amendment_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.decision = 'approved' AND (SELECT scope_changed FROM public.project_briefs WHERE id = NEW.brief_id) THEN
    UPDATE public.projects SET design_stale = true WHERE id = NEW.project_id;  -- G2 must be re-approved
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_amendment_approved AFTER INSERT ON public.project_amendment_approvals
  FOR EACH ROW EXECUTE FUNCTION public.project_amendment_approved();

-- The brief in force: the latest draft before G0; after G0 the latest approved amendment,
-- otherwise the version that was signed.
CREATE OR REPLACE FUNCTION public.project_current_brief_id(_project uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.gate_signed(_project, 'G0') THEN
    coalesce(
      (SELECT b.id FROM public.project_briefs b JOIN public.project_amendment_approvals a ON a.brief_id = b.id
       WHERE b.project_id = _project AND a.decision = 'approved' ORDER BY b.version DESC LIMIT 1),
      (SELECT g.brief_id FROM public.project_gates g WHERE g.project_id = _project AND g.gate = 'G0'))
  ELSE (SELECT b.id FROM public.project_briefs b WHERE b.project_id = _project ORDER BY b.version DESC LIMIT 1) END;
$$;
REVOKE ALL ON FUNCTION public.project_current_brief_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_current_brief_id(uuid) TO authenticated, service_role;

-- Which Appendix H sections are still incomplete (used by G0 and by the form).
CREATE OR REPLACE FUNCTION public.brief_missing(_brief uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.project_briefs; m text[] := '{}';
  blank boolean;
BEGIN
  SELECT * INTO b FROM public.project_briefs WHERE id = _brief;
  IF NOT FOUND THEN RETURN ARRAY['brief']; END IF;
  IF length(trim(coalesce(b.situation, ''))) = 0 OR jsonb_array_length(b.facts) = 0 THEN m := m || '1 Situation (text and at least one attributed fact)'; END IF;
  IF length(trim(coalesce(b.purpose_decisions, ''))) = 0 OR cardinality(b.objectives) = 0
     OR jsonb_array_length(b.ranked_asks) = 0 THEN m := m || '2 Purpose and decisions (decisions, objectives, ranked asks)'; END IF;
  IF length(trim(coalesce(b.audiences->>'affected', ''))) = 0 OR length(trim(coalesce(b.audiences->>'recipients', ''))) = 0
     OR length(trim(coalesce(b.audiences->>'approver', ''))) = 0 THEN m := m || '3 Audiences and stakeholders (affected, recipients, approver)'; END IF;
  IF cardinality(b.platforms) = 0 OR cardinality(b.languages) = 0 OR b.window_from IS NULL OR b.window_to IS NULL
     OR length(trim(coalesce(b.sample_rule, ''))) = 0 OR length(trim(coalesce(b.caps, ''))) = 0
     OR length(trim(coalesce(b.in_scope, ''))) = 0 OR length(trim(coalesce(b.out_of_scope, ''))) = 0
     THEN m := m || '4 Scope and exclusions (platforms, languages, window, sample rule, caps, in and out of scope)'; END IF;
  IF length(trim(coalesce(b.response_parameters->>'who_may_act', ''))) = 0
     OR length(trim(coalesce(b.response_parameters->>'approval_chain', ''))) = 0
     OR length(trim(coalesce(b.response_parameters->>'red_lines', ''))) = 0
     OR jsonb_array_length(coalesce(b.response_parameters->'notify', '[]'::jsonb)) = 0
     THEN m := m || '6 Response parameters (notify by severity, who may act, approval chain, red lines)'; END IF;
  IF length(trim(coalesce(b.constraints_risks->>'legal', ''))) = 0 OR length(trim(coalesce(b.constraints_risks->>'data_handling', ''))) = 0
     OR length(trim(coalesce(b.constraints_risks->>'retention_years', ''))) = 0
     THEN m := m || '9 Constraints and risks (legal, data handling, retention)'; END IF;
  IF length(trim(coalesce(b.governance->>'contacts', ''))) = 0 OR length(trim(coalesce(b.governance->>'rhythm', ''))) = 0
     OR length(trim(coalesce(b.governance->>'signoff_roles', ''))) = 0
     THEN m := m || '10 Governance (contacts, meeting rhythm, sign-off roles)'; END IF;
  RETURN m;
END; $$;
REVOKE ALL ON FUNCTION public.brief_missing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brief_missing(uuid) TO authenticated, service_role;

-- ---- discovery: interview records, intake register (T03), research questions --------------------
CREATE TABLE public.project_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  interviewee text NOT NULL, interviewee_role text NOT NULL,
  held_at timestamptz NOT NULL, duration_min int CHECK (duration_min > 0),
  interviewer uuid NOT NULL REFERENCES auth.users(id), interviewer_name text,
  note_taker uuid NOT NULL REFERENCES auth.users(id), note_taker_name text,
  -- key statements verbatim, each marked FIRST_HAND / REPORTED / ASSUMED
  key_statements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.statements_ok(key_statements)),
  priorities text[] NOT NULL DEFAULT '{}',
  disagreements text, actions text,
  readback_confirmed boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (interviewer <> note_taker)   -- two FA people at every interview
);
CREATE TRIGGER project_interviews_append_only BEFORE UPDATE OR DELETE ON public.project_interviews
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER project_interviews_roles BEFORE INSERT ON public.project_interviews
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead');

CREATE TABLE public.project_intake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_ref text NOT NULL DEFAULT '',              -- RC-001, assigned; a correction repeats the ref
  rev int NOT NULL DEFAULT 1,
  description text NOT NULL, produced_by text, produced_for text,
  produced_on date, received_on date NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),      -- computed on the file as received
  sensitivity text NOT NULL CHECK (sensitivity IN ('public', 'client_confidential')),
  personal_data boolean NOT NULL,
  claim_status text NOT NULL CHECK (claim_status IN ('FACT_CHECKED_BY_FA', 'CLIENT_CLAIM', 'UNVERIFIED_THIRD_PARTY')),
  use_class text NOT NULL CHECK (use_class IN ('SEED', 'BASELINE', 'CONTEXT', 'NOT_USED')),
  verification_note text,
  declined boolean NOT NULL DEFAULT false,         -- private groups, shared logins, leaked sources
  decline_reason text,
  logged_by uuid DEFAULT auth.uid(),
  logged_by_name text,
  logged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT declined OR (use_class = 'NOT_USED' AND length(trim(coalesce(decline_reason, ''))) > 0)),
  CHECK (claim_status <> 'FACT_CHECKED_BY_FA' OR length(trim(coalesce(verification_note, ''))) > 0),
  UNIQUE (project_id, item_ref, rev)
);
CREATE OR REPLACE FUNCTION public.project_intake_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  IF coalesce(NEW.item_ref, '') = '' THEN
    SELECT coalesce(max(substring(item_ref from 4)::int), 0) + 1 INTO n
      FROM public.project_intake_items WHERE project_id = NEW.project_id;
    NEW.item_ref := 'RC-' || lpad(n::text, 3, '0'); NEW.rev := 1;
  ELSE
    SELECT coalesce(max(rev), 0) + 1 INTO NEW.rev FROM public.project_intake_items
      WHERE project_id = NEW.project_id AND item_ref = NEW.item_ref;
    IF NEW.rev = 1 THEN RAISE EXCEPTION 'Unknown intake item %', NEW.item_ref; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_intake_items_roles BEFORE INSERT ON public.project_intake_items
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,data_steward');
CREATE TRIGGER project_intake_items_ref BEFORE INSERT ON public.project_intake_items
  FOR EACH ROW EXECUTE FUNCTION public.project_intake_ref();
CREATE TRIGGER project_intake_items_append_only BEFORE UPDATE OR DELETE ON public.project_intake_items
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.project_research_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rq_no text NOT NULL CHECK (rq_no ~ '^RQ[0-9]+$'),
  rev int NOT NULL DEFAULT 1,
  question text NOT NULL, hypothesis text,
  brief_section int NOT NULL CHECK (brief_section BETWEEN 1 AND 10),   -- where it came from
  withdrawn boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(), created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, rq_no, rev)
);
CREATE TRIGGER project_rqs_roles BEFORE INSERT ON public.project_research_questions
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,lead_analyst');
CREATE TRIGGER project_rqs_rev BEFORE INSERT ON public.project_research_questions
  FOR EACH ROW EXECUTE FUNCTION public.assign_rev('rq_no');
CREATE TRIGGER project_rqs_append_only BEFORE UPDATE OR DELETE ON public.project_research_questions
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- scenario register (Appendix J, FA-CEF-T04) ----------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_options_ok(_o jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(_o) = 'array' AND jsonb_array_length(_o) > 0 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_o) e
    WHERE length(trim(coalesce(e->>'action', ''))) = 0
       OR coalesce(e->>'kind', '') NOT IN ('FA-INTERNAL', 'CLIENT-DECISION'));
$$;
CREATE TABLE public.project_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scenario_no text NOT NULL CHECK (scenario_no ~ '^S[0-9]+$'),
  rev int NOT NULL DEFAULT 1,
  scenario_type text NOT NULL CHECK (scenario_type IN ('baseline', 'escalation', 'mobilization', 'narrative_spike',
    'protectee_under_attack', 'data_loss', 'false_alarm', 'external_shock', 'other')),
  name text NOT NULL,
  situation text NOT NULL,                       -- plain description of what would be observed
  trigger_indicators text NOT NULL,              -- data conditions FA can measure
  threshold text NOT NULL,                       -- set by the client in the brief, not by FA after the fact
  probability text,                              -- never FA's: only the client's, and labelled
  probability_source text CHECK (probability_source = 'client'),
  readers_required int NOT NULL DEFAULT 2 CHECK (readers_required >= 1),
  min_evidence_tier text,
  response_options jsonb NOT NULL CHECK (public.scenario_options_ok(response_options)),
  decision_owner text NOT NULL, approver text NOT NULL, informed text,
  time_frame text NOT NULL,
  fa_will_say text NOT NULL, fa_will_not_say text NOT NULL,
  review_date date,
  withdrawn boolean NOT NULL DEFAULT false,
  amendment_id uuid REFERENCES public.project_briefs(id),
  created_by uuid DEFAULT auth.uid(), created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scenario_no, rev),
  CHECK (probability IS NULL OR probability_source IS NOT NULL)
);
CREATE TRIGGER project_scenarios_roles BEFORE INSERT ON public.project_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead');
CREATE TRIGGER project_scenarios_amend BEFORE INSERT ON public.project_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.require_amendment_after_g0();
CREATE TRIGGER project_scenarios_rev BEFORE INSERT ON public.project_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.assign_rev('scenario_no');
CREATE TRIGGER project_scenarios_append_only BEFORE UPDATE OR DELETE ON public.project_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- declare, stand down or review a scenario (Phase 8 scenario watch, Phase 10 review)
CREATE TABLE public.project_scenario_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scenario_no text NOT NULL,
  cycle_no int NOT NULL DEFAULT 0,
  event text NOT NULL CHECK (event IN ('declared', 'stood_down', 'reviewed')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_tier text,
  confirmed_by uuid[] NOT NULL DEFAULT '{}',     -- readers who confirmed (confidence rule)
  note text,
  created_by uuid DEFAULT auth.uid(), created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.project_scenario_event_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.project_scenarios; readers int;
BEGIN
  SELECT * INTO s FROM public.project_scenarios WHERE project_id = NEW.project_id AND scenario_no = NEW.scenario_no
    ORDER BY rev DESC LIMIT 1;
  IF NOT FOUND OR s.withdrawn THEN RAISE EXCEPTION 'No active scenario %', NEW.scenario_no; END IF;
  IF NEW.event = 'declared' THEN
    SELECT count(DISTINCT u) INTO readers FROM unnest(NEW.confirmed_by) u;
    IF readers < s.readers_required THEN
      RAISE EXCEPTION 'Scenario % needs % confirming readers before it is declared (has %)',
        NEW.scenario_no, s.readers_required, readers;
    END IF;
    IF length(trim(coalesce(NEW.evidence_tier, ''))) = 0 THEN
      RAISE EXCEPTION 'Declaring a scenario needs the evidence tier';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_scenario_events_roles BEFORE INSERT ON public.project_scenario_events
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,lead_analyst');
CREATE TRIGGER project_scenario_events_check BEFORE INSERT ON public.project_scenario_events
  FOR EACH ROW EXECUTE FUNCTION public.project_scenario_event_check();
CREATE TRIGGER project_scenario_events_append_only BEFORE UPDATE OR DELETE ON public.project_scenario_events
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- success plan (Appendix K, FA-CEF-T05; AMEC levels) -----------------------------------------
CREATE TABLE public.project_success_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  measure_no text NOT NULL CHECK (measure_no ~ '^M[0-9]+$'),
  rev int NOT NULL DEFAULT 1,
  level text NOT NULL CHECK (level IN ('objectives', 'outputs', 'out_takes', 'outcomes', 'impact')),
  measure text NOT NULL,
  observable boolean NOT NULL DEFAULT true,      -- false = listed as out of reach, never estimated
  baseline text, baseline_source text CHECK (baseline_source IN ('first_window', 'client_data')),
  target text,                                    -- set by the client
  data_source text,
  client_figure boolean NOT NULL DEFAULT false,
  withdrawn boolean NOT NULL DEFAULT false,
  amendment_id uuid REFERENCES public.project_briefs(id),
  created_by uuid DEFAULT auth.uid(), created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, measure_no, rev),
  -- impact is reported only from client-supplied records, and marked as such
  CHECK (level <> 'impact' OR client_figure),
  -- each measure has a baseline, a target set by the client and a named data source; an
  -- unobservable one carries none of them (not estimated)
  CHECK ((observable AND length(trim(coalesce(baseline, ''))) > 0 AND baseline_source IS NOT NULL
          AND length(trim(coalesce(target, ''))) > 0 AND length(trim(coalesce(data_source, ''))) > 0)
      OR (NOT observable AND baseline IS NULL AND target IS NULL))
);
CREATE TRIGGER project_measures_roles BEFORE INSERT ON public.project_success_measures
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead');
CREATE TRIGGER project_measures_amend BEFORE INSERT ON public.project_success_measures
  FOR EACH ROW EXECUTE FUNCTION public.require_amendment_after_g0();
CREATE TRIGGER project_measures_rev BEFORE INSERT ON public.project_success_measures
  FOR EACH ROW EXECUTE FUNCTION public.assign_rev('measure_no');
CREATE TRIGGER project_measures_append_only BEFORE UPDATE OR DELETE ON public.project_success_measures
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- G1: scope sheet, risk screen, legal note, mandate (FA-CEF-T01; Curator) -------------------
CREATE TABLE public.project_scope_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_summary text NOT NULL,
  risk_screen jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{risk, rating, mitigation}]
  risk_screen_done boolean NOT NULL DEFAULT false,
  legal_note text,
  -- the mandate decides whether anything may leave FridayAnalytics.org (G5)
  mandate text NOT NULL DEFAULT 'internal_read_only' CHECK (mandate IN ('internal_read_only', 'external_release_allowed')),
  completed_by uuid DEFAULT auth.uid(), completed_by_name text,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER project_scope_sheets_roles BEFORE INSERT ON public.project_scope_sheets
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('curator');
CREATE TRIGGER project_scope_sheets_append_only BEFORE UPDATE OR DELETE ON public.project_scope_sheets
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE OR REPLACE FUNCTION public.project_scope_sheet_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.gate_signed(NEW.project_id, 'G0') THEN
    RAISE EXCEPTION 'The Curator completes the scope sheet after the brief is signed (G0)';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_scope_sheets_check BEFORE INSERT ON public.project_scope_sheets
  FOR EACH ROW EXECUTE FUNCTION public.project_scope_sheet_check();

-- ---- design sheet and target register (Phase 1; frozen at G2) ------------------------------------
CREATE TABLE public.project_design_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version int NOT NULL,
  lexicon_version text NOT NULL,
  lexicon jsonb NOT NULL CHECK (jsonb_typeof(lexicon) = 'object' AND lexicon <> '{}'::jsonb),  -- {language: [terms]}
  lexicon_sample_tested boolean NOT NULL DEFAULT false,
  obfuscated_spellings_tested boolean NOT NULL DEFAULT false,
  exclusion_codes text[] NOT NULL CHECK (cardinality(exclusion_codes) > 0 AND exclusion_codes <@ ARRAY[
    'NO_TARGET_GROUP', 'AMBIGUOUS_REFERENT', 'NOT_HOSTILE', 'AIMED_AT_AUTHORITIES', 'OUT_OF_MANDATE_HELD']),
  sample_rule text NOT NULL,
  comment_cap int NOT NULL CHECK (comment_cap > 0),
  comment_order text NOT NULL,
  -- every design choice names the brief section (1-10) that feeds it, or is an ASSUMPTION
  traces jsonb NOT NULL CHECK (jsonb_typeof(traces) = 'array' AND jsonb_array_length(traces) > 0),
  authored_by uuid DEFAULT auth.uid(), authored_by_name text,
  authored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE OR REPLACE FUNCTION public.project_design_sheet_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.gate_signed(NEW.project_id, 'G1') THEN
    RAISE EXCEPTION 'No design before the mandate is confirmed (G1)';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.traces) t
             WHERE length(trim(coalesce(t->>'choice', ''))) = 0
                OR coalesce(t->>'source', '') !~ '^(S([1-9]|10)|ASSUMPTION)$') THEN
    RAISE EXCEPTION 'Every design choice must name its brief section (S1-S10) or be marked ASSUMPTION';
  END IF;
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  SELECT coalesce(max(version), 0) + 1 INTO NEW.version FROM public.project_design_sheets WHERE project_id = NEW.project_id;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.project_design_sheet_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- a new version after G2 means the lexicon and scale changed: G2 must be signed again
  IF public.gate_signed(NEW.project_id, 'G2') THEN
    UPDATE public.projects SET design_stale = true WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_design_sheets_roles BEFORE INSERT ON public.project_design_sheets
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,lead_analyst');
CREATE TRIGGER project_design_sheets_before BEFORE INSERT ON public.project_design_sheets
  FOR EACH ROW EXECUTE FUNCTION public.project_design_sheet_before();
CREATE TRIGGER project_design_sheets_after AFTER INSERT ON public.project_design_sheets
  FOR EACH ROW EXECUTE FUNCTION public.project_design_sheet_after();
CREATE TRIGGER project_design_sheets_append_only BEFORE UPDATE OR DELETE ON public.project_design_sheets
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.project_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_key text NOT NULL,                         -- platform:handle
  rev int NOT NULL DEFAULT 1,
  platform text NOT NULL, handle text NOT NULL,
  target_group text,
  identity_resolved boolean NOT NULL DEFAULT false,
  curator_confirmed boolean NOT NULL DEFAULT false, -- internal or unresolved handles: Curator confirms the real account
  curator_confirmed_by uuid,
  note text,
  withdrawn boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, target_key, rev)
);
CREATE OR REPLACE FUNCTION public.project_target_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.target_key := lower(NEW.platform) || ':' || lower(NEW.handle);
  IF NEW.curator_confirmed THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'curator') THEN
      RAISE EXCEPTION 'Only the Curator confirms an internal or unresolved handle';
    END IF;
    NEW.curator_confirmed_by := auth.uid();
  ELSE
    NEW.curator_confirmed_by := NULL;
  END IF;
  IF NOT public.gate_signed(NEW.project_id, 'G1') THEN
    RAISE EXCEPTION 'No target register before the mandate is confirmed (G1)';
  END IF;
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  SELECT coalesce(max(rev), 0) + 1 INTO NEW.rev FROM public.project_targets
    WHERE project_id = NEW.project_id AND target_key = NEW.target_key;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_targets_roles BEFORE INSERT ON public.project_targets
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,lead_analyst,curator');
CREATE TRIGGER project_targets_before BEFORE INSERT ON public.project_targets
  FOR EACH ROW EXECUTE FUNCTION public.project_target_before();
CREATE TRIGGER project_targets_append_only BEFORE UPDATE OR DELETE ON public.project_targets
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- cycles: 0 is the baseline, then delta cycles (Phase 10 repeats Phases 3-7) --------------------
CREATE TABLE public.project_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cycle_no int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('baseline', 'delta')),
  tag text,                       -- a re-run on the same day carries a time tag, never overwrites
  note text,
  opened_by uuid DEFAULT auth.uid(), opened_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, cycle_no)
);
CREATE OR REPLACE FUNCTION public.project_cycle_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev int;
BEGIN
  IF NOT public.design_ready(NEW.project_id) THEN
    RAISE EXCEPTION 'No collection until the design is approved and current (G2)';
  END IF;
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  SELECT max(cycle_no) INTO prev FROM public.project_cycles WHERE project_id = NEW.project_id;
  IF prev IS NULL THEN NEW.cycle_no := 0; NEW.kind := 'baseline';
  ELSE
    IF NOT public.gate_signed(NEW.project_id, 'G4', prev) THEN
      RAISE EXCEPTION 'Cycle % has not passed evidence and QA (G4); a delta cycle cannot start', prev;
    END IF;
    NEW.cycle_no := prev + 1; NEW.kind := 'delta';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_cycles_roles BEFORE INSERT ON public.project_cycles
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,lead_analyst,collection_operator');
CREATE TRIGGER project_cycles_before BEFORE INSERT ON public.project_cycles
  FOR EACH ROW EXECUTE FUNCTION public.project_cycle_before();
CREATE TRIGGER project_cycles_append_only BEFORE UPDATE OR DELETE ON public.project_cycles
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- scope control: cases and items linked to an engagement (void, never delete) ---------------------
CREATE TABLE public.project_cases (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  case_id text NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  note text,
  linked_by uuid DEFAULT auth.uid(),
  linked_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, void_note text, voided_by uuid,
  PRIMARY KEY (project_id, case_id)
);
CREATE INDEX project_cases_case_idx ON public.project_cases (case_id);

CREATE TABLE public.project_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cycle_no int NOT NULL DEFAULT 0,
  item_kind text NOT NULL CHECK (item_kind IN ('cloud_item', 'home_ref')),
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  evidence_ref_id uuid REFERENCES public.evidence_refs(id) ON DELETE CASCADE,
  -- Phase 3 screening output
  screen_score numeric, matched_terms text[] NOT NULL DEFAULT '{}', source_line text, chunk_no int,
  note text,
  linked_by uuid DEFAULT auth.uid(),
  linked_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, void_note text, voided_by uuid,
  CHECK ((item_kind = 'cloud_item' AND item_id IS NOT NULL AND evidence_ref_id IS NULL)
      OR (item_kind = 'home_ref' AND evidence_ref_id IS NOT NULL AND item_id IS NULL)),
  FOREIGN KEY (project_id, cycle_no) REFERENCES public.project_cycles (project_id, cycle_no)
);
CREATE UNIQUE INDEX project_items_cloud_uniq ON public.project_items (project_id, cycle_no, item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX project_items_home_uniq ON public.project_items (project_id, cycle_no, evidence_ref_id) WHERE evidence_ref_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_item_case(_kind text, _item_id uuid, _evidence_ref_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _kind = 'cloud_item' THEN public.case_of_item(_item_id)
              ELSE (SELECT case_id FROM public.evidence_refs WHERE id = _evidence_ref_id) END;
$$;
REVOKE ALL ON FUNCTION public.project_item_case(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_item_case(text, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.project_case_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.gate_signed(NEW.project_id, 'G1') THEN
      RAISE EXCEPTION 'No case folder is linked before the mandate is confirmed (G1)';
    END IF;
    NEW.voided_at := NULL; NEW.void_note := NULL; NEW.voided_by := NULL;
    RETURN NEW;
  END IF;
  -- update: only voiding is allowed, with a note
  IF NEW.project_id <> OLD.project_id OR NEW.case_id <> OLD.case_id OR NEW.linked_at <> OLD.linked_at
     OR NEW.linked_by IS DISTINCT FROM OLD.linked_by OR NEW.note IS DISTINCT FROM OLD.note OR OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'A case link can only be voided, once, with a note';
  END IF;
  IF NEW.voided_at IS NULL OR length(trim(coalesce(NEW.void_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Voiding a case link needs a note';
  END IF;
  NEW.voided_by := auth.uid();
  RETURN NEW;
END; $$;
CREATE TRIGGER project_cases_roles BEFORE INSERT OR UPDATE ON public.project_cases
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,lead_analyst,collection_operator');
CREATE TRIGGER project_cases_check BEFORE INSERT OR UPDATE ON public.project_cases
  FOR EACH ROW EXECUTE FUNCTION public.project_case_check();
CREATE TRIGGER project_cases_no_delete BEFORE DELETE ON public.project_cases
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE OR REPLACE FUNCTION public.project_item_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.design_ready(NEW.project_id) THEN
      RAISE EXCEPTION 'No candidates until the design is approved and current (G2)';
    END IF;
    IF public.gate_signed(NEW.project_id, 'G3', NEW.cycle_no) THEN
      RAISE EXCEPTION 'Cycle % is read-complete (G3); open a delta cycle', NEW.cycle_no;
    END IF;
    c := public.project_item_case(NEW.item_kind, NEW.item_id, NEW.evidence_ref_id);
    IF c IS NULL OR NOT EXISTS (SELECT 1 FROM public.project_cases pc
         WHERE pc.project_id = NEW.project_id AND pc.case_id = c AND pc.voided_at IS NULL) THEN
      RAISE EXCEPTION 'The item''s case is not linked to this engagement (scope control)';
    END IF;
    NEW.voided_at := NULL; NEW.void_note := NULL; NEW.voided_by := NULL;
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) - 'voided_at' - 'void_note' - 'voided_by'
     IS DISTINCT FROM to_jsonb(OLD) - 'voided_at' - 'void_note' - 'voided_by' OR OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'A candidate can only be voided, once, with a note';
  END IF;
  IF NEW.voided_at IS NULL OR length(trim(coalesce(NEW.void_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Voiding a candidate needs a note (duplicates and withdrawn items are voided, never removed)';
  END IF;
  NEW.voided_by := auth.uid();
  RETURN NEW;
END; $$;
CREATE TRIGGER project_items_roles BEFORE INSERT OR UPDATE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,lead_analyst,analyst,collection_operator,data_steward');
CREATE TRIGGER project_items_check BEFORE INSERT OR UPDATE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.project_item_check();
CREATE TRIGGER project_items_no_delete BEFORE DELETE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- Phase 4: analyst decisions on every candidate, and the two-person rule -------------------------
CREATE TABLE public.project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('flag', 'exclude')),
  category text CHECK (category IN ('INCITEMENT', 'DEHUMANISATION', 'EXPULSION_CALL', 'GENERAL_HOSTILITY')),
  severity text CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  target_group text,
  note text,                                       -- one-line note on a flag
  exclusion_code text CHECK (exclusion_code IN ('NO_TARGET_GROUP', 'AMBIGUOUS_REFERENT', 'NOT_HOSTILE',
    'AIMED_AT_AUTHORITIES', 'OUT_OF_MANDATE_HELD')),
  reason text,                                      -- required reason on an exclusion
  judgement_call boolean NOT NULL DEFAULT false,    -- listed for the Curator
  judgement_note text,
  ruling boolean NOT NULL DEFAULT false,            -- set when the Curator rules after G3
  read_by uuid NOT NULL DEFAULT auth.uid(),
  read_by_name text,
  read_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'flag' OR (category IS NOT NULL AND severity IS NOT NULL AND exclusion_code IS NULL
         AND length(trim(coalesce(target_group, ''))) > 0 AND length(trim(coalesce(note, ''))) > 0)),
  CHECK (decision <> 'exclude' OR (exclusion_code IS NOT NULL AND category IS NULL AND severity IS NULL
         AND length(trim(coalesce(reason, ''))) > 0)),
  CHECK (NOT judgement_call OR length(trim(coalesce(judgement_note, ''))) > 0)
);
CREATE INDEX project_decisions_item_idx ON public.project_decisions (project_item_id, read_at DESC);
CREATE OR REPLACE FUNCTION public.project_decision_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record; allowed text[]; cur boolean;
BEGIN
  SELECT * INTO it FROM public.project_items WHERE id = NEW.project_item_id;
  IF NOT FOUND OR it.project_id <> NEW.project_id OR it.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Decision must be on a live candidate of this engagement';
  END IF;
  IF NOT public.design_ready(NEW.project_id) THEN
    RAISE EXCEPTION 'No reading until the design is approved and current (G2)';
  END IF;
  -- the exclusion codes in force are those in the latest design sheet
  IF NEW.decision = 'exclude' THEN
    SELECT exclusion_codes INTO allowed FROM public.project_design_sheets
      WHERE project_id = NEW.project_id ORDER BY version DESC LIMIT 1;
    IF NOT (NEW.exclusion_code = ANY(allowed)) THEN
      RAISE EXCEPTION 'Exclusion code % is not in the design sheet', NEW.exclusion_code;
    END IF;
  END IF;
  cur := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'curator');
  IF public.gate_signed(NEW.project_id, 'G3', it.cycle_no) THEN
    -- after G3 only the Curator may rule on a judgement call
    IF auth.uid() IS NOT NULL AND NOT cur THEN
      RAISE EXCEPTION 'Cycle % is read-complete (G3); only a Curator ruling can change a decision', it.cycle_no;
    END IF;
    NEW.ruling := true;
  ELSE
    NEW.ruling := false;
    IF auth.uid() IS NOT NULL AND NOT public.has_project_role(auth.uid(), NEW.project_id,
        ARRAY['owner', 'lead_analyst', 'analyst']) THEN
      RAISE EXCEPTION 'Only analysts read and decide (Phase 4)';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_decisions_check BEFORE INSERT ON public.project_decisions
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_check();
CREATE TRIGGER project_decisions_append_only BEFORE UPDATE OR DELETE ON public.project_decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.project_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.project_decisions(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('confirm', 'disagree')),
  note text,
  confirmed_by uuid NOT NULL DEFAULT auth.uid(),
  confirmed_by_name text,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (result <> 'disagree' OR length(trim(coalesce(note, ''))) > 0)
);
CREATE OR REPLACE FUNCTION public.project_confirmation_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.project_decisions WHERE id = NEW.decision_id;
  IF NOT FOUND OR d.project_id <> NEW.project_id THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  IF d.read_by = NEW.confirmed_by THEN
    RAISE EXCEPTION 'A second reader must confirm: you made this decision';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_project_role(auth.uid(), NEW.project_id,
      ARRAY['owner', 'lead_analyst', 'analyst']) THEN
    RAISE EXCEPTION 'Only analysts confirm decisions';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_confirmations_check BEFORE INSERT ON public.project_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.project_confirmation_check();
CREATE TRIGGER project_confirmations_append_only BEFORE UPDATE OR DELETE ON public.project_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- latest decision per candidate, and whether it still needs (or has) a second reader
CREATE VIEW public.project_latest_decisions WITH (security_invoker = true) AS
  SELECT DISTINCT ON (d.project_item_id) d.*,
    (d.decision = 'flag' AND d.severity IN ('CRITICAL', 'HIGH')) AS needs_second_reader,
    EXISTS (SELECT 1 FROM public.project_confirmations c
            WHERE c.decision_id = d.id AND c.result = 'confirm'
              AND NOT EXISTS (SELECT 1 FROM public.project_confirmations x
                              WHERE x.decision_id = d.id AND x.result = 'disagree' AND x.confirmed_at >= c.confirmed_at)) AS second_reader_confirmed,
    EXISTS (SELECT 1 FROM public.project_confirmations c WHERE c.decision_id = d.id AND c.result = 'disagree') AS disputed
  FROM public.project_decisions d
  ORDER BY d.project_item_id, d.read_at DESC, d.id;

-- ---- Phase 5: evidence capture and tiers (Appendix B) --------------------------------------------------
CREATE TABLE public.project_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  url_bar_clock_visible boolean NOT NULL,
  screenshot_sha256 text NOT NULL CHECK (screenshot_sha256 ~ '^[0-9a-f]{64}$'),
  archive_link text NOT NULL,
  captured_at_utc timestamptz NOT NULL,
  custody_logged boolean NOT NULL,
  captured_by uuid NOT NULL DEFAULT auth.uid(), captured_by_name text,
  second_person_check_by uuid,                      -- FA-STD-001 V2: two-person check
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (second_person_check_by IS NULL OR second_person_check_by <> captured_by)
);
CREATE OR REPLACE FUNCTION public.project_capture_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.project_latest_decisions WHERE project_item_id = NEW.project_item_id;
  IF NOT FOUND OR d.project_id <> NEW.project_id OR d.decision <> 'flag' THEN
    RAISE EXCEPTION 'Only flagged items are captured as evidence (Phase 5)';
  END IF;
  IF d.needs_second_reader AND NOT d.second_reader_confirmed THEN
    RAISE EXCEPTION 'A CRITICAL or HIGH flag needs a second reader before it leaves the case folder';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_captures_roles BEFORE INSERT ON public.project_captures
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,evidence_officer');
CREATE TRIGGER project_captures_check BEFORE INSERT ON public.project_captures
  FOR EACH ROW EXECUTE FUNCTION public.project_capture_check();
CREATE TRIGGER project_captures_append_only BEFORE UPDATE OR DELETE ON public.project_captures
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.project_item_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('API_RAW_ONLY', 'BROWSER_DOM_ONLY', 'ELEMENT_CROP', 'FA_STD_001_V2')),
  note text,
  set_by uuid DEFAULT auth.uid(), set_by_name text,
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.project_tier_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record;
BEGIN
  SELECT * INTO it FROM public.project_items WHERE id = NEW.project_item_id;
  IF NOT FOUND OR it.project_id <> NEW.project_id THEN RAISE EXCEPTION 'Unknown candidate'; END IF;
  -- only the full chain is proof: V2 needs a complete capture record and a second person's check
  IF NEW.tier = 'FA_STD_001_V2' AND NOT EXISTS (
      SELECT 1 FROM public.project_captures c
      WHERE c.project_item_id = NEW.project_item_id AND c.url_bar_clock_visible AND c.custody_logged
        AND c.second_person_check_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FA-STD-001 V2 needs a complete capture (URL bar and clock, hash, archive, custody log) and a two-person check';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_item_tiers_roles BEFORE INSERT ON public.project_item_tiers
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,evidence_officer,data_steward,collection_operator,lead_analyst');
CREATE TRIGGER project_item_tiers_check BEFORE INSERT ON public.project_item_tiers
  FOR EACH ROW EXECUTE FUNCTION public.project_tier_check();
CREATE TRIGGER project_item_tiers_append_only BEFORE UPDATE OR DELETE ON public.project_item_tiers
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE VIEW public.project_latest_tiers WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_item_id) * FROM public.project_item_tiers ORDER BY project_item_id, set_at DESC, id;

-- ---- Phase 7: load report, case register, sync log (G4 evidence) -------------------------------------
CREATE TABLE public.project_load_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cycle_no int NOT NULL,
  counts_before jsonb NOT NULL, counts_after jsonb NOT NULL, expected_new jsonb NOT NULL,
  single_transaction boolean NOT NULL,              -- an error rolled everything back
  reconciled boolean NOT NULL DEFAULT false,         -- computed: after - before = expected, for every table
  case_folder_ref text NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  register_entry_ref text NOT NULL,
  sync_log text,
  recorded_by uuid DEFAULT auth.uid(), recorded_by_name text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, cycle_no) REFERENCES public.project_cycles (project_id, cycle_no)
);
CREATE OR REPLACE FUNCTION public.project_load_report_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; ok boolean := true;
BEGIN
  IF NOT public.gate_signed(NEW.project_id, 'G3', NEW.cycle_no) THEN
    RAISE EXCEPTION 'Load and register after the read is complete (G3)';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.counts_after) LOOP
    IF coalesce((NEW.counts_after->>k)::bigint, 0) - coalesce((NEW.counts_before->>k)::bigint, 0)
       <> coalesce((NEW.expected_new->>k)::bigint, 0) THEN ok := false; END IF;
  END LOOP;
  NEW.reconciled := ok AND NEW.single_transaction;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_load_reports_roles BEFORE INSERT ON public.project_load_reports
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,data_steward');
CREATE TRIGGER project_load_reports_check BEFORE INSERT ON public.project_load_reports
  FOR EACH ROW EXECUTE FUNCTION public.project_load_report_check();
CREATE TRIGGER project_load_reports_append_only BEFORE UPDATE OR DELETE ON public.project_load_reports
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- outputs (Phase 8-9) -------------------------------------------------------------------------------
CREATE TABLE public.project_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL REFERENCES public.project_briefs(id) ON DELETE RESTRICT,   -- the brief in force
  cycle_nos int[] NOT NULL DEFAULT '{}',
  kind text NOT NULL CHECK (kind IN ('executive_brief', 'findings_tables', 'network_map', 'limits_statement',
    'evidence_bundle', 'dashboard', 'dataset', 'release_pack')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  -- draft -> qa_review -> held (QA passed; default state of anything finished) -> released (G5 only)
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'qa_review', 'held', 'released', 'withdrawn')),
  attribution_checked boolean NOT NULL DEFAULT false,   -- "Produced by FridayAnalytics.org for the Ansarian Collective."
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_count int, file_name text, size_bytes bigint,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  location text,
  shared_with_client boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(), created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  qa_by uuid, qa_at timestamptz, released_at timestamptz,
  CHECK (NOT shared_with_client OR status = 'released')
);
CREATE INDEX project_outputs_project_idx ON public.project_outputs (project_id, created_at DESC);

CREATE TABLE public.project_report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  output_id uuid NOT NULL REFERENCES public.project_outputs(id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (entry_kind IN ('research_question', 'success_measure', 'scenario_watch')),
  ref_key text NOT NULL,                              -- RQ1 / M1 / S1
  finding text,                                        -- from FA's own data only; no inference
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_tier text,
  met boolean,                                         -- scenario watch: were the trigger indicators met
  out_of_reach boolean NOT NULL DEFAULT false,         -- listed as out of reach, not estimated
  client_figure boolean NOT NULL DEFAULT false,        -- impact: client-supplied records only
  created_by uuid DEFAULT auth.uid(), created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.project_report_entry_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; m record;
BEGIN
  SELECT * INTO o FROM public.project_outputs WHERE id = NEW.output_id;
  IF NOT FOUND OR o.project_id <> NEW.project_id OR o.kind <> 'executive_brief' OR o.status <> 'draft' THEN
    RAISE EXCEPTION 'Report entries belong to a draft executive brief';
  END IF;
  IF NEW.entry_kind = 'research_question' THEN
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (rq_no) * FROM public.project_research_questions
        WHERE project_id = NEW.project_id ORDER BY rq_no, rev DESC) q WHERE q.rq_no = NEW.ref_key AND NOT q.withdrawn) THEN
      RAISE EXCEPTION 'Unknown research question %', NEW.ref_key;
    END IF;
    IF length(trim(coalesce(NEW.finding, ''))) = 0 THEN RAISE EXCEPTION 'Answer each research question from FA''s own data'; END IF;
  ELSIF NEW.entry_kind = 'success_measure' THEN
    SELECT * INTO m FROM (SELECT DISTINCT ON (measure_no) * FROM public.project_success_measures
        WHERE project_id = NEW.project_id ORDER BY measure_no, rev DESC) x WHERE x.measure_no = NEW.ref_key AND NOT x.withdrawn;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown success measure %', NEW.ref_key; END IF;
    IF NOT m.observable THEN
      IF NOT NEW.out_of_reach OR NEW.finding IS NOT NULL THEN
        RAISE EXCEPTION 'Measure % is out of reach: list it as such, do not estimate it', NEW.ref_key;
      END IF;
    ELSE
      IF NEW.out_of_reach OR length(trim(coalesce(NEW.finding, ''))) = 0 THEN
        RAISE EXCEPTION 'Report measure % against its baseline and target', NEW.ref_key;
      END IF;
      IF m.level = 'impact' AND NOT NEW.client_figure THEN
        RAISE EXCEPTION 'Impact is reported only from client-supplied records and marked as client figures';
      END IF;
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (scenario_no) * FROM public.project_scenarios
        WHERE project_id = NEW.project_id ORDER BY scenario_no, rev DESC) s WHERE s.scenario_no = NEW.ref_key AND NOT s.withdrawn) THEN
      RAISE EXCEPTION 'Unknown scenario %', NEW.ref_key;
    END IF;
    IF NEW.met IS NULL OR length(trim(coalesce(NEW.evidence_tier, ''))) = 0 OR NEW.counts = '{}'::jsonb THEN
      RAISE EXCEPTION 'Scenario watch states whether the triggers were met, with counts and the tier of evidence';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_report_entries_roles BEFORE INSERT ON public.project_report_entries
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,lead_analyst');
CREATE TRIGGER project_report_entries_check BEFORE INSERT ON public.project_report_entries
  FOR EACH ROW EXECUTE FUNCTION public.project_report_entry_check();
CREATE TRIGGER project_report_entries_append_only BEFORE UPDATE OR DELETE ON public.project_report_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- What an executive brief still lacks: every research question, every success measure and every scenario.
CREATE OR REPLACE FUNCTION public.report_incomplete(_output uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH o AS (SELECT project_id FROM public.project_outputs WHERE id = _output),
  need AS (
    SELECT 'research_question'::text k, q.rq_no key FROM o, (SELECT DISTINCT ON (rq_no) * FROM public.project_research_questions
      WHERE project_id = (SELECT project_id FROM o) ORDER BY rq_no, rev DESC) q WHERE NOT q.withdrawn
    UNION ALL
    SELECT 'success_measure', m.measure_no FROM o, (SELECT DISTINCT ON (measure_no) * FROM public.project_success_measures
      WHERE project_id = (SELECT project_id FROM o) ORDER BY measure_no, rev DESC) m WHERE NOT m.withdrawn
    UNION ALL
    SELECT 'scenario_watch', s.scenario_no FROM o, (SELECT DISTINCT ON (scenario_no) * FROM public.project_scenarios
      WHERE project_id = (SELECT project_id FROM o) ORDER BY scenario_no, rev DESC) s WHERE NOT s.withdrawn)
  SELECT coalesce(array_agg(n.key || ' (' || replace(n.k, '_', ' ') || ')' ORDER BY n.k, n.key), '{}')
  FROM need n WHERE NOT EXISTS (SELECT 1 FROM public.project_report_entries e
                                WHERE e.output_id = _output AND e.entry_kind = n.k AND e.ref_key = n.key);
$$;
REVOKE ALL ON FUNCTION public.report_incomplete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_incomplete(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.project_output_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); lacking text[];
  releasing boolean := coalesce(current_setting('fa.releasing', true), '') = NEW.id::text;
  doc boolean := NEW.kind IN ('executive_brief', 'findings_tables', 'network_map', 'limits_statement', 'release_pack');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.brief_id IS DISTINCT FROM public.project_current_brief_id(NEW.project_id) THEN
      RAISE EXCEPTION 'An output answers the brief in force';
    END IF;
    IF NOT public.design_ready(NEW.project_id) THEN
      RAISE EXCEPTION 'No outputs until the design is approved and current (G2)';
    END IF;
    IF uid IS NOT NULL AND NOT public.has_project_role(uid, NEW.project_id,
        ARRAY['owner', 'engagement_lead', 'lead_analyst', 'data_steward']) THEN
      RAISE EXCEPTION 'Only the lead analyst, engagement lead or data steward create outputs';
    END IF;
    NEW.status := 'draft'; NEW.shared_with_client := false; NEW.attribution_checked := false;
    NEW.qa_by := NULL; NEW.qa_at := NULL; NEW.released_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.project_id <> OLD.project_id OR NEW.kind <> OLD.kind OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Project, kind and author of an output cannot change';
  END IF;
  IF OLD.status IN ('held', 'released', 'withdrawn')
     AND (NEW.brief_id <> OLD.brief_id OR NEW.params IS DISTINCT FROM OLD.params OR NEW.sha256 IS DISTINCT FROM OLD.sha256
          OR NEW.file_name IS DISTINCT FROM OLD.file_name OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
          OR NEW.item_count IS DISTINCT FROM OLD.item_count OR NEW.title <> OLD.title
          OR NEW.cycle_nos IS DISTINCT FROM OLD.cycle_nos OR NEW.attribution_checked <> OLD.attribution_checked
          OR NEW.location IS DISTINCT FROM OLD.location) THEN
    RAISE EXCEPTION 'An output that has passed QA is fixed; create a new output instead';
  END IF;
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN RAISE EXCEPTION 'A withdrawn output cannot be reinstated'; END IF;

  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'released' THEN
      IF NOT releasing THEN RAISE EXCEPTION 'Release only happens through gate G5 (written Curator approval)'; END IF;
    ELSIF NEW.status = 'withdrawn' THEN
      IF uid IS NOT NULL AND NOT public.has_project_role(uid, NEW.project_id, ARRAY['owner', 'engagement_lead', 'curator']) THEN
        RAISE EXCEPTION 'Only the engagement lead or the Curator withdraws an output';
      END IF;
      NEW.shared_with_client := false;
    ELSIF OLD.status = 'draft' AND NEW.status = 'qa_review' THEN
      IF doc AND NOT NEW.attribution_checked THEN
        RAISE EXCEPTION 'Check the attribution line on every page: Produced by FridayAnalytics.org for the Ansarian Collective.';
      END IF;
      IF NEW.kind <> 'dashboard' AND NEW.sha256 IS NULL THEN RAISE EXCEPTION 'Add the output file (and its hash) before QA'; END IF;
      IF NEW.kind = 'executive_brief' THEN
        lacking := public.report_incomplete(NEW.id);
        IF cardinality(lacking) > 0 THEN
          RAISE EXCEPTION 'The executive brief does not yet report against the brief: %', array_to_string(lacking, ', ');
        END IF;
      END IF;
      IF NEW.kind = 'release_pack' AND (
          NOT EXISTS (SELECT 1 FROM public.project_outputs x WHERE x.project_id = NEW.project_id AND x.kind = 'executive_brief' AND x.status IN ('held', 'released'))
       OR NOT EXISTS (SELECT 1 FROM public.project_outputs x WHERE x.project_id = NEW.project_id AND x.kind = 'limits_statement' AND x.status IN ('held', 'released'))) THEN
        RAISE EXCEPTION 'A release pack needs a passed executive brief and a passed limits statement';
      END IF;
    ELSIF OLD.status = 'qa_review' AND NEW.status = 'draft' THEN
      NULL;
    ELSIF OLD.status = 'qa_review' AND NEW.status = 'held' THEN
      IF uid IS NOT NULL AND (NOT public.has_project_role(uid, NEW.project_id, ARRAY['owner', 'engagement_lead', 'lead_analyst'])
                              OR uid = OLD.created_by) THEN
        RAISE EXCEPTION 'QA is passed by the lead analyst or engagement lead, and not by the author';
      END IF;
      NEW.qa_by := uid; NEW.qa_at := now();
    ELSE
      RAISE EXCEPTION 'Output status cannot go from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  IF NEW.shared_with_client IS DISTINCT FROM OLD.shared_with_client AND uid IS NOT NULL
     AND NOT public.has_project_role(uid, NEW.project_id, ARRAY['owner', 'engagement_lead']) THEN
    RAISE EXCEPTION 'Only the engagement lead shares an output with the client';
  END IF;
  IF NEW.status <> 'released' THEN NEW.released_at := OLD.released_at; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_outputs_guard BEFORE INSERT OR UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.project_output_guard();
CREATE TRIGGER project_outputs_touch BEFORE UPDATE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER project_outputs_no_delete BEFORE DELETE ON public.project_outputs
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---- the gate checks: pass conditions are enforced here -------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_gate_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); roles text[]; b uuid; miss text[]; n int; sc record; ou record; dsn record;
BEGIN
  roles := CASE NEW.gate WHEN 'G0' THEN ARRAY['owner', 'engagement_lead']
                         WHEN 'G3' THEN ARRAY['owner', 'lead_analyst']
                         WHEN 'G4' THEN ARRAY['owner', 'evidence_officer', 'data_steward']
                         ELSE ARRAY['curator'] END;               -- G1, G2, G5
  IF uid IS NOT NULL AND NOT public.has_project_role(uid, NEW.project_id, roles) THEN
    RAISE EXCEPTION 'Gate % is signed by: %', NEW.gate, array_to_string(roles, ' or ');
  END IF;
  NEW.signed_by := coalesce(NEW.signed_by, uid);
  IF NEW.gate NOT IN ('G3', 'G4') THEN NEW.cycle_no := 0; END IF;
  IF NEW.gate <> 'G5' THEN NEW.output_id := NULL; END IF;
  IF NEW.gate <> 'G2' THEN NEW.design_version := NULL; END IF;

  IF NEW.gate = 'G0' THEN
    b := public.project_current_brief_id(NEW.project_id);
    miss := public.brief_missing(b);
    IF cardinality(miss) > 0 THEN RAISE EXCEPTION 'G0: the brief is incomplete: %', array_to_string(miss, '; '); END IF;
    IF length(trim(coalesce(NEW.sponsor_name, ''))) = 0 OR NEW.read_back_on IS NULL THEN
      RAISE EXCEPTION 'G0: record the client sponsor who signed and the date the brief was read back';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_interviews WHERE project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'G0: no discovery interview is recorded';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (rq_no) * FROM public.project_research_questions WHERE project_id = NEW.project_id
        ORDER BY rq_no, rev DESC) q WHERE NOT q.withdrawn) THEN RAISE EXCEPTION 'G0: write the research questions (RQ1...) first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (scenario_no) * FROM public.project_scenarios WHERE project_id = NEW.project_id
        ORDER BY scenario_no, rev DESC) x WHERE NOT x.withdrawn) THEN RAISE EXCEPTION 'G0: the scenario register is empty'; END IF;
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (measure_no) * FROM public.project_success_measures WHERE project_id = NEW.project_id
        ORDER BY measure_no, rev DESC) x WHERE NOT x.withdrawn AND x.level = 'objectives')
       OR NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (measure_no) * FROM public.project_success_measures WHERE project_id = NEW.project_id
        ORDER BY measure_no, rev DESC) x WHERE NOT x.withdrawn AND x.level = 'outputs') THEN
      RAISE EXCEPTION 'G0: the success plan needs at least an objectives measure and an outputs measure';
    END IF;
    NEW.brief_id := b;

  ELSIF NEW.gate = 'G1' THEN
    IF NOT public.gate_signed(NEW.project_id, 'G0') THEN RAISE EXCEPTION 'G1 comes after the brief is signed (G0)'; END IF;
    SELECT * INTO sc FROM public.project_scope_sheets WHERE project_id = NEW.project_id ORDER BY completed_at DESC, id LIMIT 1;
    IF NOT FOUND OR NOT sc.risk_screen_done OR length(trim(coalesce(sc.legal_note, ''))) = 0 THEN
      RAISE EXCEPTION 'G1: complete the scope sheet, the risk screen and the legal note first';
    END IF;

  ELSIF NEW.gate = 'G2' THEN
    IF NOT public.gate_signed(NEW.project_id, 'G1') THEN RAISE EXCEPTION 'G2 comes after the mandate (G1)'; END IF;
    SELECT * INTO dsn FROM public.project_design_sheets WHERE project_id = NEW.project_id ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'G2: there is no design sheet'; END IF;
    NEW.design_version := dsn.version;
    IF NOT dsn.lexicon_sample_tested OR NOT dsn.obfuscated_spellings_tested THEN
      RAISE EXCEPTION 'G2: the lexicon must be tested on a sample, including obfuscated spellings';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(dsn.traces) t WHERE t->>'source' = 'ASSUMPTION')
       AND length(trim(coalesce(NEW.note, ''))) = 0 THEN
      RAISE EXCEPTION 'G2: the design has assumptions with no source in the brief; record that the Curator accepts them (note)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (target_key) * FROM public.project_targets WHERE project_id = NEW.project_id
        ORDER BY target_key, rev DESC) t WHERE NOT t.withdrawn) THEN RAISE EXCEPTION 'G2: the target register is empty'; END IF;
    IF EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (target_key) * FROM public.project_targets WHERE project_id = NEW.project_id
        ORDER BY target_key, rev DESC) t WHERE NOT t.withdrawn AND NOT t.identity_resolved AND NOT t.curator_confirmed) THEN
      RAISE EXCEPTION 'G2: a target handle is unresolved; the Curator must confirm the real account first';
    END IF;

  ELSIF NEW.gate = 'G3' THEN
    IF NOT public.design_ready(NEW.project_id) THEN RAISE EXCEPTION 'G3 needs an approved, current design (G2)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_cycles WHERE project_id = NEW.project_id AND cycle_no = NEW.cycle_no) THEN
      RAISE EXCEPTION 'G3: unknown cycle %', NEW.cycle_no;
    END IF;
    SELECT count(*) INTO n FROM public.project_items WHERE project_id = NEW.project_id AND cycle_no = NEW.cycle_no AND voided_at IS NULL;
    IF n = 0 THEN RAISE EXCEPTION 'G3: cycle % has no candidates', NEW.cycle_no; END IF;
    SELECT count(*) INTO n FROM public.project_items i
      WHERE i.project_id = NEW.project_id AND i.cycle_no = NEW.cycle_no AND i.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.project_decisions d WHERE d.project_item_id = i.id);
    IF n > 0 THEN RAISE EXCEPTION 'G3: % candidate(s) have no decision; counts do not reconcile', n; END IF;
    SELECT count(*) INTO n FROM public.project_items i
      JOIN public.project_latest_decisions d ON d.project_item_id = i.id
      WHERE i.project_id = NEW.project_id AND i.cycle_no = NEW.cycle_no AND i.voided_at IS NULL
        AND d.needs_second_reader AND (NOT d.second_reader_confirmed OR d.disputed);
    IF n > 0 THEN
      RAISE EXCEPTION 'G3: % CRITICAL or HIGH flag(s) lack a second reader''s confirmation (or are disputed)', n;
    END IF;

  ELSIF NEW.gate = 'G4' THEN
    IF NOT public.gate_signed(NEW.project_id, 'G3', NEW.cycle_no) THEN RAISE EXCEPTION 'G4 comes after the read is complete (G3)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_load_reports r WHERE r.project_id = NEW.project_id AND r.cycle_no = NEW.cycle_no
                   AND r.reconciled) THEN
      RAISE EXCEPTION 'G4: no reconciled database load report for cycle %', NEW.cycle_no;
    END IF;
    SELECT count(*) INTO n FROM public.project_items i
      JOIN public.project_latest_decisions d ON d.project_item_id = i.id AND d.decision = 'flag'
      WHERE i.project_id = NEW.project_id AND i.cycle_no = NEW.cycle_no AND i.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.project_item_tiers t WHERE t.project_item_id = i.id);
    IF n > 0 THEN RAISE EXCEPTION 'G4: % flagged item(s) have no evidence tier', n; END IF;

  ELSE -- G5
    SELECT * INTO ou FROM public.project_outputs WHERE id = NEW.output_id;
    IF NOT FOUND OR ou.project_id <> NEW.project_id THEN RAISE EXCEPTION 'G5 is signed for one output of this engagement'; END IF;
    IF ou.status <> 'held' THEN RAISE EXCEPTION 'G5: the output must have passed QA and be HELD (it is %)', ou.status; END IF;
    IF public.project_mandate(NEW.project_id) <> 'external_release_allowed' THEN
      RAISE EXCEPTION 'G5: the mandate is internal read-only; nothing leaves FridayAnalytics.org';
    END IF;
    IF NOT ou.attribution_checked THEN RAISE EXCEPTION 'G5: the attribution line has not been checked'; END IF;
    IF length(trim(coalesce(NEW.recipient, ''))) = 0 OR length(trim(coalesce(NEW.written_approval_ref, ''))) = 0 THEN
      RAISE EXCEPTION 'G5: record the recipient and the reference of the written approval';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_cycles c WHERE c.project_id = NEW.project_id
               AND NOT public.gate_signed(NEW.project_id, 'G4', c.cycle_no)) THEN
      RAISE EXCEPTION 'G5: every cycle must have passed evidence and QA (G4)';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_gates_check BEFORE INSERT ON public.project_gates
  FOR EACH ROW EXECUTE FUNCTION public.project_gate_check();

CREATE OR REPLACE FUNCTION public.project_gate_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gate = 'G2' THEN
    UPDATE public.projects SET design_stale = false WHERE id = NEW.project_id;
  ELSIF NEW.gate = 'G5' THEN
    PERFORM set_config('fa.releasing', NEW.output_id::text, true);
    UPDATE public.project_outputs SET status = 'released', released_at = now() WHERE id = NEW.output_id;
    PERFORM set_config('fa.releasing', '', true);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_gates_after AFTER INSERT ON public.project_gates
  FOR EACH ROW EXECUTE FUNCTION public.project_gate_after();

-- ---- close-out (Phase 10) ---------------------------------------------------------------------------------
CREATE TABLE public.project_closeouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  design_frozen_version int NOT NULL,
  archive_ref text NOT NULL,
  archive_manifest_sha256 text NOT NULL CHECK (archive_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  retention_years int NOT NULL DEFAULT 5 CHECK (retention_years >= 1),   -- five years unless the contract says otherwise
  retention_note text,
  lessons_learned text NOT NULL CHECK (length(trim(lessons_learned)) > 0),
  closed_by uuid DEFAULT auth.uid(), closed_by_name text,
  closed_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.project_closeout_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.design_frozen_version IS DISTINCT FROM (SELECT max(version) FROM public.project_design_sheets WHERE project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Freeze the latest design sheet version at close-out';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_cycles c WHERE c.project_id = NEW.project_id
             AND NOT public.gate_signed(NEW.project_id, 'G4', c.cycle_no)) THEN
    RAISE EXCEPTION 'Every cycle must pass evidence and QA (G4) before close-out';
  END IF;
  IF NEW.retention_years < 5 AND length(trim(coalesce(NEW.retention_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Retention under five years needs the client contract term in the note';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_closeouts_roles BEFORE INSERT ON public.project_closeouts
  FOR EACH ROW EXECUTE FUNCTION public.project_require_roles('owner,engagement_lead,lead_analyst');
CREATE TRIGGER project_closeouts_check BEFORE INSERT ON public.project_closeouts
  FOR EACH ROW EXECUTE FUNCTION public.project_closeout_check();
CREATE TRIGGER project_closeouts_append_only BEFORE UPDATE OR DELETE ON public.project_closeouts
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- Engagement status follows the gates.
CREATE OR REPLACE FUNCTION public.project_status_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.design_stale IS DISTINCT FROM OLD.design_stale AND current_setting('fa.allow_stale_edit', true) IS DISTINCT FROM '1'
     AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'design_stale is managed by amendments, design sheets and G2';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' AND NOT public.gate_signed(NEW.id, 'G1') THEN
      RAISE EXCEPTION 'An engagement is active only after the mandate (G1)';
    ELSIF NEW.status = 'delivered' AND NOT EXISTS (SELECT 1 FROM public.project_outputs WHERE project_id = NEW.id AND status = 'released') THEN
      RAISE EXCEPTION 'Nothing has been released (G5) yet';
    ELSIF NEW.status = 'closed' AND NOT EXISTS (SELECT 1 FROM public.project_closeouts WHERE project_id = NEW.id) THEN
      RAISE EXCEPTION 'Record the close-out pack and lessons learned first';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER projects_status_guard BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_status_guard();

-- ---- people rules ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_creator_is_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'curator') THEN
    INSERT INTO public.project_members(project_id, user_id, role, added_by)
      VALUES (NEW.id, auth.uid(), 'engagement_lead', auth.uid()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER projects_creator_lead AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_creator_is_lead();

CREATE OR REPLACE FUNCTION public.project_keeps_a_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'engagement_lead' AND (TG_OP = 'DELETE' OR NEW.role <> 'engagement_lead')
     AND EXISTS (SELECT 1 FROM public.projects WHERE id = OLD.project_id)
     AND NOT EXISTS (SELECT 1 FROM public.project_members
                     WHERE project_id = OLD.project_id AND role = 'engagement_lead' AND user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'An engagement needs at least one engagement lead';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER project_members_keep_lead BEFORE DELETE OR UPDATE OF role ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.project_keeps_a_lead();

CREATE OR REPLACE FUNCTION public.project_member_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'client_viewer' AND public.is_investigator(NEW.user_id) THEN
    RAISE EXCEPTION 'FridayAnalytics staff join an engagement in an FA role, not as client viewer';
  END IF;
  IF NEW.role <> 'client_viewer' AND NOT public.is_investigator(NEW.user_id) THEN
    RAISE EXCEPTION 'Only investigators can hold an FA role';
  END IF;
  IF public.has_role(NEW.user_id, 'curator') THEN
    RAISE EXCEPTION 'The Curator is a global role, not an engagement role';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER project_members_check BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.project_member_check();

-- Curators open the cases linked to any engagement; engagement members the ones linked to theirs.
CREATE OR REPLACE FUNCTION public.can_access_case(_user_id uuid, _case_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _case_id IS NOT NULL AND (
    public.has_role(_user_id, 'owner')
    OR EXISTS (SELECT 1 FROM public.case_assignments a WHERE a.case_id = _case_id AND a.user_id = _user_id)
    OR (public.is_investigator(_user_id) AND EXISTS (
      SELECT 1 FROM public.project_cases pc
      WHERE pc.case_id = _case_id AND pc.voided_at IS NULL AND (
        public.has_role(_user_id, 'curator')
        OR EXISTS (SELECT 1 FROM public.project_members m
                   WHERE m.project_id = pc.project_id AND m.user_id = _user_id AND m.role <> 'client_viewer')))));
$$;

-- ---- engagement log (append-only; written by triggers) ----------------------------------------------------
CREATE TABLE public.project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  output_id uuid REFERENCES public.project_outputs(id) ON DELETE SET NULL,
  action text NOT NULL,
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
DECLARE r record; j jsonb; pid uuid; out_id uuid; act text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  j := to_jsonb(r);
  IF TG_TABLE_NAME = 'projects' THEN pid := r.id; ELSE pid := r.project_id; END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = pid) THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'project_outputs' THEN
    out_id := r.id;
    IF TG_OP = 'UPDATE' THEN
      IF (to_jsonb(NEW)->>'status') = (to_jsonb(OLD)->>'status')
         AND (to_jsonb(NEW)->>'shared_with_client') = (to_jsonb(OLD)->>'shared_with_client') THEN RETURN NULL; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'projects' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW)->>'status') = (to_jsonb(OLD)->>'status') THEN RETURN NULL; END IF;
  END IF;
  IF TG_TABLE_NAME IN ('project_cases', 'project_items') AND TG_OP = 'UPDATE' THEN act := 'voided';
  ELSE act := lower(TG_OP); END IF;
  INSERT INTO public.project_events(project_id, output_id, action, detail, actor)
    VALUES (pid, out_id, regexp_replace(TG_TABLE_NAME, '^project_', '') || ':' || act,
      jsonb_strip_nulls(jsonb_build_object('id', j->'id', 'gate', j->'gate', 'cycle_no', j->'cycle_no',
        'scenario_no', j->'scenario_no', 'measure_no', j->'measure_no', 'rq_no', j->'rq_no', 'item_ref', j->'item_ref',
        'decision', j->'decision', 'severity', j->'severity', 'exclusion_code', j->'exclusion_code',
        'result', j->'result', 'tier', j->'tier', 'kind', j->'kind', 'status', j->'status', 'version', j->'version',
        'amendment_no', j->'amendment_no', 'role', j->'role', 'user_id', j->'user_id', 'case_id', j->'case_id',
        'event', j->'event', 'sha256', j->'sha256', 'recipient', j->'recipient', 'reconciled', j->'reconciled',
        'mandate', j->'mandate', 'void_note', j->'void_note', 'entry_kind', j->'entry_kind', 'ref_key', j->'ref_key')),
      auth.uid());
  RETURN NULL;
END; $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'project_members', 'project_briefs', 'project_amendment_approvals', 'project_gates',
    'project_interviews', 'project_intake_items', 'project_research_questions', 'project_scenarios', 'project_scenario_events',
    'project_success_measures', 'project_scope_sheets', 'project_design_sheets', 'project_targets', 'project_cycles',
    'project_cases', 'project_items', 'project_decisions', 'project_confirmations', 'project_captures', 'project_item_tiers',
    'project_load_reports', 'project_outputs', 'project_report_entries', 'project_closeouts'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_project_event()',
                   t || '_log', t);
  END LOOP;
END $$;

-- ---- views: latest revision per register key ---------------------------------------------------------------
CREATE VIEW public.project_current_briefs WITH (security_invoker = true) AS
  SELECT b.* FROM public.project_briefs b WHERE b.id = public.project_current_brief_id(b.project_id);
CREATE VIEW public.project_latest_rqs WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_id, rq_no) * FROM public.project_research_questions ORDER BY project_id, rq_no, rev DESC;
CREATE VIEW public.project_latest_scenarios WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_id, scenario_no) * FROM public.project_scenarios ORDER BY project_id, scenario_no, rev DESC;
CREATE VIEW public.project_latest_measures WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_id, measure_no) * FROM public.project_success_measures ORDER BY project_id, measure_no, rev DESC;
CREATE VIEW public.project_latest_targets WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_id, target_key) * FROM public.project_targets ORDER BY project_id, target_key, rev DESC;
CREATE VIEW public.project_latest_intake WITH (security_invoker = true) AS
  SELECT DISTINCT ON (project_id, item_ref) * FROM public.project_intake_items ORDER BY project_id, item_ref, rev DESC;

-- ---- row level security -------------------------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'projects', 'project_members', 'project_briefs', 'project_amendment_approvals',
    'project_gates', 'project_interviews', 'project_intake_items', 'project_research_questions', 'project_scenarios',
    'project_scenario_events', 'project_success_measures', 'project_scope_sheets', 'project_design_sheets',
    'project_targets', 'project_cycles', 'project_cases', 'project_items', 'project_decisions', 'project_confirmations',
    'project_captures', 'project_item_tiers', 'project_load_reports', 'project_outputs', 'project_report_entries',
    'project_closeouts', 'project_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- internal read access and insert access are the same everywhere; triggers decide who may do what
  FOREACH t IN ARRAY ARRAY['project_briefs', 'project_amendment_approvals', 'project_gates', 'project_interviews',
    'project_intake_items', 'project_research_questions', 'project_scenarios', 'project_scenario_events',
    'project_success_measures', 'project_scope_sheets', 'project_design_sheets', 'project_targets', 'project_cycles',
    'project_cases', 'project_items', 'project_decisions', 'project_confirmations', 'project_captures',
    'project_item_tiers', 'project_load_reports', 'project_report_entries', 'project_closeouts'] LOOP
    EXECUTE format('CREATE POLICY "team reads %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.can_access_project(auth.uid(), project_id))', t);
    EXECUTE format('CREATE POLICY "team writes %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_access_project(auth.uid(), project_id))', t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.clients, public.projects, public.project_outputs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT UPDATE ON public.project_cases, public.project_items TO authenticated;      -- voiding only (trigger)
GRANT SELECT, INSERT ON public.project_events TO authenticated;
GRANT SELECT ON public.project_current_briefs, public.project_latest_rqs, public.project_latest_scenarios,
  public.project_latest_measures, public.project_latest_targets, public.project_latest_intake,
  public.project_latest_decisions, public.project_latest_tiers TO authenticated;

-- clients: FA staff read; only the owner writes
CREATE POLICY "investigators read clients" ON public.clients FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid())
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.client_id = clients.id AND public.can_view_project_as_client(auth.uid(), p.id)));
CREATE POLICY "owner creates clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner edits clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "team reads projects" ON public.projects FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), id) OR public.can_view_project_as_client(auth.uid(), id)
         OR (created_by = auth.uid() AND public.is_investigator(auth.uid())));
CREATE POLICY "investigators create projects" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_investigator(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "leads edit projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_manage_project(auth.uid(), id)) WITH CHECK (public.can_manage_project(auth.uid(), id));

CREATE POLICY "team reads members" ON public.project_members FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id) OR user_id = auth.uid());
CREATE POLICY "leads add members" ON public.project_members FOR INSERT TO authenticated WITH CHECK (public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "leads change members" ON public.project_members FOR UPDATE TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id)) WITH CHECK (public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "leads remove members" ON public.project_members FOR DELETE TO authenticated USING (public.can_manage_project(auth.uid(), project_id));

-- void an item or case link (triggers allow only the void columns, with a note)
CREATE POLICY "workers void case links" ON public.project_cases FOR UPDATE TO authenticated
  USING (public.can_work_project(auth.uid(), project_id)) WITH CHECK (public.can_work_project(auth.uid(), project_id));
CREATE POLICY "workers void items" ON public.project_items FOR UPDATE TO authenticated
  USING (public.can_work_project(auth.uid(), project_id)) WITH CHECK (public.can_work_project(auth.uid(), project_id));

-- outputs: the team reads all; a client viewer reads released outputs shared with them (portal on)
CREATE POLICY "team reads outputs" ON public.project_outputs FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id)
         OR (shared_with_client AND status = 'released' AND public.can_view_project_as_client(auth.uid(), project_id)));
CREATE POLICY "team writes outputs" ON public.project_outputs FOR INSERT TO authenticated WITH CHECK (public.can_access_project(auth.uid(), project_id));
CREATE POLICY "team updates outputs" ON public.project_outputs FOR UPDATE TO authenticated
  USING (public.can_access_project(auth.uid(), project_id)) WITH CHECK (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "team reads engagement log" ON public.project_events FOR SELECT TO authenticated
  USING (public.can_access_project(auth.uid(), project_id));
CREATE POLICY "members log downloads" ON public.project_events FOR INSERT TO authenticated
  WITH CHECK (action = 'output:downloaded' AND actor = auth.uid()
              AND (public.can_access_project(auth.uid(), project_id) OR public.can_view_project_as_client(auth.uid(), project_id)));

-- client portal (designed, off): a client viewer sees only the engagement and the brief in force
CREATE POLICY "client reads brief in force" ON public.project_briefs FOR SELECT TO authenticated
  USING (public.can_view_project_as_client(auth.uid(), project_id) AND id = public.project_current_brief_id(project_id));

SET check_function_bodies = on;

-- ---- storage: engagement output files live under projects/<code>/outputs/<output id>/ -----------------
-- Read and write follow engagement membership; files are never overwritten or deleted; an evidence
-- bundle of an engagement that holds home-vault items cannot be uploaded (home content stays home).
CREATE OR REPLACE FUNCTION public.hub_storage_project(path text, write_access boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN path NOT LIKE 'projects/%' THEN true ELSE EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.code = split_part(path, '/', 2)
      AND CASE WHEN write_access THEN public.can_work_project(auth.uid(), p.id) ELSE public.can_access_project(auth.uid(), p.id) END
      AND (NOT write_access OR NOT EXISTS (
        SELECT 1 FROM public.project_items i JOIN public.project_outputs o ON o.project_id = i.project_id
        WHERE i.project_id = p.id AND i.item_kind = 'home_ref' AND i.voided_at IS NULL
          AND o.kind = 'evidence_bundle' AND o.id::text = split_part(path, '/', 4)))) END
$$;
REVOKE ALL ON FUNCTION public.hub_storage_project(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hub_storage_project(text, boolean) TO authenticated, service_role;
CREATE POLICY project_storage_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'evidence' OR public.hub_storage_project(name, false));
CREATE POLICY project_storage_write_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'evidence' OR public.hub_storage_project(name, true));
CREATE POLICY project_output_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'evidence' OR name NOT LIKE 'projects/%') WITH CHECK (bucket_id <> 'evidence' OR name NOT LIKE 'projects/%');
CREATE POLICY project_output_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'evidence' OR name NOT LIKE 'projects/%');
