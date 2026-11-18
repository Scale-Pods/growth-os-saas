-- ==============================================================================
-- Migration: 20261118000003_access_helpers.sql
-- Description: Read-only RPCs the server (withOrg) and the UI use to learn the
--              CALLER'S OWN role and feature levels. They answer only for auth.uid(),
--              so they cannot be used to probe another user or another organization.
-- ==============================================================================

-- The caller's role in an organization (null if not an active member)
create or replace function public.my_role(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.org_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and (o.status = 'active' or (o.status = 'suspended' and m.role = 'owner'));
$$;

-- The caller's effective level (0 none, 1 view, 2 edit, 3 full) for one feature
create or replace function public.my_feature_level(p_org uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.feature_level(p_org, p_feature);
$$;

-- All of the caller's effective levels in one call (used once per page load)
create or replace function public.my_feature_levels(p_org uuid)
returns table (feature text, level integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.feature, private.feature_level(p_org, f.feature)
  from unnest(array[
    'brand', 'intelligence', 'competitors', 'trends', 'trend_alerts',
    'strategy', 'content_factory', 'studio', 'carousel_studio',
    'video_studio', 'review', 'board', 'calendar', 'publishing',
    'analytics', 'leads', 'team'
  ]) as f(feature)
  where private.is_member(p_org);
$$;

alter function public.my_role(uuid) owner to postgres;
alter function public.my_feature_level(uuid, text) owner to postgres;
alter function public.my_feature_levels(uuid) owner to postgres;

revoke all on function public.my_role(uuid) from public, anon;
revoke all on function public.my_feature_level(uuid, text) from public, anon;
revoke all on function public.my_feature_levels(uuid) from public, anon;
grant execute on function public.my_role(uuid) to authenticated, service_role;
grant execute on function public.my_feature_level(uuid, text) to authenticated, service_role;
grant execute on function public.my_feature_levels(uuid) to authenticated, service_role;
