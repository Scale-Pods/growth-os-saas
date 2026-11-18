import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaClient } from "./MfaClient";

export const dynamic = "force-dynamic";

/** Two-factor setup / verification. Reachable by any signed-in user; required for owners and admins. */
export default async function MfaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/security/mfa");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card shadow-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Two-factor authentication</h1>
        <p className="text-sm text-muted-foreground">
          Owners and admins protect the workspace with an authenticator app (Google Authenticator, 1Password, Authy).
        </p>
        <MfaClient hasFactor={aal?.nextLevel === "aal2"} />
      </div>
    </main>
  );
}
