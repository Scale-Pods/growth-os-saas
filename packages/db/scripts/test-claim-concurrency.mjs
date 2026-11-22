// 8 scheduler workers claim at the same moment from 12 due posts. Every post must be claimed
// exactly once (no duplicates, none missed). Uses real, separate connections, then cleans up.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
const [cmd, base] = url
  ? ["psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"]]
  : ["docker", ["exec", "-i", "supabase_db_growth-os-saas", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"]];

function run(sql) {
  return new Promise((resolve) => {
    const p = spawn(cmd, [...base, "-c", sql]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}
function runSync(sql) {
  const r = spawnSync(cmd, [...base, "-c", sql], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

const userId = randomUUID();
const slug = `claim-${userId.slice(0, 8)}`;
let orgId = null;
let failed = false;

try {
  let r = runSync(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('${userId}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${slug}@claim.test', '', now(), '{}', '{}', now(), now());`,
  );
  if (r.code !== 0) throw new Error("seed user failed: " + r.err);
  r = runSync(`insert into public.organizations (name, slug, created_by) values ('Claim test', '${slug}', '${userId}') returning id;`);
  if (r.code !== 0) throw new Error("seed org failed: " + r.err);
  orgId = r.out.split("\n")[0].trim();
  r = runSync(`insert into public.brands (org_id, name) values ('${orgId}', 'B') returning id;`);
  if (r.code !== 0) throw new Error("seed brand failed: " + r.err);
  const brandId = r.out.split("\n")[0].trim();
  r = runSync(
    `insert into public.social_accounts (org_id, brand_id, provider, provider_account_id, platform, display_name) values ('${orgId}', '${brandId}', 'fake', 'a1', 'instagram', 'A') returning id;`,
  );
  if (r.code !== 0) throw new Error("seed account failed: " + r.err);
  const acctId = r.out.split("\n")[0].trim();
  r = runSync(
    `insert into public.scheduled_posts (org_id, brand_id, social_account_id, caption, status, scheduled_for)
     select '${orgId}', '${brandId}', '${acctId}', 'p' || g, 'scheduled', now() - interval '1 minute' from generate_series(1, 12) g;`,
  );
  if (r.code !== 0) throw new Error("seed posts failed: " + r.err);

  const results = await Promise.all(
    Array.from({ length: 8 }, () => run(`select id from public.claim_due_posts(4) where org_id = '${orgId}';`)),
  );
  const claimed = results.flatMap((x) => (x.out ? x.out.split("\n").filter(Boolean) : []));
  const unique = new Set(claimed);
  const attempts = Number(runSync(`select count(*) from public.scheduled_posts where org_id = '${orgId}' and status = 'publishing' and attempts = 1;`).out);

  const checks = [
    ["every claim call succeeded", results.every((x) => x.code === 0), results.map((x) => x.code).join(",")],
    ["no post was claimed twice", claimed.length === unique.size, `claims=${claimed.length} unique=${unique.size}`],
    ["all 12 due posts were claimed", unique.size === 12 && attempts === 12, `unique=${unique.size} attempt1=${attempts}`],
  ];
  for (const [name, pass, detail] of checks) {
    process.stdout.write(`${pass ? "PASS" : "FAIL"}  ${name}  (${detail})\n`);
    if (!pass) failed = true;
  }
} catch (e) {
  process.stderr.write(String(e) + "\n");
  failed = true;
} finally {
  if (orgId) runSync(`delete from public.organizations where id = '${orgId}';`);
  runSync(`delete from auth.users where id = '${userId}';`);
}
process.exit(failed ? 1 : 0);
