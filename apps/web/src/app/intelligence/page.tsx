import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { BrainCircuit } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
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
        title="Business"
        serifWord="intelligence"
        subtitle="Predictive models, engagement scoring, and algorithmic marketing insights."
      />
      <ComingSoon
        title="Marketing Intelligence"
        description="Harness machine learning models to predict post virality, pinpoint audience fatigue, and maximize ROI."
        icon={BrainCircuit}
        highlights={[
          "Pre-publish engagement prediction and readability scoring",
          "Audience demographic and sentiment shift analysis",
          "Actionable AI recommendations to improve lagging assets",
        ]}
      />
    </AppShell>
  );
}
