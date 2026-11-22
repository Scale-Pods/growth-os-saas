-- ==============================================================================
-- Migration: 20261123000014_trend_alerts.sql
-- Phase:     P06 (Trend Alerts), database part
-- Adds:      trend_watches, trend_watch_runs, trend_mentions, trend_events, trend_stats_daily,
--            trend_rules, trend_deliveries, notifications; the scheduling and budget functions
--            (start_watch_run, claim_due_watches, record_watch_spend); rescue covers watch runs.
--
-- Rules
--  * Every watch has a monthly credit budget (1 or more). A watch that reaches it stops by itself
--    and restarts next month. Nothing runs unattended without a cap.
--  * Browsers can edit what a watch looks for. Spend, schedule and the budget-paused state are
--    server-owned (guard trigger), like the post state machine.
--  * Alert delivery channels are in-app, Slack and webhook (https only). Email is not offered
--    until it is set up. Targets are validated again at send time.
--  * Generated data (runs, mentions, stories, stats, deliveries) is written by the server only.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- notifications (also used later by the notification centre)
-- ------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (length(type) between 1 and 60),
  title text not null check (length(title) between 1 and 200),
  body text check (body is null or length(body) <= 1000),
  link text check (link is null or length(link) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_org_user on public.notifications (org_id, user_id, created_at desc);

-- ------------------------------------------------------------------------------
-- Trend Alerts tables
-- ------------------------------------------------------------------------------
create table public.trend_watches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  -- What actually counts, in plain words ("new model releases, not general company news")
  description text check (description is null or length(description) <= 1000),
  keywords text[] not null check (cardinality(keywords) between 1 and 10),
  excludes text[] not null default '{}' check (cardinality(excludes) <= 10),
  sources text[] not null default array['Google News'] check (cardinality(sources) >= 1 and sources <@ array['Google News', 'RSS', 'Reddit', 'Web', 'YouTube']),
  rss_feeds text[] not null default '{}' check (cardinality(rss_feeds) <= 5),
  region text not null default 'US' check (length(region) between 2 and 10),
  lookback_hours int not null default 48 check (lookback_hours between 6 and 168),
  relevance_threshold int not null default 60 check (relevance_threshold between 0 and 100),
  frequency_minutes int not null default 60 check (frequency_minutes in (30, 60, 120, 240, 720, 1440)),
  monthly_budget_credits int not null default 100 check (monthly_budget_credits between 1 and 10000),
  status text not null default 'active' check (status in ('active', 'paused', 'budget_paused')),
  spent_credits_month int not null default 0 check (spent_credits_month >= 0),
  month_key text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_trend_watches_org_brand on public.trend_watches (org_id, brand_id, created_at desc);
create index idx_trend_watches_due on public.trend_watches (next_run_at) where status in ('active', 'budget_paused');

create table public.trend_watch_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  watch_id uuid not null references public.trend_watches(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'skipped')),
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  -- {"Google News": {"ok": true, "items": 12}, "RSS": {"ok": false, "reason": "..."}}
  source_status jsonb not null default '{}'::jsonb check (jsonb_typeof(source_status) = 'object' and pg_column_size(source_status) <= 20000),
  found int not null default 0,
  new_items int not null default 0,
  kept int not null default 0,
  alerts int not null default 0,
  credits_spent int not null default 0 check (credits_spent >= 0),
  error_message text check (error_message is null or length(error_message) <= 1000),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_trend_watch_runs_org_watch on public.trend_watch_runs (org_id, watch_id, started_at desc);
create index idx_trend_watch_runs_running on public.trend_watch_runs (watch_id) where status = 'running';

-- One row per STORY (several outlets covering the same thing collapse into one event)
create table public.trend_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  watch_id uuid not null references public.trend_watches(id) on delete cascade,
  kind text not null default 'story' check (kind in ('story', 'spike')),
  title text not null check (length(title) between 1 and 300),
  summary text check (summary is null or length(summary) <= 2000),
  primary_url text check (primary_url is null or length(primary_url) <= 1000),
  source_count int not null default 1 check (source_count >= 1),
  relevance_score int not null check (relevance_score between 0 and 100),
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'negative', 'neutral', 'mixed')),
  positive_aspects text check (positive_aspects is null or length(positive_aspects) <= 1000),
  negative_aspects text check (negative_aspects is null or length(negative_aspects) <= 1000),
  importance text not null default 'low' check (importance in ('low', 'medium', 'high')),
  topic text check (topic is null or length(topic) <= 120),
  why_it_matters text check (why_it_matters is null or length(why_it_matters) <= 2000),
  is_alert boolean not null default false,
  embedding real[] not null default '{}' check (cardinality(embedding) <= 3072),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_trend_events_org_watch on public.trend_events (org_id, watch_id, last_seen_at desc);

