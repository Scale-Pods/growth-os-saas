// Real-login RLS check against the cloud project. Prints results only, never keys or tokens.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(process.argv[2], "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const token = process.argv[3]; // invitation token

async function login(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("login failed: " + (j.msg || j.error_description || r.status));
  return j.access_token;
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function rest(jwt, path, opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
}

const owner = await login("cloudtest-owner@scalepods-test.dev", "CloudTest-Pass-9981");
const invitee = await login("cloudtest-invitee@scalepods-test.dev", "CloudTest-Pass-9981");

const ownerOrgs = await rest(owner, "organizations?select=id,slug");
const orgId = ownerOrgs.body?.[0]?.id;
check("owner sees own org", Array.isArray(ownerOrgs.body) && ownerOrgs.body.length === 1, `rows=${ownerOrgs.body?.length}`);

// --- BEFORE accepting: the invitee is a stranger to the owner's org ---
for (const t of ["organizations", "brands", "memberships", "feature_access", "invitations", "audit_log", "brand_profiles", "brand_facts"]) {
  const r = await rest(invitee, `${t}?select=*`);
  check(`stranger cannot read ${t}`, r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "-"}`);
}
let r = await rest(invitee, "brands", { method: "POST", body: JSON.stringify({ org_id: orgId, name: "intruder" }) });
check("stranger cannot insert a brand into the org", r.status >= 400, `status=${r.status}`);
r = await rest(invitee, `brands?org_id=eq.${orgId}`, { method: "PATCH", body: JSON.stringify({ name: "pwned" }) });
check("stranger cannot update the org's brands", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `status=${r.status}`);
r = await rest(invitee, `brands?org_id=eq.${orgId}`, { method: "DELETE" });
check("stranger cannot delete the org's brands", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `status=${r.status}`);
r = await rest(invitee, "rpc/my_role", { method: "POST", body: JSON.stringify({ p_org: orgId }) });
check("stranger has no role in the org", r.status === 200 && r.body === null, `status=${r.status} body=${JSON.stringify(r.body)}`);
r = await rest(invitee, "organizations?id=eq." + orgId, { method: "PATCH", body: JSON.stringify({ plan_id: "enterprise" }) });
check("stranger cannot change the org's plan", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `status=${r.status}`);
r = await rest(owner, `organizations?id=eq.${orgId}`, { method: "PATCH", body: JSON.stringify({ plan_id: "enterprise" }) });
check("even the owner cannot change their own plan", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
const anonR = await fetch(`${URL_}/rest/v1/brands?select=*`, { headers: { apikey: ANON } });
check("anonymous cannot read brands", anonR.status === 401 || anonR.status === 403, `status=${anonR.status}`);

// --- accept the invitation, then confirm access appears and the token is single-use ---
r = await rest(invitee, "rpc/accept_invitation", { method: "POST", body: JSON.stringify({ p_token: token }) });
check("invitee can accept the invitation", r.status === 200, `status=${r.status} ${typeof r.body === "string" ? "" : JSON.stringify(r.body).slice(0, 100)}`);
const after = await rest(invitee, "brands?select=id");
check("after accepting, invitee sees the org's brand", Array.isArray(after.body) && after.body.length === 1, `rows=${after.body?.length}`);
r = await rest(invitee, "rpc/accept_invitation", { method: "POST", body: JSON.stringify({ p_token: token }) });
check("token cannot be reused", r.status >= 400, `status=${r.status}`);
r = await rest(invitee, "invitations?select=*");
check("editor cannot read invitations", Array.isArray(r.body) && r.body.length === 0, `rows=${r.body?.length}`);
r = await rest(invitee, "brands", { method: "POST", body: JSON.stringify({ org_id: orgId, name: "second" }) });
check("editor can add a brand within plan (trial allows 3)", r.status === 201, `status=${r.status}`);
r = await rest(invitee, `memberships?org_id=eq.${orgId}&user_id=eq.${JSON.parse(Buffer.from(owner.split(".")[1], "base64url").toString()).sub}`, { method: "DELETE" });
check("editor cannot remove the owner", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `status=${r.status}`);

let failed = 0;
for (const x of results) {
  if (!x.ok) failed++;
  process.stdout.write(`${x.ok ? "PASS" : "FAIL"}  ${x.name}  (${x.detail})\n`);
}
process.stdout.write(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
