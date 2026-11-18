-- ==============================================================================
-- Migration: 0002_brand_kit.sql
-- Description: P03 Brand Kit, Profiles, Voice, Facts, Pillars, Competitors,
--              Onboarding State, and Brand Plan Limits
-- Phase: P03 (Brand Kit & Onboarding)
-- ==============================================================================

-- ==============================================================================
-- 1. Helper Triggers & Functions (private schema)
-- ==============================================================================

-- 1.1 Generic updated_at trigger function
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon;

-- 1.2 Prevent modification of brand_id once set
create or replace function private.prevent_brand_id_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.brand_id is distinct from old.brand_id then
    raise exception 'brand_id cannot be changed once assigned';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_brand_id_change() from public, anon;

-- 1.3 Plan limit check for brands
create or replace function private.check_brand_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_brand_count integer;
begin
  v_limit := private.limit_for(new.org_id, 'brands');
  if v_limit is null then
    raise exception 'Organization or plan limit not found';
  end if;

  if v_limit <> -1 then
    select count(*) into v_brand_count
    from public.brands
    where org_id = new.org_id
      and status = 'active';

    if v_brand_count >= v_limit then
      raise exception 'Plan limit reached: your plan allows at most % active brand(s). Upgrade to add more brands.', v_limit
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.check_brand_plan_limit() from public, anon;

-- Attach plan limit trigger to public.brands
drop trigger if exists trg_brands_plan_limit on public.brands;
create trigger trg_brands_plan_limit
  before insert on public.brands
  for each row execute function private.check_brand_plan_limit();

-- ==============================================================================
-- 2. Add onboarding_state to public.organizations
-- ==============================================================================

alter table public.organizations
  add column if not exists onboarding_state jsonb not null default '{"step": 1, "completed": false}'::jsonb;

-- ==============================================================================
-- 3. Brand Kit Tables
-- ==============================================================================