create table public.trend_mentions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  watch_id uuid not null references public.trend_watches(id) on delete cascade,
  run_id uuid not null references public.trend_watch_runs(id) on delete cascade,
  event_id uuid references public.trend_events(id) on delete set null,
  source text not null check (length(source) between 1 and 60),
  title text not null check (length(title) between 1 and 500),
  snippet text check (snippet is null or length(snippet) <= 2000),
  url text check (url is null or length(url) <= 1000),
  url_hash text not null check (length(url_hash) = 64),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  -- A link already seen for this watch is skipped before any paid step
  unique (watch_id, url_hash)
);
create index idx_trend_mentions_org_watch on public.trend_mentions (org_id, watch_id, created_at desc);

create table public.trend_stats_daily (
  org_id uuid not null references public.organizations(id) on delete cascade,
  watch_id uuid not null references public.trend_watches(id) on delete cascade,
  day date not null,
  mention_count int not null default 0 check (mention_count >= 0),
  mean_7d numeric(10, 2),
  stddev_7d numeric(10, 2),
  created_at timestamptz not null default now(),
  primary key (watch_id, day)
);
create index idx_trend_stats_daily_org on public.trend_stats_daily (org_id, watch_id, day desc);

create table public.trend_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- null = applies to every watch in the workspace
  watch_id uuid references public.trend_watches(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  min_relevance int not null default 70 check (min_relevance between 0 and 100),
  min_importance text not null default 'medium' check (min_importance in ('low', 'medium', 'high')),
  -- empty = any sentiment
  sentiments text[] not null default '{}' check (sentiments <@ array['positive', 'negative', 'neutral', 'mixed']),
  channel text not null check (channel in ('in_app', 'slack', 'webhook')),
  target text check (target is null or length(target) <= 500),
  digest text not null default 'immediate' check (digest in ('immediate', 'daily', 'weekly')),
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trend_rules_target_matches_channel check (
    (channel = 'in_app' and target is null)
    or (channel in ('slack', 'webhook') and coalesce(target ~ '^https://[^ ]+$', false))
  )
);
create index idx_trend_rules_org_watch on public.trend_rules (org_id, watch_id);

create table public.trend_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.trend_events(id) on delete cascade,
  rule_id uuid not null references public.trend_rules(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'slack', 'webhook')),
  status text not null check (status in ('sent', 'failed', 'queued_digest')),
  error text check (error is null or length(error) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- A story is delivered once per rule
  unique (event_id, rule_id)
);
create index idx_trend_deliveries_org_status on public.trend_deliveries (org_id, status, created_at desc);

-- ------------------------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------------------------

-- Plan limit: number of watches per workspace
create or replace function private.check_watch_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  v_limit := private.limit_for(new.org_id, 'watches');
  if v_limit is null then
    raise exception 'Organization or plan limit not found';
  end if;
  if v_limit <> -1 then
    select count(*) into v_count from public.trend_watches where org_id = new.org_id;
    if v_count >= v_limit then
      raise exception 'Plan limit reached: your plan allows at most % trend watch(es). Upgrade to add more.', v_limit using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Shape rules that a CHECK cannot express
create or replace function private.validate_watch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  foreach k in array new.keywords loop
    if length(btrim(k)) = 0 or length(k) > 80 then
      raise exception 'Each keyword must be 1 to 80 characters.' using errcode = 'P0001';
    end if;
  end loop;
  foreach k in array new.excludes loop
    if length(btrim(k)) = 0 or length(k) > 80 then
      raise exception 'Each excluded word must be 1 to 80 characters.' using errcode = 'P0001';
    end if;
  end loop;
  foreach k in array new.rss_feeds loop
    if k !~ '^https?://[^ ]+$' or length(k) > 500 then
      raise exception 'Feed addresses must start with http:// or https://.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

