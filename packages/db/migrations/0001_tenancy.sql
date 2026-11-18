-- ==============================================================================
-- Migration: 0001_tenancy.sql
-- Description: Core tenancy tables, RBAC, feature access, invitations, audit log,
--              private security-definer helper functions, audit triggers, and per-command RLS.
-- ==============================================================================

-- 1. Required Extensions & Schemas
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create schema if not exists private;

-- 2. Custom Role Enum
create type public.org_role as enum ('owner', 'admin', 'editor', 'reviewer', 'viewer');

-- ==============================================================================
-- 3. Core Tables
-- ==============================================================================

-- 3.1 Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  plan_id text not null default 'trial',
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Note: slug unique constraint automatically creates unique index

-- 3.2 Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  email_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.3 Memberships
create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  monthly_credit_cap int check (monthly_credit_cap is null or monthly_credit_cap >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Index on user_id needed since primary key starts with org_id
create index idx_memberships_user_id on public.memberships (user_id);
create index idx_memberships_org_role on public.memberships (org_id, role);

-- 3.4 Feature Access (Granular feature permissions)
create table public.feature_access (
  org_id uuid not null,
  user_id uuid not null,
  feature text not null check (char_length(trim(feature)) > 0),
  level text not null check (level in ('none', 'view', 'edit', 'full')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, feature),
  foreign key (org_id, user_id) references public.memberships(org_id, user_id) on delete cascade
);

-- Note: Primary key (org_id, user_id, feature) already indexes lookups

-- 3.5 Brands
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_brands_org_id on public.brands (org_id);

-- 3.6 Invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email ~* '^.+@.+\..+$'),
  role public.org_role not null,
  token_hash text unique not null,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_invitations_org_id on public.invitations (org_id);
-- Note: token_hash unique constraint automatically creates unique index
create unique index idx_invitations_pending on public.invitations (org_id, lower(email)) where accepted_at is null;

-- 3.7 Audit Log (Append-only governance trail)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  org_slug text not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index idx_audit_log_org_created on public.audit_log (org_id, created_at desc);
create index idx_audit_log_slug_created on public.audit_log (org_slug, created_at desc);

-- ==============================================================================
-- 4. Enable Row Level Security (RLS) on all tables
-- ==============================================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.feature_access enable row level security;
alter table public.brands enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

-- ==============================================================================
-- 5. Private Security-Definer Helper Functions
-- ==============================================================================

-- 5.1 Check active organization membership with status handling & owner recovery
create or replace function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        o.status = 'active'
        or (o.status = 'suspended' and m.role = 'owner')
      )
  );
$$;

-- 5.2 Check active organization role with status handling & owner recovery
create or replace function private.has_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(p_roles)
      and (
        o.status = 'active'
        or (o.status = 'suspended' and m.role = 'owner')
      )
  );
$$;

