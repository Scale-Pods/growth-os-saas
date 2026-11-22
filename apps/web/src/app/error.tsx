"use client";

import { useEffect } from "react";

/** Route-level error boundary. Shows a calm message and the digest so support can find the log line. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Sentry is wired in a later step; the digest ties this screen to the server log entry.
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We could not load this page. Nothing was lost. Try again, and if it keeps happening send us the reference below.
      </p>
      {error.digest && <code className="rounded bg-fill-tertiary px-2 py-1 text-xs text-muted-foreground">Ref: {error.digest}</code>}
      <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ctaText hover:opacity-90">
        Try again
      </button>
    </div>
  );
}