-- What a signed-in user may and may not change on a watch. Server code (service role / postgres) is not restricted.
create or replace function private.guard_watch_changes()
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
    if new.status not in ('active', 'paused') then
      raise exception 'A new watch is either active or paused.' using errcode = 'P0001';
    end if;
    new.spent_credits_month := 0;
    new.month_key := to_char(now() at time zone 'utc', 'YYYY-MM');
    new.next_run_at := now();
    new.last_run_at := null;
    new.created_by := (select auth.uid());
    return new;
  end if;

  if new.spent_credits_month is distinct from old.spent_credits_month
     or new.month_key is distinct from old.month_key
     or new.next_run_at is distinct from old.next_run_at
     or new.last_run_at is distinct from old.last_run_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Spend and schedule fields are managed by the server.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'budget_paused' then
      raise exception 'Only the server can stop a watch for budget.' using errcode = 'P0001';
    end if;
    if old.status = 'budget_paused' and new.status = 'active' and old.spent_credits_month >= new.monthly_budget_credits then
      raise exception 'This watch has used its monthly budget. Raise the budget or wait for next month.' using errcode = 'P0001';
    end if;
    if new.status = 'active' then
      new.next_run_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- A rule can only point at a watch of its own workspace
create or replace function private.check_rule_watch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.watch_id is not null and not exists (select 1 from public.trend_watches w where w.id = new.watch_id and w.org_id = new.org_id) then
    raise exception 'That watch does not belong to this workspace.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_trend_watches_limit before insert on public.trend_watches
  for each row execute function private.check_watch_plan_limit();
create trigger trg_trend_watches_validate before insert or update on public.trend_watches
  for each row execute function private.validate_watch();
create trigger trg_trend_watches_guard before insert or update on public.trend_watches
  for each row execute function private.guard_watch_changes();
create trigger trg_trend_watches_immutable_org before update on public.trend_watches
  for each row execute function private.prevent_org_id_change();
create trigger trg_trend_watches_immutable_brand before update on public.trend_watches
  for each row execute function private.prevent_brand_id_change();
create trigger trg_trend_watches_updated_at before update on public.trend_watches
  for each row execute function private.set_updated_at();
create trigger trg_trend_rules_watch before insert or update on public.trend_rules
  for each row execute function private.check_rule_watch();
create trigger trg_trend_rules_immutable_org before update on public.trend_rules
  for each row execute function private.prevent_org_id_change();

revoke all on function private.check_watch_plan_limit() from public, anon, authenticated;
revoke all on function private.validate_watch() from public, anon, authenticated;
revoke all on function private.guard_watch_changes() from public, anon, authenticated;
revoke all on function private.check_rule_watch() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.trend_watches enable row level security;
alter table public.trend_watch_runs enable row level security;
alter table public.trend_events enable row level security;
alter table public.trend_mentions enable row level security;
alter table public.trend_stats_daily enable row level security;
alter table public.trend_rules enable row level security;
alter table public.trend_deliveries enable row level security;

-- notifications: private to their recipient; the only thing a user can change is read_at (column grant below)
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(org_id));
create policy notifications_insert on public.notifications for insert to authenticated with check (false);
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(org_id))
  with check (user_id = (select auth.uid()) and private.is_member(org_id));
create policy notifications_delete on public.notifications for delete to authenticated using (false);

-- trend_watches and trend_rules: members read; Edit on trend_alerts writes
create policy trend_watches_select on public.trend_watches for select to authenticated using (private.is_member(org_id));
create policy trend_watches_insert on public.trend_watches for insert to authenticated
  with check (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2);
create policy trend_watches_update on public.trend_watches for update to authenticated
  using (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2)
  with check (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2);
create policy trend_watches_delete on public.trend_watches for delete to authenticated
  using (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2);

create policy trend_rules_select on public.trend_rules for select to authenticated using (private.is_member(org_id));
create policy trend_rules_insert on public.trend_rules for insert to authenticated
  with check (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2);
create policy trend_rules_update on public.trend_rules for update to authenticated
  using (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2)
  with check (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2);
