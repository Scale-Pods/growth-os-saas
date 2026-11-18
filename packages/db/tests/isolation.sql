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
  v_global text[] := array['profiles','plan_limits','organizations'];
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
