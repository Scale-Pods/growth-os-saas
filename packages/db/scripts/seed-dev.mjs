// Local development seed: gives you a login with sample data to build screens against.
//   pnpm --filter @growth-os/db seed:dev
// LOCAL Supabase only (it refuses to run against anything else). Safe to run again: it rebuilds the sample workspace.
//
// Login it creates:  dev@scalepods-test.dev  /  DevPass-12345
//   - member role "editor" with full access to every feature, so there is NO two-factor step
//   - workspace "Dev Workspace" with one brand, 500 credits, a fake Instagram + LinkedIn account
//   - sample posts in every status (draft, scheduled, published, failed) for the Calendar / Publishing screens
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Run `supabase status -o env` to see the local values.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("This seed only runs against LOCAL Supabase (127.0.0.1 / localhost).");

const db = createClient(url, key, { auth: { persistSession: false } });
const FEATURES = [
  "brand", "intelligence", "competitors", "trends", "trend_alerts", "strategy", "content_factory", "studio",
  "carousel_studio", "video_studio", "review", "board", "calendar", "publishing", "analytics", "leads", "team",
];
const DEV_EMAIL = "dev@scalepods-test.dev";
const OWNER_EMAIL = "seed-owner@scalepods-test.dev";
const PASSWORD = "DevPass-12345";
const SLUG = "dev-workspace";

async function removeUser(email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const u = data.users.find((x) => x.email === email);
  if (!u) return;
  await db.from("organizations").delete().eq("created_by", u.id);
  await db.auth.admin.deleteUser(u.id);
}
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

await removeUser(DEV_EMAIL);
await removeUser(OWNER_EMAIL);

const owner = must(await db.auth.admin.createUser({ email: OWNER_EMAIL, password: crypto.randomUUID(), email_confirm: true }), "owner user").user;
const dev = must(await db.auth.admin.createUser({ email: DEV_EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Dev Tester" } }), "dev user").user;

const org = must(await db.from("organizations").insert({ name: "Dev Workspace", slug: SLUG, created_by: owner.id }).select("id").single(), "organization");
must(await db.from("memberships").insert([{ org_id: org.id, user_id: owner.id, role: "owner" }, { org_id: org.id, user_id: dev.id, role: "editor" }]), "memberships");
must(await db.from("feature_access").insert(FEATURES.map((f) => ({ org_id: org.id, user_id: dev.id, feature: f, level: "full" }))), "feature access");
const brand = must(await db.from("brands").insert({ org_id: org.id, name: "Dev Brand" }).select("id").single(), "brand");
must(await db.rpc("credits_grant", { p_org: org.id, p_amount: 500, p_ref: "dev-seed" }), "credits");

const accounts = must(
  await db
    .from("social_accounts")
    .insert([
      { org_id: org.id, brand_id: brand.id, provider: "fake", provider_account_id: "dev-ig", platform: "instagram", display_name: "@dev.brand" },
      { org_id: org.id, brand_id: brand.id, provider: "fake", provider_account_id: "dev-li", platform: "linkedin_page", display_name: "Dev Brand (LinkedIn)" },
    ])
    .select("id, platform"),
  "social accounts",
);
const ig = accounts.find((a) => a.platform === "instagram").id;
const li = accounts.find((a) => a.platform === "linkedin_page").id;

const day = 24 * 3600 * 1000;
const at = (offsetDays, hour) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const base = { org_id: org.id, brand_id: brand.id, created_by: dev.id };
must(
  await db.from("scheduled_posts").insert([
    { ...base, social_account_id: ig, caption: "Draft: 3 mistakes that sink B2B launch posts", status: "draft" },
    { ...base, social_account_id: li, caption: "Scheduled: our Monday playbook is live.", status: "scheduled", scheduled_for: at(2, 9) },
    { ...base, social_account_id: ig, caption: "Scheduled: carousel on content pillars", status: "scheduled", scheduled_for: at(5, 14) },
    { ...base, social_account_id: li, caption: "Published: how we cut review time in half", status: "published", scheduled_for: at(-3, 10), provider_post_id: "fake-post-1", post_url: "https://example.com/post/1", published_at: at(-3, 10), attempts: 1 },
    { ...base, social_account_id: ig, caption: "Published: behind the scenes", status: "published", scheduled_for: at(-1, 16), provider_post_id: "fake-post-2", post_url: "https://example.com/post/2", published_at: at(-1, 16), attempts: 1 },
    { ...base, social_account_id: li, caption: "Failed: the login to this channel has expired.", status: "failed", scheduled_for: at(-2, 11), attempts: 1, last_error_code: "AUTH_EXPIRED", last_error_message: "The connection to LinkedIn has expired. Reconnect the channel and try again." },
  ], { defaultToNull: false }),
  "posts",
);

process.stdout.write(`Dev seed ready.\n  Login: ${DEV_EMAIL}  /  ${PASSWORD}\n  Workspace: Dev Workspace (editor role, no two-factor)\n  Sample data: 1 brand, 2 fake channels, 6 posts, 500 credits\n`);
