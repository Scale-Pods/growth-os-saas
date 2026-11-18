import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Building2, ArrowLeft, Plus, AlertCircle } from "lucide-react";
import { createBrandAction } from "../actions";
import type { Organization, Brand, OrgRole } from "@growth-os/db";

interface MembershipWithOrg {
  role: OrgRole;
  status: string;
  monthly_credit_cap: number | null;
  organization: Organization | null;
}

export default async function NewBrandPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

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

  const activeOrgIdCookie = cookieStore.get("active_org_id")?.value;
  const activeMembership =
    memberships.find((m) => m.organization?.id === activeOrgIdCookie) ||
    memberships[0];

  const activeOrg = activeMembership.organization!;
  const userRole = activeMembership.role;

  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("org_id", activeOrg.id)
    .order("created_at", { ascending: true });

  const brands = brandsData || [];
  const activeBrand = brands[0] || null;

  const organizationList = memberships
    .filter((m) => m.organization !== null)
    .map((m) => ({
      organization: m.organization!,
      role: m.role,
    }));

  async function handleCreate(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const res = await createBrandAction(activeOrg.id, name);
    if (res.success && res.data) {
      redirect("/clients");
    }
  }

  return (
    <AppShell
      currentOrg={activeOrg}
      organizations={organizationList}
      currentBrand={activeBrand}
      brands={brands}
      profile={profile}
      userEmail={user.email}
      userRole={userRole}
      features={[]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Brand Management
        </Link>

        <PageHeader
          title="Create New"
          serifWord="Brand"
          subtitle={`Add an isolated brand to ${activeOrg.name}. Each brand holds its own profile, visual kit, voice guardrails, and verified facts.`}
        />

        <Card className="space-y-5">
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/10 text-xs flex items-center justify-between">
            <span className="text-foreground">
              Current Plan: <strong className="capitalize">{activeOrg.plan_id}</strong> · Brands active:{" "}
              <strong>{brands.length}</strong>
            </span>
            <Badge tone="green">Plan Enforcement Active</Badge>
          </div>

          <form action={handleCreate} className="space-y-4">
            <div>
              <label className="label mb-1.5 block">Brand Name</label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Apex Health, ScalePods AI"
                className="input text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                You can configure the full visual identity, colors, and tone after creating the brand.
              </p>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <Link href="/clients" className="btn-ghost text-xs px-4 py-2">
                Cancel
              </Link>
              <button type="submit" className="btn-primary text-xs px-5 py-2">
                <Plus className="w-3.5 h-3.5" />
                <span>Create Brand</span>
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
