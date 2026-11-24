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
          className="card p-6 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-start gap-4 group bg-gradient-to-b from-card to-card/90"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/25 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-inner shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
              <span>Team & access</span>
              <span className="text-xs">&rarr;</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Invite teammates, manage roles, and review pending invitations.
            </p>
          </div>
        </Link>
        <Link
          href="/settings/platform"
          className="card p-6 hover:border-secondary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-start gap-4 group bg-gradient-to-b from-card to-card/90"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-secondary/20 to-secondary/5 border border-secondary/25 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform shadow-inner shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground group-hover:text-secondary transition-colors flex items-center gap-1.5">
              <span>Platform status</span>
              <span className="text-xs">&rarr;</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
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
