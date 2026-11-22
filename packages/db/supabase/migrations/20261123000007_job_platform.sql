-- ==============================================================================
-- Migration: 20261123000007_job_platform.sql
-- Phase:     P04 (job platform)
-- Adds:      jobs (user-visible job state), credit_ledger + credit_balance view,
--            ai_usage, ai_cost_table (global config), media_assets, webhook_receipts
--            (global replay protection), ledger functions and the job rescue function.
--
-- Design notes
--  * Customers can only READ these tables. Every write is done by server code with the
--    service role (CLAUDE.md rules 2 and 3). The insert/update/delete policies exist
--    (four per-command policies, never `for all`) and refuse everything.
--  * The ledger functions live in `public` (named credits_*) because the API only exposes
--    the public schema, and the server calls them through the service role. They are
--    revoked from public, anon and authenticated, so no browser session can call them.
--  * The ledger is append-only. Balance = sum(amount). Spend is reserved when a job is
--    ACCEPTED, then settled at the real cost or released on failure.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  kind text not null check (length(kind) between 1 and 64),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  progress jsonb not null default '{}'::jsonb,
  input_ref jsonb,
  output_ref jsonb,
  error_code text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  cost_credits int not null default 0 check (cost_credits >= 0),
  created_by uuid references auth.users(id) on delete set null,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index idx_jobs_org_created on public.jobs (org_id, created_at desc);
create index idx_jobs_org_status on public.jobs (org_id, status);
create index idx_jobs_running_heartbeat on public.jobs (heartbeat_at) where status = 'running';

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_id uuid,
  kind text not null check (kind in ('grant', 'reserve', 'adjust', 'release', 'expire')),
  amount int not null,
  ref text,
  created_at timestamptz not null default now(),
  constraint credit_ledger_sign check (
    (kind = 'grant' and amount > 0)
    or (kind = 'reserve' and amount < 0)
    or (kind = 'adjust' and amount >= 0)
    or (kind = 'release' and amount > 0)
    or (kind = 'expire' and amount < 0)
  )
);
create index idx_credit_ledger_org_created on public.credit_ledger (org_id, created_at desc);
create index idx_credit_ledger_org_job on public.credit_ledger (org_id, job_id) where job_id is not null;
-- A job is reserved once; a grant reference is applied once.
create unique index uq_credit_ledger_reserve_job on public.credit_ledger (org_id, job_id) where kind = 'reserve';
create unique index uq_credit_ledger_grant_ref on public.credit_ledger (org_id, ref) where kind = 'grant' and ref is not null;
create unique index uq_credit_ledger_settle_job on public.credit_ledger (org_id, job_id) where kind in ('adjust', 'release');

create view public.credit_balance with (security_invoker = true) as
  select org_id, sum(amount)::int as balance
  from public.credit_ledger
  group by org_id;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_id uuid,
  model text not null,
  units numeric not null default 0 check (units >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  credits int not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);
create index idx_ai_usage_org_created on public.ai_usage (org_id, created_at desc);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  path text not null unique,
  kind text not null check (kind in ('logo', 'post-image', 'post-video', 'pdf', 'reference-image')),
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width int,
  height int,
  sha256 text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_media_assets_org_brand on public.media_assets (org_id, brand_id, created_at desc);