-- 3.1 Brand Profiles
create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade unique,
  tagline text check (length(tagline) <= 300),
  industry text check (length(industry) <= 120),
  description text check (length(description) <= 3000),
  products_services text check (length(products_services) <= 3000),
  target_audience text check (length(target_audience) <= 3000),
  goals text check (length(goals) <= 3000),
  website_url text check (length(website_url) <= 500),
  contact_email text check (contact_email is null or contact_email ~* '^.+@.+\..+$'),
  contact_phone text check (length(contact_phone) <= 50),
  social_urls jsonb not null default '{}'::jsonb,
  service_areas text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.2 Brand Kits (Visual Identity)
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade unique,
  logo_url text check (length(logo_url) <= 2000),
  logo_dark_url text check (length(logo_dark_url) <= 2000),
  cover_url text check (length(cover_url) <= 2000),
  colors jsonb not null default '{"primary": "#B1D997", "secondary": "#63A5E7", "accent": "#CC6B49", "background": "#04070D", "text": "#FFFFFF"}'::jsonb,
  fonts jsonb not null default '{"heading": "Instrument Serif", "body": "Inter"}'::jsonb,
  image_style_notes text check (length(image_style_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.3 Brand Voice & Guidelines
create table if not exists public.brand_voice (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade unique,
  tone_words text[] not null default '{}'::text[],
  do_examples text check (length(do_examples) <= 2000),
  dont_examples text check (length(dont_examples) <= 2000),
  banned_words text[] not null default '{}'::text[],
  approved_ctas text[] not null default '{}'::text[],
  preferred_hashtags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.4 Brand Facts (Approved Facts & Proof Points)
create table if not exists public.brand_facts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  statement text not null check (length(statement) between 3 and 1000),
  source text check (length(source) <= 500),
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.5 Brand Content Pillars
create table if not exists public.brand_pillars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (length(name) between 2 and 100),
  description text check (length(description) <= 1000),
  target_share_pct integer not null default 25 check (target_share_pct >= 0 and target_share_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.6 Competitors
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (length(name) between 2 and 150),
  website_url text check (length(website_url) <= 500),
  social_handles jsonb not null default '{}'::jsonb,
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==============================================================================
-- 4. Performance Indexes
-- ==============================================================================

create index if not exists idx_brand_profiles_org_id on public.brand_profiles (org_id);
create index if not exists idx_brand_profiles_brand_id on public.brand_profiles (brand_id);

create index if not exists idx_brand_kits_org_id on public.brand_kits (org_id);
create index if not exists idx_brand_kits_brand_id on public.brand_kits (brand_id);

create index if not exists idx_brand_voice_org_id on public.brand_voice (org_id);
create index if not exists idx_brand_voice_brand_id on public.brand_voice (brand_id);

create index if not exists idx_brand_facts_org_brand on public.brand_facts (org_id, brand_id);
create index if not exists idx_brand_pillars_org_brand on public.brand_pillars (org_id, brand_id);
create index if not exists idx_competitors_org_brand on public.competitors (org_id, brand_id);

-- ==============================================================================
-- 5. Immutability & Updated At Triggers
-- ==============================================================================

-- Brand Profiles triggers
create trigger trg_brand_profiles_immutable_org
  before update on public.brand_profiles
  for each row execute function private.prevent_org_id_change();

create trigger trg_brand_profiles_immutable_brand
  before update on public.brand_profiles
  for each row execute function private.prevent_brand_id_change();

create trigger trg_brand_profiles_updated_at
  before update on public.brand_profiles
  for each row execute function private.set_updated_at();

-- Brand Kits triggers
create trigger trg_brand_kits_immutable_org
  before update on public.brand_kits
  for each row execute function private.prevent_org_id_change();

create trigger trg_brand_kits_immutable_brand
  before update on public.brand_kits
  for each row execute function private.prevent_brand_id_change();

create trigger trg_brand_kits_updated_at
  before update on public.brand_kits
  for each row execute function private.set_updated_at();

-- Brand Voice triggers
create trigger trg_brand_voice_immutable_org
  before update on public.brand_voice
  for each row execute function private.prevent_org_id_change();

create trigger trg_brand_voice_immutable_brand
  before update on public.brand_voice
  for each row execute function private.prevent_brand_id_change();

create trigger trg_brand_voice_updated_at
  before update on public.brand_voice
  for each row execute function private.set_updated_at();

-- Brand Facts triggers
create trigger trg_brand_facts_immutable_org
  before update on public.brand_facts
  for each row execute function private.prevent_org_id_change();

create trigger trg_brand_facts_immutable_brand
  before update on public.brand_facts
  for each row execute function private.prevent_brand_id_change();

create trigger trg_brand_facts_updated_at
  before update on public.brand_facts
  for each row execute function private.set_updated_at();

-- Brand Pillars triggers
create trigger trg_brand_pillars_immutable_org
  before update on public.brand_pillars
  for each row execute function private.prevent_org_id_change();

create trigger trg_brand_pillars_immutable_brand
  before update on public.brand_pillars
  for each row execute function private.prevent_brand_id_change();

create trigger trg_brand_pillars_updated_at
  before update on public.brand_pillars
  for each row execute function private.set_updated_at();

-- Competitors triggers
create trigger trg_competitors_immutable_org
  before update on public.competitors
  for each row execute function private.prevent_org_id_change();

create trigger trg_competitors_immutable_brand
  before update on public.competitors
  for each row execute function private.prevent_brand_id_change();

create trigger trg_competitors_updated_at
  before update on public.competitors
  for each row execute function private.set_updated_at();

-- ==============================================================================
-- 6. Enable Row Level Security (RLS)
-- ==============================================================================

alter table public.brand_profiles enable row level security;
alter table public.brand_kits enable row level security;
alter table public.brand_voice enable row level security;
alter table public.brand_facts enable row level security;
alter table public.brand_pillars enable row level security;
alter table public.competitors enable row level security;

-- ==============================================================================
-- 7. RLS Policies
-- ==============================================================================

-- 7.1 Brand Profiles Policies
create policy brand_profiles_select on public.brand_profiles
  for select to authenticated
  using (private.is_member(org_id));

create policy brand_profiles_insert on public.brand_profiles
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_profiles_update on public.brand_profiles
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_profiles_delete on public.brand_profiles
  for delete to authenticated
  using (
    private.is_member(org_id)
    and private.has_role(org_id, array['owner','admin']::public.org_role[])
  );

-- 7.2 Brand Kits Policies
create policy brand_kits_select on public.brand_kits
  for select to authenticated
  using (private.is_member(org_id));

create policy brand_kits_insert on public.brand_kits
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_kits_update on public.brand_kits
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_kits_delete on public.brand_kits
  for delete to authenticated
  using (
    private.is_member(org_id)
    and private.has_role(org_id, array['owner','admin']::public.org_role[])
  );

-- 7.3 Brand Voice Policies
create policy brand_voice_select on public.brand_voice
  for select to authenticated
  using (private.is_member(org_id));

create policy brand_voice_insert on public.brand_voice
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_voice_update on public.brand_voice
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_voice_delete on public.brand_voice
  for delete to authenticated
  using (
    private.is_member(org_id)
    and private.has_role(org_id, array['owner','admin']::public.org_role[])
  );

-- 7.4 Brand Facts Policies
create policy brand_facts_select on public.brand_facts
  for select to authenticated
  using (private.is_member(org_id));

create policy brand_facts_insert on public.brand_facts
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_facts_update on public.brand_facts
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_facts_delete on public.brand_facts
  for delete to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

-- 7.5 Brand Pillars Policies
create policy brand_pillars_select on public.brand_pillars
  for select to authenticated
  using (private.is_member(org_id));

create policy brand_pillars_insert on public.brand_pillars
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_pillars_update on public.brand_pillars
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy brand_pillars_delete on public.brand_pillars
  for delete to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

-- 7.6 Competitors Policies
create policy competitors_select on public.competitors
  for select to authenticated
  using (private.is_member(org_id));

create policy competitors_insert on public.competitors
  for insert to authenticated
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy competitors_update on public.competitors
  for update to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  )
  with check (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

create policy competitors_delete on public.competitors
  for delete to authenticated
  using (
    private.is_member(org_id)
    and private.feature_level(org_id, 'strategy') >= 2
  );

-- ==============================================================================
-- 8. Explicit Permissions / Grants
-- ==============================================================================

grant select, insert, update, delete on public.brand_profiles to authenticated, service_role;
grant select, insert, update, delete on public.brand_kits to authenticated, service_role;
grant select, insert, update, delete on public.brand_voice to authenticated, service_role;
grant select, insert, update, delete on public.brand_facts to authenticated, service_role;
grant select, insert, update, delete on public.brand_pillars to authenticated, service_role;
grant select, insert, update, delete on public.competitors to authenticated, service_role;

-- Supabase grants anon access to new tables by default; deny it (RLS is the second line, not the only one)
revoke all on public.brand_profiles, public.brand_kits, public.brand_voice,
              public.brand_facts, public.brand_pillars, public.competitors from anon, public;
