import "server-only";
import { AppError, JOB_KIND_TO_QUEUE } from "@growth-os/shared";
import type { Json } from "@growth-os/db";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { enqueueJob } from "@/lib/server-only/queue";
import type { OrgContext } from "@/lib/api/with-org";

/**
 * Create the user-visible job row, then enqueue it. The org always comes from the session context.
 * If the queue cannot be reached the row is failed with a reason straight away: it never sits `queued` forever.
 */
export async function createJob(
  ctx: OrgContext,
  args: { kind: string; brandId?: string | null; input?: Json },
): Promise<{ jobId: string }> {
  if (!JOB_KIND_TO_QUEUE[args.kind]) throw new AppError("VALIDATION_ERROR", "Unknown job type.", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("jobs")
    .insert({
      org_id: ctx.orgId,
      brand_id: args.brandId ?? null,
      kind: args.kind,
      status: "queued",
      input_ref: args.input ?? null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    ctx.log.error("could not create job row", { error: error?.message });
    throw new AppError("INTERNAL_ERROR", "Could not start the job. Please try again.", 500);
  }

  try {
    await enqueueJob(args.kind, data.id);
  } catch (e) {
    ctx.log.error("could not enqueue job", { job_id: data.id, error: e instanceof Error ? e.message : String(e) });
    await admin
      .from("jobs")
      .update({
        status: "failed",
        error_code: "QUEUE_UNAVAILABLE",
        error_message: "The job queue is not reachable right now. Nothing was charged. Please try again in a minute.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    throw new AppError("INTERNAL_ERROR", "The job queue is not reachable right now. Please try again in a minute.", 503);
  }
  return { jobId: data.id };
}
