import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
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
        serifWord="calendar"
        subtitle="Unified editorial timeline across all connected channels and distribution networks."
      />
      <ComingSoon
        title="Editorial Calendar"
        description="View, schedule, and reorganize your cross-channel content distribution on a dynamic visual timeline."
        icon={CalendarDays}
        highlights={[
          "Monthly, weekly, and daily interactive timeline views",
          "Drag-and-drop rescheduling across connected channels",
          "Optimal posting time recommendations based on audience engagement",
        ]}
      />
    </AppShell>
  );
}
