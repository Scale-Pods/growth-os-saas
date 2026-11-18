import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/with-org";
import { mfaStatusFor } from "@/lib/mfa";
import type { Brand, Organization, OrgRole, Profile } from "@growth-os/db";

/** Everything the app shell needs for a signed-in page, loaded with the user's session (RLS applies). */
export async function getAppContext() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: raw }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, organization:organizations(id, name, slug, plan_id, status, trial_ends_at, created_by, created_at, updated_at, onboarding_state)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const memberships = ((raw ?? []) as unknown as { role: OrgRole; organization: Organization | null }[]).filter(
    (m) => m.organization,
  );
  if (memberships.length === 0) redirect("/onboarding");

  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.organization!.id === preferred) ?? memberships[0]!;
  const org = active.organization!;

  // Owners and admins must complete two-factor authentication before seeing the app.
  if ((await mfaStatusFor(supabase, active.role)) !== "ok") redirect("/security/mfa");

  const [{ data: brandsData }, { data: features }] = await Promise.all([
    supabase.from("brands").select("*").eq("org_id", org.id).order("created_at", { ascending: true }),
    supabase.rpc("my_feature_levels", { p_org: org.id }),
  ]);
  const brands = (brandsData ?? []) as Brand[];
  const brandCookie = cookieStore.get("active_brand_id")?.value;
  const brand = brands.find((b) => b.id === brandCookie) ?? brands[0] ?? null;

  const levelName = ["none", "view", "edit", "full"];
  return {
    supabase,
    user,
    profile: profile as Profile | null,
    org,
    role: active.role,
    organizations: memberships.map((m) => ({ organization: m.organization!, role: m.role })),
    brands,
    brand,
    features: (features ?? []).map((f) => ({ feature: f.feature, level: levelName[f.level] ?? "none" })),
  };
}
