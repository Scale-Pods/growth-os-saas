import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Film } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function VideoStudioPage() {
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
        title="Video"
        serifWord="studio"
        subtitle="Script, storyboard, and generate short-form video assets for Reels, TikTok, and Shorts."
      />
      <ComingSoon
        title="Video Script & Production Studio"
        description="From hook generation to teleprompter scripts and automated short-form video packaging."
        icon={Film}
        highlights={[
          "Viral hook scripts and pacing suggestions",
          "Teleprompter mode with timing and emphasis guides",
          "Automated subtitle and caption file generation",
        ]}
      />
    </AppShell>
  );
}
