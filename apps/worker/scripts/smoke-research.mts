// End-to-end smoke test for research: intelligence report, trend scan and strategy through the REAL queue, worker and AI provider.
//   TREND_COLLECTORS=fake in the worker's env, and a running worker.   pnpm --filter @growth-os/worker smoke:research
// Spends a few cents on the cheapest model. Creates a disposable workspace and removes it afterwards.
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
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail && (!ok || name.startsWith("credits")) ? `  (${detail})` : ""}\n`);
};

const slug = `res-${randomUUID().slice(0, 8)}`;
const user = (await db.auth.admin.createUser({ email: `${slug}@smoke.test`, password: randomUUID(), email_confirm: true })).data.user!;
const org = (await db.from("organizations").insert({ name: "Research smoke", slug, created_by: user.id }).select("id").single()).data!;
const brand = (await db.from("brands").insert({ org_id: org.id, name: "Acme Robotics" }).select("id").single()).data!;
await db.from("brand_profiles").insert({
  org_id: org.id,
  brand_id: brand.id,
  tagline: "Robots for small factories",
  industry: "Manufacturing automation",
  description: "We build affordable collaborative robots for small and mid-sized factories.",
  target_audience: "Plant managers at factories with 20 to 200 employees",
  website_url: "https://example.com",
});
await db.from("brand_facts").insert({ org_id: org.id, brand_id: brand.id, statement: "Cuts changeover time by 5 hours per week", approved: true });
await db.from("brand_pillars").insert({ org_id: org.id, brand_id: brand.id, name: "Safety", target_share_pct: 50 });
await db.from("brand_pillars").insert({ org_id: org.id, brand_id: brand.id, name: "Efficiency", target_share_pct: 50 });
await db.rpc("credits_grant", { p_org: org.id, p_amount: 300, p_ref: "smoke" });

const QUEUE: Record<string, string> = { "intelligence.generate": "ai.text", "strategy.generate": "ai.text", "trends.scan": "trends.scan" };
async function start(kind: string, input: object) {
  const { data, error } = await db.rpc("start_content_job", { p_kind: kind, p_org: org.id, p_brand: brand.id, p_user: user.id, p_input: input as never });
  if (error || !data?.[0]) throw new Error(`start ${kind}: ${error?.message}`);
  await boss.send(QUEUE[kind]!, { jobId: data[0].job_id }, { retryLimit: 3, retryDelay: 15, retryBackoff: true });
  return data[0] as { job_id: string; row_id: string };
}
async function waitJob(id: string, ms = 240_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { data } = await db.from("jobs").select("status, error_message").eq("id", id).single();
    if (data && (data.status === "done" || data.status === "failed")) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
const balance = async () => (await db.from("credit_balance").select("balance").eq("org_id", org.id).maybeSingle()).data?.balance ?? 0;

try {
  const start0 = await balance();

  // 1. Intelligence report
  const intel = await start("intelligence.generate", {});
  const ij = await waitJob(intel.job_id);
  const rep = (await db.from("intelligence_reports").select("status, sections, full_report, error_message").eq("id", intel.row_id).single()).data!;
  check("intelligence report completes", ij?.status === "done" && rep.status === "completed", ij?.error_message ?? rep.error_message ?? "timed out: is the worker running?");
  const sections = (rep.sections ?? {}) as Record<string, string>;
  check("all seven sections are stored", Object.keys(sections).length === 7, Object.keys(sections).join(","));
  check("channels with no data say so instead of inventing an analysis", /No analysis available/.test(sections.instagram ?? "") && /No analysis available/.test(sections.linkedin ?? ""));
  const allText = Object.values(sections).join("\n") + "\n" + (rep.full_report ?? "");
  check("no invented percentages in the report", !/\d\s?%/.test(allText), (allText.match(/.{20}\d\s?%.{10}/) ?? [""])[0]);
  check("audience analysis was written by the model", (sections.audience ?? "").length > 200, `chars=${sections.audience?.length}`);

  // 2. Trend scan (sample collectors)
  const scan = await start("trends.scan", { sources: ["Reddit", "YouTube", "Google Trends"] });
  const sj = await waitJob(scan.job_id);
  const run = (await db.from("trend_runs").select("status, source_status, ai_summary").eq("id", scan.row_id).single()).data!;
  const sigs = (await db.from("trend_signals").select("id, topic, relevance_score").eq("run_id", scan.row_id).order("relevance_score", { ascending: false })).data ?? [];
  check("trend scan completes", sj?.status === "done" && (run.status === "completed" || run.status === "partial"), sj?.error_message ?? `status=${run.status} (is TREND_COLLECTORS=fake set?)`);
  check("signals are ranked and scored 0-100", sigs.length >= 1 && sigs.every((s) => s.relevance_score >= 0 && s.relevance_score <= 100), `signals=${sigs.length}`);

  // 3. Strategy from the top signals
  const top = sigs.slice(0, 2).map((s) => s.id);
  const today = new Date().toISOString().slice(0, 10);
  const strat = await start("strategy.generate", { scope: "week", platform: "linkedin", content_type: "", signal_ids: top, today });
  const stj = await waitJob(strat.job_id);
  const st = (await db.from("strategies").select("status, sections, content_calendar, ai_summary, error_detail").eq("id", strat.row_id).single()).data!;
  check("strategy completes", stj?.status === "done" && st.status === "completed", stj?.error_message ?? st.error_detail ?? "timed out");
  const parts = Object.keys((st.sections ?? {}) as object);
  check("six strategy parts and a summary are stored", parts.length === 6 && !!st.ai_summary, `parts=${parts.length}`);
  const cal = (st.content_calendar ?? []) as { scheduled_date: string | null }[];
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  check("calendar items stay inside the week", cal.length >= 1 && cal.every((c) => c.scheduled_date === null || (c.scheduled_date >= today && c.scheduled_date <= end)), `items=${cal.length}`);
  const stratText = JSON.stringify(st.sections) + JSON.stringify(cal) + (st.ai_summary ?? "");
  check("no invented percentages or money in the strategy", !/\d\s?%|[$€£]\s?\d/.test(stratText), (stratText.match(/.{20}(\d\s?%|[$€£]\s?\d).{10}/) ?? [""])[0]);

  // 4. Money: credits were spent through the gateway, never overspent
  const end0 = await balance();
  const usage = (await db.from("ai_usage").select("credits, cost_usd, model").eq("org_id", org.id)).data ?? [];
  const usd = usage.reduce((a, u) => a + Number(u.cost_usd), 0);
  check("credits were spent through the gateway and the balance is not negative", end0 < start0 && end0 >= 0, `spent=${start0 - end0} credits, ${usage.length} AI calls, about $${usd.toFixed(4)}`);
  const stuck = (await db.from("credit_ledger").select("job_id, kind").eq("org_id", org.id).in("kind", ["reserve", "adjust", "release"])).data ?? [];
  const reserved = new Set(stuck.filter((r) => r.kind === "reserve").map((r) => r.job_id));
  const settled = new Set(stuck.filter((r) => r.kind !== "reserve").map((r) => r.job_id));
  check("every reservation was settled or released (nothing stuck)", [...reserved].every((j) => settled.has(j)), `reserved=${reserved.size} settled=${settled.size}`);
} finally {
  await db.from("organizations").delete().eq("id", org.id);
  await db.auth.admin.deleteUser(user.id);
  await boss.stop({ graceful: false });
}
process.stdout.write(failed ? `\n${failed} check(s) FAILED\n` : "\nAll research smoke checks passed\n");
process.exit(failed ? 1 : 0);
