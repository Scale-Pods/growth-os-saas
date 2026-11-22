// End-to-end smoke test for the job platform. Needs a running worker and the local database.
//   pnpm --filter @growth-os/worker smoke
// Creates a disposable user + org, runs dummy jobs through the real queue, checks the results, cleans up.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PgBoss } from "pg-boss";
const QUEUE = "system.dummy";
const QUEUE_RETRY = { retryLimit: 3, retryDelay: 15, retryBackoff: true };

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dbUrl = process.env.DATABASE_URL!;
if (!url || !key || !dbUrl) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL are required");

const db = createClient(url, key, { auth: { persistSession: false } });
const boss = new PgBoss({ connectionString: dbUrl, max: 2, schedule: false, supervise: false, migrate: false });
await boss.start();

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const slug = `smoke-${randomUUID().slice(0, 8)}`;
const { data: user, error: userErr } = await db.auth.admin.createUser({ email: `${slug}@smoke.test`, password: randomUUID(), email_confirm: true });
if (userErr || !user.user) throw new Error("could not create user: " + userErr?.message);
const { data: org, error: orgErr } = await db.from("organizations").insert({ name: "Smoke", slug, created_by: user.user.id }).select("id").single();
if (orgErr || !org) throw new Error("could not create org: " + orgErr?.message);

async function start(input: object) {
  const { data, error } = await db
    .from("jobs")
    .insert({ org_id: org!.id, kind: "dummy", status: "queued", input_ref: input as never, created_by: user.user!.id })
    .select("id")
    .single();
  if (error || !data) throw new Error("job insert failed: " + error?.message);
  await boss.send(QUEUE, { jobId: data.id }, { ...QUEUE_RETRY });
  return data.id;
}
async function waitFor(id: string, until: (s: string) => boolean, ms = 30_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { data } = await db.from("jobs").select("status, progress, error_message, error_code").eq("id", id).single();
    if (data && until(data.status)) return data;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

try {
  // 1. a normal job runs, reports progress and finishes
  const j1 = await start({ steps: 3, stepMs: 300 });
  const r1 = await waitFor(j1, (s) => s === "done");
  check("dummy job finishes", r1?.status === "done", r1 ? "" : "timed out: is the worker running?");

  // 2. a failing job ends as failed with a human-readable reason
  const j2 = await start({ steps: 4, stepMs: 200, fail: true });
  const r2 = await waitFor(j2, (s) => s === "failed");
  check("failing job ends as failed with a reason", r2?.status === "failed" && (r2.error_message ?? "").length > 10, r2?.error_message ?? "");

  // 3. the same queue message processed twice does not run the job twice (idempotent)
  const { data: before } = await db.from("jobs").select("finished_at").eq("id", j1).single();
  await boss.send(QUEUE, { jobId: j1 }, { ...QUEUE_RETRY });
  await new Promise((r) => setTimeout(r, 3000));
  const { data: after } = await db.from("jobs").select("finished_at, status").eq("id", j1).single();
  check("a finished job is not run again", after?.status === "done" && after.finished_at === before?.finished_at);

  // 4. the stuck-job rescue fails a running job with no heartbeat and reports it
  const stuck = randomUUID();
  await db.from("jobs").insert({
    id: stuck,
    org_id: org.id,
    kind: "dummy",
    status: "running",
    started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    heartbeat_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    created_by: user.user.id,
  });
  const { data: rescued } = await db.rpc("rescue_stuck_jobs", { p_minutes: 10 });
  const rs = await db.from("jobs").select("status, error_message").eq("id", stuck).single();
  check("rescue fails a job whose worker vanished", (rescued ?? 0) >= 1 && rs.data?.status === "failed", rs.data?.error_message ?? "");
} finally {
  await db.from("organizations").delete().eq("id", org.id);
  await db.auth.admin.deleteUser(user.user.id);
  await boss.stop({ graceful: false });
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll smoke checks passed");
process.exit(failed ? 1 : 0);
