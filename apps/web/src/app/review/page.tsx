import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { CheckSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
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
        title="Creative"
        serifWord="review"
        subtitle="Collaborative quality assurance, brand compliance checks, and stakeholder sign-offs."
      />
      <ComingSoon
        title="Review & Approvals"
        description="Review drafts, leave visual feedback, verify brand compliance, and sign off before publishing."
        icon={CheckSquare}
        highlights={[
          "Automated brand voice compliance checklist",
          "Granular inline commenting and edit suggestions",
          "Multi-role approval flows with explicit sign-off gates",
        ]}
      />
    </AppShell>
  );
}
