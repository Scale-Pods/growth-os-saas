import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { ThisWeekStrip } from "@/components/dashboard/ThisWeekStrip";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ConnectedPlatforms } from "@/components/dashboard/ConnectedPlatforms";
import Link from "next/link";
import { Target, Plus } from "lucide-react";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getAppContext();
  const { supabase, org, brand } = ctx;

  // 1. Fetch real posts for this org (and brand if selected)
  let postsQuery = supabase
    .from("scheduled_posts")
    .select("*")
    .eq("org_id", org.id);

  if (brand) {
    postsQuery = postsQuery.eq("brand_id", brand.id);
  }

  const { data: postsData } = await postsQuery.order("created_at", { ascending: false });
  const posts = (postsData ?? []) as ScheduledPost[];

  // 2. Fetch real social accounts
  let accountsQuery = supabase
    .from("social_accounts")
    .select("*")
    .eq("org_id", org.id);

  if (brand) {
    accountsQuery = accountsQuery.eq("brand_id", brand.id);
  }

  const { data: accountsData } = await accountsQuery.order("created_at", { ascending: true });
  const accounts = (accountsData ?? []) as SocialAccount[];
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  // Calculate real counts from database
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;
  const failedCount = posts.filter((p) => p.status === "failed").length;
  const draftCount = posts.filter((p) => p.status === "draft").length;

  return (
    <AppShell
      currentOrg={org}
      organizations={ctx.organizations}
      currentBrand={brand}
      brands={ctx.brands}
      profile={ctx.profile}
      userEmail={ctx.user.email}
      userRole={ctx.role}
      features={ctx.features}
    >
      {/* Page Header */}
      <PageHeader
        title="Welcome back to"
        serifWord="Growth OS"
        subtitle={`Marketing operating system for ${org.name}. Unified content generation, cross-platform publishing, and performance loop.`}
        badge={
          <Badge tone="green">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Workspace Active · {brand?.name || org.name}</span>
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
              href="/publishing/new"
              className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Post</span>
            </Link>
          </div>
        }
      />

      {/* 4 Metric Tiles Row with Real Numbers */}
      <DashboardMetrics
        scheduledCount={scheduledCount}
        publishedCount={publishedCount}
        failedCount={failedCount}
        draftCount={draftCount}
      />

      {/* 2-Column Split: This Week Strip (Left) + Activity & Platforms (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 mt-6">
        <ThisWeekStrip posts={posts} accountsById={accountsById} />

        <div className="space-y-6">
          <RecentActivity posts={posts} accountsById={accountsById} />
          <ConnectedPlatforms accounts={accounts} />
        </div>
      </div>
    </AppShell>
  );
}
