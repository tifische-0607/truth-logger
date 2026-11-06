CREATE OR REPLACE FUNCTION public.ew_set_threshold(_signal text, _level text, _value numeric, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old numeric := public.ew_threshold(_signal,_level);
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can change alert thresholds.'; END IF;
  IF _value IS NOT NULL AND (_value < 0 OR _value > 20 OR _value <> trunc(_value)) THEN RAISE EXCEPTION 'A threshold must be a whole number from 0 to 20.'; END IF;
  INSERT INTO public.ew_thresholds(signal,level,value,set_by,note) VALUES (_signal,_level,_value,auth.uid(),nullif(trim(_note),''));
  INSERT INTO public.ew_events(action,detail,actor) VALUES ('threshold_set', jsonb_build_object('signal',_signal,'level',_level,'old',old,'new',_value), auth.uid());
END $$;