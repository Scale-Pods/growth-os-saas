import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ctaText hover:opacity-90">
        Back to dashboard
      </Link>
    </div>
  );
}
