-- Evidence Hub: multi-source model.
--
-- Evidence lives in one of two vaults:
--   * cloud vault  - Mac mini captures, stored in this project (artefacts + storage bucket)
--   * home vault   - DarkNight, read live from the home network through the gateway
--
-- Home-vault CONTENT never enters this database. When an analyst links a home-vault
-- record to a case, only a reference is stored: source, record id, index metadata
-- (platform, type, published date) and the SHA-256 of each file at linking time.

-- 1. sources ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cloud_vault', 'home_vault')),
  description text,
  -- Home vaults only: the gateway's private HTTPS address on the tailnet,
  -- e.g. https://mac-studio.tail1234.ts.net:8443. Browsers call it directly.
  gateway_url text,
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investigators read sources" ON public.sources;
CREATE POLICY "investigators read sources" ON public.sources FOR SELECT TO authenticated
  USING (public.is_investigator(auth.uid()));
DROP POLICY IF EXISTS "owner configures sources" ON public.sources;
CREATE POLICY "owner configures sources" ON public.sources FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

DROP TRIGGER IF EXISTS sources_touch ON public.sources;
CREATE TRIGGER sources_touch BEFORE UPDATE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.sources (id, name, kind, description, enabled)
VALUES
  ('cloud', 'Mac mini captures', 'cloud_vault',
   'Facebook posts, comments, reels and live streams captured by the Mac mini worker.', true),
  ('darknight', 'DarkNight', 'home_vault',
   'OSINT findings in the DarkNight database on the Mac Studio, with evidence files on the home NAS.', false)
ON CONFLICT (id) DO NOTHING;

-- 2. evidence_refs (append-only) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evidence_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE RESTRICT,
  source_id text NOT NULL REFERENCES public.sources(id),
  record_id text NOT NULL,
  record_code text NOT NULL,
  -- index metadata only, so the item can sit in case trees, timelines and search
  platform text,
  item_type text,
  published_at timestamptz,
  -- [{ "file_id": "...", "filename": "...", "kind": "...", "size_bytes": 0, "sha256": "..." }]
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  linked_by uuid DEFAULT auth.uid(),
  linked_by_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, source_id, record_id)
);
CREATE INDEX IF NOT EXISTS evidence_refs_case_idx ON public.evidence_refs(case_id);
CREATE INDEX IF NOT EXISTS evidence_refs_record_idx ON public.evidence_refs(source_id, record_id);

GRANT SELECT, INSERT ON public.evidence_refs TO authenticated;
GRANT ALL ON public.evidence_refs TO service_role;
ALTER TABLE public.evidence_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case members read evidence refs" ON public.evidence_refs;
CREATE POLICY "case members read evidence refs" ON public.evidence_refs FOR SELECT TO authenticated
  USING (public.can_access_case(auth.uid(), case_id));
DROP POLICY IF EXISTS "case members link evidence" ON public.evidence_refs;
CREATE POLICY "case members link evidence" ON public.evidence_refs FOR INSERT TO authenticated
  WITH CHECK (public.can_access_case(auth.uid(), case_id) AND source_id <> 'cloud');

DROP TRIGGER IF EXISTS evidence_refs_append_only ON public.evidence_refs;
CREATE TRIGGER evidence_refs_append_only BEFORE UPDATE OR DELETE ON public.evidence_refs
FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- 3. custody events know their source -----------------------------------------
-- ADD COLUMN with a constant default does not rewrite rows, so the append-only
-- trigger is not involved.
ALTER TABLE public.custody_events
  ADD COLUMN IF NOT EXISTS source_id text NOT NULL DEFAULT 'cloud' REFERENCES public.sources(id),
  ADD COLUMN IF NOT EXISTS evidence_ref_id uuid REFERENCES public.evidence_refs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS custody_evidence_ref_idx ON public.custody_events(evidence_ref_id);

-- 'linked' records the moment a home-vault record joins a case.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.custody_events'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%action%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.custody_events DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE public.custody_events ADD CONSTRAINT custody_events_action_check
  CHECK (action IN ('captured','accessed','transferred','exported','re-hashed','linked'));

-- A home-vault custody event must point at its reference.
ALTER TABLE public.custody_events DROP CONSTRAINT IF EXISTS custody_events_home_vault_ref;
ALTER TABLE public.custody_events ADD CONSTRAINT custody_events_home_vault_ref
  CHECK (source_id = 'cloud' OR evidence_ref_id IS NOT NULL) NOT VALID;
