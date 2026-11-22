-- ==============================================================================
-- Migration: 20261123000012_research_and_strategy.sql
-- Phase:     P06 (research and strategy), database part
-- Adds:      intelligence_reports, trend_runs, trend_signals, strategies, strategy_signals,
--            competitor_candidates; start_content_job (job + placeholder row in ONE transaction);
--            approve_strategy (only one approved strategy per brand); accept/reject candidate.
-- Not in this migration: Trend Alerts tables (trend_watches, trend_events, trend_rules,
--            trend_watch_runs). They are the most complex part of P06 and are built last.
--
-- Rules
--  * Generated content (reports, runs, signals, strategies) is written by the server only.
--    Members read; nobody edits it from the browser.
--  * The placeholder row and its job are created together, so a screen never sees a job with no
--    row (the old "placeholder row did not exist yet" race).
--  * Exactly one strategy per brand can be `approved`, enforced by a partial unique index and by
--    approve_strategy(), which demotes the previous one in the same transaction.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------------------
create table public.intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  -- website, instagram, facebook, linkedin, competitors, seo, audience (markdown text each)
  sections jsonb not null default '{}'::jsonb check (jsonb_typeof(sections) = 'object' and pg_column_size(sections) <= 400000),
  full_report text check (full_report is null or length(full_report) <= 100000),
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_intelligence_reports_org_brand on public.intelligence_reports (org_id, brand_id, created_at desc);

create table public.trend_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'partial', 'failed')),
  sources_requested text[] not null default '{}',
  sources_completed text[] not null default '{}',
  -- per source: {"Reddit": {"ok": true, "items": 12}, "YouTube": {"ok": false, "reason": "..."}}
  source_status jsonb not null default '{}'::jsonb check (jsonb_typeof(source_status) = 'object' and pg_column_size(source_status) <= 20000),
  ai_summary text check (ai_summary is null or length(ai_summary) <= 10000),
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_trend_runs_org_brand on public.trend_runs (org_id, brand_id, created_at desc);

create table public.trend_signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  run_id uuid not null references public.trend_runs(id) on delete cascade,
  source text not null check (length(source) between 1 and 60),
  topic text not null check (length(topic) between 1 and 500),
  relevance_score int not null check (relevance_score between 0 and 100),
  relevance_reason text check (relevance_reason is null or length(relevance_reason) <= 1000),
  url text check (url is null or length(url) <= 1000),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 8000),
  created_at timestamptz not null default now()
);
create index idx_trend_signals_org_brand on public.trend_signals (org_id, brand_id, created_at desc);
create index idx_trend_signals_org_run on public.trend_signals (org_id, run_id, relevance_score desc);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'approved', 'failed')),
  scope text not null default 'week' check (scope in ('day', 'week', 'month')),
  -- Empty string = any platform / AI decides the mix
  platform text not null default '' check (length(platform) <= 40),
  content_type text not null default '' check (length(content_type) <= 40),
  source_signal_ids uuid[] not null default '{}',
  -- Durable copy of the signals used, so the strategy still reads correctly if signals are pruned later
  source_signals_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(source_signals_snapshot) = 'array'),
  ai_summary text check (ai_summary is null or length(ai_summary) <= 10000),
  -- campaign_planning, weekly_content_strategy, content_pillars, platform_strategy, lead_generation_strategy, cta_strategy
  sections jsonb not null default '{}'::jsonb check (jsonb_typeof(sections) = 'object' and pg_column_size(sections) <= 400000),
  content_calendar jsonb not null default '[]'::jsonb check (jsonb_typeof(content_calendar) = 'array' and jsonb_array_length(content_calendar) <= 200),
  header_insights jsonb,
  pillar_balance jsonb,
  error_detail text check (error_detail is null or length(error_detail) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_strategies_org_brand on public.strategies (org_id, brand_id, created_at desc);
-- Only one approved strategy per brand
create unique index uq_strategies_one_approved on public.strategies (brand_id) where status = 'approved';

create table public.strategy_signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  signal_id uuid not null references public.trend_signals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (strategy_id, signal_id)
);
create index idx_strategy_signals_org_strategy on public.strategy_signals (org_id, strategy_id);

