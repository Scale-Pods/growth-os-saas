// End-to-end smoke test for Trend Alerts: a REAL Google News check and the REAL AI, through the real queue and worker.
//   (worker running, ALERT_COLLECTORS not set)    pnpm --filter @growth-os/worker smoke:alerts
// Costs a fraction of a cent. Needs internet access. Creates a disposable workspace and removes it afterwards.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PgBoss } from "pg-boss";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dbUrl = process.env.DATABASE_URL!;
if (!url || !key || !dbUrl) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL are required");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("Local Supabase only.");

const db = createClient(url, key, { auth: { persistSession: false } });
const boss = new PgBoss({ connectionString: dbUrl, max: 2, schedule: false, supervise: false, migrate: false });
await boss.start();

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail && (!ok || name.startsWith("info")) ? `  (${detail})` : ""}\n`);
};

const slug = `alr-${randomUUID().slice(0, 8)}`;
const user = (await db.auth.admin.createUser({ email: `${slug}@smoke.test`, password: randomUUID(), email_confirm: true })).data.user!;
const org = (await db.from("organizations").insert({ name: "Alerts smoke", slug, created_by: user.id }).select("id").single()).data!;
await db.from("memberships").insert({ org_id: org.id, user_id: user.id, role: "owner" });
const brand = (await db.from("brands").insert({ org_id: org.id, name: "Smoke brand" }).select("id").single()).data!;
await db.rpc("credits_grant", { p_org: org.id, p_amount: 100, p_ref: "smoke" });
const watch = (
  await db
    .from("trend_watches")
    .insert({
      org_id: org.id,
      brand_id: brand.id,
      name: "AI image generation",
      description: "New AI image generation models and major quality or pricing changes. Not general company news.",
      keywords: ["AI image generation", "text-to-image model"],
      excludes: ["jobs", "hiring"],
      sources: ["Google News"],
      lookback_hours: 72,
      relevance_threshold: 50,
      monthly_budget_credits: 50,
      created_by: user.id,
    })
    .select("id")
    .single()
).data!;
await db.from("trend_rules").insert({ org_id: org.id, watch_id: watch.id, name: "In app", channel: "in_app", min_relevance: 50, min_importance: "low" });

async function startRun() {
  const { data, error } = await db.rpc("start_watch_run", { p_watch: watch.id, p_trigger: "manual", p_user: user.id });
  const row = data?.[0];
  if (error || !row?.job_id) throw new Error(`start_watch_run: ${error?.message ?? row?.refused}`);
  await boss.send("alerts.run", { jobId: row.job_id }, { retryLimit: 3, retryDelay: 15, retryBackoff: true });
  return row as { job_id: string; run_id: string };
}
async function waitJob(id: string, ms = 200_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { data } = await db.from("jobs").select("status, error_message").eq("id", id).single();
    if (data && (data.status === "done" || data.status === "failed")) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
const usageCount = async () => (await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("org_id", org.id)).count ?? 0;
const balance = async () => (await db.from("credit_balance").select("balance").eq("org_id", org.id).maybeSingle()).data?.balance ?? 0;

try {
  // 1. First check: real news in, stories out
  const bal0 = await balance();
  const r1 = await startRun();
  const j1 = await waitJob(r1.job_id);
  const run1 = (await db.from("trend_watch_runs").select("status, source_status, found, new_items, kept, alerts, credits_spent, error_message").eq("id", r1.run_id).single()).data!;
  check("first check finishes", j1?.status === "done" && run1.status === "done", j1?.error_message ?? run1.error_message ?? "timed out: is the worker running (without ALERT_COLLECTORS)?");
  const gn = (run1.source_status as Record<string, { ok: boolean; items?: number; reason?: string }>)["Google News"];
  check("Google News was read", gn?.ok === true && (gn.items ?? 0) > 0, gn?.reason ?? JSON.stringify(gn));
  check("new items were found", run1.found > 0 && run1.new_items > 0, `found=${run1.found} new=${run1.new_items}`);
  const events = (await db.from("trend_events").select("id, title, kind, source_count, relevance_score, importance, sentiment, summary").eq("watch_id", watch.id)).data ?? [];
  const mentions = (await db.from("trend_mentions").select("id", { count: "exact", head: true }).eq("watch_id", watch.id)).count ?? 0;
  check("info stories kept from the real headlines", true, `found=${run1.found} new=${run1.new_items} stories=${events.length} alerts=${run1.alerts} mentions saved=${mentions}`);
  check("every new link was remembered (so it is never paid for twice)", mentions >= run1.new_items - 0 && mentions > 0, `mentions=${mentions} new=${run1.new_items}`);
  check("story scores are in range", events.every((e) => e.relevance_score >= 0 && e.relevance_score <= 100 && ["low", "medium", "high"].includes(e.importance)));
  const usd1 = ((await db.from("ai_usage").select("cost_usd").eq("org_id", org.id)).data ?? []).reduce((a, u) => a + Number(u.cost_usd), 0);
  const spent1 = bal0 - (await balance());
  check("info the first check cost", true, `${spent1} credit(s), about $${usd1.toFixed(5)}`);
  check("credits were charged once for the run and recorded on the run", run1.credits_spent === spent1, `run=${run1.credits_spent} ledger=${spent1}`);
  const w1 = (await db.from("trend_watches").select("spent_credits_month, status").eq("id", watch.id).single()).data!;
  check("the watch's monthly spend was updated", w1.spent_credits_month === spent1 && w1.status === "active", `spent=${w1.spent_credits_month} status=${w1.status}`);
  const notes = (await db.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.id)).count ?? 0;
  check("alerts reached the owner's notifications", run1.alerts === 0 || notes >= 1, `alerts=${run1.alerts} notifications=${notes}`);

  // 2. Immediate second check: nothing new, so nothing is paid
  const usageBefore = await usageCount();
  const balBefore = await balance();
  const r2 = await startRun();
  const j2 = await waitJob(r2.job_id);
  const run2 = (await db.from("trend_watch_runs").select("status, new_items, credits_spent, error_message").eq("id", r2.run_id).single()).data!;
  check("second check finishes", j2?.status === "done" && run2.status === "done", j2?.error_message ?? run2.error_message ?? "timed out");
  check("a repeat check finds nothing new", run2.new_items === 0, `new=${run2.new_items}`);
  check("and costs nothing (no AI calls, no credits)", (await usageCount()) === usageBefore && (await balance()) === balBefore && run2.credits_spent === 0, `usage rows ${usageBefore}->${await usageCount()} credits ${balBefore}->${await balance()}`);

  // 3. Ledger is clean
  const l = (await db.from("credit_ledger").select("job_id, kind").eq("org_id", org.id).in("kind", ["reserve", "adjust", "release"])).data ?? [];
  const reserved = new Set(l.filter((x) => x.kind === "reserve").map((x) => x.job_id));
  const settled = new Set(l.filter((x) => x.kind !== "reserve").map((x) => x.job_id));
  check("every reservation was settled or released", [...reserved].every((j) => settled.has(j)), `reserved=${reserved.size} settled=${settled.size}`);
  check("the balance never went negative", (await balance()) >= 0);
} finally {
  await db.from("organizations").delete().eq("id", org.id);
  await db.auth.admin.deleteUser(user.id);
  await boss.stop({ graceful: false });
}
process.stdout.write(failed ? `\n${failed} check(s) FAILED\n` : "\nAll alerts smoke checks passed\n");
process.exit(failed ? 1 : 0);
