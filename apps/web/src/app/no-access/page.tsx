import Link from "next/link";

export const metadata = { title: "No access" };

/** Shown when a member types the URL of a feature they have no access to. */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const { feature } = await searchParams;
  const label = (feature ?? "this area").replace(/[^a-z0-9_ -]/gi, "").replace(/_/g, " ").slice(0, 40);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold text-foreground">No access</h1>
      <p className="text-sm text-muted-foreground">
        You do not have access to {label}. Ask a workspace admin to grant it in Team &amp; access.
      </p>
      <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ctaText hover:opacity-90">
        Back to dashboard
      </Link>
    </div>
  );
}