create table public.competitor_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  website_url text check (website_url is null or length(website_url) <= 500),
  reason text check (reason is null or length(reason) <= 1000),
  evidence_url text check (evidence_url is null or length(evidence_url) <= 1000),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_competitor_candidates_org_brand on public.competitor_candidates (org_id, brand_id, status);
create unique index uq_competitor_candidates_site on public.competitor_candidates (brand_id, website_url) where website_url is not null;

-- ------------------------------------------------------------------------------
-- Triggers (updated_at, immutable org/brand)
-- ------------------------------------------------------------------------------
create trigger trg_intelligence_reports_updated_at before update on public.intelligence_reports
  for each row execute function private.set_updated_at();
create trigger trg_intelligence_reports_immutable_org before update on public.intelligence_reports
  for each row execute function private.prevent_org_id_change();
create trigger trg_strategies_updated_at before update on public.strategies
  for each row execute function private.set_updated_at();
create trigger trg_strategies_immutable_org before update on public.strategies
  for each row execute function private.prevent_org_id_change();
create trigger trg_strategies_immutable_brand before update on public.strategies
  for each row execute function private.prevent_brand_id_change();

-- ------------------------------------------------------------------------------
-- RLS: members read, only the server writes
-- ------------------------------------------------------------------------------
alter table public.intelligence_reports enable row level security;
alter table public.trend_runs enable row level security;
alter table public.trend_signals enable row level security;
alter table public.strategies enable row level security;
alter table public.strategy_signals enable row level security;
alter table public.competitor_candidates enable row level security;

create policy intelligence_reports_select on public.intelligence_reports for select to authenticated using (private.is_member(org_id));
create policy intelligence_reports_insert on public.intelligence_reports for insert to authenticated with check (false);
create policy intelligence_reports_update on public.intelligence_reports for update to authenticated using (false);
create policy intelligence_reports_delete on public.intelligence_reports for delete to authenticated using (false);

create policy trend_runs_select on public.trend_runs for select to authenticated using (private.is_member(org_id));
create policy trend_runs_insert on public.trend_runs for insert to authenticated with check (false);
create policy trend_runs_update on public.trend_runs for update to authenticated using (false);
create policy trend_runs_delete on public.trend_runs for delete to authenticated using (false);

create policy trend_signals_select on public.trend_signals for select to authenticated using (private.is_member(org_id));
create policy trend_signals_insert on public.trend_signals for insert to authenticated with check (false);
create policy trend_signals_update on public.trend_signals for update to authenticated using (false);
create policy trend_signals_delete on public.trend_signals for delete to authenticated using (false);

create policy strategies_select on public.strategies for select to authenticated using (private.is_member(org_id));
create policy strategies_insert on public.strategies for insert to authenticated with check (false);
create policy strategies_update on public.strategies for update to authenticated using (false);
create policy strategies_delete on public.strategies for delete to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy strategy_signals_select on public.strategy_signals for select to authenticated using (private.is_member(org_id));
create policy strategy_signals_insert on public.strategy_signals for insert to authenticated with check (false);
create policy strategy_signals_update on public.strategy_signals for update to authenticated using (false);
create policy strategy_signals_delete on public.strategy_signals for delete to authenticated using (false);

create policy competitor_candidates_select on public.competitor_candidates for select to authenticated using (private.is_member(org_id));
create policy competitor_candidates_insert on public.competitor_candidates for insert to authenticated with check (false);
create policy competitor_candidates_update on public.competitor_candidates for update to authenticated using (false);
create policy competitor_candidates_delete on public.competitor_candidates for delete to authenticated using (false);

revoke all on public.intelligence_reports, public.trend_runs, public.trend_signals, public.strategies,
  public.strategy_signals, public.competitor_candidates from public, anon, authenticated;
grant select on public.intelligence_reports, public.trend_runs, public.trend_signals, public.strategies,
  public.strategy_signals, public.competitor_candidates to authenticated;
grant delete on public.strategies to authenticated;

