import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";
import { WorkspaceCreationCard } from "./WorkspaceCreationCard";
import type { Organization, Brand, OnboardingState, OrgRole } from "@growth-os/db";

interface MembershipWithOrg {
  role: OrgRole;
  status: string;
  monthly_credit_cap: number | null;
  organization: Organization | null;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  // 1. Verify user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch active memberships
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
        onboarding_state,
        trial_ends_at
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships = (rawMemberships as unknown as MembershipWithOrg[]) || [];

  // If user does not have any workspace yet, render the initial workspace creation card
  if (memberships.length === 0 || !memberships[0]?.organization) {
    return <WorkspaceCreationCard userEmail={user.email || ""} />;
  }

  // Determine active organization
  const activeOrgIdCookie = cookieStore.get("active_org_id")?.value;
  const activeMembership =
    memberships.find((m) => m.organization?.id === activeOrgIdCookie) ||
    memberships[0];

  const organization = activeMembership.organization!;

  // 3. Fetch or ensure default brand
  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("org_id", organization.id)
    .order("created_at", { ascending: true });

  let brand: Brand;
  if (!brandsData || brandsData.length === 0) {
    const { data: newBrand } = await supabase
      .from("brands")
      .insert({
        org_id: organization.id,
        name: organization.name,
        status: "active",
      })
      .select()
      .single();

    brand = newBrand as Brand;
  } else {
    brand = brandsData[0];
  }

  const rawState = organization.onboarding_state as unknown;
  const initialState: OnboardingState =
    rawState && typeof rawState === "object"
      ? (rawState as OnboardingState)
      : { step: 1, completed: false };

  return (
    <OnboardingWizard
      organization={organization}
      brand={brand}
      initialState={initialState}
      userEmail={user.email || ""}
    />
  );
}
