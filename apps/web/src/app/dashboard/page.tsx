import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMfaOrRedirect } from "@/lib/mfa";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile } from "@/components/ui/MetricTile";
import { Card } from "@/components/ui/Card";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import {
  CheckCircle2,
  Send,
  BarChart3,
  AlertCircle,
  CalendarDays,
  Building2,
  BrainCircuit,
  TrendingUp,
  Target,
  Factory,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Plus,
} from "lucide-react";
import type { Organization, Brand, OrgRole } from "@growth-os/db";

interface MembershipWithOrg {
  role: OrgRole;
  status: string;
  monthly_credit_cap: number | null;
  organization: Organization | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  // 1. Verify user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Fetch active memberships with associated organization details
  const { data: rawMemberships } = await supabase
    .from("memberships")
    .select(`
      role,
      status,
      monthly_credit_cap,
      organization:organizations (
        id,
        name,
        slug,
        plan_id,
        status,
        trial_ends_at
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships = (rawMemberships as unknown as MembershipWithOrg[]) || [];

  if (memberships.length === 0 || !memberships[0]?.organization) {
    redirect("/onboarding");
  }

  // Determine active organization (support cookie override if user has multiple)
  const activeOrgIdCookie = cookieStore.get("active_org_id")?.value;
  const activeMembership =
    memberships.find((m) => m.organization?.id === activeOrgIdCookie) ||
    memberships[0];

  const activeOrg = activeMembership.organization!;
  const userRole = activeMembership.role;
  await requireMfaOrRedirect(supabase, userRole);

  // 4. Fetch brands for the active organization
  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("org_id", activeOrg.id)
    .order("created_at", { ascending: true });

  const brands = brandsData || [];

  // Determine active brand (support cookie override)
  const activeBrandIdCookie = cookieStore.get("active_brand_id")?.value;
  const activeBrand =
    brands.find((b) => b.id === activeBrandIdCookie) || brands[0] || null;

  // 5. Fetch feature permissions
  const { data: rawFeatures } = await supabase
    .from("feature_access")
    .select("feature, level")
    .eq("org_id", activeOrg.id)
    .eq("user_id", user.id);

  const features = rawFeatures || [];

  // Build clean organization switcher list
  const organizationList = memberships
    .filter((m) => m.organization !== null)
    .map((m) => ({
      organization: m.organization!,
      role: m.role,
    }));

  // Mock weekly calendar strip items for reference parity
  const today = new Date();
  const currentDayIndex = today.getDay(); // 0 is Sunday
  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const weeklySchedule = daysOfWeek.map((dayName, idx) => {
    const isToday = (idx + 1) % 7 === currentDayIndex;
    let postCount = 0;
    let platform = "instagram";
    if (idx === 1) { postCount = 2; platform = "instagram"; }
    else if (idx === 3) { postCount = 1; platform = "linkedin"; }
    else if (idx === 4) { postCount = 3; platform = "youtube"; }
    else if (idx === 6) { postCount = 1; platform = "facebook"; }

    return {
      name: dayName,
      isToday,
      postCount,
      platform,
    };
  });

  return (
    <AppShell
      currentOrg={activeOrg}
      organizations={organizationList}
      currentBrand={activeBrand}
      brands={brands}
      profile={profile}
      userEmail={user.email}
      userRole={userRole}
      features={features}
    >
      {/* Page Header */}
      <PageHeader
        title="Welcome back to"
        serifWord="Growth OS"
        subtitle={`Marketing operating system for ${activeOrg.name}. Unified content generation, cross-platform publishing, and performance loop.`}
        badge={
          <Badge tone="green">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Workspace Active · {activeBrand?.name || activeOrg.name}</span>
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/strategy"
              className="btn-ghost text-xs px-3.5 py-2 flex items-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5 text-secondary" />
              <span>Generate Strategy</span>
            </Link>
            <Link
              href="/studio"
              className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Post</span>
            </Link>
          </div>
        }
      />

      {/* 4 Metric Tiles Row (Reference App Parity) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Approved & Ready"
          value="12"
          subtext="Ready to publish"
          accent="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricTile
          label="Published This Month"
          value="28"
          subtext="+14% vs last month"
          accent="blue"
          icon={<Send className="w-4 h-4" />}
        />
        <MetricTile
          label="Total Engagement"
          value="14.8k"
          subtext="Likes, comments & shares"
          accent="green"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <MetricTile
          label="Pending Review"
          value="4"
          subtext="Requires approval"
          accent="orange"
          icon={<AlertCircle className="w-4 h-4" />}
        />
      </div>

      {/* 2-Column Split: This Week Strip (Left) + Activity & Platforms (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        {/* Left Card: "This week" 7-Day Strip */}
        <Card className="flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 text-primary flex items-center justify-center">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">This Week</h2>
                <p className="text-xs text-muted-foreground">7-day publishing schedule</p>
              </div>
            </div>
            <Link
              href="/calendar"
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Full calendar <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 7-Day Columns */}
          <div className="grid grid-cols-7 gap-2">
            {weeklySchedule.map((d) => (
              <div
                key={d.name}
                className={`p-3 rounded-xl border flex flex-col items-center justify-between min-h-[110px] transition-all ${
                  d.isToday
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/60 bg-panel/50 hover:bg-panel"
                }`}
              >
                <div className="text-center">
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      d.isToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {d.name}
                  </div>
                  {d.isToday && (
                    <div className="text-[9px] text-primary font-medium">Today</div>
                  )}
                </div>

                {d.postCount > 0 ? (
                  <div className="w-full flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-foreground">
                      {d.postCount}
                    </span>
                    <PlatformBadge platform={d.platform} size="sm" className="truncate max-w-full" />
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">Empty</span>
                )}
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-fill-tertiary border border-border/60 text-xs text-muted-foreground flex items-center justify-between">
            <span>Next scheduled: Carousel post on LinkedIn</span>
            <span className="font-semibold text-foreground">Tomorrow, 10:00 AM</span>
          </div>
        </Card>

        {/* Right Stacked Column */}
        <div className="space-y-6">
          {/* Recent Activity Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
              <Link href="/publishing" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>

            <div className="space-y-2.5">
              {[
                {
                  title: "Q4 B2B Lead Gen Playbook",
                  platform: "linkedin",
                  status: "published",
                  time: "2 hours ago",
                },
                {
                  title: "10 Growth Engine Metrics to Track",
                  platform: "instagram",
                  status: "scheduled",
                  time: "Tomorrow, 2:30 PM",
                },
                {
                  title: "AI Automation Architecture Walkthrough",
                  platform: "youtube",
                  status: "in_review",
                  time: "Needs approval",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl border border-border/60 bg-panel/60 flex items-center justify-between gap-3 hover:bg-panel transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">
                      {item.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      <PlatformBadge platform={item.platform} size="sm" />
                      <span>{item.time}</span>
                    </div>
                  </div>
                  <Badge
                    tone={
                      item.status === "published"
                        ? "green"
                        : item.status === "scheduled"
                        ? "blue"
                        : "orange"
                    }
                  >
                    {item.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Connected Platforms Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Connected Platforms</h2>
              <span className="text-[10px] text-muted-foreground font-mono">4 channels</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { name: "Instagram", id: "instagram", connected: true },
                { name: "LinkedIn", id: "linkedin", connected: true },
                { name: "YouTube", id: "youtube", connected: false },
                { name: "Facebook", id: "facebook", connected: false },
              ].map((ch) => (
                <div
                  key={ch.id}
                  className="p-3 rounded-xl border border-border/60 bg-panel/50 flex items-center justify-between"
                >
                  <PlatformBadge platform={ch.id} size="sm" />
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                      ch.connected ? "text-primary" : "text-muted-foreground/60"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ch.connected ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                      }`}
                    />
                    {ch.connected ? "Live" : "Off"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Pipeline Shortcuts Grid (Exact Reference App M Array) */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Marketing Engine Shortcuts</h2>
          <p className="text-xs text-muted-foreground">
            Direct access to all active engines provisioned for your workspace
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {[
            {
              href: "/clients",
              label: "Business Profile",
              desc: "Brand knowledge base & competitors",
              icon: Building2,
              tone: "green",
            },
            {
              href: "/intelligence",
              label: "Intelligence",
              desc: "AI business analysis & reports",
              icon: BrainCircuit,
              tone: "blue",
            },
            {
              href: "/trends",
              label: "Trends",
              desc: "8-source signal scanner",
              icon: TrendingUp,
              tone: "orange",
            },
            {
              href: "/strategy",
              label: "Strategy",
              desc: "7-part content plan & approval",
              icon: Target,
              tone: "green",
            },
            {
              href: "/content",
              label: "Content Factory",
              desc: "Bulk copy + image generation",
              icon: Factory,
              tone: "blue",
            },
            {
              href: "/publishing",
              label: "Publishing",
              desc: "IG · YT · FB · LinkedIn queue",
              icon: Send,
              tone: "green",
            },
            {
              href: "/analytics",
              label: "Analytics",
              desc: "Post insights & learning loop",
              icon: BarChart3,
              tone: "blue",
            },
          ].map((sc) => {
            const Icon = sc.icon;
            return (
              <Link
                key={sc.label}
                href={sc.href}
                className="card p-4 flex items-center justify-between group hover:border-primary/50 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-panel border border-border/80 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors flex-shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {sc.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {sc.desc}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
