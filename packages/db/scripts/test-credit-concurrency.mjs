// 20 parallel reservations against a balance of 100 (30 each) must succeed exactly 3 times
// and leave a balance of 10. Uses real, separate database connections (committed data),
// then cleans up. Local: needs Docker + `supabase start`. CI/other: set DATABASE_URL and psql.
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
const slug = `conc-${userId.slice(0, 8)}`;
let orgId = null;
let failed = false;

try {
  let r = runSync(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('${userId}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${slug}@concurrency.test', '', now(), '{}', '{}', now(), now());`,
  );
  if (r.code !== 0) throw new Error("seed user failed: " + r.err);
  r = runSync(`insert into public.organizations (name, slug, created_by) values ('Concurrency', '${slug}', '${userId}') returning id;`);
  if (r.code !== 0) throw new Error("seed org failed: " + r.err);
  orgId = r.out.split("\n")[0].trim();
  r = runSync(`select public.credits_grant('${orgId}', 100, 'concurrency-grant', null);`);
  if (r.code !== 0) throw new Error("grant failed: " + r.err);

  const results = await Promise.all(
    Array.from({ length: 20 }, () => run(`select public.credits_reserve('${orgId}', null, '${randomUUID()}', 30, 'reserve');`)),
  );
  const ok = results.filter((x) => x.code === 0).length;
  const refused = results.filter((x) => x.code !== 0 && x.err.includes("INSUFFICIENT_CREDITS")).length;
  const bal = Number(runSync(`select coalesce(sum(amount),0) from public.credit_ledger where org_id = '${orgId}';`).out);

  const checks = [
    ["exactly 3 of 20 reservations succeed", ok === 3, `succeeded=${ok}`],
    ["the other 17 are refused for insufficient credits", refused === 17, `refused=${refused}`],
    ["balance is 10 and never negative", bal === 10, `balance=${bal}`],
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
