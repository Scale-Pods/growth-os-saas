import { CREDIT_DEFAULTS } from "@growth-os/shared";

export interface CostRow {
  model: string;
  unit: "per_1k_tokens" | "per_image" | "per_second" | string;
  usdPerUnit: number;
}

/** Reads prices. The real implementation reads `ai_cost_table` and caches it, so prices change without a deploy. */
export interface CostSource {
  get(model: string): Promise<CostRow>;
}

export function usdToCredits(usd: number, creditsPerUsd: number = CREDIT_DEFAULTS.CREDITS_PER_USD): number {
  if (usd <= 0) return 0;
  return Math.max(1, Math.ceil(usd * creditsPerUsd));
}

export function costUsd(row: CostRow, units: number): number {
  return Math.round(row.usdPerUnit * units * 1e6) / 1e6;
}

/** Rough token estimate for pricing a request before it is sent (about 4 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Cache wrapper: one lookup per model per `ttlMs`. */
export function cachedCostSource(inner: CostSource, ttlMs = 60_000, now: () => number = Date.now): CostSource {
  const cache = new Map<string, { row: CostRow; at: number }>();
  return {
    async get(model) {
      const hit = cache.get(model);
      if (hit && now() - hit.at < ttlMs) return hit.row;
      const row = await inner.get(model);
      cache.set(model, { row, at: now() });
      return row;
    },
  };
}