create policy trend_rules_delete on public.trend_rules for delete to authenticated
  using (private.is_member(org_id) and private.feature_level(org_id, 'trend_alerts') >= 2);

-- Generated data: members read, only the server writes
create policy trend_watch_runs_select on public.trend_watch_runs for select to authenticated using (private.is_member(org_id));
create policy trend_watch_runs_insert on public.trend_watch_runs for insert to authenticated with check (false);
create policy trend_watch_runs_update on public.trend_watch_runs for update to authenticated using (false);
create policy trend_watch_runs_delete on public.trend_watch_runs for delete to authenticated using (false);

create policy trend_events_select on public.trend_events for select to authenticated using (private.is_member(org_id));
create policy trend_events_insert on public.trend_events for insert to authenticated with check (false);
create policy trend_events_update on public.trend_events for update to authenticated using (false);
create policy trend_events_delete on public.trend_events for delete to authenticated using (false);

create policy trend_mentions_select on public.trend_mentions for select to authenticated using (private.is_member(org_id));
create policy trend_mentions_insert on public.trend_mentions for insert to authenticated with check (false);
create policy trend_mentions_update on public.trend_mentions for update to authenticated using (false);
create policy trend_mentions_delete on public.trend_mentions for delete to authenticated using (false);

create policy trend_stats_daily_select on public.trend_stats_daily for select to authenticated using (private.is_member(org_id));
create policy trend_stats_daily_insert on public.trend_stats_daily for insert to authenticated with check (false);
create policy trend_stats_daily_update on public.trend_stats_daily for update to authenticated using (false);
create policy trend_stats_daily_delete on public.trend_stats_daily for delete to authenticated using (false);

create policy trend_deliveries_select on public.trend_deliveries for select to authenticated using (private.is_member(org_id));
create policy trend_deliveries_insert on public.trend_deliveries for insert to authenticated with check (false);
create policy trend_deliveries_update on public.trend_deliveries for update to authenticated using (false);
create policy trend_deliveries_delete on public.trend_deliveries for delete to authenticated using (false);

revoke all on public.notifications, public.trend_watches, public.trend_watch_runs, public.trend_events, public.trend_mentions,
  public.trend_stats_daily, public.trend_rules, public.trend_deliveries from public, anon, authenticated;
grant select on public.notifications, public.trend_watches, public.trend_watch_runs, public.trend_events, public.trend_mentions,
  public.trend_stats_daily, public.trend_rules, public.trend_deliveries to authenticated;
grant insert, update, delete on public.trend_watches, public.trend_rules to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------------------------------
-- Scheduling and budget (server only)
-- ------------------------------------------------------------------------------

