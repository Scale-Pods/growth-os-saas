import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type PostStatus } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { PlatformClient } from "./PlatformClient";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const ctx = await getAppContext();
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/no-access?feature=platform");
  const { supabase, org } = ctx;

  const [{ data: jobs }, { data: balance }] = await Promise.all([
    supabase.from("jobs").select("id, kind, status, error_message, created_at").eq("org_id", org.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("credit_balance").select("balance").eq("org_id", org.id).maybeSingle(),
  ]);

  return (
    <AppShell
      currentOrg={org}
      organizations={ctx.organizations}
      currentBrand={ctx.brand}
      brands={ctx.brands}
      profile={ctx.profile}
      userEmail={ctx.user.email}
      userRole={ctx.role}
      features={ctx.features}
    >
      <PageHeader title="Platform" serifWord="health" subtitle="Check that background jobs run and report progress. Credits balance and recent jobs for this workspace." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Test the worker</h2>
          <PlatformClient />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Credits</h2>
          <p className="text-3xl font-bold text-foreground">{balance?.balance ?? 0}</p>
          <p className="text-xs text-muted-foreground">Credits available in this workspace.</p>
        </section>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recent jobs</h2>
        <DataTable
          rows={jobs ?? []}
          rowKey={(j) => j.id}
          emptyTitle="No jobs yet"
          emptyHint="Run a test job above and it will appear here."
          columns={[
            { key: "kind", header: "Type", render: (j) => j.kind },
            { key: "status", header: "Status", render: (j) => <StatusBadge status={j.status as PostStatus} /> },
            { key: "msg", header: "Detail", render: (j) => j.error_message ?? "" },
            { key: "at", header: "Started", render: (j) => new Date(j.created_at).toLocaleString() },
          ]}
        />
      </section>
    </AppShell>
  );
}
