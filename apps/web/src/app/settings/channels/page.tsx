import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChannelsClient } from "@/components/channels/ChannelsClient";
import type { SocialAccount } from "@growth-os/db";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const ctx = await getAppContext();
  const { supabase, org, brand } = ctx;

  // Load all social accounts for this org
  const { data: accountsData } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  const accounts = (accountsData ?? []) as SocialAccount[];
  const canManage = ctx.role === "owner" || ctx.role === "admin";

  return (
    <AppShell
      currentOrg={org}
      organizations={ctx.organizations}
      currentBrand={brand}
      brands={ctx.brands}
      profile={ctx.profile}
      userEmail={ctx.user.email}
      userRole={ctx.role}
      features={ctx.features}
    >
      <PageHeader
        title="Connected"
        serifWord="channels"
        subtitle="Manage authorized social accounts, check connection health, and add new distribution endpoints."
      />
      <ChannelsClient
        brands={ctx.brands}
        accounts={accounts}
        canManage={canManage}
        activeBrandId={brand?.id}
      />
    </AppShell>
  );
}
