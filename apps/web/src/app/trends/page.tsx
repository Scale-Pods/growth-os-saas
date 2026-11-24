import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
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
        title="Market"
        serifWord="trends"
        subtitle="Real-time trend analysis, emerging topic detection, and audience sentiment shifts."
      />
      <ComingSoon
        title="Trends Intelligence"
        description="Detect breakout industry trends, viral conversations, and emerging keywords before your competitors."
        icon={TrendingUp}
        highlights={[
          "Surge volume tracking across Reddit, X, LinkedIn, and Google Search",
          "Automated relevance scoring tuned to your brand's ICP",
          "One-click conversion from trending insight to content draft",
        ]}
      />
    </AppShell>
  );
}
