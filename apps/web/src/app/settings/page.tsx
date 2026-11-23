import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Settings, Users, Activity } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
        title="Workspace"
        serifWord="settings"
        subtitle="Manage workspace preferences, API keys, brand integrations, and account settings."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-6">
        <Link
          href="/settings/team"
          className="card p-5 hover:border-primary/40 transition-all flex items-start gap-4 group"
        >
          <div className="w-10 h-10 rounded-xl bg-fill-tertiary flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              Team & access &rarr;
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Invite teammates, manage roles, and review pending invitations.
            </p>
          </div>
        </Link>
        <Link
          href="/settings/platform"
          className="card p-5 hover:border-primary/40 transition-all flex items-start gap-4 group"
        >
          <div className="w-10 h-10 rounded-xl bg-fill-tertiary flex items-center justify-center text-secondary group-hover:scale-105 transition-transform">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-secondary transition-colors">
              Platform status &rarr;
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              View system diagnostics, database connectivity, and health metrics.
            </p>
          </div>
        </Link>
      </div>
      <ComingSoon
        title="Workspace Settings Hub"
        description="Unified configuration console for organization settings, API credentials, and billing management."
        icon={Settings}
        highlights={[
          "Organization profile, billing plans, and invoicing",
          "API keys vault and secure credential management",
          "Notification preferences and audit log review",
        ]}
      />
    </AppShell>
  );
}
