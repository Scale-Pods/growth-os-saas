import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PostComposer } from "@/components/composer/PostComposer";
import type { SocialAccount } from "@growth-os/db";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const ctx = await getAppContext();
  const { supabase, org, brand } = ctx;

  // Load social accounts for this brand/org
  let accountsQuery = supabase
    .from("social_accounts")
    .select("*")
    .eq("org_id", org.id);

  if (brand) {
    accountsQuery = accountsQuery.eq("brand_id", brand.id);
  }

  const { data: accountsData } = await accountsQuery.order("created_at", { ascending: true });
  const accounts = (accountsData ?? []) as SocialAccount[];

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
        title="Compose &"
        serifWord="schedule"
        subtitle="Craft multi-channel social releases, check character limits per platform, and preview formats."
      />
      <PostComposer
        accounts={accounts}
        brandId={brand?.id || ""}
        brandName={brand?.name || org.name}
      />
    </AppShell>
  );
}
