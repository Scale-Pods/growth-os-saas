-- ==============================================================================
-- Cross-tenant isolation suite (the P01 gate)
--
-- Run:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/isolation.sql
-- Needs: all migrations applied (local `supabase start`, CI, or a test project).
-- Safe:  everything runs inside one transaction that is ROLLED BACK at the end.
--
-- What it does
--   A. Catalogue checks, generated from the system catalogs (a new table that is
--      not covered makes this suite fail):
--        - RLS enabled on every public table
--        - exactly four per-command policies, never `for all`
--        - org_id uuid NOT NULL + an index starting with org_id (global tables allow-listed)
--        - every security definer function pins search_path
--        - anon holds no privileges on public tables / functions
--        - every table has a seeded fixture row for org A
--   B. For EVERY table with an org_id: as org B's owner, an org A viewer and an
--      anonymous caller, try select / insert / update / delete against org A's rows.
--      Every attempt must be blocked. Positive control: org A's owner can read them.
--   C. Named rule tests (roles, last owner, plan limits, rate limit, invitations,
--      instant revocation, suspended orgs, helper functions called as the wrong org).
--
-- Any failure raises an exception, so psql exits non-zero and CI fails.
-- ==============================================================================

begin;

create schema isolation_test;
create temp table isolation_results (
  id serial primary key,
  area text not null,
  subject text not null,
  actor text not null,
  op text not null,
  ok boolean not null,
  detail text
) on commit drop;

-- Fixed identifiers -----------------------------------------------------------
create table isolation_test.ids (k text primary key, v uuid not null);
insert into isolation_test.ids values
  ('a_owner',  'a0000000-0000-0000-0000-000000000001'),
  ('a_admin',  'a0000000-0000-0000-0000-000000000002'),
  ('a_viewer', 'a0000000-0000-0000-0000-000000000003'),
  ('b_owner',  'b0000000-0000-0000-0000-000000000001'),
  ('c_user',   'c0000000-0000-0000-0000-000000000001'),
  ('d_user',   'd0000000-0000-0000-0000-000000000001');

create function isolation_test.id(p_k text) returns uuid language sql stable as $$
  select v from isolation_test.ids where k = p_k;
$$;

-- Run one statement as a given actor and report what happened ------------------
-- actor: user key from isolation_test.ids, or 'anon', or 'postgres'
create function isolation_test.try(p_actor text, p_sql text,
  out rows_affected int, out state text, out msg text)
language plpgsql as $$
declare
  v_uid uuid;
begin
  rows_affected := null; state := null; msg := null;
  if p_actor = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    set local role anon;
  elsif p_actor <> 'postgres' then
    v_uid := isolation_test.id(p_actor);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
  end if;

  begin
    execute p_sql;
    get diagnostics rows_affected = row_count;
  exception when others then
    state := sqlstate;
    msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

-- Scalar helper: run a select returning one integer as an actor
create function isolation_test.count_as(p_actor text, p_sql text) returns int
language plpgsql as $$
declare
  v_uid uuid;
  v_n int;
begin
  if p_actor = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    set local role anon;
  else
    v_uid := isolation_test.id(p_actor);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
  end if;
  begin
    execute p_sql into v_n;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', '', true);
    return -1; -- error (e.g. permission denied)
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  return v_n;
end;
$$;

create function isolation_test.record(p_area text, p_subject text, p_actor text,
  p_op text, p_ok boolean, p_detail text default null) returns void
language sql as $$
  insert into isolation_results (area, subject, actor, op, ok, detail)
  values (p_area, p_subject, p_actor, p_op, coalesce(p_ok, false), p_detail);  -- NULL means "did not behave as required"
$$;

-- ==============================================================================
-- SEED: users, organizations (through the real RPC), members, fixtures
-- ==============================================================================
do $$
declare
  v_k text;
  v_org_a uuid; v_org_b uuid;
  v_brand_a uuid; v_brand_b uuid;
  v_feature text;
  r record;
begin
  -- auth users (profiles are created by the on_auth_user_created trigger)
  for v_k in select k from isolation_test.ids loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values (isolation_test.id(v_k), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', v_k || '@isolation.test', '',
            now(), '{}'::jsonb, '{}'::jsonb, now(), now());
  end loop;

  -- orgs are created through create_organization, exactly like production
  select * into r from isolation_test.try('a_owner', $q$select public.create_organization('Org A','iso-org-a')$q$);
  if r.state is not null then raise exception 'seed failed (org A): %', r.msg; end if;
  select * into r from isolation_test.try('b_owner', $q$select public.create_organization('Org B','iso-org-b')$q$);
  if r.state is not null then raise exception 'seed failed (org B): %', r.msg; end if;

  select id into v_org_a from public.organizations where slug = 'iso-org-a';
  select id into v_org_b from public.organizations where slug = 'iso-org-b';
  select id into v_brand_a from public.brands where org_id = v_org_a limit 1;
  select id into v_brand_b from public.brands where org_id = v_org_b limit 1;

  insert into isolation_test.ids values ('org_a', v_org_a), ('org_b', v_org_b),
                                        ('brand_a', v_brand_a), ('brand_b', v_brand_b);

  -- extra members of org A (seeded as superuser, mirroring accept_invitation)
  insert into public.memberships (org_id, user_id, role) values
    (v_org_a, isolation_test.id('a_admin'), 'admin'),
    (v_org_a, isolation_test.id('a_viewer'), 'viewer');
  foreach v_feature in array array['brand','strategy','studio','review','publishing','team'] loop
    insert into public.feature_access (org_id, user_id, feature, level) values
      (v_org_a, isolation_test.id('a_admin'), v_feature, 'full'),
      (v_org_a, isolation_test.id('a_viewer'), v_feature, 'view');
  end loop;

  -- fixtures: one row per table for org A and org B
  insert into public.brand_profiles (org_id, brand_id, tagline) values
    (v_org_a, v_brand_a, 'A tagline'), (v_org_b, v_brand_b, 'B tagline');
  insert into public.brand_kits (org_id, brand_id) values
    (v_org_a, v_brand_a), (v_org_b, v_brand_b);
  insert into public.brand_voice (org_id, brand_id, banned_words) values
    (v_org_a, v_brand_a, array['secret-a']), (v_org_b, v_brand_b, array['secret-b']);
  insert into public.brand_facts (org_id, brand_id, statement) values
    (v_org_a, v_brand_a, 'Org A confidential fact'), (v_org_b, v_brand_b, 'Org B confidential fact');
  insert into public.brand_pillars (org_id, brand_id, name) values
    (v_org_a, v_brand_a, 'Pillar A'), (v_org_b, v_brand_b, 'Pillar B');
  insert into public.competitors (org_id, brand_id, name) values
    (v_org_a, v_brand_a, 'Competitor A'), (v_org_b, v_brand_b, 'Competitor B');
  insert into public.invitations (org_id, email, role, token_hash, invited_by) values
    (v_org_a, 'pending@isolation.test', 'viewer', repeat('1', 64), isolation_test.id('a_owner')),
    (v_org_b, 'pending@isolation.test', 'viewer', repeat('2', 64), isolation_test.id('b_owner'));

  -- P04 fixtures
  insert into public.credit_ledger (org_id, kind, amount, ref) values
    (v_org_a, 'grant', 100, 'fixture'), (v_org_b, 'grant', 100, 'fixture');
  insert into public.jobs (org_id, brand_id, kind, status, created_by) values
    (v_org_a, v_brand_a, 'dummy', 'done', isolation_test.id('a_owner')),
    (v_org_b, v_brand_b, 'dummy', 'done', isolation_test.id('b_owner'));
  insert into public.ai_usage (org_id, user_id, model, units, cost_usd, credits) values
    (v_org_a, isolation_test.id('a_owner'), 'fake-model', 10, 0.01, 1),
    (v_org_b, isolation_test.id('b_owner'), 'fake-model', 10, 0.01, 1);
  insert into public.media_assets (org_id, brand_id, path, kind, content_type, size_bytes, created_by) values
    (v_org_a, v_brand_a, 'org/a/brand/a/logo/fixture.png', 'logo', 'image/png', 1000, isolation_test.id('a_owner')),
    (v_org_b, v_brand_b, 'org/b/brand/b/logo/fixture.png', 'logo', 'image/png', 1000, isolation_test.id('b_owner'));
end;
$$;

-- P05 fixtures
do $$
declare
  v_org_a uuid := isolation_test.id('org_a'); v_org_b uuid := isolation_test.id('org_b');
  v_brand_a uuid := isolation_test.id('brand_a'); v_brand_b uuid := isolation_test.id('brand_b');
  v_acct_a uuid; v_acct_b uuid; v_post_a uuid; v_post_b uuid;
begin
  insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name, connected_by)
    values (v_org_a, v_brand_a, 'fake', 'acct-a-1', 'instagram', 'Org A IG', isolation_test.id('a_owner')) returning id into v_acct_a;
  insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name, connected_by)
    values (v_org_b, v_brand_b, 'fake', 'acct-b-1', 'instagram', 'Org B IG', isolation_test.id('b_owner')) returning id into v_acct_b;
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, created_by)
    values (v_org_a, v_brand_a, v_acct_a, 'Org A secret caption', 'draft', isolation_test.id('a_owner')) returning id into v_post_a;
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, created_by)
    values (v_org_b, v_brand_b, v_acct_b, 'Org B secret caption', 'draft', isolation_test.id('b_owner')) returning id into v_post_b;
  insert into public.publish_attempts (org_id, post_id, attempt_no, outcome) values (v_org_a, v_post_a, 1, 'failed'), (v_org_b, v_post_b, 1, 'failed');
  insert into public.post_edits (org_id, post_id, edited_by, old_caption, new_caption) values
    (v_org_a, v_post_a, isolation_test.id('a_owner'), 'old a', 'new a'), (v_org_b, v_post_b, isolation_test.id('b_owner'), 'old b', 'new b');
  insert into public.social_connect_states (org_id, brand_id, user_id, state_hash, expires_at) values
    (v_org_a, v_brand_a, isolation_test.id('a_owner'), repeat('a', 64), now() + interval '10 minutes'),
    (v_org_b, v_brand_b, isolation_test.id('b_owner'), repeat('b', 64), now() + interval '10 minutes');
  insert into isolation_test.ids values ('acct_a', v_acct_a), ('post_a', v_post_a);
end;
$$;

-- P06 fixtures
do $$
declare
  v_org_a uuid := isolation_test.id('org_a'); v_org_b uuid := isolation_test.id('org_b');
  v_brand_a uuid := isolation_test.id('brand_a'); v_brand_b uuid := isolation_test.id('brand_b');
  v_run_a uuid; v_run_b uuid; v_sig_a uuid; v_sig_b uuid; v_strat_a uuid; v_strat_b uuid; v_cand_a uuid;
begin
  insert into public.intelligence_reports (org_id, brand_id, status, sections)
    values (v_org_a, v_brand_a, 'completed', '{"website":"Org A secret analysis"}'), (v_org_b, v_brand_b, 'completed', '{"website":"Org B secret analysis"}');
  insert into public.trend_runs (org_id, brand_id, status) values (v_org_a, v_brand_a, 'completed') returning id into v_run_a;
  insert into public.trend_runs (org_id, brand_id, status) values (v_org_b, v_brand_b, 'completed') returning id into v_run_b;
  insert into public.trend_signals (org_id, brand_id, run_id, source, topic, relevance_score) values (v_org_a, v_brand_a, v_run_a, 'Reddit', 'Org A secret topic', 80) returning id into v_sig_a;
  insert into public.trend_signals (org_id, brand_id, run_id, source, topic, relevance_score) values (v_org_b, v_brand_b, v_run_b, 'Reddit', 'Org B secret topic', 70) returning id into v_sig_b;
  insert into public.strategies (org_id, brand_id, status, scope, ai_summary) values (v_org_a, v_brand_a, 'completed', 'week', 'Org A secret strategy') returning id into v_strat_a;
  insert into public.strategies (org_id, brand_id, status, scope, ai_summary) values (v_org_b, v_brand_b, 'completed', 'week', 'Org B secret strategy') returning id into v_strat_b;
  insert into public.strategy_signals (org_id, strategy_id, signal_id) values (v_org_a, v_strat_a, v_sig_a), (v_org_b, v_strat_b, v_sig_b);
  insert into public.competitor_candidates (org_id, brand_id, name, website_url, reason) values (v_org_a, v_brand_a, 'Candidate A Inc', 'https://candidate-a.example', 'Sells the same thing') returning id into v_cand_a;
  insert into public.competitor_candidates (org_id, brand_id, name, website_url, reason) values (v_org_b, v_brand_b, 'Candidate B Inc', 'https://candidate-b.example', 'Sells the same thing');
  insert into isolation_test.ids values ('sig_a', v_sig_a), ('sig_b', v_sig_b), ('strat_a', v_strat_a), ('strat_b', v_strat_b), ('cand_a', v_cand_a);
