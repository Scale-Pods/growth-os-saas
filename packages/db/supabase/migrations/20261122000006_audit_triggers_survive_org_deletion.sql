-- ==============================================================================
-- Migration: 20261122000006_audit_triggers_survive_org_deletion.sql
-- Description: Deleting an organization cascades to its memberships, feature access and
--              invitations. The audit triggers on those tables then tried to write an
--              audit_log row pointing at the organization that was being deleted, which
--              violated audit_log_org_id_fkey and made organization deletion (account
--              closure, data deletion requests, test cleanup) impossible.
--              Fix: when the organization no longer exists, skip the audit entry.
--              (Org deletion itself is a system action recorded elsewhere.)
-- Found by: cloud test cleanup, 2026-11-22.
-- ==============================================================================

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
      if v_slug is null then return new; end if;
      insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
      values (
        new.org_id,
        v_slug,
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
    -- Organization is being deleted (cascade): nothing to attach an audit entry to.
    if v_slug is null then return old; end if;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      old.org_id,
      v_slug,
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
    if v_slug is null then return new; end if;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      new.org_id,
      v_slug,
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
      if v_slug is null then return new; end if;
      insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
      values (
        new.org_id,
        v_slug,
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
    if v_slug is null then return old; end if;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      old.org_id,
      v_slug,
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
    if v_slug is null then return new; end if;
    insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
    values (
      new.org_id,
      v_slug,
      v_actor,
      'invitation.created',
      'invitation',
      new.id::text,
      jsonb_build_object('email', new.email, 'role', new.role)
    );
    return new;
  elsif tg_op = 'DELETE' then
    if old.accepted_at is null and old.expires_at > now() then
      select slug into v_slug from public.organizations where id = old.org_id;
      if v_slug is null then return old; end if;
      insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id, metadata)
      values (
        old.org_id,
        v_slug,
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

alter function private.audit_membership_change() owner to postgres;
alter function private.audit_feature_access_change() owner to postgres;
alter function private.audit_invitation_change() owner to postgres;
