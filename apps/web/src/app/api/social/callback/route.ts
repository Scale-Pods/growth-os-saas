import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@growth-os/shared";
import { hashConnectState } from "@growth-os/shared/src/connect-state";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { socialProvider } from "@/lib/server-only/social";
import { mfaStatusFor } from "@/lib/mfa";
import { audit } from "@/lib/api/audit";

const log = createLogger({ service: "web", route: "social-callback" });

function back(req: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/settings/channels?${query}`, req.url));
}

/**
 * Step 2 of connecting a channel: the provider sends the customer back here.
 * We trust nothing in the URL except the state, which must be: ours, unused, unexpired, and tied to the
 * signed-in user who started it. The workspace and brand come from the stored state, never from the request.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state || state.length > 200) return back(req, "error=invalid_state");

  const admin = createAdminClient();
  const { data: rows, error: stateErr } = await admin.rpc("consume_connect_state", { p_hash: hashConnectState(state) });
  if (stateErr) {
    log.error("could not consume connect state", { error: stateErr.message });
    return back(req, "error=server");
  }
  const row = rows?.[0];
  if (!row) return back(req, "error=expired");
  if (row.user_id !== user.id) {
    log.warn("connect state used by a different user", { user_id: user.id, org_id: row.org_id });
    return back(req, "error=invalid_state");
  }

  // Re-check at the moment of return: still an owner/admin of that workspace, and two-factor done.
  const { data: role } = await supabase.rpc("my_role", { p_org: row.org_id });
  if (role !== "owner" && role !== "admin") return back(req, "error=forbidden");
  if ((await mfaStatusFor(supabase, role)) !== "ok") return back(req, "error=mfa");

  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k !== "state" && v.length <= 500) params[k] = v;
  });

  let accounts;
  try {
    accounts = await socialProvider().accountsFromCallback({ params, brandId: row.brand_id });
  } catch (e) {
    log.error("provider callback failed", { org_id: row.org_id, error: e instanceof Error ? e.message : String(e) });
    return back(req, "error=connect_failed");
  }

  const providerName = socialProvider().name;
  let saved = 0;
  for (const a of accounts) {
    // Update first: reconnecting an existing account must not count against the plan limit again.
    const { data: existing, error: selErr } = await admin
      .from("social_accounts")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("provider", providerName)
      .eq("provider_account_id", a.providerAccountId)
      .maybeSingle();
    if (selErr) {
      log.error("could not look up account", { org_id: row.org_id, error: selErr.message });
      return back(req, "error=server");
    }
    const fields = { display_name: a.displayName.slice(0, 200), avatar_url: a.avatarUrl, status: "active" as const, last_checked_at: null, connected_by: user.id };
    const { error } = existing
      ? await admin.from("social_accounts").update(fields).eq("id", existing.id).eq("org_id", row.org_id)
      : await admin.from("social_accounts").insert({
          org_id: row.org_id,
          brand_id: row.brand_id,
          provider: providerName,
          provider_account_id: a.providerAccountId,
          platform: a.platform,
          ...fields,
        });
    if (error) {
      // The plan-limit trigger raises a readable message; anything else is a server problem.
      const limit = error.message.includes("Plan limit");
      log.warn("could not save account", { org_id: row.org_id, limit });
      return back(req, limit ? "error=plan_limit" : "error=server");
    }
    saved++;
    await audit({ userId: user.id, orgId: row.org_id }, existing ? "channel.reconnected" : "channel.connected", { type: "social_account", id: a.providerAccountId }, { platform: a.platform });
  }
  return back(req, `connected=${saved}`);
}
