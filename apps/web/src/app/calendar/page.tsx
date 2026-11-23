import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarView, type CalendarPostItem } from "@/components/calendar/CalendarView";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

export const dynamic = "force-dynamic";

interface CalendarPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const ctx = await getAppContext();
  const { supabase, org, brand } = ctx;

  const resolvedParams = await searchParams;
  // Default to current month YYYY-MM
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = resolvedParams.month || defaultMonth;

  // Fetch posts for org (and brand if selected)
  let postsQuery = supabase
    .from("scheduled_posts")
    .select("*")
    .eq("org_id", org.id);

  if (brand) {
    postsQuery = postsQuery.eq("brand_id", brand.id);
  }

  const { data: postsData } = await postsQuery.order("created_at", { ascending: false });
  const rawPosts = (postsData ?? []) as ScheduledPost[];

  // Fetch social accounts
  let accountsQuery = supabase
    .from("social_accounts")
    .select("*")
    .eq("org_id", org.id);

  if (brand) {
    accountsQuery = accountsQuery.eq("brand_id", brand.id);
  }

  const { data: accountsData } = await accountsQuery;
  const accounts = (accountsData ?? []) as SocialAccount[];
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  // Fetch publish attempts for error messages on failed posts
  const failedPostIds = rawPosts.filter((p) => p.status === "failed").map((p) => p.id);
  const attemptsByPostId = new Map<string, string>();

  if (failedPostIds.length > 0) {
    const { data: attemptsData } = await supabase
      .from("publish_attempts")
      .select("post_id, error_message, error_code")
      .in("post_id", failedPostIds)
      .order("started_at", { ascending: false });

    if (attemptsData) {
      for (const att of attemptsData) {
        if (!attemptsByPostId.has(att.post_id) && att.error_message) {
          attemptsByPostId.set(att.post_id, att.error_message);
        }
      }
    }
  }

  const posts: CalendarPostItem[] = rawPosts.map((p) => ({
    ...p,
    account: accountsById.get(p.social_account_id),
    error: attemptsByPostId.get(p.id) || null,
  }));

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
      <PageHeader
        title="Publishing"
        serifWord="calendar"
        subtitle="Manage and visualize your multi-platform editorial timeline and scheduled releases."
      />
      <CalendarView posts={posts} currentMonth={currentMonth} />
    </AppShell>
  );
}