-- ------------------------------------------------------------------------------
-- start_content_job: the job row and its placeholder row are created in ONE transaction
-- (server only). Validates the brand, scope, sources and signal ids before creating anything.
-- ------------------------------------------------------------------------------
create or replace function public.start_content_job(
  p_kind text, p_org uuid, p_brand uuid, p_user uuid, p_input jsonb default '{}'::jsonb
) returns table (job_id uuid, row_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_job uuid;
  v_row uuid;
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_sources text[];
  v_scope text;
  v_signal_ids uuid[];
  v_found int;
  v_snapshot jsonb;
  v_strategy uuid;
  v_section text;
  c_sources constant text[] := array['Reddit', 'Instagram', 'YouTube', 'Google Search', 'Google Trends'];
  c_sections constant text[] := array['campaign_planning', 'weekly_content_strategy', 'content_pillars', 'platform_strategy', 'lead_generation_strategy', 'cta_strategy', 'content_calendar'];
begin
  if p_kind not in ('intelligence.generate', 'trends.scan', 'strategy.generate', 'strategy.regenerate_section', 'competitors.discover') then
    raise exception 'Unknown job kind.' using errcode = 'P0001';
  end if;

  select o.status into v_status from public.organizations o where o.id = p_org;
  if v_status is distinct from 'active' then
    raise exception 'This workspace is not active.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.brands b where b.id = p_brand and b.org_id = p_org) then
    raise exception 'That brand does not belong to this workspace.' using errcode = 'P0001';
  end if;

  -- validate input first, so a refusal creates nothing
  if p_kind = 'trends.scan' then
    select coalesce(array_agg(x), c_sources) into v_sources from jsonb_array_elements_text(coalesce(v_input->'sources', '[]'::jsonb)) x;
    if cardinality(v_sources) = 0 then v_sources := c_sources; end if;
    if exists (select 1 from unnest(v_sources) s where s <> all (c_sources)) then
      raise exception 'Unknown trend source.' using errcode = 'P0001';
    end if;
  elsif p_kind = 'strategy.generate' then
    v_scope := coalesce(v_input->>'scope', 'week');
    if v_scope not in ('day', 'week', 'month') then
      raise exception 'Scope must be day, week or month.' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(x::uuid), '{}') into v_signal_ids from jsonb_array_elements_text(coalesce(v_input->'signal_ids', '[]'::jsonb)) x;
    if cardinality(v_signal_ids) > 50 then
      raise exception 'Choose at most 50 signals.' using errcode = 'P0001';
    end if;
    select count(*) into v_found from public.trend_signals s where s.id = any (v_signal_ids) and s.org_id = p_org and s.brand_id = p_brand;
    if v_found <> cardinality(v_signal_ids) then
      raise exception 'One of the chosen signals does not belong to this brand.' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'source', s.source, 'topic', s.topic)), '[]'::jsonb) into v_snapshot
      from public.trend_signals s where s.id = any (v_signal_ids);
  elsif p_kind = 'strategy.regenerate_section' then
    v_strategy := (v_input->>'strategy_id')::uuid;
    v_section := v_input->>'section';
    if v_section is null or v_section <> all (c_sections) then
      raise exception 'Unknown strategy section.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.strategies s where s.id = v_strategy and s.org_id = p_org and s.brand_id = p_brand and s.status in ('completed', 'approved')) then
      raise exception 'That strategy was not found or is not ready.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.jobs (org_id, brand_id, kind, status, input_ref, created_by)
  values (p_org, p_brand, p_kind, 'queued', v_input, p_user)
  returning id into v_job;

  if p_kind = 'intelligence.generate' then
    insert into public.intelligence_reports (org_id, brand_id, job_id, status, created_by)
    values (p_org, p_brand, v_job, 'processing', p_user) returning id into v_row;
  elsif p_kind = 'trends.scan' then
    insert into public.trend_runs (org_id, brand_id, job_id, status, sources_requested, created_by)
    values (p_org, p_brand, v_job, 'pending', v_sources, p_user) returning id into v_row;
  elsif p_kind = 'strategy.generate' then
    insert into public.strategies (org_id, brand_id, job_id, status, scope, platform, content_type, source_signal_ids, source_signals_snapshot, created_by)
    values (p_org, p_brand, v_job, 'processing', v_scope, left(coalesce(v_input->>'platform', ''), 40), left(coalesce(v_input->>'content_type', ''), 40), v_signal_ids, v_snapshot, p_user)
    returning id into v_row;
    insert into public.strategy_signals (org_id, strategy_id, signal_id)
      select p_org, v_row, x from unnest(v_signal_ids) x;
  elsif p_kind = 'strategy.regenerate_section' then
    v_row := v_strategy;
  else
    -- competitors.discover has no placeholder row: candidates are inserted as they are found
    v_row := v_job;
  end if;

  return query select v_job, v_row;
