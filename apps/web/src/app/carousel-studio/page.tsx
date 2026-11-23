import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Clapperboard } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CarouselStudioPage() {
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
        title="Carousel"
        serifWord="studio"
        subtitle="Design high-engagement visual slide decks for LinkedIn and Instagram."
      />
      <ComingSoon
        title="Carousel Deck Studio"
        description="Transform text ideas, blog posts, and research into polished, swipeable multi-slide carousel graphics."
        icon={Clapperboard}
        highlights={[
          "Auto-layout engine with brand color and typography presets",
          "One-click export to multi-page PDF and high-res image sets",
          "Proven hook and closing CTA slide templates",
        ]}
      />
    </AppShell>
  );
}
