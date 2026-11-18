-- Trigger functions must never be callable through the API. Supabase grants EXECUTE on new
-- public functions to authenticated by default, so revoke it explicitly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
