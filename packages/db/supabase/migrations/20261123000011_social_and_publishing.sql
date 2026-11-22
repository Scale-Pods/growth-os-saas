-- ==============================================================================
-- Migration: 20261123000011_social_and_publishing.sql
-- Phase:     P05 (social connections and publishing), database part
-- Adds:      social_accounts, scheduled_posts, publish_attempts, post_edits,
--            social_connect_states, channel plan-limit trigger, the post state machine
--            guard, and the server-only engine functions (claim, rescue, consume state).
--
-- Rules baked in here
--  * We never store social tokens: only the provider's account id. The provider holds the token.
--  * Accounts are connected by the server only (callback route, service role). Customers can read
--    accounts and disconnect (delete) as owner/admin.
--  * A post row can only reach `publishing`/`published` through server code. A signed-in user can
--    draft, schedule (>= ~5 min ahead), cancel and re-draft. `published` needs a provider post id.
--  * The engine claims due posts atomically (FOR UPDATE SKIP LOCKED), so two workers never take the
--    same post. Rescue never resends a post whose provider post id is already stored.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider text not null check (length(provider) between 1 and 40),
  provider_account_id text not null check (length(provider_account_id) between 1 and 200),
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin', 'linkedin_page', 'youtube', 'x', 'tiktok', 'threads', 'pinterest')),
  display_name text not null check (length(display_name) <= 200),
  avatar_url text check (avatar_url is null or length(avatar_url) <= 1000),
  status text not null default 'active' check (status in ('active', 'needs_reconnect', 'disconnected')),
  last_checked_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, provider_account_id)
);
create index idx_social_accounts_org_brand on public.social_accounts (org_id, brand_id);
create index idx_social_accounts_org_status on public.social_accounts (org_id, status);
create unique index uq_social_accounts_id_org_brand on public.social_accounts (id, org_id, brand_id);

create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  caption text not null default '' check (length(caption) <= 5000),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 20),
  platform_options jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_options) = 'object' and pg_column_size(platform_options) <= 8000),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled')),
  scheduled_for timestamptz,
  locked_at timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  provider_post_id text,
  post_url text check (post_url is null or length(post_url) <= 1000),
  published_at timestamptz,
  last_error_code text,
  last_error_message text check (last_error_message is null or length(last_error_message) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_posts_scheduled_needs_time check (status <> 'scheduled' or scheduled_for is not null),
  constraint scheduled_posts_published_needs_provider_id check (status <> 'published' or provider_post_id is not null)
);
create index idx_scheduled_posts_org_status_time on public.scheduled_posts (org_id, status, scheduled_for);
create index idx_scheduled_posts_org_brand on public.scheduled_posts (org_id, brand_id, created_at desc);
create index idx_scheduled_posts_due on public.scheduled_posts (scheduled_for) where status = 'scheduled';
create index idx_scheduled_posts_publishing on public.scheduled_posts (locked_at) where status = 'publishing';

create table public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  attempt_no int not null check (attempt_no >= 1),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('success', 'retryable_error', 'failed')),
  error_code text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  provider_response jsonb check (provider_response is null or pg_column_size(provider_response) <= 8000),
  created_at timestamptz not null default now(),
  unique (post_id, attempt_no)
);
create index idx_publish_attempts_org_post on public.publish_attempts (org_id, post_id);

create table public.post_edits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  edited_by uuid references auth.users(id) on delete set null,
  old_caption text not null,
  new_caption text not null,
  status text not null default 'applied' check (status in ('applied', 'failed')),
  created_at timestamptz not null default now()
);
create index idx_post_edits_org_post on public.post_edits (org_id, post_id);

