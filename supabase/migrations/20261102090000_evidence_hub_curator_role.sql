-- FA-CEF V1.10 Appendix D: the Curator signs gates G1, G2 and G5 and approves brief amendments.
-- Own migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'curator';
