CREATE OR REPLACE FUNCTION public.report_set_tiers(doc uuid, tiers uuid[], note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.documents; clean uuid[];
BEGIN
 IF NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'curator') OR public.has_role(auth.uid(),'management')) THEN
  RAISE EXCEPTION 'Only the owner, a Curator or Management can set which tiers see a report.'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=doc;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF d.source='client' THEN RAISE EXCEPTION 'Client uploads are always visible to their own client; tier access applies to FridayAnalytics reports only.'; END IF;
 SELECT COALESCE(array_agg(DISTINCT x),'{}') INTO clean FROM unnest(COALESCE(tiers,'{}')) x;
 IF EXISTS (SELECT 1 FROM unnest(clean) x WHERE NOT EXISTS (SELECT 1 FROM public.billing_tiers b WHERE b.id=x)) THEN RAISE EXCEPTION 'Tier not found.'; END IF;
 IF clean = public.report_tiers_in_force(doc) THEN RAISE EXCEPTION 'These tiers are already in force for this report.'; END IF;
 INSERT INTO public.document_tier_access(document_id,tier_ids,note) VALUES (doc,clean,nullif(trim(coalesce(note,'')),''));
 PERFORM public.library_log(doc,'updated','Report access by tier changed',jsonb_build_object('tiers',(SELECT COALESCE(jsonb_agg(name ORDER BY rank),'[]') FROM public.billing_tiers WHERE id=ANY(clean)),'note',nullif(trim(coalesce(note,'')),'')));
END $$;