"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";

/** "Continue with Google". Shown only when NEXT_PUBLIC_GOOGLE_AUTH=true (provider enabled in Supabase Auth). */
export function GoogleButton({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "true") return null;

  async function signIn() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeRedirect(next))}`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-panel text-foreground hover:opacity-90 text-sm font-medium"
      >
        Continue with Google
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
