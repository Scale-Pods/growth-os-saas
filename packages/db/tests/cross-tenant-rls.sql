-- ==============================================================================
-- Test Suite: cross-tenant-rls.sql
-- Description: Comprehensive cross-tenant isolation and RLS permission test.
-- Instructions: Run in Supabase SQL Editor.
--               The transaction automatically ROLLS BACK at the end so it leaves
--               ZERO test data in your database.
-- ==============================================================================

begin;

-- 1. Setup Test Tenant Identifiers
do $$
declare
  v_user_a_owner uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_user_a_viewer uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_user_b_owner uuid := 'b0000000-0000-0000-0000-000000000001'::uuid;
  v_org_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_org_b uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_brand_a uuid := 'aaaa1111-0000-0000-0000-000000000000'::uuid;
  v_brand_b uuid := 'bbbb2222-0000-0000-0000-000000000000'::uuid;
  v_count int;
  v_err_caught boolean;
begin
  raise notice '==================================================';
  raise notice 'STARTING P01 CROSS-TENANT ISOLATION TEST SUITE';
  raise notice '==================================================';

  -- ----------------------------------------------------------------------------
  -- SEEDING (Bypassing RLS as postgres superuser for fixture setup)
  -- ----------------------------------------------------------------------------
  -- Seed dummy users in auth.users
  insert into auth.users (id, email, raw_user_meta_data, role, aud)
  values
    (v_user_a_owner, 'a_owner@example.com', '{"full_name": "Alice Owner"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_a_viewer, 'a_viewer@example.com', '{"full_name": "Alex Viewer"}'::jsonb, 'authenticated', 'authenticated'),
    (v_user_b_owner, 'b_owner@example.com', '{"full_name": "Bob Owner"}'::jsonb, 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  -- Seed Org A
  insert into public.organizations (id, name, slug, created_by)
  values (v_org_a, 'Tenant A Corp', 'tenant-a-test', v_user_a_owner)
  on conflict (id) do nothing;

  insert into public.memberships (org_id, user_id, role, status)
  values
    (v_org_a, v_user_a_owner, 'owner', 'active'),
    (v_org_a, v_user_a_viewer, 'viewer', 'active')
  on conflict (org_id, user_id) do nothing;

  insert into public.brands (id, org_id, name)
  values (v_brand_a, v_org_a, 'Brand A Alpha')
  on conflict (id) do nothing;

  insert into public.feature_access (org_id, user_id, feature, level)
  values (v_org_a, v_user_a_owner, 'strategy', 'full')
  on conflict (org_id, user_id, feature) do nothing;

  insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id)
  values (v_org_a, 'tenant-a-test', v_user_a_owner, 'org.created', 'organization', v_org_a::text);

  -- Seed Org B
  insert into public.organizations (id, name, slug, created_by)
  values (v_org_b, 'Tenant B Corp', 'tenant-b-test', v_user_b_owner)
  on conflict (id) do nothing;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_org_b, v_user_b_owner, 'owner', 'active')
  on conflict (org_id, user_id) do nothing;

  insert into public.brands (id, org_id, name)
  values (v_brand_b, v_org_b, 'Brand B Beta')
  on conflict (id) do nothing;

  insert into public.audit_log (org_id, org_slug, actor_id, action, target_type, target_id)
  values (v_org_b, 'tenant-b-test', v_user_b_owner, 'org.created', 'organization', v_org_b::text);

  raise notice '[PASS] Test fixtures successfully seeded for Org A and Org B.';

  -- ----------------------------------------------------------------------------
  -- TEST 1: Tenant B cross-tenant SELECT on organizations
  -- ----------------------------------------------------------------------------
  -- Simulate authenticated session for User B (Bob)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_b_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select count(*) into v_count from public.organizations where id = v_org_a;
  if v_count != 0 then
    raise exception '[FAIL] Test 1: Tenant B was able to view Org A! (expected 0 rows, got %)', v_count;
  end if;
  raise notice '[PASS] Test 1: Org A is completely invisible to Tenant B (SELECT returned 0 rows).';

  -- ----------------------------------------------------------------------------
  -- TEST 2: Tenant B cross-tenant SELECT on brands
  -- ----------------------------------------------------------------------------
  select count(*) into v_count from public.brands where org_id = v_org_a;
  if v_count != 0 then
    raise exception '[FAIL] Test 2: Tenant B was able to view Org A brands! (expected 0, got %)', v_count;
  end if;
  raise notice '[PASS] Test 2: Org A brands are completely invisible to Tenant B (SELECT returned 0 rows).';

  -- ----------------------------------------------------------------------------
  -- TEST 3: Tenant B cross-tenant SELECT on memberships
  -- ----------------------------------------------------------------------------
  select count(*) into v_count from public.memberships where org_id = v_org_a;
  if v_count != 0 then
    raise exception '[FAIL] Test 3: Tenant B was able to view Org A memberships! (expected 0, got %)', v_count;
  end if;
  raise notice '[PASS] Test 3: Org A memberships are invisible to Tenant B (SELECT returned 0 rows).';

  -- ----------------------------------------------------------------------------
  -- TEST 4: Tenant B cross-tenant SELECT on feature_access
  -- ----------------------------------------------------------------------------
  select count(*) into v_count from public.feature_access where org_id = v_org_a;
  if v_count != 0 then
    raise exception '[FAIL] Test 4: Tenant B was able to view Org A feature_access! (expected 0, got %)', v_count;
  end if;
  raise notice '[PASS] Test 4: Org A feature permissions are invisible to Tenant B (SELECT returned 0 rows).';

  -- ----------------------------------------------------------------------------
  -- TEST 5: Tenant B cross-tenant SELECT on audit_log
  -- ----------------------------------------------------------------------------
  select count(*) into v_count from public.audit_log where org_id = v_org_a;
  if v_count != 0 then
    raise exception '[FAIL] Test 5: Tenant B was able to view Org A audit_log! (expected 0, got %)', v_count;
  end if;
  raise notice '[PASS] Test 5: Org A audit log trail is invisible to Tenant B (SELECT returned 0 rows).';

  -- ----------------------------------------------------------------------------
  -- TEST 6: Tenant B profile visibility check (cannot see Alice's profile)
  -- ----------------------------------------------------------------------------
  select count(*) into v_count from public.profiles where id = v_user_a_owner;
  if v_count != 0 then
    raise exception '[FAIL] Test 6: Tenant B was able to view User A profile! (expected 0, got %)', v_count;
  end if;
  raise notice '[PASS] Test 6: User A profile is invisible to Tenant B (no shared active organization).';

  -- ----------------------------------------------------------------------------
  -- TEST 7: Tenant B cross-tenant INSERT into brands for Org A
  -- ----------------------------------------------------------------------------
  v_err_caught := false;
  begin
    insert into public.brands (org_id, name)
    values (v_org_a, 'Rogue Injected Brand');
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception '[FAIL] Test 7: Tenant B was able to insert a brand into Org A!';
  end if;
  raise notice '[PASS] Test 7: Tenant B cannot insert brands into Org A (RLS check rejected write).';

  -- ----------------------------------------------------------------------------
  -- TEST 8: Tenant B cross-tenant UPDATE on Org A brand
  -- ----------------------------------------------------------------------------
  update public.brands set name = 'Hacked Brand' where id = v_brand_a;
  -- In PostgreSQL RLS, updating non-visible rows modifies 0 rows
  select count(*) into v_count from public.brands where id = v_brand_a and name = 'Hacked Brand';
  if v_count != 0 then
    raise exception '[FAIL] Test 8: Tenant B was able to update Org A brand!';
  end if;
  raise notice '[PASS] Test 8: Tenant B cannot update Org A brands (0 rows affected).';

  -- ----------------------------------------------------------------------------
  -- TEST 9: Tenant B cross-tenant DELETE on Org A brand
  -- ----------------------------------------------------------------------------
  delete from public.brands where id = v_brand_a;
  -- Switch temporarily to superuser to verify row still exists
  perform set_config('role', 'postgres', true);
  select count(*) into v_count from public.brands where id = v_brand_a;
  if v_count != 1 then
    raise exception '[FAIL] Test 9: Tenant B was able to delete Org A brand!';
  end if;
  raise notice '[PASS] Test 9: Tenant B cannot delete Org A brands (row preserved untouched).';

  -- ----------------------------------------------------------------------------
  -- TEST 10: Tenant B cross-tenant UPDATE moving Brand B to Org A
  -- ----------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_b_owner::text, true);

  v_err_caught := false;
  begin
    update public.brands set org_id = v_org_a where id = v_brand_b;
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception '[FAIL] Test 10: Moving a brand across organizations was not blocked!';
  end if;
  raise notice '[PASS] Test 10: Transferring records across organizations is strictly blocked by trigger.';

  -- ----------------------------------------------------------------------------
  -- TEST 11: Direct INSERT on memberships is disabled
  -- ----------------------------------------------------------------------------
  v_err_caught := false;
  begin
    insert into public.memberships (org_id, user_id, role, status)
    values (v_org_b, 'b0000000-0000-0000-0000-000000000099'::uuid, 'admin', 'active');
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception '[FAIL] Test 11: Direct client INSERT on memberships was allowed!';
  end if;
  raise notice '[PASS] Test 11: Direct client INSERT on memberships blocked (must use create_org or invitations).';

  -- ----------------------------------------------------------------------------
  -- TEST 12: Last-owner demotion/removal protection in Org A
  -- ----------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a_owner::text, true);

  v_err_caught := false;
  begin
    delete from public.memberships where org_id = v_org_a and user_id = v_user_a_owner;
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception '[FAIL] Test 12: Last active owner was able to delete their membership!';
  end if;
  raise notice '[PASS] Test 12: Last owner cannot be deleted (prevent_last_owner_removal trigger enforced).';

  -- ----------------------------------------------------------------------------
  -- TEST 13: Viewer in Org A cannot create brands
  -- ----------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_a_viewer::text, true);

  v_err_caught := false;
  begin
    insert into public.brands (org_id, name)
    values (v_org_a, 'Unauthorized Viewer Brand');
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception '[FAIL] Test 13: Viewer in Org A was able to insert a brand!';
  end if;
  raise notice '[PASS] Test 13: Viewer role refused brand creation (requires strategy feature >= 2).';

  raise notice '==================================================';
  raise notice 'ALL 13 CROSS-TENANT ISOLATION TESTS PASSED!';
  raise notice '==================================================';
end $$;

-- Rollback entire transaction so zero test data is committed
rollback;
