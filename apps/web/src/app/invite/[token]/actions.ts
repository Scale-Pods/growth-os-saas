"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/with-org";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, "This invitation link is not valid.");

/** Accept an invitation. All checks (hash, expiry, verified email, matching email, single use) run in the database. */
export async function acceptInvitationAction(
  rawToken: string,
): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return { ok: false, error: "This invitation link is not valid." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to accept this invitation." };

  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data });
  if (error || !orgId) {
    // The database messages are written for people ("issued to a different email address", "expired", ...).
    return { ok: false, error: error?.message ?? "Could not accept the invitation." };
  }

  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  // The database already wrote the audit entry (invitation.accepted).
  revalidatePath("/", "layout");
  return { ok: true, orgId };
}
