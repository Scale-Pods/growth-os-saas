import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRole } from "@growth-os/db";

/** Owners and admins must use two-factor authentication (P01). */
export const MFA_REQUIRED_ROLES: OrgRole[] = ["owner", "admin"];

export type MfaStatus = "ok" | "enroll" | "verify";

/**
 * ok      - not required for this role, or the session is already aal2
 * enroll  - required, but the user has no verified authenticator yet
 * verify  - required, the user has an authenticator but this session has not passed it
 */
export async function mfaStatusFor(supabase: SupabaseClient, role: OrgRole): Promise<MfaStatus> {
  if (!MFA_REQUIRED_ROLES.includes(role)) return "ok";
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "verify"; // fail closed
  if (data.currentLevel === "aal2") return "ok";
  return data.nextLevel === "aal2" ? "verify" : "enroll";
}

/** Page guard: send owners/admins who have not passed two-factor to /security/mfa. */
export async function requireMfaOrRedirect(supabase: SupabaseClient, role: OrgRole): Promise<void> {
  if ((await mfaStatusFor(supabase, role)) !== "ok") redirect("/security/mfa");
}