-- Start one check for a watch: the job and the run row are created together. Never raises for expected refusals:
-- it returns `refused` (missing | inactive | paused | budget | running) so callers can say why.
create or replace function public.start_watch_run(p_watch uuid, p_trigger text, p_user uuid default null)
returns table (job_id uuid, run_id uuid, org_id uuid, refused text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.trend_watches%rowtype;
  v_month text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_org_status text;
  v_job uuid;
  v_run uuid;
begin
  if p_trigger not in ('schedule', 'manual') then
    raise exception 'Unknown trigger.' using errcode = 'P0001';
  end if;
  select * into w from public.trend_watches t where t.id = p_watch for update;
  if w.id is null then
    return query select null::uuid, null::uuid, null::uuid, 'missing'::text;
    return;
  end if;
  select o.status into v_org_status from public.organizations o where o.id = w.org_id;
  if v_org_status is distinct from 'active' then
    return query select null::uuid, null::uuid, w.org_id, 'inactive'::text;
    return;
  end if;

  -- A new month: spend starts again, and a watch stopped for budget starts again too.
  if w.month_key <> v_month then
    update public.trend_watches t
       set spent_credits_month = 0, month_key = v_month, status = case when t.status = 'budget_paused' then 'active' else t.status end
     where t.id = w.id;
    select * into w from public.trend_watches t where t.id = w.id;
  end if;

  if w.status = 'paused' then
    return query select null::uuid, null::uuid, w.org_id, 'paused'::text;
    return;
  end if;
  if w.status = 'budget_paused' or w.spent_credits_month >= w.monthly_budget_credits then
    update public.trend_watches t set status = 'budget_paused' where t.id = w.id and t.status <> 'budget_paused';
    return query select null::uuid, null::uuid, w.org_id, 'budget'::text;
    return;
  end if;
  if exists (select 1 from public.trend_watch_runs r where r.watch_id = w.id and r.status = 'running') then
    return query select null::uuid, null::uuid, w.org_id, 'running'::text;
    return;
  end if;

  insert into public.jobs (org_id, brand_id, kind, status, input_ref, created_by)
  values (w.org_id, w.brand_id, 'alerts.run', 'queued', jsonb_build_object('watch_id', w.id), p_user)
  returning id into v_job;
  insert into public.trend_watch_runs (org_id, watch_id, job_id, status, trigger)
  values (w.org_id, w.id, v_job, 'running', p_trigger)
  returning id into v_run;
  update public.trend_watches t
     set next_run_at = now() + make_interval(mins => w.frequency_minutes), last_run_at = now()
   where t.id = w.id;

  return query select v_job, v_run, w.org_id, null::text;
end;
$$;

-- Claim due watches (each at most once per interval). Watches over budget are marked budget_paused and skipped.
create or replace function public.claim_due_watches(p_limit int default 20)
returns table (job_id uuid, run_id uuid, watch_id uuid, org_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  s record;
begin
  for r in
    select t.id from public.trend_watches t
     where t.status in ('active', 'budget_paused') and t.next_run_at <= now()
     order by t.next_run_at
     for update skip locked
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
  loop
    select * into s from public.start_watch_run(r.id, 'schedule', null);
    if s.job_id is not null then
      return query select s.job_id, s.run_id, r.id, s.org_id;
    end if;
  end loop;
end;
$$;

-- Add the credits a run really cost. When the monthly budget is reached the watch stops (and stays stopped until next month
-- or until someone raises the budget). Returns the watch's status afterwards.
create or replace function public.record_watch_spend(p_watch uuid, p_credits int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_credits is null or p_credits < 0 then
    raise exception 'Spend cannot be negative.' using errcode = 'P0001';
  end if;
  update public.trend_watches t
     set spent_credits_month = t.spent_credits_month + p_credits,
         status = case when t.status = 'active' and t.spent_credits_month + p_credits >= t.monthly_budget_credits then 'budget_paused' else t.status end
   where t.id = p_watch
   returning t.status into v_status;
  return v_status;
end;
$$;

-- Rescue now also fails the run row of a stuck alerts.run job (keeps the earlier research placeholder handling).
create or replace function public.rescue_stuck_jobs(p_minutes int default 10)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_msg constant text := 'The worker stopped responding before this finished. Anything already completed was kept and any reserved credits were returned. Please try again.';
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

    update public.intelligence_reports set status = 'failed', error_message = v_msg
      where job_id = r.id and status in ('pending', 'processing');
    update public.trend_runs set status = 'failed', error_message = v_msg, finished_at = now()
      where job_id = r.id and status in ('pending', 'running');
    update public.strategies set status = 'failed', error_detail = v_msg
      where job_id = r.id and status = 'processing';
    update public.trend_watch_runs set status = 'failed', error_message = v_msg, finished_at = now()
      where job_id = r.id and status = 'running';

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

alter function public.start_watch_run(uuid, text, uuid) owner to postgres;
alter function public.claim_due_watches(int) owner to postgres;
alter function public.record_watch_spend(uuid, int) owner to postgres;
revoke all on function public.start_watch_run(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_due_watches(int) from public, anon, authenticated;
revoke all on function public.record_watch_spend(uuid, int) from public, anon, authenticated;
grant execute on function public.start_watch_run(uuid, text, uuid) to service_role;
grant execute on function public.claim_due_watches(int) to service_role;
grant execute on function public.record_watch_spend(uuid, int) to service_role;

-- Price of the embedding model used by the relevance filter and story clustering (placeholder: check against the provider's price page).
insert into public.ai_cost_table (model, provider, capability, unit, usd_per_unit)
values ('text-embedding-3-small', 'openai', 'text', 'per_1k_tokens', 0.00002)
on conflict (model) do nothing;