-- 5.3 Evaluate effective feature permission level (none=0, view=1, edit=2, full=3)
create or replace function private.feature_level(p_org uuid, p_feature text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.org_role;
  v_org_status text;
  v_level text;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    return 0;
  end if;

  -- 1. Active membership & organization status check
  select m.role, o.status into v_role, v_org_status
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.org_id = p_org
    and m.user_id = v_user_id
    and m.status = 'active';

  if v_role is null or v_org_status = 'deleted' then
    return 0;
  end if;

  -- If suspended, only owners have view access for recovery
  if v_org_status = 'suspended' then
    if v_role = 'owner' then
      return 1; -- View-only for recovery/billing
    else
      return 0;
    end if;
  end if;

  -- 2. Explicit feature_access lookup
  select fa.level into v_level
  from public.feature_access fa
  where fa.org_id = p_org
    and fa.user_id = v_user_id
    and fa.feature = p_feature;

  if v_level is not null then
    return case v_level
      when 'full' then 3
      when 'edit' then 2
      when 'view' then 1
      else 0
    end;
  end if;

  -- 3. Default fallback by organization role
  return case v_role
    when 'owner' then 3
    when 'admin' then 3
    when 'editor' then 2
    when 'reviewer' then 1
    when 'viewer' then 1
    else 0
  end;
end;
$$;

-- 5.4 Authorization for assigning a role (used by UPDATE checks)
create or replace function private.can_create_membership(
  p_org uuid,
  p_target_user uuid,
  p_role public.org_role
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_role public.org_role;
  v_caller_id uuid;
  v_org_status text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    return false;
  end if;

  select m.role, o.status into v_caller_role, v_org_status
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.org_id = p_org
    and m.user_id = v_caller_id
    and m.status = 'active';

  if v_caller_role is null or v_org_status != 'active' then
    return false;
  end if;

  -- Owners can assign any role
  if v_caller_role = 'owner' then
    return true;
  end if;

  -- Admins can only assign non-owner, non-admin roles and cannot modify themselves
  if v_caller_role = 'admin' then
    if p_target_user = v_caller_id then
      return false;
    end if;
    if p_role in ('editor', 'reviewer', 'viewer') then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- 5.5 Authorization for modifying or deleting an existing membership
create or replace function private.can_modify_membership(
  p_org uuid,
  p_target_user uuid,
  p_existing_role public.org_role
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_role public.org_role;
  v_caller_id uuid;
  v_org_status text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    return false;
  end if;

  select m.role, o.status into v_caller_role, v_org_status
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.org_id = p_org
    and m.user_id = v_caller_id
    and m.status = 'active';

  if v_caller_role is null or v_org_status != 'active' then
    return false;
  end if;

  -- Owners can modify/remove any member
  if v_caller_role = 'owner' then
    return true;
  end if;

  -- Admins CANNOT modify/remove owners, other admins, or themselves
  if v_caller_role = 'admin' then
    if p_target_user = v_caller_id then
      return false;
    end if;
    if p_existing_role in ('editor', 'reviewer', 'viewer') then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- 5.6 Authorization for creating or revoking invitations
create or replace function private.can_invite_role(
  p_org uuid,
  p_role public.org_role
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_role public.org_role;
  v_org_status text;
begin
  select m.role, o.status into v_caller_role, v_org_status
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.org_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active';

  if v_caller_role is null or v_org_status != 'active' then
    return false;
  end if;

  if v_caller_role = 'owner' then
    return true;
  end if;

  if v_caller_role = 'admin' and p_role in ('editor', 'reviewer', 'viewer') then
    return true;
  end if;

  return false;
end;
$$;

-- 5.7 Authorization for modifying feature access
create or replace function private.can_manage_feature_access(
  p_org uuid,
  p_target_user uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_role public.org_role;
  v_caller_id uuid;
  v_org_status text;
  v_target_role public.org_role;
  v_target_status text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    return false;
  end if;

  select m.role, o.status into v_caller_role, v_org_status
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.org_id = p_org
    and m.user_id = v_caller_id
    and m.status = 'active';

  if v_caller_role is null or v_org_status != 'active' or v_caller_role not in ('owner', 'admin') then
    return false;
  end if;

  -- Target user must be an active member
  select m.role, m.status into v_target_role, v_target_status
  from public.memberships m
  where m.org_id = p_org
    and m.user_id = p_target_user;

  if v_target_status is null or v_target_status != 'active' then
    return false;
  end if;

  if v_caller_role = 'owner' then
    return true;
  end if;

  if v_caller_role = 'admin' then
    if p_target_user = v_caller_id then
      return false;
    end if;
    if v_target_role in ('editor', 'reviewer', 'viewer') then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- ==============================================================================
-- 6. Trigger Functions & Lifecycle Enforcement
-- ==============================================================================

-- 6.1 Prevent removing or demoting the last active owner of an active organization
create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other_owners int;
  v_org_status text;
begin
  -- If trigger depth is > 1 (e.g. cascading delete triggered by parent organizations cleanup), allow
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  -- Check parent organization status
  select status into v_org_status
  from public.organizations
  where id = old.org_id;

  -- If parent org does not exist or is marked deleted, allow cleanup
  if v_org_status is null or v_org_status = 'deleted' then
    return old;
  end if;

  -- Concurrency serialization lock on active organization
  perform 1 from public.organizations
  where id = old.org_id
  for update;

  -- Handle DELETE
  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.status = 'active' then
      select count(*) into v_other_owners
      from public.memberships
      where org_id = old.org_id
        and role = 'owner'
        and status = 'active'
        and user_id != old.user_id;

      if v_other_owners = 0 then
        raise exception 'Cannot delete the last remaining active owner of an active organization'
          using errcode = '23514';
      end if;
    end if;
    return old;
  end if;

  -- Handle UPDATE
  if tg_op = 'UPDATE' then
    if old.role = 'owner' and old.status = 'active' and (new.role != 'owner' or new.status != 'active') then
      select count(*) into v_other_owners
      from public.memberships
      where org_id = old.org_id
        and role = 'owner'
        and status = 'active'
        and user_id != old.user_id;

      if v_other_owners = 0 then
        raise exception 'Cannot demote or deactivate the last remaining active owner of an active organization'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- 6.2 Prevent changing org_id or user_id on existing memberships
create or replace function private.prevent_membership_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.org_id != old.org_id or new.user_id != old.user_id then
    raise exception 'Cannot modify org_id or user_id of an existing membership'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 6.3 Prevent transferring brands or feature access across organizations
create or replace function private.prevent_org_id_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.org_id != old.org_id then
    raise exception 'Cannot transfer records across organizations'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 6.4 Secure invitation creation, sanitization, and single pending invitation enforcement
create or replace function private.enforce_single_pending_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());

  -- 1. Ensure email is trimmed and lowercased
  new.email := lower(trim(new.email));

  -- 2. Validate token hash format (must be 64-character lowercase hex string from SHA-256)
  if new.token_hash is null or not (new.token_hash ~ '^[a-f0-9]{64}$') then
    raise exception 'Invalid token hash format. Expected 64-character hex string.'
      using errcode = '22023';
  end if;

  -- 3. If called by an authenticated user, enforce server-controlled defaults
  if v_caller_id is not null then
    new.invited_by := v_caller_id;
  end if;

  -- Always enforce pending state and fixed 7-day expiration at creation
  new.accepted_at := null;
  new.expires_at := now() + interval '7 days';

  -- 4. Transaction advisory lock prevents concurrent invitations for the same email in the same org
  perform pg_advisory_xact_lock(hashtext(new.org_id::text || ':' || new.email)::bigint);

  -- 5. Clean up any expired unaccepted invitations for this email in this org
  delete from public.invitations
  where org_id = new.org_id
    and lower(email) = new.email
    and accepted_at is null
    and expires_at <= now();

  -- 6. If an active unexpired invitation still exists, reject
  if exists (
    select 1 from public.invitations
    where org_id = new.org_id
      and lower(email) = new.email
      and accepted_at is null
      and expires_at > now()
  ) then
    raise exception 'An active invitation is already pending for this email address in this organization'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

-- 6.5 Enforce organization updates: restrict system fields & status transitions
create or replace function private.prevent_organization_system_field_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
begin
  -- 1. Immutable structural fields: cannot be modified by ANY user session
  if new.id != old.id then
    raise exception 'Cannot modify organization id' using errcode = '42501';
  end if;

  if new.slug != old.slug then
    raise exception 'Cannot modify organization slug directly' using errcode = '42501';
  end if;

  if new.created_by != old.created_by or new.created_at != old.created_at then
    raise exception 'Cannot modify organization creator or creation timestamp' using errcode = '42501';
  end if;

  -- 2. Sensitive subscription & billing fields: only service_role / backend can modify
  v_caller_role := coalesce(current_setting('request.jwt.claim.role', true), (select auth.role()));
  if (new.plan_id != old.plan_id or new.trial_ends_at is distinct from old.trial_ends_at) then
    if v_caller_role = 'authenticated' then
      raise exception 'Only system billing workflows can modify plan_id or trial_ends_at'
        using errcode = '42501';
    end if;
  end if;

  -- 3. Organization status transitions: require active owner role
  if new.status != old.status then
    if not private.has_role(old.id, array['owner']::public.org_role[]) then
      raise exception 'Only an active organization owner can change organization status'
        using errcode = '42501';
    end if;
  end if;

  -- 4. Maintain updated_at timestamp
  new.updated_at := now();

  return new;
end;
$$;

-- 6.6 Auto-provision profile on auth.users creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 6.7 Audit logging for membership role changes and member removal
create or replace function private.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_actor uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  v_actor := (select auth.uid());

  if tg_op = 'UPDATE' then
    if new.role != old.role or new.status != old.status then
      select slug into v_slug from public.organizations where id = new.org_id;
      insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
      values (
        new.org_id,
        coalesce(v_slug, 'unknown'),
        v_actor,
        'membership.updated',
        'membership',
        new.user_id::text,
        jsonb_build_object(
          'old_role', old.role,
          'new_role', new.role,
          'old_status', old.status,
          'new_status', new.status
        )
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    select slug into v_slug from public.organizations where id = old.org_id;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      old.org_id,
      coalesce(v_slug, 'unknown'),
      v_actor,
      'membership.removed',
      'membership',
      old.user_id::text,
      jsonb_build_object(
        'role', old.role,
        'status', old.status
      )
    );
    return old;
  end if;

  return new;
end;
$$;

-- 6.8 Audit logging for feature access permission changes
create or replace function private.audit_feature_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_actor uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  -- Suppress audit events during batch initialization (create_organization / accept_invitation)
  if current_setting('app.skip_feature_audit', true) = 'true' then
    return coalesce(new, old);
  end if;

  v_actor := (select auth.uid());

  if tg_op = 'INSERT' then
    select slug into v_slug from public.organizations where id = new.org_id;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      new.org_id,
      coalesce(v_slug, 'unknown'),
      v_actor,
      'feature_access.granted',
      'feature_access',
      new.user_id::text,
      jsonb_build_object('feature', new.feature, 'level', new.level)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if new.level != old.level then
      select slug into v_slug from public.organizations where id = new.org_id;
      insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
      values (
        new.org_id,
        coalesce(v_slug, 'unknown'),
        v_actor,
        'feature_access.updated',
        'feature_access',
        new.user_id::text,
        jsonb_build_object('feature', new.feature, 'old_level', old.level, 'new_level', new.level)
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    select slug into v_slug from public.organizations where id = old.org_id;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      old.org_id,
      coalesce(v_slug, 'unknown'),
      v_actor,
      'feature_access.revoked',
      'feature_access',
      old.user_id::text,
      jsonb_build_object('feature', old.feature, 'level', old.level)
    );
    return old;
  end if;

  return new;
end;
$$;

-- 6.9 Audit logging for invitations (creation and manual revocation)
create or replace function private.audit_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_actor uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  v_actor := (select auth.uid());

  if tg_op = 'INSERT' then
    select slug into v_slug from public.organizations where id = new.org_id;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      new.org_id,
      coalesce(v_slug, 'unknown'),
      v_actor,
      'invitation.created',
      'invitation',
      new.id::text,
      jsonb_build_object('email', new.email, 'role', new.role)
    );
    return new;
  elsif tg_op = 'DELETE' then
    -- Log revocation only if an active unaccepted unexpired invitation was deleted
    if old.accepted_at is null and old.expires_at > now() then
      select slug into v_slug from public.organizations where id = old.org_id;
      insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
      values (
        old.org_id,
        coalesce(v_slug, 'unknown'),
        v_actor,
        'invitation.revoked',
        'invitation',
        old.id::text,
        jsonb_build_object('email', old.email, 'role', old.role)
      );
    end if;
    return old;
  end if;

  return new;
end;
$$;

-- ==============================================================================
-- 7. Attach Triggers
-- ==============================================================================

create trigger trg_protect_last_owner
  before update or delete on public.memberships
  for each row execute function private.prevent_last_owner_removal();

create trigger trg_memberships_immutable_keys
  before update on public.memberships
  for each row execute function private.prevent_membership_key_change();

create trigger trg_brands_immutable_org
  before update on public.brands
  for each row execute function private.prevent_org_id_change();

create trigger trg_feature_access_immutable_org
  before update on public.feature_access
  for each row execute function private.prevent_org_id_change();

create trigger trg_invitations_single_pending
  before insert on public.invitations
  for each row execute function private.enforce_single_pending_invitation();

create trigger trg_organizations_system_guard
  before update on public.organizations
  for each row execute function private.prevent_organization_system_field_changes();

create trigger trg_audit_memberships
  after update or delete on public.memberships
  for each row execute function private.audit_membership_change();

create trigger trg_audit_feature_access
  after insert or update or delete on public.feature_access
  for each row execute function private.audit_feature_access_change();

create trigger trg_audit_invitations
  after insert or delete on public.invitations
  for each row execute function private.audit_invitation_change();

-- Trigger on auth.users for profile creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==============================================================================
-- 8. Public RPC Functions
-- ==============================================================================

-- 8.1 Atomic organization creation with owner membership, 17 features, and brand
create or replace function public.create_organization(
  p_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_clean_slug text;
  v_clean_name text;
  v_feature text;
  v_features text[] := array[
    'brand', 'intelligence', 'competitors', 'trends', 'trend_alerts',
    'strategy', 'content_factory', 'studio', 'carousel_studio',
    'video_studio', 'review', 'board', 'calendar', 'publishing',
    'analytics', 'leads', 'team'
  ];
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_clean_name := trim(p_name);
  v_clean_slug := lower(trim(p_slug));

  -- Slug format validation
  if not (v_clean_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(v_clean_slug) between 3 and 48) then
    raise exception 'Invalid slug format. Must be 3-48 characters, lowercase alphanumeric with single hyphens.'
      using errcode = '22023';
  end if;

  -- Reserved slug check
  if v_clean_slug in (
    'api', 'app', 'admin', 'auth', 'billing', 'settings', 'workspace',
    'support', 'help', 'status', 'docs', 'system', 'root', 'login',
    'signup', 'invite', 'growthos', 'scalepods'
  ) then
    raise exception 'The requested slug is reserved.' using errcode = '22023';
  end if;

  -- Suppress individual feature audit events during batch initialization
  perform set_config('app.skip_feature_audit', 'true', true);

  -- 1. Create Organization
  insert into public.organizations (name, slug, created_by)
  values (v_clean_name, v_clean_slug, v_user_id)
  returning id into v_org_id;

  -- 2. Create Owner Membership
  insert into public.memberships (org_id, user_id, role, status)
  values (v_org_id, v_user_id, 'owner', 'active');

  -- 3. Initialize Feature Access (all 17 features = full)
  foreach v_feature in array v_features loop
    insert into public.feature_access (org_id, user_id, feature, level)
    values (v_org_id, v_user_id, v_feature, 'full');
  end loop;

  -- 4. Create Initial Default Brand
  insert into public.brands (org_id, name)
  values (v_org_id, v_clean_name);

  -- 5. Audit Log Entry
  insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id)
  values (v_org_id, v_clean_slug, v_user_id, 'org.created', 'organization', v_org_id::text);

  return v_org_id;
end;
$$;

-- 8.2 Single-use invitation acceptance with verified email assert & inactive org rejection
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_invitation record;
  v_token_hash text;
  v_feature text;
  v_features text[] := array[
    'brand', 'intelligence', 'competitors', 'trends', 'trend_alerts',
    'strategy', 'content_factory', 'studio', 'carousel_studio',
    'video_studio', 'review', 'board', 'calendar', 'publishing',
    'analytics', 'leads', 'team'
  ];
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- 1. Query auth.users directly to ensure email is verified
  select email, email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if v_user_email is null or v_email_confirmed_at is null then
    raise exception 'A verified email address is required to accept invitations.'
      using errcode = '42501';
  end if;

  -- 2. Compute token hash using pgcrypto digest
  v_token_hash := encode(digest(p_token::bytea, 'sha256'), 'hex');

  -- 3. Atomic claim with row lock, joining organizations to check status
  select i.*, o.status as org_status, o.slug as org_slug
  into v_invitation
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  where i.token_hash = v_token_hash
    and i.accepted_at is null
    and i.expires_at > now()
  for update of i;

  if v_invitation is null then
    raise exception 'Invalid or expired invitation token.' using errcode = '22023';
  end if;

  -- 4. Reject invitations for inactive, suspended, or deleted organizations
  if v_invitation.org_status != 'active' then
    raise exception 'Cannot accept invitation for an inactive or suspended organization.'
      using errcode = '42501';
  end if;

  -- 5. Enforce strict email matching
  if lower(v_invitation.email) != lower(v_user_email) then
    raise exception 'This invitation was issued to a different email address.'
      using errcode = '42501';
  end if;

  -- 6. Prevent overwriting / corrupting an existing active membership
  if exists (
    select 1 from public.memberships
    where org_id = v_invitation.org_id
      and user_id = v_user_id
  ) then
    raise exception 'You are already a member of this organization.'
      using errcode = '23505';
  end if;

  -- Suppress individual feature audit events during batch initialization
  perform set_config('app.skip_feature_audit', 'true', true);

  -- 7. Insert new membership (fails safely on conflict)
  insert into public.memberships (org_id, user_id, role, status)
  values (v_invitation.org_id, v_user_id, v_invitation.role, 'active');

  -- 8. Initialize Feature Access defaults for the assigned role
  foreach v_feature in array v_features loop
    insert into public.feature_access (org_id, user_id, feature, level)
    values (
      v_invitation.org_id,
      v_user_id,
      v_feature,
      case v_invitation.role
        when 'owner' then 'full'
        when 'admin' then 'full'
        when 'editor' then 'edit'
        when 'reviewer' then 'view'
        else 'view'
      end
    );
  end loop;

  -- 9. Mark token accepted
  update public.invitations
  set accepted_at = now()
  where id = v_invitation.id;

  -- 10. Audit Log Entry
  insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id)
  values (
    v_invitation.org_id,
    v_invitation.org_slug,
    v_user_id,
    'invitation.accepted',
    'invitation',
    v_invitation.id::text
  );

  return v_invitation.org_id;
end;
$$;

-- ==============================================================================
-- 9. Row Level Security Policies
-- ==============================================================================

-- 9.1 Organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (private.is_member(id));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (false);

create policy organizations_update on public.organizations
  for update to authenticated
  using (private.has_role(id, array['owner','admin']::public.org_role[]))
  with check (private.has_role(id, array['owner','admin']::public.org_role[]));

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (false);

-- 9.2 Profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m1.org_id = m2.org_id
      join public.organizations o on o.id = m1.org_id
      where m1.user_id = (select auth.uid())
        and m2.user_id = profiles.id
        and m1.status = 'active'
        and m2.status = 'active'
        and (
          o.status = 'active'
          or (o.status = 'suspended' and m1.role = 'owner')
        )
    )
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (false);

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (false);

-- 9.3 Memberships
create policy memberships_select on public.memberships
  for select to authenticated
  using (private.is_member(org_id));

-- Direct client membership insertion is disabled; members join via create_organization or accept_invitation
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (false);

create policy memberships_update on public.memberships
  for update to authenticated
  using (private.can_modify_membership(org_id, user_id, role))
  with check (private.can_create_membership(org_id, user_id, role));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (private.can_modify_membership(org_id, user_id, role));

-- 9.4 Feature Access
create policy feature_access_select on public.feature_access
  for select to authenticated
  using (private.is_member(org_id));

create policy feature_access_insert on public.feature_access
  for insert to authenticated
  with check (private.can_manage_feature_access(org_id, user_id));

create policy feature_access_update on public.feature_access
  for update to authenticated
  using (private.can_manage_feature_access(org_id, user_id))
  with check (private.can_manage_feature_access(org_id, user_id) and level in ('none', 'view', 'edit', 'full'));

create policy feature_access_delete on public.feature_access
  for delete to authenticated
  using (private.can_manage_feature_access(org_id, user_id));

-- 9.5 Brands
create policy brands_select on public.brands
  for select to authenticated
  using (private.is_member(org_id));

create policy brands_insert on public.brands
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brands_update on public.brands
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brands_delete on public.brands
  for delete to authenticated
  using (private.has_role(org_id, array['owner','admin']::public.org_role[]));

-- 9.6 Invitations
create policy invitations_select on public.invitations
  for select to authenticated
  using (private.has_role(org_id, array['owner','admin']::public.org_role[]));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    private.can_invite_role(org_id, role)
    and invited_by = (select auth.uid())
    and accepted_at is null
    and char_length(token_hash) = 64
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using (false);

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (private.can_invite_role(org_id, role));

-- 9.7 Audit Log
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.has_role(org_id, array['owner','admin']::public.org_role[]));

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (false);

