-- U6: people write only through the u6_* functions; remove any default table write privileges.
REVOKE ALL ON public.checkpoint_definitions, public.checkpoint_results, public.verification_records, public.findings,
  public.finding_items, public.finding_reviews, public.collection_measures, public.negative_results, public.report_figures,
  public.report_statements, public.report_statement_approvals, public.conflict_declarations, public.staff_exposure_log,
  public.staff_training_records FROM anon, authenticated;
GRANT SELECT ON public.checkpoint_definitions, public.checkpoint_results, public.verification_records, public.findings,
  public.finding_items, public.finding_reviews, public.collection_measures, public.negative_results, public.report_figures,
  public.report_statements, public.report_statement_approvals, public.conflict_declarations, public.staff_exposure_log,
  public.staff_training_records TO authenticated;
REVOKE ALL ON FUNCTION public.research_rejection_dashboard(int) FROM anon;