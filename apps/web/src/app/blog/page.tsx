import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { Newspaper } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
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
        title="Blog"
        serifWord="engine"
        subtitle="SEO-optimized long-form article writing, schema generation, and CMS distribution."
      />
      <ComingSoon
        title="Blog CMS & SEO Studio"
        description="Author, optimize, and sync search-ranked articles directly to your website CMS."
        icon={Newspaper}
        highlights={[
          "Rich Markdown editor with live preview and syntax highlighting",
          "Real-time SEO scoring, readability analysis, and meta tag generator",
          "Direct webhook sync to WordPress, Webflow, and custom headless CMSs",
        ]}
      />
    </AppShell>
  );
}
