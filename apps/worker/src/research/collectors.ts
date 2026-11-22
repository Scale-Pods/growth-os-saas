import type { BrandContext } from "@growth-os/shared";
import type { RawTrendItem } from "@growth-os/ai";

/** One trend source (Reddit, YouTube, ...). Throws a readable error when it cannot be read: the scan keeps going without it. */
export interface TrendCollector {
  readonly source: string;
  collect(args: { ctx: BrandContext; count: number }): Promise<RawTrendItem[]>;
}

/** The sources the scan supports (same list the database accepts). */
export const TREND_SOURCES = ["Reddit", "Instagram", "YouTube", "Google Search", "Google Trends"] as const;

/**
 * Local-development collector: invents plausible, clearly labelled topics so the whole flow can be tried
 * without paying a scraping provider. Never enabled in production.
 */
export class FakeTrendCollector implements TrendCollector {
  constructor(readonly source: string) {}
  async collect({ ctx, count }: { ctx: BrandContext; count: number }): Promise<RawTrendItem[]> {
    const industry = ctx.industry || "your industry";
    const templates = [
      `How small teams in ${industry} are cutting costs with automation`,
      `Common mistakes beginners make in ${industry} and how to avoid them`,
      `What buyers in ${industry} ask about payback and return on investment`,
      `Safety and compliance changes that matter to ${industry}`,
      `Customer stories: teams switching to new ${industry} tools`,
    ];
    // The "sample" flag lives in meta so the topics read like real trends and can be ranked sensibly.
    return templates.slice(0, Math.min(count, templates.length)).map((topic, i) => ({
      source: this.source,
      topic,
      url: `https://example.com/sample/${encodeURIComponent(this.source)}/${i + 1}`,
      meta: { sample: true },
    }));
  }
}

/**
 * Collectors available in this environment. Real collectors (Apify / search providers) are added here once their
 * keys exist. Until then only the sample collectors can be switched on, and only outside production.
 */
export function collectorsFromEnv(env: { NODE_ENV?: string; TREND_COLLECTORS?: string }): Map<string, TrendCollector> {
  const map = new Map<string, TrendCollector>();
  if (env.TREND_COLLECTORS === "fake") {
    if (env.NODE_ENV === "production") throw new Error("TREND_COLLECTORS=fake is not allowed in production.");
    for (const s of TREND_SOURCES) map.set(s, new FakeTrendCollector(s));
  }
  return map;
}