-- Global configuration: no org_id on purpose (allow-listed in the isolation suite).
create table public.ai_cost_table (
  model text primary key,
  provider text not null,
  capability text not null check (capability in ('text', 'image', 'video', 'speech', 'music', 'moderation')),
  unit text not null,
  usd_per_unit numeric(12, 6) not null check (usd_per_unit >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.ai_cost_table (model, provider, capability, unit, usd_per_unit) values
  ('gemini-2.5-flash', 'google', 'text', 'per_1k_tokens', 0.0006),
  ('gpt-4o-mini', 'openai', 'text', 'per_1k_tokens', 0.0006),
  ('gemini-2.5-flash-image', 'google', 'image', 'per_image', 0.039),
  ('gpt-image-1', 'openai', 'image', 'per_image', 0.04),
  ('veo-3.0-fast', 'google', 'video', 'per_second', 0.15),
  ('veo-3.0', 'google', 'video', 'per_second', 0.40);

-- Global replay protection for inbound webhooks (provider events arrive before an org is known).
create table public.webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ------------------------------------------------------------------------------
-- RLS: members read, nobody writes from the client
-- ------------------------------------------------------------------------------
alter table public.jobs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.ai_usage enable row level security;
alter table public.media_assets enable row level security;
alter table public.ai_cost_table enable row level security;
alter table public.webhook_receipts enable row level security;

-- jobs
create policy jobs_select on public.jobs for select to authenticated using (private.is_member(org_id));
create policy jobs_insert on public.jobs for insert to authenticated with check (false);
create policy jobs_update on public.jobs for update to authenticated using (false);
create policy jobs_delete on public.jobs for delete to authenticated using (false);

-- credit_ledger (members see the balance movements of their own org)
create policy credit_ledger_select on public.credit_ledger for select to authenticated using (private.is_member(org_id));
create policy credit_ledger_insert on public.credit_ledger for insert to authenticated with check (false);
create policy credit_ledger_update on public.credit_ledger for update to authenticated using (false);
create policy credit_ledger_delete on public.credit_ledger for delete to authenticated using (false);

-- ai_usage (spend detail is for owners and admins)
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy ai_usage_insert on public.ai_usage for insert to authenticated with check (false);
create policy ai_usage_update on public.ai_usage for update to authenticated using (false);
create policy ai_usage_delete on public.ai_usage for delete to authenticated using (false);

-- media_assets
create policy media_assets_select on public.media_assets for select to authenticated using (private.is_member(org_id));
create policy media_assets_insert on public.media_assets for insert to authenticated with check (false);
create policy media_assets_update on public.media_assets for update to authenticated using (false);
create policy media_assets_delete on public.media_assets for delete to authenticated using (false);

-- ai_cost_table and webhook_receipts: server only (no client privileges at all)
create policy ai_cost_table_select on public.ai_cost_table for select to authenticated using (false);
create policy ai_cost_table_insert on public.ai_cost_table for insert to authenticated with check (false);
create policy ai_cost_table_update on public.ai_cost_table for update to authenticated using (false);
create policy ai_cost_table_delete on public.ai_cost_table for delete to authenticated using (false);

create policy webhook_receipts_select on public.webhook_receipts for select to authenticated using (false);
create policy webhook_receipts_insert on public.webhook_receipts for insert to authenticated with check (false);
create policy webhook_receipts_update on public.webhook_receipts for update to authenticated using (false);
create policy webhook_receipts_delete on public.webhook_receipts for delete to authenticated using (false);

-- ------------------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------------------
revoke all on public.jobs, public.credit_ledger, public.ai_usage, public.media_assets,
  public.ai_cost_table, public.webhook_receipts, public.credit_balance from public, anon, authenticated;
grant select on public.jobs, public.credit_ledger, public.ai_usage, public.media_assets, public.credit_balance to authenticated;

-- ------------------------------------------------------------------------------
-- Ledger functions (service role only)
-- ------------------------------------------------------------------------------

-- Reserve credits for a job at acceptance. Idempotent per job. Locks the org row so
-- concurrent reservations are serialized and can never overspend.
create or replace function public.credits_reserve(
  p_org uuid, p_user uuid, p_job uuid, p_amount int, p_ref text default 'reserve'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_balance int;
  v_existing uuid;
  v_cap int;
  v_spent int;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: reservation must be positive' using errcode = 'P0001';
  end if;
  if p_job is null then
    raise exception 'INVALID_JOB: a reservation needs a job id' using errcode = 'P0001';
  end if;

  -- serialize all credit movements of this org
  select status into v_status from public.organizations where id = p_org for update;
  if v_status is null then
    raise exception 'ORG_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status <> 'active' then
    raise exception 'ORG_NOT_ACTIVE: this workspace cannot spend credits' using errcode = 'P0001';
  end if;

  -- idempotent: the same job is reserved once
  select id into v_existing from public.credit_ledger
    where org_id = p_org and job_id = p_job and kind = 'reserve';
  if v_existing is not null then
    return v_existing;
  end if;

  select coalesce(sum(amount), 0) into v_balance from public.credit_ledger where org_id = p_org;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS: balance % is below the % needed', v_balance, p_amount using errcode = 'P0001';
  end if;

  -- per-member monthly cap
  if p_user is not null then
    select monthly_credit_cap into v_cap from public.memberships
      where org_id = p_org and user_id = p_user and status = 'active';
    if v_cap is not null then
      select coalesce(-sum(amount), 0) into v_spent from public.credit_ledger
        where org_id = p_org and user_id = p_user
          and kind in ('reserve', 'adjust', 'release')
          and created_at >= date_trunc('month', now());
      if v_spent + p_amount > v_cap then
        raise exception 'MEMBER_CAP_REACHED: monthly cap of % credits', v_cap using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.credit_ledger (org_id, user_id, job_id, kind, amount, ref)
  values (p_org, p_user, p_job, 'reserve', -p_amount, p_ref)
  returning id into v_id;
  return v_id;
end;
$$;

-- Settle a reservation at the real cost. Returns unused credits. Never charges more than reserved.
-- Idempotent: a job that is already settled or released is left alone.
create or replace function public.credits_settle(p_org uuid, p_job uuid, p_actual int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.credit_ledger%rowtype;
  v_reserved int;
  v_actual int;
begin
  perform 1 from public.organizations where id = p_org for update;

  select * into v_res from public.credit_ledger where org_id = p_org and job_id = p_job and kind = 'reserve';
  if v_res.id is null then
    raise exception 'NO_RESERVATION: nothing reserved for this job' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.credit_ledger where org_id = p_org and job_id = p_job and kind in ('adjust', 'release')) then
    return;
  end if;

  v_reserved := -v_res.amount;
  v_actual := greatest(0, least(coalesce(p_actual, 0), v_reserved));
  insert into public.credit_ledger (org_id, user_id, job_id, kind, amount, ref)
  values (p_org, v_res.user_id, p_job, 'adjust', v_reserved - v_actual, 'settle');
end;
$$;

-- Give the whole reservation back (provider failure, cancellation, rescue). Idempotent.
create or replace function public.credits_release(p_org uuid, p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.credit_ledger%rowtype;
begin
  perform 1 from public.organizations where id = p_org for update;

  select * into v_res from public.credit_ledger where org_id = p_org and job_id = p_job and kind = 'reserve';
  if v_res.id is null then
    return;
  end if;
  if exists (select 1 from public.credit_ledger where org_id = p_org and job_id = p_job and kind in ('adjust', 'release')) then
    return;
  end if;

  insert into public.credit_ledger (org_id, user_id, job_id, kind, amount, ref)
  values (p_org, v_res.user_id, p_job, 'release', -v_res.amount, 'release');
end;
$$;

-- Add credits (monthly plan grant, pack purchase, manual). Idempotent per ref.
create or replace function public.credits_grant(p_org uuid, p_amount int, p_ref text, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: a grant must be positive' using errcode = 'P0001';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  insert into public.credit_ledger (org_id, user_id, kind, amount, ref)
  values (p_org, p_user, 'grant', p_amount, p_ref)
  on conflict (org_id, ref) where kind = 'grant' and ref is not null do nothing;
end;
$$;

-- Rescue: fail running jobs that have not sent a heartbeat and give their credits back.
create or replace function public.rescue_stuck_jobs(p_minutes int default 10)
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
    select id, org_id from public.jobs
    where status = 'running'
      and coalesce(heartbeat_at, started_at, created_at) < now() - make_interval(mins => p_minutes)
    for update skip locked
  loop
    update public.jobs
      set status = 'failed',
          error_code = 'WORKER_LOST',
          error_message = 'The worker stopped responding while running this job. Any reserved credits were returned. Please try again.',
          finished_at = now()
      where id = r.id and status = 'running';
    perform public.credits_release(r.org_id, r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Reconciliation: orgs whose balance is negative (must always be empty).
create or replace function public.credits_reconcile()
returns table (org_id uuid, balance int)
language sql
security definer
set search_path = ''
as $$
  select l.org_id, sum(l.amount)::int from public.credit_ledger l group by l.org_id having sum(l.amount) < 0;
$$;

alter function public.credits_reserve(uuid, uuid, uuid, int, text) owner to postgres;
alter function public.credits_settle(uuid, uuid, int) owner to postgres;
alter function public.credits_release(uuid, uuid) owner to postgres;
alter function public.credits_grant(uuid, int, text, uuid) owner to postgres;
alter function public.rescue_stuck_jobs(int) owner to postgres;
alter function public.credits_reconcile() owner to postgres;

revoke all on function public.credits_reserve(uuid, uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.credits_settle(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.credits_release(uuid, uuid) from public, anon, authenticated;
revoke all on function public.credits_grant(uuid, int, text, uuid) from public, anon, authenticated;
revoke all on function public.rescue_stuck_jobs(int) from public, anon, authenticated;
revoke all on function public.credits_reconcile() from public, anon, authenticated;

grant execute on function public.credits_reserve(uuid, uuid, uuid, int, text) to service_role;
grant execute on function public.credits_settle(uuid, uuid, int) to service_role;
grant execute on function public.credits_release(uuid, uuid) to service_role;
grant execute on function public.credits_grant(uuid, int, text, uuid) to service_role;
grant execute on function public.rescue_stuck_jobs(int) to service_role;
grant execute on function public.credits_reconcile() to service_role;