create policy audit_log_update on public.audit_log
  for update to authenticated
  using (false);

create policy audit_log_delete on public.audit_log
  for delete to authenticated
  using (false);

-- ==============================================================================
-- 10. Function Ownership & Execution Privileges
-- ==============================================================================

-- 10.1 Establish Postgres Ownership
alter function private.is_member(uuid) owner to postgres;
alter function private.has_role(uuid, public.org_role[]) owner to postgres;
alter function private.feature_level(uuid, text) owner to postgres;
alter function private.can_create_membership(uuid, uuid, public.org_role) owner to postgres;
alter function private.can_modify_membership(uuid, uuid, public.org_role) owner to postgres;
alter function private.can_invite_role(uuid, public.org_role) owner to postgres;
alter function private.can_manage_feature_access(uuid, uuid) owner to postgres;
alter function private.prevent_last_owner_removal() owner to postgres;
alter function private.prevent_membership_key_change() owner to postgres;
alter function private.prevent_org_id_change() owner to postgres;
alter function private.enforce_single_pending_invitation() owner to postgres;
alter function private.prevent_organization_system_field_changes() owner to postgres;
alter function public.handle_new_user() owner to postgres;
alter function private.audit_membership_change() owner to postgres;
alter function private.audit_feature_access_change() owner to postgres;
alter function private.audit_invitation_change() owner to postgres;
alter function public.create_organization(text, text) owner to postgres;
alter function public.accept_invitation(text) owner to postgres;

