import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { BellRing } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TrendAlertsPage() {
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
        title="Trend"
        serifWord="alerts"
        subtitle="Configure proactive alerts and webhook notifications for breakout marketing opportunities."
      />
      <ComingSoon
        title="Real-Time Trend Alerts"
        description="Set threshold triggers to get notified immediately when relevant topics spike across social and search."
        icon={BellRing}
        highlights={[
          "Custom alert rules by keyword, engagement velocity, and niche",
          "Multi-channel notifications via Slack, email, or in-app alerts",
          "Instant draft actions directly from incoming notification payloads",
        ]}
      />
    </AppShell>
  );
}
