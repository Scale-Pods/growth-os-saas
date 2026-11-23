import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
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
        title="Performance"
        serifWord="analytics"
        subtitle="Audience reach, engagement velocity, and conversion attribution across all channels."
      />
      <ComingSoon
        title="Unified Performance Analytics"
        description="Consolidated cross-platform telemetry to measure return on marketing investment and creative performance."
        icon={BarChart3}
        highlights={[
          "Aggregated impressions, clicks, engagements, and CTR benchmarks",
          "Channel-by-channel performance comparisons",
          "Automated weekly executive summary reports",
        ]}
      />
    </AppShell>
  );
}