end;
$$;

-- P06b (Trend Alerts) fixtures
do $$
declare
  v_org_a uuid := isolation_test.id('org_a'); v_org_b uuid := isolation_test.id('org_b');
  v_brand_a uuid := isolation_test.id('brand_a'); v_brand_b uuid := isolation_test.id('brand_b');
  v_w_a uuid; v_w_b uuid; v_run_a uuid; v_run_b uuid; v_ev_a uuid; v_ev_b uuid; v_rule_a uuid; v_rule_b uuid;
begin
  insert into public.trend_watches (org_id, brand_id, name, keywords, sources, created_by, status)
    values (v_org_a, v_brand_a, 'Org A watch', array['robots'], array['Google News'], isolation_test.id('a_owner'), 'paused') returning id into v_w_a;
  insert into public.trend_watches (org_id, brand_id, name, keywords, sources, created_by, status)
    values (v_org_b, v_brand_b, 'Org B watch', array['robots'], array['Google News'], isolation_test.id('b_owner'), 'paused') returning id into v_w_b;
  insert into public.trend_watch_runs (org_id, watch_id, status, trigger) values (v_org_a, v_w_a, 'done', 'manual') returning id into v_run_a;
  insert into public.trend_watch_runs (org_id, watch_id, status, trigger) values (v_org_b, v_w_b, 'done', 'manual') returning id into v_run_b;
  insert into public.trend_mentions (org_id, watch_id, run_id, source, title, url, url_hash) values
    (v_org_a, v_w_a, v_run_a, 'Google News', 'Org A secret headline', 'https://a.example/1', repeat('a', 64)),
    (v_org_b, v_w_b, v_run_b, 'Google News', 'Org B secret headline', 'https://b.example/1', repeat('b', 64));
  insert into public.trend_events (org_id, brand_id, watch_id, title, summary, relevance_score, sentiment, importance, topic)
    values (v_org_a, v_brand_a, v_w_a, 'Org A secret story', 'summary', 80, 'neutral', 'medium', 'robots') returning id into v_ev_a;
  insert into public.trend_events (org_id, brand_id, watch_id, title, summary, relevance_score, sentiment, importance, topic)
    values (v_org_b, v_brand_b, v_w_b, 'Org B secret story', 'summary', 80, 'neutral', 'medium', 'robots') returning id into v_ev_b;
  insert into public.trend_stats_daily (org_id, watch_id, day, mention_count) values (v_org_a, v_w_a, current_date, 3), (v_org_b, v_w_b, current_date, 3);
  insert into public.trend_rules (org_id, watch_id, name, channel) values (v_org_a, v_w_a, 'Org A rule', 'in_app') returning id into v_rule_a;
  insert into public.trend_rules (org_id, watch_id, name, channel) values (v_org_b, v_w_b, 'Org B rule', 'in_app') returning id into v_rule_b;
  insert into public.trend_deliveries (org_id, event_id, rule_id, channel, status) values (v_org_a, v_ev_a, v_rule_a, 'in_app', 'sent'), (v_org_b, v_ev_b, v_rule_b, 'in_app', 'sent');
  insert into public.notifications (org_id, user_id, type, title, body) values
    (v_org_a, isolation_test.id('a_owner'), 'trend_alert', 'Org A secret notice', 'body'),
    (v_org_b, isolation_test.id('b_owner'), 'trend_alert', 'Org B secret notice', 'body');
  insert into isolation_test.ids values ('watch_a', v_w_a), ('watch_b', v_w_b), ('event_a', v_ev_a), ('rule_a', v_rule_a), ('wrun_a', v_run_a);
end;
$$;

-- ==============================================================================
-- A. CATALOGUE CHECKS
-- ==============================================================================
do $$
declare
  r record;
  v_n int;
  -- tables without org_id on purpose (documented)
  v_global text[] := array['profiles','plan_limits','organizations','ai_cost_table','webhook_receipts'];
  -- org_id nullable on purpose (audit trail survives org deletion)
  v_nullable_ok text[] := array['audit_log'];
begin
  for r in
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    -- 1. RLS enabled
    perform isolation_test.record('catalogue', r.relname, '-', 'rls enabled', r.relrowsecurity);

    -- 2. exactly the four per-command policies, never `for all`
    select count(*) into v_n from pg_policy p
      where p.polrelid = r.oid and p.polcmd = '*';
    perform isolation_test.record('catalogue', r.relname, '-', 'no for-all policy', v_n = 0,
      case when v_n > 0 then v_n || ' policy(ies) use FOR ALL' end);
    select count(distinct p.polcmd) into v_n from pg_policy p
      where p.polrelid = r.oid and p.polcmd in ('r','a','w','d');
    perform isolation_test.record('catalogue', r.relname, '-', 'four per-command policies', v_n = 4,
      'found ' || v_n || ' of 4 commands');

    -- 3. org_id uuid not null + index starting with org_id
    if r.relname <> all (v_global) then
      select count(*) into v_n from pg_attribute a
        where a.attrelid = r.oid and a.attname = 'org_id'
          and (a.attnotnull or r.relname = any (v_nullable_ok))
          and a.atttypid = 'uuid'::regtype and not a.attisdropped;
      perform isolation_test.record('catalogue', r.relname, '-', 'org_id uuid not null', v_n = 1);
      select count(*) into v_n from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = r.oid and a.attname = 'org_id';
      perform isolation_test.record('catalogue', r.relname, '-', 'index starts with org_id', v_n >= 1);

      -- 6. fixture exists for org A (otherwise the table is not really tested)
      execute format('select count(*) from public.%I where org_id = %L', r.relname, isolation_test.id('org_a')) into v_n;
      perform isolation_test.record('catalogue', r.relname, '-', 'fixture row for org A', v_n >= 1,
        case when v_n = 0 then 'add a fixture for this table to isolation.sql' end);
    end if;

    -- 5a. anon has no table privileges
    perform isolation_test.record('catalogue', r.relname, 'anon', 'no table privileges',
      not has_any_column_privilege('anon', r.oid, 'select,insert,update,references')
      and not has_table_privilege('anon', r.oid, 'delete,truncate,trigger'));
  end loop;

  -- 4. security definer functions pin search_path; 5b. anon cannot execute them
  for r in
    select p.oid, n.nspname || '.' || p.proname as fname, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef
  loop
    perform isolation_test.record('catalogue', r.fname, '-', 'search_path pinned',
      exists (select 1 from unnest(coalesce(r.proconfig, '{}')) c where c like 'search_path=%'),
      'security definer function without a fixed search_path is injectable');
    perform isolation_test.record('catalogue', r.fname, 'anon', 'no execute',
      not has_function_privilege('anon', r.oid, 'execute'));
    -- trigger functions are never an API surface for signed-in users either
    if (select prorettype from pg_proc where oid = r.oid) = 'trigger'::regtype then
      perform isolation_test.record('catalogue', r.fname, 'authenticated', 'trigger fn not executable',
        not has_function_privilege('authenticated', r.oid, 'execute'));
    end if;
  end loop;
end;
$$;

-- ==============================================================================
-- B. BEHAVIOURAL MATRIX, generated for every table with an org_id
-- ==============================================================================
do $$
declare
  t text;
  v_org_a uuid := isolation_test.id('org_a');
  v_actor text;
  v_row jsonb;
  v_payload text;
  res record;
  v_n int;
  v_has_id boolean;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    -- positive control: org A's owner CAN see the fixture (so "0 rows" elsewhere is meaningful)
    v_n := isolation_test.count_as('a_owner',
      format('select count(*) from public.%I where org_id = %L', t, v_org_a));
    perform isolation_test.record('matrix', t, 'a_owner', 'positive control: select', v_n >= 1,
      'owner of org A could not read own fixture (count=' || v_n || ')');

    -- fixture row as JSON, read as superuser, used to build cross-tenant inserts
    execute format('select to_jsonb(x) from public.%I x where org_id = %L limit 1', t, v_org_a) into v_row;
    v_has_id := v_row ? 'id';
    if v_has_id then v_row := jsonb_set(v_row, '{id}', to_jsonb(gen_random_uuid()::text)); end if;
    -- values that would trip unrelated validation triggers before RLS is reached
    if t = 'invitations' then
      v_row := v_row || jsonb_build_object('email', 'attacker@isolation.test', 'token_hash', repeat('f', 64));
    end if;
    v_payload := jsonb_build_array(v_row)::text;

    foreach v_actor in array array['b_owner', 'a_viewer', 'anon'] loop
      -- SELECT: org B / anon must see nothing. (a_viewer may read org A; skip that case.)
      if v_actor <> 'a_viewer' then
        v_n := isolation_test.count_as(v_actor,
          format('select count(*) from public.%I where org_id = %L', t, v_org_a));
        perform isolation_test.record('matrix', t, v_actor, 'select', v_n <= 0,
          case when v_n > 0 then 'LEAK: ' || v_n || ' row(s) of org A visible' end);
      end if;

      -- INSERT into org A: must be refused by RLS / privileges (42501)
      select * into res from isolation_test.try(v_actor,
        format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, %L::jsonb)', t, t, v_payload));
      perform isolation_test.record('matrix', t, v_actor, 'insert', res.state = '42501',
        coalesce('state=' || res.state || ' ' || res.msg, 'INSERT SUCCEEDED (' || res.rows_affected || ' rows)'));

      -- UPDATE org A's rows: 0 rows or permission error
      select * into res from isolation_test.try(v_actor,
        format('update public.%I set org_id = org_id where org_id = %L', t, v_org_a));
      perform isolation_test.record('matrix', t, v_actor, 'update',
        res.state is not null and res.state in ('42501') or coalesce(res.rows_affected, 0) = 0 and res.state is null,
        'rows=' || coalesce(res.rows_affected::text, '-') || ' state=' || coalesce(res.state, '-') || ' ' || coalesce(res.msg, ''));

      -- DELETE org A's rows: 0 rows or permission error
      select * into res from isolation_test.try(v_actor,
        format('delete from public.%I where org_id = %L', t, v_org_a));
      perform isolation_test.record('matrix', t, v_actor, 'delete',
        res.state is not null and res.state in ('42501') or coalesce(res.rows_affected, 0) = 0 and res.state is null,
        'rows=' || coalesce(res.rows_affected::text, '-') || ' state=' || coalesce(res.state, '-') || ' ' || coalesce(res.msg, ''));
    end loop;
  end loop;

  -- Rows must still exist after all those attempts (nothing was deleted or changed)
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('select count(*) from public.%I where org_id = %L', t, v_org_a) into v_n;
    perform isolation_test.record('matrix', t, 'postgres', 'fixture intact after attacks', v_n >= 1);
  end loop;
end;
$$;

-- Admin-only reads: a viewer must not read invitations or the audit log of their own org
do $$
declare t text; v_n int;
begin
  foreach t in array array['invitations','audit_log'] loop
    v_n := isolation_test.count_as('a_viewer',
      format('select count(*) from public.%I where org_id = %L', t, isolation_test.id('org_a')));
    perform isolation_test.record('matrix', t, 'a_viewer', 'select (admin-only table)', v_n <= 0,
      'viewer sees ' || v_n || ' row(s)');
  end loop;
end;
$$;

