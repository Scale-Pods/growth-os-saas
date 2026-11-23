import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Target } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
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
        title="Marketing"
        serifWord="strategy"
        subtitle="Orchestrate quarterly positioning, campaign themes, and distribution pillars."
      />
      <ComingSoon
        title="Strategy & Campaigns"
        description="Align your content themes, audience personas, and positioning goals into unified campaign frameworks."
        icon={Target}
        highlights={[
          "Content pillar and sub-cluster thematic mapping",
          "Audience persona alignment with tailored value propositions",
          "Quarterly campaign timelines linked to publishing goals",
        ]}
      />
    </AppShell>
  );
}
