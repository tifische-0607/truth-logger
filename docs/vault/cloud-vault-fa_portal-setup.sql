-- FA Portal: Cloud Vault schema setup (schema version 1)
-- Target: PostgreSQL 10.23, database fridzdmo_DarkVault, role fridzdmo_FAVault.
-- REVIEW, THEN RUN MANUALLY (for example in cPanel > phpPgAdmin). The FA Portal never runs this automatically.
-- Touches only the fa_portal schema. Does not touch public or any other schema.
-- PostgreSQL 10 notes: triggers use EXECUTE PROCEDURE; no gen_random_uuid() (needs pgcrypto) and no sha256()
-- (added in PostgreSQL 11), so ids are bigserial and every hash is computed by FA Portal and stored as text.

BEGIN;

CREATE SCHEMA IF NOT EXISTS fa_portal AUTHORIZATION fridzdmo_FAVault;
SET search_path = fa_portal;

CREATE TABLE IF NOT EXISTS fa_portal.schema_version (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL
);
INSERT INTO fa_portal.schema_version (version, note) VALUES (1, 'Initial FA Portal Cloud Vault schema')
  ON CONFLICT (version) DO NOTHING;

-- copies of released outputs and shared documents, keyed by the FA Portal id and SHA-256
CREATE TABLE IF NOT EXISTS fa_portal.objects (
  id bigserial PRIMARY KEY,
  outbox_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('document','output','capture')),
  ref_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text,
  size_bytes bigint CHECK (size_bytes >= 0),
  content bytea NOT NULL,
  written_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id, sha256)
);

-- custody and event records, hash-chained: row_sha256 = sha256(prev_sha256 || record_sha256), computed by FA Portal
CREATE TABLE IF NOT EXISTS fa_portal.records (
  seq bigserial PRIMARY KEY,
  outbox_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('custody_event','document_event','research_event')),
  ref_id uuid NOT NULL,
  record jsonb NOT NULL,
  record_sha256 text NOT NULL CHECK (record_sha256 ~ '^[0-9a-f]{64}$'),
  prev_sha256 text CHECK (prev_sha256 IS NULL OR prev_sha256 ~ '^[0-9a-f]{64}$'),
  row_sha256 text NOT NULL CHECK (row_sha256 ~ '^[0-9a-f]{64}$'),
  written_at timestamptz NOT NULL DEFAULT now()
);

-- write test target used by Test connection (one row inserted per test; never updated)
CREATE TABLE IF NOT EXISTS fa_portal.write_tests (
  id bigserial PRIMARY KEY,
  token text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fa_portal.block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fa_portal.% is append-only', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS objects_append_only ON fa_portal.objects;
CREATE TRIGGER objects_append_only BEFORE UPDATE OR DELETE ON fa_portal.objects
  FOR EACH ROW EXECUTE PROCEDURE fa_portal.block_mutation();
DROP TRIGGER IF EXISTS records_append_only ON fa_portal.records;
CREATE TRIGGER records_append_only BEFORE UPDATE OR DELETE ON fa_portal.records
  FOR EACH ROW EXECUTE PROCEDURE fa_portal.block_mutation();
DROP TRIGGER IF EXISTS write_tests_append_only ON fa_portal.write_tests;
CREATE TRIGGER write_tests_append_only BEFORE UPDATE OR DELETE ON fa_portal.write_tests
  FOR EACH ROW EXECUTE PROCEDURE fa_portal.block_mutation();
DROP TRIGGER IF EXISTS schema_version_append_only ON fa_portal.schema_version;
CREATE TRIGGER schema_version_append_only BEFORE UPDATE OR DELETE ON fa_portal.schema_version
  FOR EACH ROW EXECUTE PROCEDURE fa_portal.block_mutation();

-- the FA Portal role may read and append, never update or delete
REVOKE ALL ON ALL TABLES IN SCHEMA fa_portal FROM PUBLIC;
GRANT USAGE ON SCHEMA fa_portal TO fridzdmo_FAVault;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA fa_portal TO fridzdmo_FAVault;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA fa_portal TO fridzdmo_FAVault;

COMMIT;

-- Check after running:  SELECT max(version) FROM fa_portal.schema_version;   -- expect 1
