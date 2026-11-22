import type { CostRow, CostSource } from "./costs";
import type { CreditLedger, UsageRecord, UsageRecorder } from "./ports";

type DbError = { message: string } | null;

/** Calls a database function with the service role. The app supplies this (keeps the DB client out of this package). */
export type RpcCall = (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: DbError }>;

export function supabaseLedger(rpc: RpcCall): CreditLedger {
  async function call(fn: string, args: Record<string, unknown>) {
    const { error } = await rpc(fn, args);
    if (error) throw new Error(error.message);
  }
  return {
    reserve: ({ orgId, userId, jobId, credits }) =>
      call("credits_reserve", { p_org: orgId, p_user: userId, p_job: jobId, p_amount: credits, p_ref: "reserve" }),
    settle: ({ orgId, jobId, actualCredits }) => call("credits_settle", { p_org: orgId, p_job: jobId, p_actual: actualCredits }),
    release: ({ orgId, jobId }) => call("credits_release", { p_org: orgId, p_job: jobId }),
  };
}

export function supabaseUsageRecorder(insert: (row: Record<string, unknown>) => PromiseLike<{ error: DbError }>): UsageRecorder {
  return {
    async record(u: UsageRecord) {
      const { error } = await insert({
        org_id: u.orgId,
        user_id: u.userId,
        job_id: u.jobId,
        model: u.model,
        units: u.units,
        cost_usd: u.costUsd,
        credits: u.credits,
      });
      if (error) throw new Error(`could not record AI usage: ${error.message}`);
    },
  };
}

export function supabaseCostSource(
  fetchRow: (model: string) => PromiseLike<{ data: { model: string; unit: string; usd_per_unit: number | string } | null; error: DbError }>,
): CostSource {
  return {
    async get(model: string): Promise<CostRow> {
      const { data, error } = await fetchRow(model);
      if (error) throw new Error(`could not read the cost table: ${error.message}`);
      if (!data) throw new Error(`no price configured for model ${model}`);
      return { model: data.model, unit: data.unit, usdPerUnit: Number(data.usd_per_unit) };
    },
  };
}
