-- U3: writes to the move tables go only through the owner-checked functions.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.evidence_move_freeze_log, public.darknight_route,
  public.evidence_move_runs, public.evidence_move_results FROM authenticated, anon;
REVOKE ALL ON public.evidence_move_freeze_log, public.darknight_route, public.evidence_move_runs, public.evidence_move_results FROM anon;
GRANT SELECT ON public.evidence_move_freeze_log, public.darknight_route, public.evidence_move_runs, public.evidence_move_results TO authenticated;