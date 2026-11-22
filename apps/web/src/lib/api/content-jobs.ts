import "server-only";
import { AppError, ESTIMATED_CREDITS } from "@growth-os/shared";
import type { Json } from "@growth-os/db";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { enqueueJob } from "@/lib/server-only/queue";
import type { OrgContext } from "@/lib/api/with-org";

/**
 * Start a research job (intelligence report, trend scan, strategy, strategy part).
 *
 * 1. Refuse early if the workspace clearly cannot afford it (each AI call still reserves its own credits).
 * 2. The database creates the job AND its placeholder row in ONE transaction, so a screen never sees a job
 *    without a row. The workspace comes from the session, never from the request.
 * 3. Queue it. If the queue is unreachable the job and its placeholder are failed with a reason straight away:
 *    nothing sits "processing" forever.
 */
export async function startContentJob(
  ctx: OrgContext,
  kind: keyof typeof ESTIMATED_CREDITS & string,
  brandId: string,
  input: Record<string, Json | undefined>,
): Promise<{ jobId: string; rowId: string; estimatedCredits: number }> {
  const estimated = ESTIMATED_CREDITS[kind] ?? 1;

  const { data: bal } = await ctx.supabase.from("credit_balance").select("balance").eq("org_id", ctx.orgId).maybeSingle();
  if ((bal?.balance ?? 0) < estimated) {
    throw new AppError("INSUFFICIENT_CREDITS", `This needs about ${estimated} credits and you have ${bal?.balance ?? 0}. Add credits or wait for your monthly refill.`, 402);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_content_job", {
    p_kind: kind,
    p_org: ctx.orgId,
    p_brand: brandId,
    p_user: ctx.user.id,
    p_input: input as Json,
  });
  if (error || !data?.[0]) {
    // The database refuses with readable messages for bad scope, sources, signals or brands.
    const readable = error?.code === "P0001" ? error.message : "Could not start this. Please try again.";
    if (error?.code !== "P0001") ctx.log.error("could not start content job", { kind, error: error?.message });
    throw new AppError(error?.code === "P0001" ? "VALIDATION_ERROR" : "INTERNAL_ERROR", readable, error?.code === "P0001" ? 400 : 500);
  }
  const { job_id: jobId, row_id: rowId } = data[0];

  try {
    await enqueueJob(kind, jobId);
  } catch (e) {
    ctx.log.error("could not enqueue content job", { job_id: jobId, kind, error: e instanceof Error ? e.message : String(e) });
    const message = "The job queue is not reachable right now. Nothing was charged. Please try again in a minute.";
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("jobs").update({ status: "failed", error_code: "QUEUE_UNAVAILABLE", error_message: message, finished_at: now }).eq("id", jobId),
      admin.from("intelligence_reports").update({ status: "failed", error_message: message }).eq("job_id", jobId).in("status", ["pending", "processing"]),
      admin.from("trend_runs").update({ status: "failed", error_message: message, finished_at: now }).eq("job_id", jobId).in("status", ["pending", "running"]),
      admin.from("strategies").update({ status: "failed", error_detail: message }).eq("job_id", jobId).eq("status", "processing"),
    ]);
    throw new AppError("INTERNAL_ERROR", message, 503);
  }
  return { jobId, rowId, estimatedCredits: estimated };
}
