import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Send } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
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
        title="Publishing"
        serifWord="engine"
        subtitle="Automated distribution engine, queue management, and social platform integrations."
      />
      <ComingSoon
        title="Automated Publishing Engine"
        description="Directly distribute scheduled posts across LinkedIn, X, Facebook, and custom webhook destinations."
        icon={Send}
        highlights={[
          "Instant and queue-based multi-platform publishing pipelines",
          "Automatic token refresh and API rate-limit resilience",
          "Real-time dispatch telemetry and delivery status tracking",
        ]}
      />
    </AppShell>
  );
}