-- 10.2 Revoke Default Permissions
revoke all on schema public from public, anon;
revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;

-- 10.3 Schema Usages
grant usage on schema public to authenticated, anon;
grant usage on schema private to authenticated;

-- 10.4 Execution Grants on Policy Evaluators for Authenticated Sessions
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.org_role[]) to authenticated;
grant execute on function private.feature_level(uuid, text) to authenticated;
grant execute on function private.can_create_membership(uuid, uuid, public.org_role) to authenticated;
grant execute on function private.can_modify_membership(uuid, uuid, public.org_role) to authenticated;
grant execute on function private.can_invite_role(uuid, public.org_role) to authenticated;
grant execute on function private.can_manage_feature_access(uuid, uuid) to authenticated;

-- 10.5 Public RPC Execution Grants
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- Note: Trigger functions remain strictly revoked from all direct client execution.

-- ==============================================================================
-- 11. Table Privileges
-- ==============================================================================

revoke all on all tables in schema public from public, anon;

-- Authenticated table privileges
grant select on public.organizations to authenticated;
grant update (name, status) on public.organizations to authenticated;

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.feature_access to authenticated;
grant select, insert, update, delete on public.brands to authenticated;
grant select, insert, delete on public.invitations to authenticated;

-- audit_log: SELECT-only for authenticated. NO insert, update, or delete.
grant select on public.audit_log to authenticated;

-- ==============================================================================
-- 12. Supabase service_role Privileges
-- ==============================================================================

-- Explicitly ensure service_role (used by server route handlers and workers) has full access
grant usage on schema public to service_role;
grant usage on schema private to service_role;
grant usage on schema extensions to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;
grant all on all routines in schema private to service_role;