-- Signed, single-use, short-lived state for the connect flow (we store only a hash).
create table public.social_connect_states (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique check (length(state_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_social_connect_states_org on public.social_connect_states (org_id, expires_at);

-- ------------------------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------------------------

-- Channel plan limit: active (not disconnected) accounts per workspace.
create or replace function private.check_channel_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'UPDATE' and not (old.status = 'disconnected' and new.status <> 'disconnected') then
    return new;
  end if;
  if new.status = 'disconnected' then
    return new;
  end if;

  v_limit := private.limit_for(new.org_id, 'channels');
  if v_limit is null then
    raise exception 'Organization or plan limit not found';
  end if;
  if v_limit <> -1 then
    select count(*) into v_count from public.social_accounts
      where org_id = new.org_id and status <> 'disconnected' and id is distinct from new.id;
    if v_count >= v_limit then
      raise exception 'Plan limit reached: your plan allows at most % connected channel(s). Upgrade to connect more.', v_limit
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- A post must use an account of its own workspace AND brand.
create or replace function private.check_post_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.social_accounts a
    where a.id = new.social_account_id and a.org_id = new.org_id and a.brand_id = new.brand_id
  ) then
    raise exception 'That account does not belong to this brand.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- State machine guard for signed-in users. Server code (service role / postgres) is not restricted.
create or replace function private.guard_post_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select auth.role());
begin
  if v_role is distinct from 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'scheduled') then
      raise exception 'New posts can only be drafts or scheduled.' using errcode = 'P0001';
    end if;
    if new.provider_post_id is not null or new.post_url is not null or new.locked_at is not null
       or new.published_at is not null or new.last_error_code is not null or new.last_error_message is not null or new.attempts <> 0 then
      raise exception 'Publishing fields are set by the server only.' using errcode = 'P0001';
    end if;
  else
    if new.provider_post_id is distinct from old.provider_post_id or new.post_url is distinct from old.post_url
       or new.locked_at is distinct from old.locked_at or new.published_at is distinct from old.published_at
       or new.attempts is distinct from old.attempts or new.last_error_code is distinct from old.last_error_code
       or new.last_error_message is distinct from old.last_error_message then
      raise exception 'Publishing fields are set by the server only.' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if not (
        (old.status in ('draft', 'scheduled', 'failed', 'canceled') and new.status in ('draft', 'scheduled', 'canceled'))
      ) then
        raise exception 'You cannot change a post from % to %.', old.status, new.status using errcode = 'P0001';
      end if;
    elsif old.status in ('publishing', 'published') then
      raise exception 'A post that is publishing or published cannot be edited here.' using errcode = 'P0001';
    end if;
  end if;

  -- Scheduling rule: at least ~5 minutes ahead (30 s of clock slack).
  if new.status = 'scheduled' and (tg_op = 'INSERT' or old.status is distinct from 'scheduled' or new.scheduled_for is distinct from old.scheduled_for) then
    if new.scheduled_for is null or new.scheduled_for < now() + interval '4 minutes 30 seconds' then
      raise exception 'Choose a time at least 5 minutes from now.' using errcode = 'P0001';
    end if;
  end if;

  -- Retrying a failed post starts it fresh.
  if tg_op = 'UPDATE' and old.status = 'failed' and new.status in ('scheduled', 'draft') then
    new.last_error_code := null;
    new.last_error_message := null;
    new.attempts := 0;
  end if;
  return new;
end;
$$;

create trigger trg_social_accounts_channel_limit before insert or update on public.social_accounts
  for each row execute function private.check_channel_plan_limit();
create trigger trg_social_accounts_immutable_org before update on public.social_accounts
  for each row execute function private.prevent_org_id_change();
create trigger trg_social_accounts_immutable_brand before update on public.social_accounts
  for each row execute function private.prevent_brand_id_change();
create trigger trg_social_accounts_updated_at before update on public.social_accounts
  for each row execute function private.set_updated_at();

create trigger trg_scheduled_posts_account before insert or update of social_account_id, brand_id, org_id on public.scheduled_posts
  for each row execute function private.check_post_account();
create trigger trg_scheduled_posts_guard before insert or update on public.scheduled_posts
  for each row execute function private.guard_post_changes();
create trigger trg_scheduled_posts_immutable_org before update on public.scheduled_posts
  for each row execute function private.prevent_org_id_change();
create trigger trg_scheduled_posts_immutable_brand before update on public.scheduled_posts
  for each row execute function private.prevent_brand_id_change();
create trigger trg_scheduled_posts_updated_at before update on public.scheduled_posts
  for each row execute function private.set_updated_at();

revoke all on function private.check_channel_plan_limit() from public, anon, authenticated;
revoke all on function private.check_post_account() from public, anon, authenticated;
revoke all on function private.guard_post_changes() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.publish_attempts enable row level security;
alter table public.post_edits enable row level security;
alter table public.social_connect_states enable row level security;

-- social_accounts: members read; only the server connects; owners/admins can disconnect (delete)
create policy social_accounts_select on public.social_accounts for select to authenticated using (private.is_member(org_id));
create policy social_accounts_insert on public.social_accounts for insert to authenticated with check (false);
create policy social_accounts_update on public.social_accounts for update to authenticated using (false);
create policy social_accounts_delete on public.social_accounts for delete to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));

-- scheduled_posts: members read; Edit on `publishing` writes; owners/admins delete
create policy scheduled_posts_select on public.scheduled_posts for select to authenticated using (private.is_member(org_id));
create policy scheduled_posts_insert on public.scheduled_posts for insert to authenticated
  with check (private.is_member(org_id) and private.feature_level(org_id, 'publishing') >= 2);
