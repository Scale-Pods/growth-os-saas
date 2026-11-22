import { withOrg } from "@/lib/api/with-org";

/** Balance and recent movements for the active workspace. Read through the user's session, so RLS applies. */
export const GET = withOrg({ feature: "brand", level: "view" }, async (ctx) => {
  const [{ data: bal, error: balErr }, { data: recent, error: recErr }] = await Promise.all([
    ctx.supabase.from("credit_balance").select("balance").eq("org_id", ctx.orgId).maybeSingle(),
    ctx.supabase
      .from("credit_ledger")
      .select("id, kind, amount, created_at")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (balErr || recErr) throw new Error(balErr?.message ?? recErr?.message);
  return { balance: bal?.balance ?? 0, recent: recent ?? [] };
});
