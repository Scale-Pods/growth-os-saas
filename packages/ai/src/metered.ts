import { AppError, COST_CAPS } from "@growth-os/shared";
import { costUsd, usdToCredits } from "./costs";
import { UNTRUSTED_DATA_RULE, mapReserveError, type GatewayDeps } from "./gateway";
import { ProviderFailure, type Embedder, type UsageRecord } from "./ports";

export interface MeteredDeps extends GatewayDeps {
  embedderFor: (model: string) => Embedder;
}

export interface Meter {
  /** One model answer (the model chosen for this run). */
  text(req: { system: string; user: string; maxOutputTokens: number; json?: boolean; temperature?: number }): Promise<string>;
  /** Vectors for texts (the embedding model chosen for this run). */
  embed(inputs: string[]): Promise<number[][]>;
}

export interface MeteredArgs {
  orgId: string;
  userId: string | null;
  /** The credit reservation is keyed by this id: one per run, so a retry reuses it and can never be charged twice. */
  jobId: string;
  /** Rough cost of the whole run in USD. Reserved up front; the real cost is settled afterwards. */
  estimateUsd: number;
  uses: { text?: string; embed?: string };
}

const TRIES = 3;
const TIMEOUT_MS = 60_000;

/**
 * Billing for ONE run that makes several model calls (a Trend Alerts check): reserve once, run, settle once at the real
 * total. A run that finds nothing new calls no model and costs nothing. This avoids rounding every tiny call up to a
 * whole credit. A failed run is released: the customer pays nothing for it.
 */
export async function runMetered<T>(d: MeteredDeps, a: MeteredArgs, body: (m: Meter) => Promise<T>): Promise<{ value: T; credits: number; costUsd: number }> {
  if (a.estimateUsd > COST_CAPS.JOB_USD_DEFAULT) {
    throw new AppError("VALIDATION_ERROR", "This check is too large. Please narrow it down.", 400);
  }
  // Resolve providers BEFORE reserving: a missing key refuses the run without leaving a reservation behind.
  const textProvider = a.uses.text ? d.providerFor(a.uses.text) : null;
  const embedder = a.uses.embed ? d.embedderFor(a.uses.embed) : null;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  try {
    await d.ledger.reserve({ orgId: a.orgId, userId: a.userId, jobId: a.jobId, credits: usdToCredits(a.estimateUsd) });
  } catch (e) {
    throw mapReserveError(e);
  }

  const perModel = new Map<string, { tokens: number; usd: number }>();
  let totalUsd = 0;
  const add = async (model: string, tokens: number) => {
    const row = await d.costs.get(model);
    const usd = costUsd(row, tokens / 1000);
    const cur = perModel.get(model) ?? { tokens: 0, usd: 0 };
    perModel.set(model, { tokens: cur.tokens + tokens, usd: cur.usd + usd });
    totalUsd += usd;
    if (totalUsd > COST_CAPS.JOB_USD_DEFAULT) {
      throw new AppError("VALIDATION_ERROR", "This check grew too large and was stopped. Nothing was charged.", 400);
    }
  };
  const retrying = async <R>(call: (signal: AbortSignal) => Promise<R>): Promise<R> => {
    let last: ProviderFailure | null = null;
    for (let i = 0; i < TRIES; i++) {
      try {
        return await call(AbortSignal.timeout(TIMEOUT_MS));
      } catch (e) {
        if (!(e instanceof ProviderFailure)) throw e;
        last = e;
        if (!e.retryable || i === TRIES - 1) break;
        await sleep(500 * 2 ** i);
      }
    }
    throw new AppError("PROVIDER_ERROR", "The AI service did not respond. Nothing was charged. Please try again.", 502, { status: last?.status ?? null });
  };

  const meter: Meter = {
    async text(req) {
      if (!textProvider || !a.uses.text) throw new Error("No text model was chosen for this run.");
      const model = a.uses.text;
      const res = await retrying((signal) =>
        textProvider.generate({ model, system: `${req.system}\n\n${UNTRUSTED_DATA_RULE}`, user: req.user, maxOutputTokens: req.maxOutputTokens, temperature: req.temperature, jsonMode: req.json, signal }),
      );
      await add(model, res.inputTokens + res.outputTokens);
      return res.text;
    },
    async embed(inputs) {
      if (!embedder || !a.uses.embed) throw new Error("No embedding model was chosen for this run.");
      if (inputs.length === 0) return [];
      const model = a.uses.embed;
      const res = await retrying((signal) => embedder.embed(model, inputs, signal));
      await add(model, res.tokens);
      return res.vectors;
    },
  };

  let value: T;
  try {
    value = await body(meter);
  } catch (e) {
    await d.ledger.release({ orgId: a.orgId, jobId: a.jobId });
    if (e instanceof AppError) throw e;
    throw new AppError("INTERNAL_ERROR", "Something went wrong during this check. Nothing was charged.", 500);
  }

  const credits = totalUsd > 0 ? usdToCredits(totalUsd) : 0;
  await d.ledger.settle({ orgId: a.orgId, jobId: a.jobId, actualCredits: credits });

  // One usage row per model; the whole charge is attributed to the most expensive one so the rows add up.
  const rows = [...perModel.entries()].sort((x, y) => y[1].usd - x[1].usd);
  for (const [i, [model, m]] of rows.entries()) {
    const rec: UsageRecord = { orgId: a.orgId, userId: a.userId, jobId: a.jobId, model, units: m.tokens / 1000, costUsd: m.usd, credits: i === 0 ? credits : 0 };
    await d.usage.record(rec);
  }
  return { value, credits, costUsd: totalUsd };
}
