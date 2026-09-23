
REVOKE ALL ON FUNCTION public.claim_next_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.append_job_log(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signup_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_open() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.append_job_log(uuid, text[], text[]) TO service_role;
