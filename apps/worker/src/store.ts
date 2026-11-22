import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow, JobStore } from "./runner";

/** Job storage using the service role. Every write is scoped by job id; org checks happen in the runner. */
export function supabaseJobStore(db: SupabaseClient): JobStore {
  function must(error: { message: string } | null, what: string) {
    if (error) throw new Error(`${what}: ${error.message}`);
  }
  return {
    async load(jobId) {
      const { data, error } = await db
        .from("jobs")
        .select("id, org_id, brand_id, kind, status, input_ref, created_by")
        .eq("id", jobId)
        .maybeSingle();
      must(error, "load job");
      return (data as JobRow | null) ?? null;
    },
    async countRunning(orgId) {
      const { count, error } = await db
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "running");
      must(error, "count running jobs");
      return count ?? 0;
    },
    async markRunning(jobId) {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from("jobs")
        .update({ status: "running", started_at: now, heartbeat_at: now })
        .eq("id", jobId)
        .eq("status", "queued")
        .select("id");
      must(error, "claim job");
      return (data?.length ?? 0) === 1;
    },
    async heartbeat(jobId, progress) {
      const patch: Record<string, unknown> = { heartbeat_at: new Date().toISOString() };
      if (progress !== undefined) patch.progress = progress;
      const { error } = await db.from("jobs").update(patch).eq("id", jobId).eq("status", "running");
      must(error, "heartbeat");
    },
    async markDone(jobId, output, costCredits) {
      const { error } = await db
        .from("jobs")
        .update({
          status: "done",
          output_ref: output,
          cost_credits: costCredits,
          error_code: null,
          error_message: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      must(error, "mark job done");
    },
    async markFailed(jobId, code, message) {
      const { error } = await db
        .from("jobs")
        .update({ status: "failed", error_code: code, error_message: message.slice(0, 1000), finished_at: new Date().toISOString() })
        .eq("id", jobId);
      must(error, "mark job failed");
    },
    async markQueued(jobId) {
      const { error } = await db.from("jobs").update({ status: "queued", heartbeat_at: null }).eq("id", jobId);
      must(error, "requeue job row");
    },
    async releaseCredits(orgId, jobId) {
      const { error } = await db.rpc("credits_release", { p_org: orgId, p_job: jobId });
      must(error, "release credits");
    },
  };
}
