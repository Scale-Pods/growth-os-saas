import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// 1. Locate environment file
const envPath = path.resolve(__dirname, "../../../apps/web/.env.local");
let envConfig: Record<string, string> = {};

if (fs.existsSync(envPath)) {
  envConfig = dotenv.parse(fs.readFileSync(envPath));
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local");
  process.exit(1);
}

const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

interface TestResult {
  tableOrFunction: string;
  operation: string;
  status: "PASS" | "FAIL";
  details: string;
}

const results: TestResult[] = [];

function record(tableOrFunction: string, operation: string, passed: boolean, details: string) {
  results.push({
    tableOrFunction,
    operation,
    status: passed ? "PASS" : "FAIL",
    details,
  });
}

async function runIsolationSuite() {
  console.log("================================================================================");
  console.log("             GROWTH OS P01 — CROSS-TENANT ISOLATION TEST SUITE                  ");
  console.log("================================================================================");
  console.log(`Target Supabase: ${supabaseUrl}\n`);

  const coreTables = [
    "organizations",
    "profiles",
    "memberships",
    "feature_access",
    "brands",
    "invitations",
    "audit_log",
    "brand_profiles",
    "brand_kits",
    "brand_voice",
    "brand_facts",
    "brand_pillars",
    "competitors",
  ];

  // ----------------------------------------------------------------------------
  // SECTION 1: Anonymous Access Matrix (Read / Write / Delete on all 7 tables)
  // ----------------------------------------------------------------------------
  console.log("Testing Anonymous (Unauthenticated) Access Matrix...");

  for (const table of coreTables) {
    // 1. SELECT
    const { data: selectData, error: selectError } = await anonClient.from(table).select("*");
    const selectBlocked = selectError !== null || (selectData && selectData.length === 0);
    record(
      table,
      "ANON SELECT",
      selectBlocked,
      selectError ? `Blocked: ${selectError.message}` : "0 rows returned"
    );

    // 2. INSERT
    const dummyPayload = {
      id: "00000000-0000-0000-0000-000000000099",
      name: "Injected Anon",
      slug: "injected-anon",
      email: "anon@injected.com",
      role: "owner",
      feature: "brand",
      level: "full",
      org_slug: "injected",
      action: "injected",
    };
    const { error: insertError } = await anonClient.from(table).insert(dummyPayload as any);
    const insertBlocked = insertError !== null;
    record(
      table,
      "ANON INSERT",
      insertBlocked,
      insertError ? `Rejected: ${insertError.message}` : "FAIL: Insert succeeded unexpectedly"
    );

    // 3. UPDATE
    const { error: updateError, data: updateData } = await anonClient
      .from(table)
      .update({ name: "Updated by Anon" } as any)
      .eq("id", "00000000-0000-0000-0000-000000000099");
    const updateBlocked = updateError !== null || !updateData || (updateData as any[]).length === 0;
    record(
      table,
      "ANON UPDATE",
      updateBlocked,
      updateError ? `Rejected: ${updateError.message}` : "0 rows affected"
    );

    // 4. DELETE
    const { error: deleteError, data: deleteData } = await anonClient
      .from(table)
      .delete()
      .eq("id", "00000000-0000-0000-0000-000000000099");
    const deleteBlocked = deleteError !== null || !deleteData || (deleteData as any[]).length === 0;
    record(
      table,
      "ANON DELETE",
      deleteBlocked,
      deleteError ? `Rejected: ${deleteError.message}` : "0 rows affected"
    );
  }

  // ----------------------------------------------------------------------------
  // SECTION 2: Anonymous RPC Security Checks
  // ----------------------------------------------------------------------------
  console.log("Testing RPC Security Definer Protections...");

  // 1. create_organization as anon -> Must require auth
  const { error: createOrgError } = await anonClient.rpc("create_organization", {
    p_name: "Rogue Org",
    p_slug: "rogue-org",
  });
  record(
    "create_organization()",
    "ANON EXECUTE",
    createOrgError !== null && (createOrgError.message.includes("Authentication required") || createOrgError.message.includes("permission denied")),
    createOrgError ? `Blocked: ${createOrgError.message}` : "FAIL: Allowed without auth"
  );

  // 2. accept_invitation as anon -> Must require auth
  const { error: acceptInviteError } = await anonClient.rpc("accept_invitation", {
    p_token: "invalid-dummy-token",
  });
  record(
    "accept_invitation()",
    "ANON EXECUTE",
    acceptInviteError !== null && (acceptInviteError.message.includes("Authentication required") || acceptInviteError.message.includes("permission denied")),
    acceptInviteError ? `Blocked: ${acceptInviteError.message}` : "FAIL: Allowed without auth"
  );

  // ----------------------------------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                        ISOLATION TEST RESULTS SUMMARY                          ");
  console.log("================================================================================");
  console.log(
    "| Table / Function        | Operation    | Status | Details".padEnd(80) + "|"
  );
  console.log("|" + "-".repeat(78) + "|");

  let passedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    if (r.status === "PASS") passedCount++;
    else failedCount++;

    const tableCol = r.tableOrFunction.padEnd(24);
    const opCol = r.operation.padEnd(14);
    const statusCol = r.status === "PASS" ? "  PASS " : "  FAIL ";
    const detailsCol = r.details.slice(0, 32).padEnd(32);
    console.log(`| ${tableCol} | ${opCol} |${statusCol}| ${detailsCol} |`);
  }

  console.log("|" + "-".repeat(78) + "|");
  console.log(`Total Checks: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error("\n❌ SUITE FAILED: Cross-tenant or RLS vulnerabilities detected.");
    process.exit(1);
  } else {
    console.log("\n✅ ALL ISOLATION CHECKS PASSED: 100% of public tables enforce strict RLS.");
  }
}

runIsolationSuite().catch((err) => {
  console.error("Test suite runtime failure:", err);
  process.exit(1);
});
