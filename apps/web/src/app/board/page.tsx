import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { KanbanSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
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
        title="Team"
        serifWord="board"
        subtitle="Agile marketing workflows, campaign sprint tracking, and task assignments."
      />
      <ComingSoon
        title="Marketing Sprint Board"
        description="Organize campaigns, assign creative tasks, and monitor delivery status in an intuitive Kanban board."
        icon={KanbanSquare}
        highlights={[
          "Customizable workflow columns: Backlog, Drafting, Review, Scheduled, Live",
          "Teammate task assignments with due date tracking",
          "Filterable views by brand, channel, and campaign initiative",
        ]}
      />
    </AppShell>
  );
}
