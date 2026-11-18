import "server-only";
import { redact, AppError } from "@growth-os/shared";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import type { Json } from "@growth-os/db";

export interface AuditActor {
  userId: string;
  orgId?: string | null;
  ip?: string | null;
}

/**
 * Append an entry to the audit log (sign-ins, role changes, invites, brand create/delete).
 * Written with the service role because clients have no insert policy on audit_log.
 * Secret-looking metadata keys are redacted. A failed write is surfaced, never swallowed.
 */
export async function audit(
  actor: AuditActor,
  action: string,
  target?: { type: string; id: string },
  meta: Record<string, unknown> = {},
): Promise<void> {
  const admin = createAdminClient();

  let orgSlug = "system";
  if (actor.orgId) {
    const { data, error } = await admin.from("organizations").select("slug").eq("id", actor.orgId).maybeSingle();
    if (error) throw new AppError("INTERNAL_ERROR", "Could not write audit entry.", 500, error.message);
    if (data?.slug) orgSlug = data.slug;
  }

  const { error } = await admin.from("audit_log").insert({
    org_id: actor.orgId ?? null,
    org_slug: orgSlug,
    actor_id: actor.userId,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    metadata: redact(meta) as Json,
    ip: actor.ip ?? null,
  });
  if (error) throw new AppError("INTERNAL_ERROR", "Could not write audit entry.", 500, error.message);
}
