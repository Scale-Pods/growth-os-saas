import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@growth-os/shared";
import {
  cachedCostSource,
  getModel,
  googleTextProvider,
  openAiTextProvider,
  supabaseCostSource,
  supabaseLedger,
  supabaseUsageRecorder,
  type GatewayDeps,
  type TextProvider,
} from "@growth-os/ai";

/** Default text model for research jobs. A model with a price row in ai_cost_table. */
export const DEFAULT_TEXT_MODEL = "gpt-4o-mini";

/**
 * The AI gateway wired to the real ledger, usage table, price table and providers.
 * A missing provider key refuses the call before any credits are reserved.
 */
export function buildGatewayDeps(db: SupabaseClient, env: { OPENAI_API_KEY?: string; GOOGLE_AI_API_KEY?: string }): GatewayDeps {
  const providers: Partial<Record<"openai" | "google", TextProvider>> = {};
  if (env.OPENAI_API_KEY) providers.openai = openAiTextProvider(env.OPENAI_API_KEY);
  if (env.GOOGLE_AI_API_KEY) providers.google = googleTextProvider(env.GOOGLE_AI_API_KEY);

  return {
    ledger: supabaseLedger((fn, args) => db.rpc(fn, args)),
    usage: supabaseUsageRecorder((row) => db.from("ai_usage").insert(row)),
    costs: cachedCostSource(
      supabaseCostSource((model) =>
        db.from("ai_cost_table").select("model, unit, usd_per_unit").eq("model", model).eq("active", true).maybeSingle() as never,
      ),
    ),
    providerFor(model) {
      let kind: "openai" | "google";
      try {
        kind = getModel(model).provider;
      } catch {
        throw new AppError("INTERNAL_ERROR", "That AI model is not available.", 500);
      }
      const p = providers[kind];
      if (!p) throw new AppError("INTERNAL_ERROR", "AI is not set up on this server yet. Nothing was charged.", 503);
      return p;
    },
  };
}
