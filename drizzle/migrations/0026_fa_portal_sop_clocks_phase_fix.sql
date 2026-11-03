CREATE OR REPLACE FUNCTION public.sla_project_phase(_project uuid, OUT phase integer, OUT cycle_no integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g0 boolean; g1 boolean; g2 boolean; stale boolean; lastc integer;
BEGIN
  SELECT p.design_stale INTO stale FROM public.projects p WHERE p.id = _project;
  g0 := EXISTS (SELECT 1 FROM public.project_gates g WHERE g.project_id=_project AND g.gate='G0' AND g.cycle_no=0 AND g.output_id IS NULL);
  g1 := EXISTS (SELECT 1 FROM public.project_gates g WHERE g.project_id=_project AND g.gate='G1' AND g.cycle_no=0 AND g.output_id IS NULL);
  g2 := EXISTS (SELECT 1 FROM public.project_gates g WHERE g.project_id=_project AND g.gate='G2' AND g.cycle_no=0 AND g.output_id IS NULL);
  cycle_no := NULL;
  IF NOT g0 OR NOT g1 THEN phase := 0; RETURN; END IF;
  IF NOT g2 OR coalesce(stale,false) THEN phase := 1; RETURN; END IF;
  SELECT max(c.cycle_no) INTO lastc FROM public.project_cycles c WHERE c.project_id=_project;
  IF lastc IS NULL THEN phase := 2; RETURN; END IF;
  cycle_no := lastc;
  IF NOT EXISTS (SELECT 1 FROM public.project_gates g WHERE g.project_id=_project AND g.gate='G3' AND g.cycle_no=lastc) THEN
    phase := CASE WHEN EXISTS (SELECT 1 FROM public.project_items i WHERE i.project_id=_project AND i.cycle_no=lastc AND i.voided_at IS NULL) THEN 4 ELSE 3 END;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_gates g WHERE g.project_id=_project AND g.gate='G4' AND g.cycle_no=lastc) THEN
    phase := CASE WHEN EXISTS (SELECT 1 FROM public.project_load_reports l WHERE l.project_id=_project AND l.cycle_no=lastc) THEN 7 ELSE 5 END;
    RETURN;
  END IF;
  cycle_no := NULL;
  IF NOT EXISTS (SELECT 1 FROM public.project_outputs o WHERE o.project_id=_project AND o.status='released') THEN
    phase := CASE WHEN EXISTS (SELECT 1 FROM public.project_outputs o WHERE o.project_id=_project) THEN 9 ELSE 8 END;
    RETURN;
  END IF;
  phase := 10;
END $$;