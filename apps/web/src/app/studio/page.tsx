import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Wand2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
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
        title="AI"
        serifWord="studio"
        subtitle="Multi-modal creative playground powered by your brand voice and positioning."
      />
      <ComingSoon
        title="AI Content Studio"
        description="Generate high-converting copy, hook variations, and creative concepts customized to your brand voice."
        icon={Wand2}
        highlights={[
          "Direct brand voice and tone enforcement on all generations",
          "Multi-variation headline, hook, and body generator",
          "Interactive prompt playground with custom brand context",
        ]}
      />
    </AppShell>
  );
}
