import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamClient, type MemberRow, type InviteRow } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await getAppContext();
  const { supabase, org, user } = ctx;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id, role, status, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  const ids = (memberships ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const members: MemberRow[] = (memberships ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    status: m.status,
    name: byId.get(m.user_id)?.full_name || "",
    email: byId.get(m.user_id)?.email || "",
    isYou: m.user_id === user.id,
  }));

  // Pending invitations are visible to owners/admins only (RLS); others get an empty list.
  const { data: inv } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("org_id", org.id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const invites: InviteRow[] = (inv ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expires_at,
  }));

  const canManage = ctx.role === "owner" || ctx.role === "admin";

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
      <PageHeader
        title="Team &"
        serifWord="access"
        subtitle="Invite teammates and control what each person can do in this workspace."
      />
      <TeamClient members={members} invites={invites} canManage={canManage} isOwner={ctx.role === "owner"} />
    </AppShell>
  );
}
