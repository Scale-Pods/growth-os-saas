// End-to-end smoke test for publishing. Needs a running worker (with the fake provider) and the local database.
//   pnpm --filter @growth-os/worker smoke:publish
// The scheduler ticks once a minute, so this takes a couple of minutes. It creates a disposable workspace and cleans up.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("Local Supabase only.");
const db = createClient(url, key, { auth: { persistSession: false } });

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}\n`);
};

const slug = `pub-${randomUUID().slice(0, 8)}`;
const { data: user, error: ue } = await db.auth.admin.createUser({ email: `${slug}@smoke.test`, password: randomUUID(), email_confirm: true });
if (ue || !user.user) throw new Error("user: " + ue?.message);
const org = (await db.from("organizations").insert({ name: "Publish smoke", slug, created_by: user.user.id }).select("id").single()).data!;
const brand = (await db.from("brands").insert({ org_id: org.id, name: "B" }).select("id").single()).data!;
const mk = async (platform: string, pid: string) =>
  (
    await db
      .from("social_accounts")
      .insert({ org_id: org.id, brand_id: brand.id, provider: "fake", provider_account_id: pid, platform, display_name: pid })
      .select("id")
      .single()
  ).data!.id as string;
const good = await mk("linkedin", "smoke-li-good");
const bad = await mk("linkedin", "smoke-li-bad");

const past = () => new Date(Date.now() - 60_000).toISOString();
async function post(caption: string, extra: Record<string, unknown> = {}, account = good) {
  const { data, error } = await db
    .from("scheduled_posts")
    .insert({ org_id: org.id, brand_id: brand.id, social_account_id: account, caption, status: "scheduled", scheduled_for: past(), ...extra })
    .select("id")
    .single();
  if (error || !data) throw new Error("post insert: " + error?.message);
  return data.id as string;
}
async function waitFor(id: string, done: (s: string) => boolean, ms = 200_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { data } = await db.from("scheduled_posts").select("status, provider_post_id, attempts, last_error_code, last_error_message, scheduled_for").eq("id", id).single();
    if (data && done(data.status)) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

try {
  const okId = await post("Smoke test: a normal post");
  const authId = await post("Smoke test [fail:AUTH_EXPIRED]", {}, bad);
  const flakyId = await post("Smoke test [fail-once:RATE_LIMITED]");
  // A post whose worker "crashed" mid-publish 20 minutes ago: the rescue job must bring it back and publish it once.
  const crashedId = await post("Smoke test: recovered after a crash", {
    status: "publishing",
    locked_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    attempts: 1,
  });

  const ok = await waitFor(okId, (s) => s === "published");
  check("normal post is published within a tick or two", ok?.status === "published" && !!ok.provider_post_id, ok?.provider_post_id ?? "timed out: is the worker running?");

  const auth = await waitFor(authId, (s) => s === "failed");
  check("expired login fails with a reason and no retry", auth?.status === "failed" && auth.last_error_code === "AUTH_EXPIRED" && auth.attempts === 1, auth?.last_error_message ?? "");
  const acct = (await db.from("social_accounts").select("status").eq("id", bad).single()).data;
  check("the failing channel is flagged for reconnect", acct?.status === "needs_reconnect", `status=${acct?.status}`);

  const crashed = await waitFor(crashedId, (s) => s === "published");
  check("a crashed post is rescued and published exactly once", crashed?.status === "published" && !!crashed.provider_post_id, `attempts=${crashed?.attempts}`);

  // The flaky post fails once with RATE_LIMITED, is rescheduled about a minute out, then publishes on attempt 2.
  const flaky = await waitFor(flakyId, (s) => s === "published" || s === "failed");
  check("flaky post is retried and then published", flaky?.status === "published" && flaky.attempts === 2, `status=${flaky?.status} attempts=${flaky?.attempts}`);

  const goodAcct = (await db.from("social_accounts").select("status").eq("id", good).single()).data;
  check("the healthy channel stays active", goodAcct?.status === "active", `status=${goodAcct?.status}`);

  const { data: attempts } = await db.from("publish_attempts").select("post_id, attempt_no, outcome").eq("org_id", org.id);
  check("every post has attempt records", (attempts?.length ?? 0) >= 4, `rows=${attempts?.length}`);
  const dupes = new Map<string, number>();
  for (const a of attempts ?? []) if (a.outcome === "success") dupes.set(a.post_id, (dupes.get(a.post_id) ?? 0) + 1);
  check("no post has more than one success record", [...dupes.values()].every((n) => n === 1));
} finally {
  await db.from("organizations").delete().eq("id", org.id);
  await db.auth.admin.deleteUser(user.user.id);
}
process.stdout.write(failed ? `\n${failed} check(s) FAILED\n` : "\nAll publish smoke checks passed\n");
process.exit(failed ? 1 : 0);
