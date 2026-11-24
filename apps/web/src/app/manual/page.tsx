import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ManualClient } from "@/components/manual/ManualClient";

export const dynamic = "force-dynamic";

export default async function ManualPage() {
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
        title="User"
        serifWord="manual"
        subtitle="Complete guide to Marketing Growth OS: navigation directory, post lifecycles, and key terminology."
      />
      <ManualClient />
    </AppShell>
  );
}
