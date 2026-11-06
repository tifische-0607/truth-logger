CREATE OR REPLACE FUNCTION public.lnk_set_threshold(_key text, _value numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ew_is_settings_editor(auth.uid()) THEN RAISE EXCEPTION 'Only the owner, Curator or Management can change coordination thresholds.'; END IF;
  IF _value IS NOT NULL AND (_value < 0 OR _value > 20 OR _value <> trunc(_value)) THEN RAISE EXCEPTION 'A threshold must be a whole number from 0 to 20.'; END IF;
  INSERT INTO public.lnk_thresholds(key,value,set_by) VALUES (_key,_value,auth.uid());
  INSERT INTO public.lnk_events(action,detail,actor) VALUES ('threshold_set', jsonb_build_object('key',_key,'value',_value), auth.uid());
END $$;