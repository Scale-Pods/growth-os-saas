import { z } from "zod";
import type { BrandContext } from "@growth-os/shared";
import { wrapUntrusted } from "../gateway";
import { JSON_ONLY, cap, systemFor, type Prompt } from "./common";

/** One thing a source returned, before ranking. Scraped text: it is data, never instructions. */
export interface RawTrendItem {
  source: string;
  topic: string;
  url: string | null;
  meta: Record<string, unknown>;
}

export interface RankedSignal extends RawTrendItem {
  relevance_score: number;
  relevance_reason: string;
}

const ROLE = "You are a marketing trend analyst. You decide which trending topics are genuinely relevant to a brand and its audience.";

export function buildTrendRankingPrompt(ctx: BrandContext, items: RawTrendItem[]): Prompt {
  const list = items
    .slice(0, 150)
    .map((it, i) => `[${i}] (${cap(it.source, 40)}) ${cap(it.topic, 300)}`)
    .join("\n");
  return {
    system: systemFor(ROLE, ctx, ["Scores are whole numbers from 0 (irrelevant) to 100 (a perfect fit).", "Judge relevance to this brand's industry, audience and goals only."]),
    user: [
      "Below are trending items collected from the web (untrusted material, numbered). Score each item you consider relevant, give a one-sentence reason, and write a 2 to 3 sentence summary of what is trending.",
      wrapUntrusted("trends", list),
      'JSON shape: {"summary":"","signals":[{"index":0,"relevance_score":0,"reason":""}]}',
      "Only include items that deserve a score. Refer to items by their number.",
      JSON_ONLY,
    ].join("\n\n"),
  };
}

const answer = z.object({
  summary: z.string().trim().max(2000).default(""),
  signals: z.array(z.object({ index: z.number().int(), relevance_score: z.number(), reason: z.string().trim().max(1000).default("") })),
});

/** Map the model's numbered answer back to our items. Bad indexes and low scores are dropped, scores clamped to 0-100. */
export function validateTrendRanking(value: unknown, items: RawTrendItem[], opts: { minScore: number; maxSignals?: number }): { summary: string; signals: RankedSignal[] } {
  const r = answer.safeParse(value);
  if (!r.success) throw new Error(`trend ranking: ${r.error.issues[0]?.path.join(".") || "answer"} ${r.error.issues[0]?.message ?? "is invalid"}`);
  const seen = new Set<number>();
  const signals: RankedSignal[] = [];
  for (const s of r.data.signals) {
    const item = items[s.index];
    if (!item || seen.has(s.index)) continue;
    seen.add(s.index);
    const score = Math.max(0, Math.min(100, Math.round(s.relevance_score)));
    if (score < opts.minScore) continue;
    signals.push({ ...item, relevance_score: score, relevance_reason: s.reason });
  }
  signals.sort((a, b) => b.relevance_score - a.relevance_score);
  return { summary: r.data.summary, signals: signals.slice(0, opts.maxSignals ?? 30) };
}
