import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { BrandManagementView } from "./BrandManagementView";
import type {
  Organization,
  Brand,
  OrgRole,
  BrandProfile,
  BrandKit,
  BrandVoice,
  BrandFact,
  BrandPillar,
  Competitor,
} from "@growth-os/db";

interface MembershipWithOrg {
  role: OrgRole;
  status: string;
  monthly_credit_cap: number | null;
  organization: Organization | null;
}

export default async function ClientsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  // 1. Verify authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Fetch active memberships
  const { data: rawMemberships } = await supabase
    .from("memberships")
    .select(`
      role,
      status,
      monthly_credit_cap,
      organization:organizations (
        id,
        name,
        slug,
        plan_id,
        status,
        trial_ends_at
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships = (rawMemberships as unknown as MembershipWithOrg[]) || [];

  if (memberships.length === 0 || !memberships[0]?.organization) {
    redirect("/onboarding");
  }

  // Determine active organization
  const activeOrgIdCookie = cookieStore.get("active_org_id")?.value;
  const activeMembership =
    memberships.find((m) => m.organization?.id === activeOrgIdCookie) ||
    memberships[0];

  const activeOrg = activeMembership.organization!;
  const userRole = activeMembership.role;

  // 4. Fetch brands for the active organization
  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("org_id", activeOrg.id)
    .order("created_at", { ascending: true });

  const brands = brandsData || [];

  // If no brand exists for this workspace, create a default one
  let activeBrand: Brand;
  if (brands.length === 0) {
    const { data: newBrand } = await supabase
      .from("brands")
      .insert({
        org_id: activeOrg.id,
        name: activeOrg.name,
        status: "active",
      })
      .select()
      .single();

    if (newBrand) {
      activeBrand = newBrand as Brand;
      brands.push(activeBrand);
    } else {
      redirect("/onboarding");
    }
  } else {
    const activeBrandIdCookie = cookieStore.get("active_brand_id")?.value;
    activeBrand =
      brands.find((b) => b.id === activeBrandIdCookie) || brands[0];
  }

  // 5. Fetch feature permissions
  const { data: rawFeatures } = await supabase
    .from("feature_access")
    .select("feature, level")
    .eq("org_id", activeOrg.id)
    .eq("user_id", user.id);

  const features = rawFeatures || [];

  // Build clean organization switcher list
  const organizationList = memberships
    .filter((m) => m.organization !== null)
    .map((m) => ({
      organization: m.organization!,
      role: m.role,
    }));

  // 6. Fetch P03 brand data (profile, kit, voice, facts, pillars, competitors)
  const [
    { data: brandProfile },
    { data: brandKit },
    { data: brandVoice },
    { data: brandFacts },
    { data: brandPillars },
    { data: competitors },
  ] = await Promise.all([
    supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .maybeSingle(),
    supabase
      .from("brand_kits")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .maybeSingle(),
    supabase
      .from("brand_voice")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .maybeSingle(),
    supabase
      .from("brand_facts")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("brand_pillars")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("target_share_pct", { ascending: false }),
    supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AppShell
      currentOrg={activeOrg}
      organizations={organizationList}
      currentBrand={activeBrand}
      brands={brands}
      profile={profile}
      userEmail={user.email}
      userRole={userRole}
      features={features}
    >
      <PageHeader
        title="Brand Knowledge &"
        serifWord="Kit"
        subtitle={`Complete marketing intelligence and visual guidelines for ${activeBrand.name}. Configured assets are automatically injected into AI Studio, Carousels, and Strategy generators.`}
        badge={
          <Badge tone="green">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Multi-Tenant Brand Hub</span>
          </Badge>
        }
      />

      <BrandManagementView
        currentOrg={activeOrg}
        currentBrand={activeBrand}
        brands={brands}
        profile={brandProfile as BrandProfile | null}
        kit={brandKit as BrandKit | null}
        voice={brandVoice as BrandVoice | null}
        facts={(brandFacts as BrandFact[]) || []}
        pillars={(brandPillars as BrandPillar[]) || []}
        competitors={(competitors as Competitor[]) || []}
        userRole={userRole}
      />
    </AppShell>
  );
}
