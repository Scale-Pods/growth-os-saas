import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Factory } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const ctx = await getAppContext();

  return (
    <AppShell
      currentOrg={ctx.org}
      organizations={ctx.organizations}
      currentBrand={ctx.brand}
      brands={ctx.brands}
      profile={ctx.profile}
      userEmail={ctx.user.email}
      userRole={ctx.role}
      features={ctx.features}
    >
      <PageHeader
        title="Content"
        serifWord="factory"
        subtitle="High-velocity batch production pipeline for multi-channel asset creation."
      />
      <ComingSoon
        title="Content Production Factory"
        description="Batch-create, organize, and syndicate marketing content at scale across all your active channels."
        icon={Factory}
        highlights={[
          "Bulk generation workflows from single source concepts",
          "Tagging, taxonomy, and asset library categorization",
          "Repurposing engine: convert long-form articles into social posts",
        ]}
      />
    </AppShell>
  );
}
