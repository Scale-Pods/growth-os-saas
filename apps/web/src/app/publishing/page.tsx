import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PublishingConsole, type PublishingPostItem } from "@/components/publishing/PublishingConsole";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
  const ctx = await getAppContext();
  const { supabase, org, brand } = ctx;

  // 1. Load posts for org (and brand if selected)
  let postsQuery = supabase
    .from("scheduled_posts")
    .select("*")
    .eq("org_id", org.id);

  if (brand) {
    postsQuery = postsQuery.eq("brand_id", brand.id);
  }

  const { data: postsData } = await postsQuery.order("created_at", { ascending: false });
  const rawPosts = (postsData ?? []) as ScheduledPost[];

  // 2. Load social accounts
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

  // 3. Load publish attempts for failure reasons
  const failedIds = rawPosts.filter((p) => p.status === "failed").map((p) => p.id);
  const errorMessages = new Map<string, string>();

  if (failedIds.length > 0) {
    const { data: attempts } = await supabase
      .from("publish_attempts")
      .select("post_id, error_message")
      .in("post_id", failedIds)
      .order("started_at", { ascending: false });

    if (attempts) {
      for (const att of attempts) {
        if (!errorMessages.has(att.post_id) && att.error_message) {
          errorMessages.set(att.post_id, att.error_message);
        }
      }
    }
  }

  const posts: PublishingPostItem[] = rawPosts.map((p) => ({
    ...p,
    account: accountsById.get(p.social_account_id),
    error: errorMessages.get(p.id) || p.last_error_message || null,
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
        serifWord="engine"
        subtitle="Distribution queue, live publication statuses, and retry controls across all channels."
      />
      <PublishingConsole posts={posts} />
    </AppShell>
  );
}