create policy scheduled_posts_update on public.scheduled_posts for update to authenticated
  using (private.is_member(org_id) and private.feature_level(org_id, 'publishing') >= 2)
  with check (private.is_member(org_id) and private.feature_level(org_id, 'publishing') >= 2);
create policy scheduled_posts_delete on public.scheduled_posts for delete to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));

-- publish_attempts: members read (they need to see why a post failed); server writes
create policy publish_attempts_select on public.publish_attempts for select to authenticated using (private.is_member(org_id));
create policy publish_attempts_insert on public.publish_attempts for insert to authenticated with check (false);
create policy publish_attempts_update on public.publish_attempts for update to authenticated using (false);
create policy publish_attempts_delete on public.publish_attempts for delete to authenticated using (false);

-- post_edits: owners/admins read; server writes
create policy post_edits_select on public.post_edits for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy post_edits_insert on public.post_edits for insert to authenticated with check (false);
create policy post_edits_update on public.post_edits for update to authenticated using (false);
create policy post_edits_delete on public.post_edits for delete to authenticated using (false);

-- social_connect_states: hashes only; owners/admins may read, server writes
create policy social_connect_states_select on public.social_connect_states for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy social_connect_states_insert on public.social_connect_states for insert to authenticated with check (false);
create policy social_connect_states_update on public.social_connect_states for update to authenticated using (false);
create policy social_connect_states_delete on public.social_connect_states for delete to authenticated using (false);

revoke all on public.social_accounts, public.scheduled_posts, public.publish_attempts, public.post_edits,
  public.social_connect_states from public, anon, authenticated;
grant select on public.social_accounts, public.scheduled_posts, public.publish_attempts, public.post_edits,
  public.social_connect_states to authenticated;
grant insert, update, delete on public.scheduled_posts to authenticated;
grant delete on public.social_accounts to authenticated;

-- ------------------------------------------------------------------------------
-- Engine functions (service role only)
-- ------------------------------------------------------------------------------

-- Atomically claim due posts. Two workers can never claim the same row.
create or replace function public.claim_due_posts(p_limit int default 10)
returns table (id uuid, org_id uuid, brand_id uuid)
language sql
security definer
set search_path = ''
as $$
  update public.scheduled_posts p
     set status = 'publishing', locked_at = now(), attempts = p.attempts + 1
   where p.id in (
     select sp.id from public.scheduled_posts sp
      where sp.status = 'scheduled'
        and sp.scheduled_for <= now()
        and exists (select 1 from public.organizations o where o.id = sp.org_id and o.status = 'active')
      order by sp.scheduled_for
      for update skip locked
      limit least(greatest(coalesce(p_limit, 10), 1), 100)
   )
  returning p.id, p.org_id, p.brand_id;
$$;

-- Rescue posts stuck in `publishing`. A post whose provider id is stored was already sent: mark it
-- published, never resend. Otherwise retry up to 3 attempts, then fail with a reason.
create or replace function public.rescue_stuck_posts(p_minutes int default 10)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select id, attempts, provider_post_id from public.scheduled_posts
     where status = 'publishing'
       and coalesce(locked_at, updated_at) < now() - make_interval(mins => p_minutes)
     for update skip locked
  loop
    if r.provider_post_id is not null then
      update public.scheduled_posts
         set status = 'published', published_at = coalesce(published_at, now()), locked_at = null
       where id = r.id;
    elsif r.attempts >= 3 then
      update public.scheduled_posts
         set status = 'failed', locked_at = null,
             last_error_code = 'PUBLISH_STUCK',
             last_error_message = 'Publishing did not finish after several tries, so it was stopped. Nothing was posted twice. Please check the channel and try again.'
       where id = r.id;
    else
      update public.scheduled_posts set status = 'scheduled', locked_at = null where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Consume a connect state: valid only once, only before it expires.
create or replace function public.consume_connect_state(p_hash text)
returns table (org_id uuid, brand_id uuid, user_id uuid)
language sql
security definer
set search_path = ''
as $$
  update public.social_connect_states s
     set used_at = now()
   where s.state_hash = p_hash and s.used_at is null and s.expires_at > now()
  returning s.org_id, s.brand_id, s.user_id;
$$;

alter function public.claim_due_posts(int) owner to postgres;
alter function public.rescue_stuck_posts(int) owner to postgres;
alter function public.consume_connect_state(text) owner to postgres;
revoke all on function public.claim_due_posts(int) from public, anon, authenticated;
revoke all on function public.rescue_stuck_posts(int) from public, anon, authenticated;
revoke all on function public.consume_connect_state(text) from public, anon, authenticated;
grant execute on function public.claim_due_posts(int) to service_role;
grant execute on function public.rescue_stuck_posts(int) to service_role;
grant execute on function public.consume_connect_state(text) to service_role;
