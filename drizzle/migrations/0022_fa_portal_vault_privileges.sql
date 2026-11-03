-- Phase 6: vault records are written only by database triggers and service-role functions.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.vault_config, public.vault_events,
  public.vault_outbox, public.vault_outbox_results FROM authenticated;
REVOKE ALL ON public.vault_config, public.vault_events, public.vault_outbox, public.vault_outbox_results FROM anon;
GRANT SELECT ON public.vault_config, public.vault_events, public.vault_outbox, public.vault_outbox_results TO authenticated;