end;
$$;

-- ------------------------------------------------------------------------------
-- approve_strategy: one approved strategy per brand. The previous one is demoted in the same transaction.
-- ------------------------------------------------------------------------------
create or replace function public.approve_strategy(p_strategy uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_brand uuid;
  v_status text;
begin
  select s.org_id, s.brand_id, s.status into v_org, v_brand, v_status from public.strategies s where s.id = p_strategy;
  if v_org is null or not private.is_member(v_org) or private.feature_level(v_org, 'strategy') < 2 then
    raise exception 'You do not have access to approve this strategy.' using errcode = '42501';
  end if;
  if v_status not in ('completed', 'approved') then
    raise exception 'Only a finished strategy can be approved.' using errcode = 'P0001';
  end if;

  -- serialize approvals for this brand
  perform 1 from public.strategies s where s.brand_id = v_brand for update;
  update public.strategies set status = 'completed', approved_at = null where brand_id = v_brand and status = 'approved' and id <> p_strategy;
  update public.strategies set status = 'approved', approved_at = coalesce(approved_at, now()) where id = p_strategy;
end;
$$;

-- ------------------------------------------------------------------------------
-- Competitor candidates: accept (creates a competitor) or reject
-- ------------------------------------------------------------------------------
create or replace function public.accept_competitor_candidate(p_candidate uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.competitor_candidates%rowtype;
  v_competitor uuid;
begin
  select * into c from public.competitor_candidates where id = p_candidate for update;
  if c.id is null or not private.is_member(c.org_id) or private.feature_level(c.org_id, 'strategy') < 2 then
    raise exception 'You do not have access to this suggestion.' using errcode = '42501';
  end if;
  if c.status <> 'suggested' then
    raise exception 'This suggestion was already handled.' using errcode = 'P0001';
  end if;
  insert into public.competitors (org_id, brand_id, name, website_url, notes)
  values (c.org_id, c.brand_id, c.name, c.website_url, c.reason)
  returning id into v_competitor;
  update public.competitor_candidates set status = 'accepted', decided_at = now() where id = c.id;
  return v_competitor;
end;
$$;

create or replace function public.reject_competitor_candidate(p_candidate uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.competitor_candidates%rowtype;
begin
  select * into c from public.competitor_candidates where id = p_candidate for update;
  if c.id is null or not private.is_member(c.org_id) or private.feature_level(c.org_id, 'strategy') < 2 then
    raise exception 'You do not have access to this suggestion.' using errcode = '42501';
  end if;
  if c.status <> 'suggested' then
    raise exception 'This suggestion was already handled.' using errcode = 'P0001';
  end if;
  update public.competitor_candidates set status = 'rejected', decided_at = now() where id = c.id;
end;
$$;

alter function public.start_content_job(text, uuid, uuid, uuid, jsonb) owner to postgres;
alter function public.approve_strategy(uuid) owner to postgres;
alter function public.accept_competitor_candidate(uuid) owner to postgres;
alter function public.reject_competitor_candidate(uuid) owner to postgres;

revoke all on function public.start_content_job(text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.approve_strategy(uuid) from public, anon;
revoke all on function public.accept_competitor_candidate(uuid) from public, anon;
revoke all on function public.reject_competitor_candidate(uuid) from public, anon;
grant execute on function public.start_content_job(text, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.approve_strategy(uuid) to authenticated;
grant execute on function public.accept_competitor_candidate(uuid) to authenticated;
grant execute on function public.reject_competitor_candidate(uuid) to authenticated;
