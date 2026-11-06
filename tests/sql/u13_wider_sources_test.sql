-- U13 Wider source coverage — SQL checks
-- Part A (structure): RUN 6 Nov 2026 through the read-only database tool — passed.
--   A1 Seven new connector rows (telegram_public, whatsapp_channels, youtube_public, reddit_public, local_forum, news_sites, blogs):
--      status 'suspended', requires_certification true, no certification rows, not configured.
--   A2 Triggers research_connector_activation and research_capture_source present.
--   A3 RLS + append-only on research_connector_certifications, research_connector_config, research_approved_sources;
--      authenticated cannot insert; authenticated cannot call research_report_connector_config (collection device only).
-- Part B (behaviour): NOT RUN — needs a privileged test connection, a Curator test account and an engagement with a signed brief.

SELECT key, status, requires_certification FROM public.research_connectors ORDER BY requires_certification, key;
SELECT tgname FROM pg_trigger WHERE tgname IN ('research_connector_activation','research_capture_source');

BEGIN;
-- B1 Activation refused while not certified:
DO $$ BEGIN
  BEGIN
    UPDATE public.research_connectors SET status='active', status_reason=NULL WHERE key='telegram_public';
    RAISE EXCEPTION 'B1 FAILED: uncertified connector activated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Connector telegram_public is not certified%' THEN RAISE; END IF;
  END;
END $$;
-- B2 Certified but not configured → 'Connector … is not configured; it cannot collect.'
-- B3 Capture insert for telegram_public in an engagement without an approved source →
--    'Source telegram_public is not approved in this engagement''s signed brief; collection refused.'
-- B4 research_certify_connector by a non-Curator → 'Only the Curator can certify a connector.'
-- B5 Pass with one check unticked → 'Certification needs every check to pass; … is not ticked.'
-- B6 A new connector version (version bump) is no longer certified until re-certified.
ROLLBACK;
