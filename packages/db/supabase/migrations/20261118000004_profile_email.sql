-- ==============================================================================
-- Migration: 20261118000004_profile_email.sql
-- Description: Store each user's email on their profile so the Team page can show
--              members. Visibility is unchanged: profiles_select only exposes
--              teammates (members of a shared organization) and the user themself.
-- ==============================================================================

alter table public.profiles add column if not exists email text;

update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', ''),
    lower(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A user may edit their own profile but never the email copy (it follows auth.users)
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, email_notifications) on public.profiles to authenticated;