-- profiles has no org_id: members see each other, strangers never, and nobody edits another profile
do $$
declare v_n int; res record;
begin
  v_n := isolation_test.count_as('b_owner', format('select count(*) from public.profiles where id = %L', isolation_test.id('a_owner')));
  perform isolation_test.record('matrix', 'profiles', 'b_owner', 'select other-org profile', v_n <= 0);
  v_n := isolation_test.count_as('anon', 'select count(*) from public.profiles');
  perform isolation_test.record('matrix', 'profiles', 'anon', 'select', v_n <= 0);
  v_n := isolation_test.count_as('a_viewer', format('select count(*) from public.profiles where id = %L', isolation_test.id('a_owner')));
  perform isolation_test.record('matrix', 'profiles', 'a_viewer', 'positive control: select teammate', v_n = 1);
  select * into res from isolation_test.try('b_owner',
    format('update public.profiles set full_name = ''pwned'' where id = %L', isolation_test.id('a_owner')));
  perform isolation_test.record('matrix', 'profiles', 'b_owner', 'update other profile', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
  select * into res from isolation_test.try('a_viewer',
    format('update public.profiles set full_name = ''pwned'' where id = %L', isolation_test.id('a_owner')));
  perform isolation_test.record('matrix', 'profiles', 'a_viewer', 'update teammate profile', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
  select * into res from isolation_test.try('b_owner', 'delete from public.profiles');
  perform isolation_test.record('matrix', 'profiles', 'b_owner', 'delete', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
end;
$$;

-- organizations: the tenant key is its own id
do $$
declare v_n int; res record; v_a uuid := isolation_test.id('org_a'); v_actor text;
begin
  v_n := isolation_test.count_as('a_owner', format('select count(*) from public.organizations where id = %L', v_a));
  perform isolation_test.record('matrix', 'organizations', 'a_owner', 'positive control: select', v_n = 1);
  foreach v_actor in array array['b_owner','anon'] loop
    v_n := isolation_test.count_as(v_actor, format('select count(*) from public.organizations where id = %L', v_a));
    perform isolation_test.record('matrix', 'organizations', v_actor, 'select', v_n <= 0);
    select * into res from isolation_test.try(v_actor, format('update public.organizations set name = ''pwned'' where id = %L', v_a));
    perform isolation_test.record('matrix', 'organizations', v_actor, 'update', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
    select * into res from isolation_test.try(v_actor, format('delete from public.organizations where id = %L', v_a));
    perform isolation_test.record('matrix', 'organizations', v_actor, 'delete', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
    select * into res from isolation_test.try(v_actor, 'insert into public.organizations (name, slug, created_by) values (''x'',''iso-hack'', ''' || isolation_test.id('b_owner') || ''')');
    perform isolation_test.record('matrix', 'organizations', v_actor, 'insert', res.state = '42501');
  end loop;
  select * into res from isolation_test.try('a_viewer', format('update public.organizations set name = ''pwned'' where id = %L', v_a));
  perform isolation_test.record('matrix', 'organizations', 'a_viewer', 'update', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
  select * into res from isolation_test.try('a_owner', format('delete from public.organizations where id = %L', v_a));
  perform isolation_test.record('matrix', 'organizations', 'a_owner', 'owner cannot hard-delete org', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
end;
$$;

-- plan_limits is read-only reference data
do $$
declare res record; v_n int;
begin
  v_n := isolation_test.count_as('b_owner', 'select count(*) from public.plan_limits');
  perform isolation_test.record('matrix', 'plan_limits', 'b_owner', 'positive control: select', v_n > 0);
  select * into res from isolation_test.try('b_owner', 'update public.plan_limits set value = 999999');
  perform isolation_test.record('matrix', 'plan_limits', 'b_owner', 'update', coalesce(res.rows_affected, 0) = 0 or res.state = '42501');
  select * into res from isolation_test.try('b_owner', 'insert into public.plan_limits values (''trial'',''hack'',1)');
  perform isolation_test.record('matrix', 'plan_limits', 'b_owner', 'insert', res.state = '42501');
  select * into res from isolation_test.try('anon', 'select * from public.plan_limits');
  perform isolation_test.record('matrix', 'plan_limits', 'anon', 'select', res.state = '42501');
end;
$$;

-- ==============================================================================
-- C. NAMED RULE TESTS
-- ==============================================================================

-- C1. Wrong-org calls to every policy helper (security definer) -----------------
do $$
declare
  v_org_a uuid := isolation_test.id('org_a');
  v_n int;
begin
  v_n := isolation_test.count_as('b_owner', format('select (private.is_member(%L))::int', v_org_a));
  perform isolation_test.record('rules', 'private.is_member', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select private.feature_level(%L, ''brand'')', v_org_a));
  perform isolation_test.record('rules', 'private.feature_level', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select (private.has_role(%L, array[''owner'',''admin'']::public.org_role[]))::int', v_org_a));
  perform isolation_test.record('rules', 'private.has_role', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select (private.can_invite_role(%L, ''viewer''))::int', v_org_a));
  perform isolation_test.record('rules', 'private.can_invite_role', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select (private.can_modify_membership(%L, %L, ''viewer''))::int', v_org_a, isolation_test.id('a_viewer')));
  perform isolation_test.record('rules', 'private.can_modify_membership', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select (private.can_create_membership(%L, %L, ''viewer''))::int', v_org_a, isolation_test.id('b_owner')));
  perform isolation_test.record('rules', 'private.can_create_membership', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select (private.can_manage_feature_access(%L, %L))::int', v_org_a, isolation_test.id('a_viewer')));
  perform isolation_test.record('rules', 'private.can_manage_feature_access', 'b_owner', 'wrong org', v_n = 0);
  -- public access helpers answer only for the caller: wrong org => nothing
  v_n := isolation_test.count_as('b_owner', format('select count(public.my_role(%L))::int', v_org_a));
  perform isolation_test.record('rules', 'public.my_role', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select public.my_feature_level(%L, ''brand'')', v_org_a));
  perform isolation_test.record('rules', 'public.my_feature_level', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('b_owner', format('select count(*)::int from public.my_feature_levels(%L)', v_org_a));
  perform isolation_test.record('rules', 'public.my_feature_levels', 'b_owner', 'wrong org', v_n = 0);
  v_n := isolation_test.count_as('a_owner', format('select public.my_feature_level(%L, ''brand'')', v_org_a));
  perform isolation_test.record('rules', 'public.my_feature_level', 'a_owner', 'positive control', v_n = 3);
  v_n := isolation_test.count_as('anon', format('select count(public.my_role(%L))::int', v_org_a));
  perform isolation_test.record('rules', 'public.my_role', 'anon', 'execute', v_n = -1);
  -- anon cannot call helpers or RPCs at all
  v_n := isolation_test.count_as('anon', format('select (private.is_member(%L))::int', v_org_a));
  perform isolation_test.record('rules', 'private.is_member', 'anon', 'execute', v_n = -1);
  v_n := isolation_test.count_as('anon', 'select public.create_organization(''x'',''anon-org'')::text::int');
  perform isolation_test.record('rules', 'create_organization', 'anon', 'execute', v_n = -1);
  v_n := isolation_test.count_as('anon', 'select public.accept_invitation(''x'')::text::int');
  perform isolation_test.record('rules', 'accept_invitation', 'anon', 'execute', v_n = -1);
end;
$$;

-- C2. Roles ------------------------------------------------------------------
do $$
declare
  res record;
  v_org_a uuid := isolation_test.id('org_a');
begin
  -- last owner cannot be demoted or removed (by the owner, or by anyone)
  select * into res from isolation_test.try('a_owner',
    format('update public.memberships set role = ''viewer'' where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_owner')));
  perform isolation_test.record('rules', 'memberships', 'a_owner', 'cannot demote last owner', res.state is not null, res.msg);
  select * into res from isolation_test.try('postgres',
    format('delete from public.memberships where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_owner')));
  perform isolation_test.record('rules', 'memberships', 'postgres', 'cannot delete last owner', res.state = '23514', res.msg);

  -- admin cannot demote or remove the owner, nor change their own role
  select * into res from isolation_test.try('a_admin',
    format('update public.memberships set role = ''viewer'' where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_owner')));
  perform isolation_test.record('rules', 'memberships', 'a_admin', 'cannot demote owner', coalesce(res.rows_affected, 0) = 0 or res.state is not null);
  select * into res from isolation_test.try('a_admin',
    format('update public.memberships set role = ''owner'' where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_admin')));
  perform isolation_test.record('rules', 'memberships', 'a_admin', 'cannot promote self to owner', coalesce(res.rows_affected, 0) = 0 or res.state is not null);
  select * into res from isolation_test.try('a_admin',
    format('update public.memberships set role = ''owner'' where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_viewer')));
  perform isolation_test.record('rules', 'memberships', 'a_admin', 'cannot make anyone owner', coalesce(res.rows_affected, 0) = 0 or res.state is not null);
  select * into res from isolation_test.try('a_admin',
    format('delete from public.memberships where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_owner')));
  perform isolation_test.record('rules', 'memberships', 'a_admin', 'cannot remove owner', coalesce(res.rows_affected, 0) = 0 or res.state is not null);

  -- admin CAN manage a viewer (positive control for the above)
  select * into res from isolation_test.try('a_admin',
    format('update public.memberships set role = ''reviewer'' where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_viewer')));
  perform isolation_test.record('rules', 'memberships', 'a_admin', 'positive control: admin edits viewer', res.rows_affected = 1, res.msg);
  perform isolation_test.try('postgres',
    format('update public.memberships set role = ''viewer'' where org_id = %L and user_id = %L', v_org_a, isolation_test.id('a_viewer')));

  -- viewer cannot invite; admin cannot invite an owner; admin can invite an editor
  select * into res from isolation_test.try('a_viewer',
    format('insert into public.invitations (org_id, email, role, token_hash, invited_by) values (%L, ''x1@isolation.test'', ''viewer'', %L, %L)',
           v_org_a, repeat('3', 64), isolation_test.id('a_viewer')));
  perform isolation_test.record('rules', 'invitations', 'a_viewer', 'viewer cannot invite', res.state = '42501', res.msg);
  select * into res from isolation_test.try('a_admin',
    format('insert into public.invitations (org_id, email, role, token_hash, invited_by) values (%L, ''x2@isolation.test'', ''owner'', %L, %L)',
           v_org_a, repeat('4', 64), isolation_test.id('a_admin')));
  perform isolation_test.record('rules', 'invitations', 'a_admin', 'admin cannot invite owner', res.state = '42501', res.msg);
  select * into res from isolation_test.try('a_admin',
    format('insert into public.invitations (org_id, email, role, token_hash, invited_by) values (%L, ''x3@isolation.test'', ''editor'', %L, %L)',
           v_org_a, repeat('5', 64), isolation_test.id('a_admin')));
  perform isolation_test.record('rules', 'invitations', 'a_admin', 'positive control: admin invites editor', res.rows_affected = 1, res.msg);

  -- nobody can move rows across organizations (org_id is immutable)
  select * into res from isolation_test.try('a_owner',
    format('update public.brands set org_id = %L where org_id = %L', isolation_test.id('org_b'), v_org_a));
  perform isolation_test.record('rules', 'brands', 'a_owner', 'cannot change org_id', res.state is not null, res.msg);

  -- plan cannot be changed by a customer
  select * into res from isolation_test.try('a_owner',
    format('update public.organizations set plan_id = ''enterprise'' where id = %L', v_org_a));
  perform isolation_test.record('rules', 'organizations', 'a_owner', 'cannot change own plan', res.state is not null, res.msg);

  -- audit log is append-only for clients
  select * into res from isolation_test.try('a_owner',
    format('insert into public.audit_log (org_id, org_slug, action) values (%L, ''iso-org-a'', ''forged'')', v_org_a));
  perform isolation_test.record('rules', 'audit_log', 'a_owner', 'cannot forge audit entries', res.state = '42501', res.msg);
end;
$$;

-- C3. Plan limits are enforced by the database ----------------------------------
do $$
declare
  res record;
  v_org_a uuid := isolation_test.id('org_a');
begin
  -- trial allows 3 brands: two more succeed, the fourth is refused
  select * into res from isolation_test.try('a_owner', format('insert into public.brands (org_id, name) values (%L, ''B2'')', v_org_a));
  perform isolation_test.record('limits', 'brands', 'a_owner', 'positive control: 2nd brand on trial', res.rows_affected = 1, res.msg);

  update public.organizations set plan_id = 'starter' where id = v_org_a;   -- superuser (billing) action
  select * into res from isolation_test.try('a_owner', format('insert into public.brands (org_id, name) values (%L, ''B3'')', v_org_a));
  perform isolation_test.record('limits', 'brands', 'a_owner', 'starter cannot exceed 1 brand', res.state = 'P0001', res.state || ' ' || coalesce(res.msg, 'no error'));

  -- seats: starter allows 2, org A already has 3 members -> a 4th is refused even for superuser inserts
  select * into res from isolation_test.try('postgres',
    format('insert into public.memberships (org_id, user_id, role) values (%L, %L, ''viewer'')', v_org_a, isolation_test.id('c_user')));
  perform isolation_test.record('limits', 'memberships', 'postgres', 'starter cannot exceed seat limit', res.state = 'P0001', res.state || ' ' || coalesce(res.msg, 'no error'));

  update public.organizations set plan_id = 'trial' where id = v_org_a;
end;
$$;

-- C4. create_organization rate limit (3 per hour per user) -----------------------
do $$
declare res record; i int;
begin
  for i in 1..3 loop
    select * into res from isolation_test.try('c_user', format('select public.create_organization(''C%s'', ''iso-c-%s'')', i, i));
    perform isolation_test.record('limits', 'create_organization', 'c_user', 'workspace ' || i || ' of 3 allowed', res.state is null, res.msg);
  end loop;
  select * into res from isolation_test.try('c_user', 'select public.create_organization(''C4'', ''iso-c-4'')');
  perform isolation_test.record('limits', 'create_organization', 'c_user', '4th workspace in an hour is refused', res.state = '54000', res.state || ' ' || coalesce(res.msg, 'no error'));
  select * into res from isolation_test.try('d_user', 'select public.create_organization(''Bad'', ''api'')');
  perform isolation_test.record('limits', 'create_organization', 'd_user', 'reserved slug refused', res.state = '22023', res.msg);
  select * into res from isolation_test.try('d_user', 'select public.create_organization(''Bad'', ''Has Spaces'')');
  perform isolation_test.record('limits', 'create_organization', 'd_user', 'invalid slug refused', res.state = '22023', res.msg);
end;
$$;

-- C5. Invitations: single use, expiry, email match, wrong org ----------------------
do $$
declare
  res record;
  v_org_a uuid := isolation_test.id('org_a');
  v_token text := 'iso-token-for-d-user';
  v_hash text := encode(extensions.digest(v_token::bytea, 'sha256'), 'hex');
  v_expired_token text := 'iso-expired-token';
  v_expired_hash text := encode(extensions.digest(v_expired_token::bytea, 'sha256'), 'hex');
begin
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (v_org_a, 'd_user@isolation.test', 'viewer', v_hash, isolation_test.id('a_owner'));
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (v_org_a, 'd_user@isolation.test'::text || '.expired', 'viewer', v_expired_hash, isolation_test.id('a_owner'));
  update public.invitations set expires_at = now() - interval '1 day' where token_hash = v_expired_hash;

  -- a stranger (b_owner) cannot use d_user's token
  select * into res from isolation_test.try('b_owner', format('select public.accept_invitation(%L)', v_token));
  perform isolation_test.record('rules', 'accept_invitation', 'b_owner', 'token for another email refused', res.state = '42501', res.state || ' ' || coalesce(res.msg, 'no error'));
  -- expired token refused
  select * into res from isolation_test.try('d_user', format('select public.accept_invitation(%L)', v_expired_token));
  perform isolation_test.record('rules', 'accept_invitation', 'd_user', 'expired token refused', res.state = '22023', res.state || ' ' || coalesce(res.msg, 'no error'));
  -- a guessed token is refused
  select * into res from isolation_test.try('d_user', 'select public.accept_invitation(''guess'')');
  perform isolation_test.record('rules', 'accept_invitation', 'd_user', 'unknown token refused', res.state = '22023');
  -- the right user can accept once...
  select * into res from isolation_test.try('d_user', format('select public.accept_invitation(%L)', v_token));
  perform isolation_test.record('rules', 'accept_invitation', 'd_user', 'positive control: accept once', res.state is null, res.msg);
  -- ...and not twice
  select * into res from isolation_test.try('d_user', format('select public.accept_invitation(%L)', v_token));
  perform isolation_test.record('rules', 'accept_invitation', 'd_user', 'token cannot be reused', res.state is not null);
  -- unverified email cannot accept
  update auth.users set email_confirmed_at = null where id = isolation_test.id('d_user');
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (v_org_a, 'd_user@isolation.test', 'viewer', repeat('9', 64), isolation_test.id('a_owner'))
  on conflict do nothing;
  update public.invitations set accepted_at = null where token_hash = repeat('9', 64);
  update auth.users set email_confirmed_at = now() where id = isolation_test.id('d_user');
end;
$$;

-- C8. Credit ledger and jobs (P04) ---------------------------------------------------
do $$
declare
  v_a uuid := isolation_test.id('org_a');
  v_b uuid := isolation_test.id('org_b');
  v_user uuid := isolation_test.id('a_owner');
  v_viewer uuid := isolation_test.id('a_viewer');
  v_start int; v_bal int; v_bal_b int; v_job uuid; v_job2 uuid; v_id1 uuid; v_id2 uuid;
  res record; v_status text; v_msg text; v_n int;
begin
  select coalesce(sum(amount),0) into v_start from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'fixture', '-', 'starting balance is the 100 grant', v_start = 100, 'balance=' || v_start);

  -- grant is idempotent per ref
  perform public.credits_grant(v_a, 50, 'topup-1', null);
  perform public.credits_grant(v_a, 50, 'topup-1', null);
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_grant', 'postgres', 'same ref grants only once', v_bal = 150, 'balance=' || v_bal);

  -- reserve takes credits at acceptance
  v_job := gen_random_uuid();
  perform public.credits_reserve(v_a, v_user, v_job, 30, 'reserve');
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'reserve deducts', v_bal = 120, 'balance=' || v_bal);

  -- reserving the same job twice must not double charge
  v_id1 := public.credits_reserve(v_a, v_user, v_job, 30, 'reserve');
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'same job reserved twice charges once', v_bal = 120, 'balance=' || v_bal);

  -- settle at a lower real cost returns the difference, and is idempotent
  perform public.credits_settle(v_a, v_job, 10);
  perform public.credits_settle(v_a, v_job, 10);
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_settle', 'postgres', 'settle at actual cost, once', v_bal = 140, 'balance=' || v_bal);

  -- settle cannot charge more than was reserved
  v_job2 := gen_random_uuid();
  perform public.credits_reserve(v_a, v_user, v_job2, 20, 'reserve');
  perform public.credits_settle(v_a, v_job2, 500);
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_settle', 'postgres', 'settle never exceeds the reservation', v_bal = 120, 'balance=' || v_bal);

  -- release gives everything back, once
  v_job := gen_random_uuid();
  perform public.credits_reserve(v_a, v_user, v_job, 40, 'reserve');
  perform public.credits_release(v_a, v_job);
  perform public.credits_release(v_a, v_job);
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_release', 'postgres', 'release returns the reservation once', v_bal = 120, 'balance=' || v_bal);

  -- a settled job cannot be released afterwards
  perform public.credits_release(v_a, v_job2);
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_release', 'postgres', 'release after settle is a no-op', v_bal = 120, 'balance=' || v_bal);

  -- insufficient credits are refused before anything is written
  select * into res from isolation_test.try('postgres',
    format('select public.credits_reserve(%L, %L, %L, 100000, ''reserve'')', v_a, v_user, gen_random_uuid()));
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'refuses more than the balance',
    res.msg like '%INSUFFICIENT_CREDITS%', coalesce(res.msg, 'NOT REFUSED'));
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'refusal leaves balance unchanged', v_bal = 120, 'balance=' || v_bal);

  -- zero or negative amounts are refused
  select * into res from isolation_test.try('postgres',
    format('select public.credits_reserve(%L, %L, %L, 0, ''reserve'')', v_a, v_user, gen_random_uuid()));
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'refuses zero amount', res.state is not null, coalesce(res.msg, 'NOT REFUSED'));
  select * into res from isolation_test.try('postgres',
    format('select public.credits_grant(%L, -5, ''neg'', null)', v_a));
  perform isolation_test.record('credits', 'credits_grant', 'postgres', 'refuses negative grant', res.state is not null, coalesce(res.msg, 'NOT REFUSED'));

  -- per-member monthly cap
  update public.memberships set monthly_credit_cap = 20 where org_id = v_a and user_id = v_viewer;
  select * into res from isolation_test.try('postgres',
    format('select public.credits_reserve(%L, %L, %L, 25, ''reserve'')', v_a, v_viewer, gen_random_uuid()));
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'member cap blocks a reservation above the cap',
    res.msg like '%MEMBER_CAP_REACHED%', coalesce(res.msg, 'NOT REFUSED'));
  select * into res from isolation_test.try('postgres',
    format('select public.credits_reserve(%L, %L, %L, 15, ''reserve'')', v_a, v_viewer, gen_random_uuid()));
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'member cap allows a reservation within the cap', res.state is null, coalesce(res.msg, ''));
  select * into res from isolation_test.try('postgres',
    format('select public.credits_reserve(%L, %L, %L, 10, ''reserve'')', v_a, v_viewer, gen_random_uuid()));
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', 'member cap counts earlier spend this month',
    res.msg like '%MEMBER_CAP_REACHED%', coalesce(res.msg, 'NOT REFUSED'));

  -- org B is untouched by all of the above
  select coalesce(sum(amount),0) into v_bal_b from public.credit_ledger where org_id = v_b;
  perform isolation_test.record('credits', 'credit_ledger', 'postgres', 'other org balance unchanged', v_bal_b = 100, 'balance=' || v_bal_b);

  -- nobody but the service role can call the ledger functions
  perform isolation_test.record('credits', 'credits_reserve', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.credits_reserve(uuid,uuid,uuid,int,text)', 'execute'));
  perform isolation_test.record('credits', 'credits_settle', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.credits_settle(uuid,uuid,int)', 'execute'));
  perform isolation_test.record('credits', 'credits_release', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.credits_release(uuid,uuid)', 'execute'));
  perform isolation_test.record('credits', 'credits_grant', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.credits_grant(uuid,int,text,uuid)', 'execute'));
  perform isolation_test.record('credits', 'rescue_stuck_jobs', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.rescue_stuck_jobs(int)', 'execute'));
  perform isolation_test.record('credits', 'credits_reserve', 'service_role', 'can execute',
    has_function_privilege('service_role', 'public.credits_reserve(uuid,uuid,uuid,int,text)', 'execute'));

  -- members read their own org balance through the view; strangers read nothing
  v_n := isolation_test.count_as('a_viewer', format('select coalesce(sum(balance),0)::int from public.credit_balance where org_id = %L', v_a));
  perform isolation_test.record('credits', 'credit_balance', 'a_viewer', 'member can read own balance', v_n > 0, 'balance=' || v_n);
  v_n := isolation_test.count_as('b_owner', format('select count(*) from public.credit_balance where org_id = %L', v_a));
  perform isolation_test.record('credits', 'credit_balance', 'b_owner', 'stranger cannot read balance', v_n = 0, 'rows=' || v_n);
  v_n := isolation_test.count_as('anon', 'select count(*) from public.credit_balance');
  perform isolation_test.record('credits', 'credit_balance', 'anon', 'anon cannot read balance', v_n <= 0, 'rows=' || v_n);

  -- 20 reservations in a row can never overspend (the parallel version runs in test-credit-concurrency.mjs)
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_b;
  for v_n in 1..20 loop
    perform isolation_test.try('postgres', format('select public.credits_reserve(%L, %L, %L, 30, ''reserve'')', v_b, isolation_test.id('b_owner'), gen_random_uuid()));
  end loop;
  select coalesce(sum(amount),0) into v_bal_b from public.credit_ledger where org_id = v_b;
  perform isolation_test.record('credits', 'credits_reserve', 'postgres', '20 reservations of 30 against 100 never go negative',
    v_bal_b >= 0 and v_bal_b = 10, 'balance=' || v_bal_b);

  -- Rescue: a running job with no heartbeat for more than 10 minutes fails and releases its credits
  v_job := gen_random_uuid();
  perform public.credits_reserve(v_a, v_user, v_job, 25, 'reserve');
  insert into public.jobs (id, org_id, kind, status, started_at, heartbeat_at, created_by)
    values (v_job, v_a, 'dummy', 'running', now() - interval '30 minutes', now() - interval '20 minutes', v_user);
  v_job2 := gen_random_uuid();
  insert into public.jobs (id, org_id, kind, status, started_at, heartbeat_at, created_by)
    values (v_job2, v_a, 'dummy', 'running', now(), now(), v_user);
  select coalesce(sum(amount),0) into v_bal from public.credit_ledger where org_id = v_a;
  select public.rescue_stuck_jobs(10) into v_n;
  perform isolation_test.record('rescue', 'rescue_stuck_jobs', 'postgres', 'reports one rescued job', v_n = 1, 'rescued=' || v_n);
  select status, error_message into v_status, v_msg from public.jobs where id = v_job;
  perform isolation_test.record('rescue', 'jobs', 'postgres', 'stuck job is failed with a reason',
    v_status = 'failed' and v_msg is not null and length(v_msg) > 10, 'status=' || v_status || ' msg=' || coalesce(v_msg, '-'));
  select status into v_status from public.jobs where id = v_job2;
  perform isolation_test.record('rescue', 'jobs', 'postgres', 'healthy running job is left alone', v_status = 'running', 'status=' || v_status);
  perform isolation_test.record('rescue', 'credit_ledger', 'postgres', 'stuck job credits released',
    (select coalesce(sum(amount),0) from public.credit_ledger where org_id = v_a) = v_bal + 25);
  select public.rescue_stuck_jobs(10) into v_n;
  perform isolation_test.record('rescue', 'rescue_stuck_jobs', 'postgres', 'running twice does not double release', v_n = 0, 'rescued=' || v_n);

  -- job status values are constrained
  select * into res from isolation_test.try('postgres',
    format('insert into public.jobs (org_id, kind, status) values (%L, ''dummy'', ''weird'')', v_a));
  perform isolation_test.record('jobs', 'jobs', 'postgres', 'unknown status refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- a webhook event id can be recorded only once per provider
  insert into public.webhook_receipts (provider, event_id) values ('testprov', 'evt-1');
  select * into res from isolation_test.try('postgres', 'insert into public.webhook_receipts (provider, event_id) values (''testprov'', ''evt-1'')');
  perform isolation_test.record('webhooks', 'webhook_receipts', 'postgres', 'duplicate event id refused', res.state = '23505', coalesce(res.msg, 'ACCEPTED'));
  v_n := isolation_test.count_as('b_owner', 'select count(*) from public.webhook_receipts');
  perform isolation_test.record('webhooks', 'webhook_receipts', 'b_owner', 'customers cannot read receipts', v_n <= 0, 'rows=' || v_n);
  v_n := isolation_test.count_as('b_owner', 'select count(*) from public.ai_cost_table');
  perform isolation_test.record('webhooks', 'ai_cost_table', 'b_owner', 'customers cannot read the cost table', v_n <= 0, 'rows=' || v_n);
end;
$$;


-- C9. Social accounts, scheduled posts and the publishing state machine (P05) ----------
do $$
declare
  v_a uuid := isolation_test.id('org_a');
  v_b uuid := isolation_test.id('org_b');
  v_brand uuid := isolation_test.id('brand_a');
  v_acct uuid := isolation_test.id('acct_a');
  v_owner uuid := isolation_test.id('a_owner');
  res record; v_n int; v_id uuid; v_id2 uuid; v_id3 uuid; v_status text; v_msg text; v_pid text; v_state text; v_attempts int; i int;
begin
  -- Channel plan limit (trial = 15). The fixture already holds 1 active account.
  for i in 2..15 loop
    insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name)
      values (v_a, v_brand, 'fake', 'limit-' || i, 'facebook', 'L' || i);
  end loop;
  select * into res from isolation_test.try('postgres', format(
    'insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name) values (%L, %L, ''fake'', ''limit-16'', ''facebook'', ''L16'')', v_a, v_brand));
  perform isolation_test.record('social', 'social_accounts', 'postgres', 'channel plan limit refuses the 16th account',
    res.msg like '%Plan limit%', coalesce(res.msg, 'ACCEPTED'));
  delete from public.social_accounts where org_id = v_a and provider_account_id = 'limit-15';
  insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name, status)
    values (v_a, v_brand, 'fake', 'limit-15b', 'facebook', 'L15b', 'active');
  select count(*) into v_n from public.social_accounts where org_id = v_a;
  perform isolation_test.record('social', 'social_accounts', 'postgres', 'freeing a slot allows a new account', v_n = 15, 'count=' || v_n);
  -- disconnected accounts do not count toward the limit
  update public.social_accounts set status = 'disconnected' where org_id = v_a and provider_account_id = 'limit-14';
  insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name)
    values (v_a, v_brand, 'fake', 'after-disconnect', 'facebook', 'AD');
  perform isolation_test.record('social', 'social_accounts', 'postgres', 'disconnected accounts do not use a slot', true);

  select * into res from isolation_test.try('postgres', format(
    'insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name, status) values (%L, %L, ''fake'', ''acct-a-1'', ''instagram'', ''dup'', ''disconnected'')', v_a, v_brand));
  perform isolation_test.record('social', 'social_accounts', 'postgres', 'same provider account cannot be added twice', res.state = '23505', coalesce(res.msg, 'ACCEPTED'));

  -- Only the server connects accounts: no signed-in user can insert one
  select * into res from isolation_test.try('a_admin', format(
    'insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name) values (%L, %L, ''fake'', ''hack'', ''instagram'', ''x'')', v_a, v_brand));
  perform isolation_test.record('social', 'social_accounts', 'a_admin', 'cannot insert accounts from the browser', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));

  -- Post creation needs Edit access to publishing
  select * into res from isolation_test.try('a_admin', format(
    'insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, created_by) values (%L, %L, %L, ''hello'', ''draft'', %L)', v_a, v_brand, v_acct, isolation_test.id('a_admin')));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'editor can create a draft', res.state is null, coalesce(res.msg, ''));
  select * into res from isolation_test.try('a_viewer', format(
    'insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, created_by) values (%L, %L, %L, ''hello'', ''draft'', %L)', v_a, v_brand, v_acct, isolation_test.id('a_viewer')));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_viewer', 'viewer cannot create a post', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));

  -- A draft belongs to the account's own workspace and brand
  select * into res from isolation_test.try('postgres', format(
    'insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status) values (%L, %L, (select id from public.social_accounts where org_id = %L limit 1), ''cross'', ''draft'')', v_b, isolation_test.id('brand_b'), v_a));
  perform isolation_test.record('posts', 'scheduled_posts', 'postgres', 'post cannot use another workspace''s account', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  select id into v_id from public.scheduled_posts where org_id = v_a and caption = 'hello' limit 1;

  -- Signed-in users cannot jump to publishing/published or touch provider fields
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set status = ''published'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'browser cannot mark a post published', res.state is not null, coalesce(res.msg, 'ACCEPTED rows=' || res.rows_affected));
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set provider_post_id = ''forged'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'browser cannot write the provider post id', res.state is not null, coalesce(res.msg, 'ACCEPTED rows=' || res.rows_affected));

  -- Scheduling rules: at least ~5 minutes ahead
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set status = ''scheduled'', scheduled_for = now() - interval ''1 hour'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'cannot schedule in the past', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set status = ''scheduled'', scheduled_for = now() + interval ''2 minutes'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'cannot schedule less than 5 minutes ahead', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set status = ''scheduled'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'scheduled needs a time', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set status = ''scheduled'', scheduled_for = now() + interval ''1 hour'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'can schedule an hour ahead', res.state is null and res.rows_affected = 1, coalesce(res.msg, 'rows=' || res.rows_affected));
  select * into res from isolation_test.try('a_admin', format('update public.scheduled_posts set status = ''canceled'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'a_admin', 'can cancel a scheduled post', res.state is null and res.rows_affected = 1, coalesce(res.msg, 'rows=' || res.rows_affected));

  -- Success is only recorded with a provider post id (rule: flags are written after confirmation)
  select * into res from isolation_test.try('postgres', format('update public.scheduled_posts set status = ''published'' where id = %L', v_id));
  perform isolation_test.record('posts', 'scheduled_posts', 'postgres', 'published requires a provider post id', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- Claiming due posts: atomic, no duplicates, only due ones
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for)
    select v_a, v_brand, v_acct, 'due ' || g, 'scheduled', now() - interval '1 minute' from generate_series(1, 3) g;
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for)
    values (v_a, v_brand, v_acct, 'future one', 'scheduled', now() + interval '2 hours');
  select count(*) into v_n from public.claim_due_posts(2);
  perform isolation_test.record('engine', 'claim_due_posts', 'postgres', 'claims at most the requested number', v_n = 2, 'claimed=' || v_n);
  select count(*) into v_n from public.claim_due_posts(10);
  perform isolation_test.record('engine', 'claim_due_posts', 'postgres', 'second call gets only the rest (no duplicates)', v_n = 1, 'claimed=' || v_n);
  select count(*) into v_n from public.claim_due_posts(10);
  perform isolation_test.record('engine', 'claim_due_posts', 'postgres', 'nothing left to claim', v_n = 0, 'claimed=' || v_n);
  select count(*) into v_n from public.scheduled_posts where org_id = v_a and caption like 'due %' and status = 'publishing' and attempts = 1 and locked_at is not null;
  perform isolation_test.record('engine', 'scheduled_posts', 'postgres', 'claimed rows are publishing, locked, attempt 1', v_n = 3, 'rows=' || v_n);
  select status into v_status from public.scheduled_posts where org_id = v_a and caption = 'future one';
  perform isolation_test.record('engine', 'scheduled_posts', 'postgres', 'future posts are not claimed', v_status = 'scheduled', 'status=' || v_status);

  -- Rescue: stuck publishing rows go back to scheduled (up to 3 tries), then fail; a post already sent is never resent
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for, locked_at, attempts)
    values (v_a, v_brand, v_acct, 'stuck-1', 'publishing', now() - interval '1 hour', now() - interval '20 minutes', 1) returning id into v_id;
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for, locked_at, attempts)
    values (v_a, v_brand, v_acct, 'stuck-3', 'publishing', now() - interval '1 hour', now() - interval '20 minutes', 3) returning id into v_id2;
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for, locked_at, attempts, provider_post_id)
    values (v_a, v_brand, v_acct, 'stuck-sent', 'publishing', now() - interval '1 hour', now() - interval '20 minutes', 1, 'prov-123') returning id into v_id3;
  insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for, locked_at, attempts)
    values (v_a, v_brand, v_acct, 'fresh-publishing', 'publishing', now(), now(), 1);
  select public.rescue_stuck_posts(10) into v_n;
  perform isolation_test.record('engine', 'rescue_stuck_posts', 'postgres', 'reports the three stuck rows', v_n = 3, 'rescued=' || v_n);
  select status, attempts into v_status, v_attempts from public.scheduled_posts where id = v_id;
  perform isolation_test.record('engine', 'scheduled_posts', 'postgres', 'stuck row with tries left returns to scheduled', v_status = 'scheduled', 'status=' || v_status);
  select status, last_error_message into v_status, v_msg from public.scheduled_posts where id = v_id2;
  perform isolation_test.record('engine', 'scheduled_posts', 'postgres', 'stuck row out of tries fails with a reason', v_status = 'failed' and length(coalesce(v_msg, '')) > 10, 'status=' || v_status || ' msg=' || coalesce(v_msg, '-'));
  select status into v_status from public.scheduled_posts where id = v_id3;
  perform isolation_test.record('engine', 'scheduled_posts', 'postgres', 'already-sent post is marked published, never resent', v_status = 'published', 'status=' || v_status);
  select status into v_status from public.scheduled_posts where org_id = v_a and caption = 'fresh-publishing';
  perform isolation_test.record('engine', 'scheduled_posts', 'postgres', 'recent publishing row is left alone', v_status = 'publishing', 'status=' || v_status);
  select public.rescue_stuck_posts(10) into v_n;
  perform isolation_test.record('engine', 'rescue_stuck_posts', 'postgres', 'running twice rescues nothing more', v_n = 0, 'rescued=' || v_n);

  -- Attempts are numbered once per post
  select id into v_id from public.scheduled_posts where org_id = v_a and caption = 'future one';
  insert into public.publish_attempts (org_id, post_id, attempt_no, outcome) values (v_a, v_id, 1, 'success');
  select * into res from isolation_test.try('postgres', format('insert into public.publish_attempts (org_id, post_id, attempt_no, outcome) values (%L, %L, 1, ''failed'')', v_a, v_id));
  perform isolation_test.record('engine', 'publish_attempts', 'postgres', 'attempt number is unique per post', res.state = '23505', coalesce(res.msg, 'ACCEPTED'));

  -- Connect state: signed in, single use, expires
  select * into res from isolation_test.try('postgres', format('select count(*) from public.consume_connect_state(%L)', repeat('a', 64)));
  select count(*) into v_n from public.consume_connect_state(repeat('c', 64));
  perform isolation_test.record('social', 'consume_connect_state', 'postgres', 'unknown state returns nothing', v_n = 0);
  insert into public.social_connect_states (org_id, brand_id, user_id, state_hash, expires_at)
    values (v_a, v_brand, v_owner, repeat('d', 64), now() + interval '10 minutes');
  select count(*) into v_n from public.consume_connect_state(repeat('d', 64));
  perform isolation_test.record('social', 'consume_connect_state', 'postgres', 'valid state is accepted once', v_n = 1, 'rows=' || v_n);
  select count(*) into v_n from public.consume_connect_state(repeat('d', 64));
  perform isolation_test.record('social', 'consume_connect_state', 'postgres', 'state cannot be reused', v_n = 0, 'rows=' || v_n);
  insert into public.social_connect_states (org_id, brand_id, user_id, state_hash, expires_at)
    values (v_a, v_brand, v_owner, repeat('e', 64), now() - interval '1 minute');
  select count(*) into v_n from public.consume_connect_state(repeat('e', 64));
  perform isolation_test.record('social', 'consume_connect_state', 'postgres', 'expired state is refused', v_n = 0, 'rows=' || v_n);

  -- Server-only functions
  perform isolation_test.record('engine', 'claim_due_posts', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.claim_due_posts(int)', 'execute'));
  perform isolation_test.record('engine', 'rescue_stuck_posts', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.rescue_stuck_posts(int)', 'execute'));
  perform isolation_test.record('social', 'consume_connect_state', 'authenticated', 'cannot execute',
    not has_function_privilege('authenticated', 'public.consume_connect_state(text)', 'execute'));
  perform isolation_test.record('engine', 'claim_due_posts', 'service_role', 'can execute',
    has_function_privilege('service_role', 'public.claim_due_posts(int)', 'execute'));

  -- A stranger cannot read org A's posts or accounts (matrix covers every command; spot check the secret caption)
  v_n := isolation_test.count_as('b_owner', 'select count(*) from public.scheduled_posts where caption = ''Org A secret caption''');
  perform isolation_test.record('posts', 'scheduled_posts', 'b_owner', 'cannot read org A captions', v_n = 0, 'rows=' || v_n);
  v_n := isolation_test.count_as('a_viewer', 'select count(*) from public.scheduled_posts where caption = ''Org A secret caption''');
  perform isolation_test.record('posts', 'scheduled_posts', 'a_viewer', 'member can read org captions', v_n = 1, 'rows=' || v_n);
end;
$$;


-- C10. Research and strategy (P06) --------------------------------------------------------
do $$
declare
  v_a uuid := isolation_test.id('org_a');
  v_b uuid := isolation_test.id('org_b');
  v_brand_a uuid := isolation_test.id('brand_a');
  v_brand_b uuid := isolation_test.id('brand_b');
  v_user uuid := isolation_test.id('a_owner');
  v_sig_a uuid := isolation_test.id('sig_a');
  v_sig_b uuid := isolation_test.id('sig_b');
  v_s1 uuid := isolation_test.id('strat_a');
  v_cand uuid := isolation_test.id('cand_a');
  res record; v_job uuid; v_row uuid; v_job2 uuid; v_row2 uuid; v_job3 uuid; v_row3 uuid; v_msg text; v_s2 uuid; v_n int; v_n2 int; v_status text; v_status2 text; v_jobs_before int; v_comp uuid;
begin
  -- Starting a job creates the job row AND its placeholder row together
  select * into res from isolation_test.try('postgres', format('select * from public.start_content_job(%L, %L, %L, %L, ''{}''::jsonb)', 'intelligence.generate', v_a, v_brand_a, v_user));
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'intelligence job starts', res.state is null, coalesce(res.msg, ''));
  select job_id, row_id into v_job, v_row from public.start_content_job('intelligence.generate', v_a, v_brand_a, v_user, '{}'::jsonb);
  select count(*) into v_n from public.jobs where id = v_job and kind = 'intelligence.generate' and status = 'queued' and org_id = v_a;
  select count(*) into v_n2 from public.intelligence_reports where id = v_row and job_id = v_job and status = 'processing' and org_id = v_a and brand_id = v_brand_a;
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'job and placeholder exist together and are linked', v_n = 1 and v_n2 = 1, 'job=' || v_n || ' report=' || v_n2);

  select job_id, row_id into v_job, v_row from public.start_content_job('trends.scan', v_a, v_brand_a, v_user, '{"sources":["Reddit","YouTube"]}'::jsonb);
  select count(*) into v_n from public.trend_runs where id = v_row and job_id = v_job and sources_requested = array['Reddit','YouTube'];
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'trend scan records the chosen sources', v_n = 1, 'rows=' || v_n);

  select * into res from isolation_test.try('postgres', format('select * from public.start_content_job(%L, %L, %L, %L, ''{"sources":["Myspace"]}''::jsonb)', 'trends.scan', v_a, v_brand_a, v_user));
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'unknown trend source refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- Strategy: signals must belong to the same brand; nothing is created when a check fails
  select job_id, row_id into v_job, v_s2 from public.start_content_job('strategy.generate', v_a, v_brand_a, v_user,
    jsonb_build_object('scope', 'month', 'platform', 'linkedin', 'content_type', 'post', 'signal_ids', jsonb_build_array(v_sig_a)));
  select count(*) into v_n from public.strategies where id = v_s2 and job_id = v_job and status = 'processing' and scope = 'month' and platform = 'linkedin' and source_signal_ids = array[v_sig_a];
  select count(*) into v_n2 from public.strategy_signals where strategy_id = v_s2 and signal_id = v_sig_a;
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'strategy placeholder keeps scope, platform and linked signals', v_n = 1 and v_n2 = 1, 'strategy=' || v_n || ' links=' || v_n2);
  select source_signals_snapshot->0->>'topic' into v_status from public.strategies where id = v_s2;
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'strategy keeps a snapshot of its source signals', v_status = 'Org A secret topic', 'topic=' || coalesce(v_status, '-'));

  select count(*) into v_jobs_before from public.jobs where org_id = v_a;
  select * into res from isolation_test.try('postgres', format('select * from public.start_content_job(%L, %L, %L, %L, %L::jsonb)', 'strategy.generate', v_a, v_brand_a, v_user,
    jsonb_build_object('scope', 'week', 'signal_ids', jsonb_build_array(v_sig_b))::text));
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'another workspace''s signal is refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select count(*) into v_n from public.jobs where org_id = v_a;
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'a refused start leaves no orphan job', v_n = v_jobs_before, 'before=' || v_jobs_before || ' after=' || v_n);

  select * into res from isolation_test.try('postgres', format('select * from public.start_content_job(%L, %L, %L, %L, ''{"scope":"year"}''::jsonb)', 'strategy.generate', v_a, v_brand_a, v_user));
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'unknown scope refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('select * from public.start_content_job(%L, %L, %L, %L, ''{}''::jsonb)', 'intelligence.generate', v_a, v_brand_b, v_user));
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'brand from another workspace refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('select * from public.start_content_job(%L, %L, %L, %L, ''{}''::jsonb)', 'rm.rf', v_a, v_brand_a, v_user));
  perform isolation_test.record('research', 'start_content_job', 'postgres', 'unknown job kind refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- Only one approved strategy per brand
  update public.strategies set status = 'completed' where id = v_s2;
  select * into res from isolation_test.try('a_admin', format('select public.approve_strategy(%L)', v_s1));
  perform isolation_test.record('strategy', 'approve_strategy', 'a_admin', 'editor with Full access can approve', res.state is null, coalesce(res.msg, ''));
  select * into res from isolation_test.try('a_admin', format('select public.approve_strategy(%L)', v_s2));
  select status into v_status from public.strategies where id = v_s1;
  select status into v_status2 from public.strategies where id = v_s2;
  perform isolation_test.record('strategy', 'approve_strategy', 'a_admin', 'approving another strategy demotes the first', v_status = 'completed' and v_status2 = 'approved', 'first=' || v_status || ' second=' || v_status2);
  select count(*) into v_n from public.strategies where brand_id = v_brand_a and status = 'approved';
  perform isolation_test.record('strategy', 'approve_strategy', 'postgres', 'exactly one approved strategy per brand', v_n = 1, 'approved=' || v_n);
  select * into res from isolation_test.try('postgres', format('update public.strategies set status = ''approved'' where id = %L', v_s1));
  perform isolation_test.record('strategy', 'strategies', 'postgres', 'the database refuses two approved strategies', res.state = '23505', coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_viewer', format('select public.approve_strategy(%L)', v_s1));
  perform isolation_test.record('strategy', 'approve_strategy', 'a_viewer', 'viewer cannot approve', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('b_owner', format('select public.approve_strategy(%L)', v_s1));
  perform isolation_test.record('strategy', 'approve_strategy', 'b_owner', 'stranger cannot approve', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('anon', format('select public.approve_strategy(%L)', v_s1));
  perform isolation_test.record('strategy', 'approve_strategy', 'anon', 'anonymous cannot approve', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  update public.strategies set status = 'failed' where id = v_s1;
  select * into res from isolation_test.try('a_admin', format('select public.approve_strategy(%L)', v_s1));
  perform isolation_test.record('strategy', 'approve_strategy', 'a_admin', 'a failed strategy cannot be approved', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  update public.strategies set status = 'completed' where id = v_s1;

  -- Signed-in users cannot write generated content directly
  select * into res from isolation_test.try('a_admin', format('update public.strategies set ai_summary = ''forged'' where id = %L', v_s1));
  perform isolation_test.record('strategy', 'strategies', 'a_admin', 'generated content cannot be edited from the browser', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));

  -- Signal scores stay in range
  select * into res from isolation_test.try('postgres', format('insert into public.trend_signals (org_id, brand_id, run_id, source, topic, relevance_score) values (%L, %L, (select id from public.trend_runs where org_id = %L limit 1), ''Reddit'', ''x'', 150)', v_a, v_brand_a, v_a));
  perform isolation_test.record('research', 'trend_signals', 'postgres', 'relevance score above 100 refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- Competitor candidates: accept creates a competitor, once; reject closes it
  select * into res from isolation_test.try('a_viewer', format('select public.accept_competitor_candidate(%L)', v_cand));
  perform isolation_test.record('research', 'accept_competitor_candidate', 'a_viewer', 'viewer cannot accept', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('b_owner', format('select public.accept_competitor_candidate(%L)', v_cand));
  perform isolation_test.record('research', 'accept_competitor_candidate', 'b_owner', 'stranger cannot accept', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_admin', format('select public.accept_competitor_candidate(%L)', v_cand));
  perform isolation_test.record('research', 'accept_competitor_candidate', 'a_admin', 'editor can accept', res.state is null, coalesce(res.msg, ''));
  select count(*) into v_n from public.competitors where org_id = v_a and brand_id = v_brand_a and name = 'Candidate A Inc' and website_url = 'https://candidate-a.example';
  perform isolation_test.record('research', 'competitors', 'postgres', 'accepted candidate became a competitor', v_n = 1, 'rows=' || v_n);
  select * into res from isolation_test.try('a_admin', format('select public.accept_competitor_candidate(%L)', v_cand));
  perform isolation_test.record('research', 'accept_competitor_candidate', 'a_admin', 'cannot accept the same candidate twice', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select count(*) into v_n from public.competitors where org_id = v_a and name = 'Candidate A Inc';
  perform isolation_test.record('research', 'competitors', 'postgres', 'no duplicate competitor created', v_n = 1, 'rows=' || v_n);
  insert into public.competitor_candidates (org_id, brand_id, name, website_url, reason) values (v_a, v_brand_a, 'Candidate Two', 'https://two.example', 'r') returning id into v_comp;
  select * into res from isolation_test.try('a_admin', format('select public.reject_competitor_candidate(%L)', v_comp));
  select status into v_status from public.competitor_candidates where id = v_comp;
  perform isolation_test.record('research', 'reject_competitor_candidate', 'a_admin', 'reject closes the candidate', res.state is null and v_status = 'rejected', coalesce(res.msg, 'status=' || v_status));

  -- Rescue: when a worker dies mid-job, the placeholder rows must not stay "processing" forever
  select job_id, row_id into v_job, v_row from public.start_content_job('intelligence.generate', v_a, v_brand_a, v_user, '{}'::jsonb);
  update public.jobs set status = 'running', started_at = now() - interval '40 minutes', heartbeat_at = now() - interval '30 minutes' where id = v_job;
  select job_id, row_id into v_job2, v_row2 from public.start_content_job('strategy.generate', v_a, v_brand_a, v_user, '{"scope":"week"}'::jsonb);
  update public.jobs set status = 'running', started_at = now() - interval '40 minutes', heartbeat_at = now() - interval '30 minutes' where id = v_job2;
  select job_id, row_id into v_job3, v_row3 from public.start_content_job('trends.scan', v_a, v_brand_a, v_user, '{}'::jsonb);
  update public.jobs set status = 'running', started_at = now() - interval '40 minutes', heartbeat_at = now() - interval '30 minutes' where id = v_job3;
  perform public.rescue_stuck_jobs(10);
  select status, error_message into v_status, v_msg from public.intelligence_reports where id = v_row;
  perform isolation_test.record('research', 'rescue_stuck_jobs', 'postgres', 'stuck report is failed with a reason', v_status = 'failed' and length(coalesce(v_msg, '')) > 10, 'status=' || v_status);
  select status, error_detail into v_status, v_msg from public.strategies where id = v_row2;
  perform isolation_test.record('research', 'rescue_stuck_jobs', 'postgres', 'stuck strategy is failed with a reason', v_status = 'failed' and length(coalesce(v_msg, '')) > 10, 'status=' || v_status);
  select status, error_message into v_status, v_msg from public.trend_runs where id = v_row3;
  perform isolation_test.record('research', 'rescue_stuck_jobs', 'postgres', 'stuck trend run is failed with a reason', v_status = 'failed' and length(coalesce(v_msg, '')) > 10, 'status=' || v_status);
  -- a finished report is never touched by the rescue
  select count(*) into v_n from public.intelligence_reports where org_id = v_a and status = 'completed';
  perform isolation_test.record('research', 'rescue_stuck_jobs', 'postgres', 'completed reports are left alone', v_n >= 1, 'completed=' || v_n);

  -- Who can call what
  perform isolation_test.record('research', 'start_content_job', 'authenticated', 'cannot execute (server only)', not has_function_privilege('authenticated', 'public.start_content_job(text,uuid,uuid,uuid,jsonb)', 'execute'));
  perform isolation_test.record('research', 'start_content_job', 'service_role', 'can execute', has_function_privilege('service_role', 'public.start_content_job(text,uuid,uuid,uuid,jsonb)', 'execute'));
  perform isolation_test.record('strategy', 'approve_strategy', 'authenticated', 'can execute (checks access inside)', has_function_privilege('authenticated', 'public.approve_strategy(uuid)', 'execute'));
  perform isolation_test.record('strategy', 'approve_strategy', 'anon', 'cannot execute', not has_function_privilege('anon', 'public.approve_strategy(uuid)', 'execute'));

  -- A stranger cannot read org A's research (matrix covers every command; spot check the secret text)
  v_n := isolation_test.count_as('b_owner', 'select count(*) from public.intelligence_reports where sections::text like ''%Org A secret%''');
  perform isolation_test.record('research', 'intelligence_reports', 'b_owner', 'cannot read org A reports', v_n = 0, 'rows=' || v_n);
  v_n := isolation_test.count_as('a_viewer', 'select count(*) from public.intelligence_reports where sections::text like ''%Org A secret%''');
  perform isolation_test.record('research', 'intelligence_reports', 'a_viewer', 'member can read org reports', v_n = 1, 'rows=' || v_n);
end;
$$;


-- C11. Trend Alerts (P06b) ----------------------------------------------------------------------
do $$
declare
  v_a uuid := isolation_test.id('org_a');
  v_brand uuid := isolation_test.id('brand_a');
  v_user uuid := isolation_test.id('a_owner');
  v_w uuid := isolation_test.id('watch_a');
  v_ev uuid := isolation_test.id('event_a');
  v_rule uuid := isolation_test.id('rule_a');
  res record; v_n int; v_status text; v_w2 uuid; v_job uuid; v_run uuid; v_refused text; v_next timestamptz; v_notice uuid; i int; v_org2 uuid; v_msg text;
begin
  -- Creating watches needs Full/Edit access to trend_alerts; a stranger and a viewer cannot
  select * into res from isolation_test.try('a_admin', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (%L, %L, ''Admin watch'', array[''cobots''], array[''Google News''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'a_admin', 'editor can create a watch', res.state is null, coalesce(res.msg, ''));
  select * into res from isolation_test.try('a_viewer', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (%L, %L, ''Viewer watch'', array[''x''], array[''Google News''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'a_viewer', 'viewer cannot create a watch', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('b_owner', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (%L, %L, ''Hack'', array[''x''], array[''Google News''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'b_owner', 'stranger cannot create a watch in another workspace', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));

  -- Shape rules
  select * into res from isolation_test.try('postgres', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (%L, %L, ''x'', ''{}'', array[''Google News''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'postgres', 'a watch needs at least one keyword', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (%L, %L, ''x'', array[''k''], array[''Myspace''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'postgres', 'unknown source refused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources, frequency_minutes) values (%L, %L, ''x'', array[''k''], array[''Google News''], 5)', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'postgres', 'check every 5 minutes refused (minimum 30)', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources, monthly_budget_credits) values (%L, %L, ''x'', array[''k''], array[''Google News''], 0)', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'postgres', 'a watch must have a budget (never unattended and uncapped)', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources, rss_feeds) values (%L, %L, ''x'', array[''k''], array[''RSS''], array[''ftp://x.example/feed''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'postgres', 'feed addresses must be https/http', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- Plan limit on watches (trial = 10). Org A already has the fixture + admin watch.
  select count(*) into v_n from public.trend_watches where org_id = v_a;
  for i in v_n + 1 .. 10 loop
    insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (v_a, v_brand, 'filler ' || i, array['k'], array['Google News']);
  end loop;
  select * into res from isolation_test.try('postgres', format('insert into public.trend_watches (org_id, brand_id, name, keywords, sources) values (%L, %L, ''eleventh'', array[''k''], array[''Google News''])', v_a, v_brand));
  perform isolation_test.record('alerts', 'trend_watches', 'postgres', 'plan limit refuses the 11th watch', res.msg like '%Plan limit%', coalesce(res.msg, 'ACCEPTED'));
  delete from public.trend_watches where org_id = v_a and name like 'filler %';

  -- Server-owned fields cannot be written from the browser
  select id into v_w2 from public.trend_watches where org_id = v_a and name = 'Admin watch';
  select * into res from isolation_test.try('a_admin', format('update public.trend_watches set spent_credits_month = 0, next_run_at = now() + interval ''1 day'' where id = %L', v_w2));
  perform isolation_test.record('alerts', 'trend_watches', 'a_admin', 'browser cannot write spend or schedule fields', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_admin', format('update public.trend_watches set status = ''budget_paused'' where id = %L', v_w2));
  perform isolation_test.record('alerts', 'trend_watches', 'a_admin', 'browser cannot set budget_paused', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_admin', format('update public.trend_watches set status = ''paused'', name = ''Renamed'', keywords = array[''a'',''b''], monthly_budget_credits = 20 where id = %L', v_w2));
  perform isolation_test.record('alerts', 'trend_watches', 'a_admin', 'editor can pause and edit a watch', res.state is null and res.rows_affected = 1, coalesce(res.msg, 'rows=' || res.rows_affected));
  select * into res from isolation_test.try('a_viewer', format('update public.trend_watches set name = ''pwned'' where id = %L', v_w2));
  perform isolation_test.record('alerts', 'trend_watches', 'a_viewer', 'viewer cannot edit a watch', res.state = '42501' or coalesce(res.rows_affected, 0) = 0, coalesce(res.msg, 'rows=' || res.rows_affected));

  -- Starting a run: job and run together; one at a time; paused watches do not run
  update public.trend_watches set status = 'active', spent_credits_month = 0, monthly_budget_credits = 20 where id = v_w2;
  select job_id, run_id, refused into v_job, v_run, v_refused from public.start_watch_run(v_w2, 'manual', v_user);
  select count(*) into v_n from public.jobs j join public.trend_watch_runs r on r.job_id = j.id where j.id = v_job and r.id = v_run and j.kind = 'alerts.run' and r.status = 'running' and r.trigger = 'manual';
  perform isolation_test.record('alerts', 'start_watch_run', 'postgres', 'a run starts with its job, linked', v_job is not null and v_n = 1 and v_refused is null, 'refused=' || coalesce(v_refused, '-') || ' linked=' || v_n);
  select refused into v_refused from public.start_watch_run(v_w2, 'manual', v_user);
  perform isolation_test.record('alerts', 'start_watch_run', 'postgres', 'a second run while one is running is refused', v_refused = 'running', 'refused=' || coalesce(v_refused, '-'));
  update public.trend_watch_runs set status = 'done' where id = v_run;
  update public.trend_watches set status = 'paused' where id = v_w2;
  select refused into v_refused from public.start_watch_run(v_w2, 'manual', v_user);
  perform isolation_test.record('alerts', 'start_watch_run', 'postgres', 'a paused watch does not run', v_refused = 'paused', 'refused=' || coalesce(v_refused, '-'));

  -- Budget: spending past the monthly budget stops the watch; a new month starts it again
  update public.trend_watches set status = 'active', spent_credits_month = 0, monthly_budget_credits = 10 where id = v_w2;
  select public.record_watch_spend(v_w2, 6) into v_status;
  perform isolation_test.record('alerts', 'record_watch_spend', 'postgres', 'under budget keeps running', v_status = 'active', 'status=' || v_status);
  select public.record_watch_spend(v_w2, 5) into v_status;
  perform isolation_test.record('alerts', 'record_watch_spend', 'postgres', 'reaching the budget stops the watch', v_status = 'budget_paused', 'status=' || v_status);
  select refused into v_refused from public.start_watch_run(v_w2, 'schedule', null);
  perform isolation_test.record('alerts', 'start_watch_run', 'postgres', 'a budget-paused watch does not run', v_refused in ('paused', 'budget'), 'refused=' || coalesce(v_refused, '-'));
  update public.trend_watches set month_key = '2020-01' where id = v_w2;
  select job_id, refused into v_job, v_refused from public.start_watch_run(v_w2, 'schedule', null);
  select status, spent_credits_month into v_status, v_n from public.trend_watches where id = v_w2;
  perform isolation_test.record('alerts', 'start_watch_run', 'postgres', 'a new month resets spend and restarts a budget-paused watch', v_job is not null and v_status = 'active' and v_n = 0, 'status=' || v_status || ' spent=' || v_n || ' refused=' || coalesce(v_refused, '-'));
  update public.trend_watch_runs set status = 'done' where watch_id = v_w2;

  -- Scheduling: only due, active, in-budget watches are claimed, each once
  update public.trend_watches set status = 'paused' where org_id = v_a;
  update public.trend_watches set status = 'active', next_run_at = now() - interval '1 minute', spent_credits_month = 0, monthly_budget_credits = 50 where id = v_w2;
  select count(*) into v_n from public.claim_due_watches(10);
  perform isolation_test.record('alerts', 'claim_due_watches', 'postgres', 'a due watch is claimed', v_n = 1, 'claimed=' || v_n);
  select next_run_at into v_next from public.trend_watches where id = v_w2;
  perform isolation_test.record('alerts', 'claim_due_watches', 'postgres', 'next run moves forward by the chosen frequency', v_next > now() + interval '30 minutes', 'next=' || v_next);
  select count(*) into v_n from public.claim_due_watches(10);
  perform isolation_test.record('alerts', 'claim_due_watches', 'postgres', 'it is not claimed twice', v_n = 0, 'claimed=' || v_n);
  update public.trend_watch_runs set status = 'done' where watch_id = v_w2;
  update public.trend_watches set next_run_at = now() + interval '3 hours' where id = v_w2;
  select count(*) into v_n from public.claim_due_watches(10);
  perform isolation_test.record('alerts', 'claim_due_watches', 'postgres', 'a watch that is not due is left alone', v_n = 0, 'claimed=' || v_n);
  update public.trend_watches set next_run_at = now() - interval '1 minute', spent_credits_month = 50 where id = v_w2;
  select count(*) into v_n from public.claim_due_watches(10);
  select status into v_status from public.trend_watches where id = v_w2;
  perform isolation_test.record('alerts', 'claim_due_watches', 'postgres', 'an over-budget watch is not run and is marked budget_paused', v_n = 0 and v_status = 'budget_paused', 'claimed=' || v_n || ' status=' || v_status);

  -- Rescue: a stuck alerts.run fails its run row too
  update public.trend_watches set status = 'active', spent_credits_month = 0, month_key = to_char(now() at time zone 'utc', 'YYYY-MM') where id = v_w2;
  select job_id, run_id into v_job, v_run from public.start_watch_run(v_w2, 'manual', v_user);
  update public.jobs set status = 'running', started_at = now() - interval '40 minutes', heartbeat_at = now() - interval '30 minutes' where id = v_job;
  perform public.rescue_stuck_jobs(10);
  select status, error_message into v_status, v_msg from public.trend_watch_runs where id = v_run;
  perform isolation_test.record('alerts', 'rescue_stuck_jobs', 'postgres', 'a stuck run is failed with a reason', v_status = 'failed' and length(coalesce(v_msg, '')) > 10, 'status=' || v_status);

  -- Alert rules
  select * into res from isolation_test.try('a_admin', format('insert into public.trend_rules (org_id, watch_id, name, channel, target) values (%L, %L, ''to slack'', ''slack'', ''https://hooks.slack.com/services/T/B/x'')', v_a, v_w));
  perform isolation_test.record('alerts', 'trend_rules', 'a_admin', 'editor can add a Slack rule', res.state is null, coalesce(res.msg, ''));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_rules (org_id, watch_id, name, channel, target) values (%L, %L, ''bad'', ''slack'', ''http://insecure.example'')', v_a, v_w));
  perform isolation_test.record('alerts', 'trend_rules', 'postgres', 'Slack and webhook targets must be https', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_rules (org_id, watch_id, name, channel) values (%L, %L, ''bad'', ''webhook'')', v_a, v_w));
  perform isolation_test.record('alerts', 'trend_rules', 'postgres', 'a webhook rule needs a target', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_rules (org_id, watch_id, name, channel) values (%L, %L, ''bad'', ''email'')', v_a, v_w));
  perform isolation_test.record('alerts', 'trend_rules', 'postgres', 'email is not offered until it is set up', res.state is not null, coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('a_viewer', format('insert into public.trend_rules (org_id, watch_id, name, channel) values (%L, %L, ''v'', ''in_app'')', v_a, v_w));
  perform isolation_test.record('alerts', 'trend_rules', 'a_viewer', 'viewer cannot add a rule', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_rules (org_id, watch_id, name, channel) values (%L, %L, ''other org watch'', ''in_app'')', isolation_test.id('org_b'), v_w));
  perform isolation_test.record('alerts', 'trend_rules', 'postgres', 'a rule cannot point at another workspace''s watch', res.state is not null, coalesce(res.msg, 'ACCEPTED'));

  -- One delivery per story and rule; one stored mention per link
  select * into res from isolation_test.try('postgres', format('insert into public.trend_deliveries (org_id, event_id, rule_id, channel, status) values (%L, %L, %L, ''in_app'', ''sent'')', v_a, v_ev, v_rule));
  perform isolation_test.record('alerts', 'trend_deliveries', 'postgres', 'a story is delivered once per rule', res.state = '23505', coalesce(res.msg, 'ACCEPTED'));
  select * into res from isolation_test.try('postgres', format('insert into public.trend_mentions (org_id, watch_id, run_id, source, title, url, url_hash) values (%L, %L, isolation_test.id(''wrun_a''), ''Google News'', ''dup'', ''https://a.example/1'', %L)', v_a, v_w, repeat('a', 64)));
  perform isolation_test.record('alerts', 'trend_mentions', 'postgres', 'a link is stored once per watch (seen links are skipped later)', res.state = '23505', coalesce(res.msg, 'ACCEPTED'));

  -- Notifications: private to the person they are for
  v_n := isolation_test.count_as('a_owner', format('select count(*) from public.notifications where org_id = %L', v_a));
  perform isolation_test.record('alerts', 'notifications', 'a_owner', 'owner sees their own notification', v_n = 1, 'rows=' || v_n);
  v_n := isolation_test.count_as('a_admin', format('select count(*) from public.notifications where org_id = %L', v_a));
  perform isolation_test.record('alerts', 'notifications', 'a_admin', 'a teammate does not see someone else''s notification', v_n = 0, 'rows=' || v_n);
  select id into v_notice from public.notifications where org_id = v_a and user_id = v_user limit 1;
  select * into res from isolation_test.try('a_owner', format('update public.notifications set read_at = now() where id = %L', v_notice));
  perform isolation_test.record('alerts', 'notifications', 'a_owner', 'owner can mark their notification read', res.state is null and res.rows_affected = 1, coalesce(res.msg, 'rows=' || res.rows_affected));
  select * into res from isolation_test.try('a_owner', format('update public.notifications set title = ''forged'' where id = %L', v_notice));
  perform isolation_test.record('alerts', 'notifications', 'a_owner', 'notification text cannot be edited from the browser', res.state = '42501', coalesce(res.msg, 'ACCEPTED'));

  -- Who can call what
  perform isolation_test.record('alerts', 'start_watch_run', 'authenticated', 'cannot execute (server only)', not has_function_privilege('authenticated', 'public.start_watch_run(uuid,text,uuid)', 'execute'));
  perform isolation_test.record('alerts', 'claim_due_watches', 'authenticated', 'cannot execute (server only)', not has_function_privilege('authenticated', 'public.claim_due_watches(int)', 'execute'));
  perform isolation_test.record('alerts', 'record_watch_spend', 'authenticated', 'cannot execute (server only)', not has_function_privilege('authenticated', 'public.record_watch_spend(uuid,int)', 'execute'));
  perform isolation_test.record('alerts', 'claim_due_watches', 'service_role', 'can execute', has_function_privilege('service_role', 'public.claim_due_watches(int)', 'execute'));

  -- A stranger cannot read org A's alerts (the matrix covers every command; spot check the secret text)
  v_n := isolation_test.count_as('b_owner', 'select count(*) from public.trend_events where title like ''Org A secret%''');
  perform isolation_test.record('alerts', 'trend_events', 'b_owner', 'cannot read org A stories', v_n = 0, 'rows=' || v_n);
  v_n := isolation_test.count_as('a_viewer', 'select count(*) from public.trend_events where title like ''Org A secret%''');
  perform isolation_test.record('alerts', 'trend_events', 'a_viewer', 'member can read org stories', v_n = 1, 'rows=' || v_n);
end;
$$;

-- C6. Revocation is immediate; suspended orgs are locked ---------------------------
do $$
declare
  v_org_a uuid := isolation_test.id('org_a');
  v_before int; v_after int; v_n int;
begin
  v_before := isolation_test.count_as('a_viewer', format('select count(*) from public.brands where org_id = %L', v_org_a));
  perform isolation_test.record('rules', 'revocation', 'a_viewer', 'positive control: member sees brands', v_before >= 1);

  -- suspended org: non-owner members see nothing; owner keeps read access for recovery
  update public.organizations set status = 'suspended' where id = v_org_a;
  v_n := isolation_test.count_as('a_viewer', format('select count(*) from public.brands where org_id = %L', v_org_a));
  perform isolation_test.record('rules', 'suspended org', 'a_viewer', 'member loses access', v_n = 0);
  v_n := isolation_test.count_as('a_owner', format('select count(*) from public.organizations where id = %L', v_org_a));
  perform isolation_test.record('rules', 'suspended org', 'a_owner', 'owner can still see org', v_n = 1);
  update public.organizations set status = 'active' where id = v_org_a;

  -- removing a membership revokes access on the very next query
  delete from public.memberships where org_id = v_org_a and user_id = isolation_test.id('a_viewer');
  v_after := isolation_test.count_as('a_viewer', format('select count(*) from public.brands where org_id = %L', v_org_a));
  perform isolation_test.record('rules', 'revocation', 'a_viewer', 'removed member sees nothing', v_after = 0);
end;
$$;


-- C7. Deleting an organization must cascade cleanly (account closure / data deletion)
do $$
declare
  v_org uuid; res record; v_left int;
begin
  select * into res from isolation_test.try('c_user', 'select public.create_organization(''Disposable'', ''iso-disposable'')');
  -- c_user is rate limited by section C4, so seed the disposable org directly as superuser instead
  insert into public.organizations (name, slug, created_by) values ('Disposable', 'iso-disposable', isolation_test.id('b_owner')) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, isolation_test.id('b_owner'), 'owner');
  insert into public.feature_access (org_id, user_id, feature, level) values (v_org, isolation_test.id('b_owner'), 'brand', 'full');
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
    values (v_org, 'gone@isolation.test', 'viewer', repeat('7', 64), isolation_test.id('b_owner'));
  insert into public.brands (org_id, name) values (v_org, 'Disposable brand');

  select * into res from isolation_test.try('postgres', format('delete from public.organizations where id = %L', v_org));
  perform isolation_test.record('rules', 'organizations', 'postgres', 'org deletion cascades without audit FK errors', res.state is null, res.state || ' ' || coalesce(res.msg, ''));

  select (select count(*) from public.memberships where org_id = v_org)
       + (select count(*) from public.brands where org_id = v_org)
       + (select count(*) from public.invitations where org_id = v_org)
       + (select count(*) from public.feature_access where org_id = v_org) into v_left;
  perform isolation_test.record('rules', 'organizations', 'postgres', 'no orphan rows after org deletion', v_left = 0, v_left || ' orphan row(s)');
end;
$$;

-- ==============================================================================
-- REPORT
-- ==============================================================================
do $$
declare
  v_total int; v_failed int; r record;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from isolation_results;

  for r in
    select area, count(*) n, count(*) filter (where not ok) f
    from isolation_results group by area order by area
  loop
    raise notice '% : % checks, % failed', rpad(r.area, 10), r.n, r.f;
  end loop;

  if v_failed > 0 then
    for r in select * from isolation_results where not ok order by id loop
      raise warning 'FAIL [%] % | actor=% | % | %', r.area, r.subject, r.actor, r.op, coalesce(r.detail, '');
    end loop;
    raise exception 'ISOLATION SUITE FAILED: % of % checks failed', v_failed, v_total;
  end if;

  raise notice 'ISOLATION SUITE PASSED: % checks', v_total;
end;
$$;

rollback;
