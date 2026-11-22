import type { TrendWatch } from "@growth-os/db";
import { buildGoogleNewsUrl, parseFeed } from "./feeds";
import type { RawMention } from "./pipeline";
import { fetchRawText, type FetchDeps, defaultFetchDeps } from "../web-text";

/** One place a watch can look for news. Throws a readable error when it cannot be read; the check continues without it. */
export interface WatchCollector {
  readonly source: string;
  collect(watch: TrendWatch): Promise<RawMention[]>;
}

/** Google News search as an RSS feed: free, no key needed. */
export function googleNewsCollector(d: FetchDeps = defaultFetchDeps): WatchCollector {
  return {
    source: "Google News",
    async collect(w) {
      const xml = await fetchRawText(buildGoogleNewsUrl({ keywords: w.keywords, excludes: w.excludes, region: w.region, lookbackHours: w.lookback_hours }), d);
      return parseFeed(xml, "Google News");
    },
  };
}

/** The customer's own RSS or Atom feeds. A broken feed is skipped; if every feed fails the source fails. */
export function rssCollector(d: FetchDeps = defaultFetchDeps): WatchCollector {
  return {
    source: "RSS",
    async collect(w) {
      if (w.rss_feeds.length === 0) throw new Error("No feeds were added for this watch.");
      const items: RawMention[] = [];
      const failures: string[] = [];
      for (const feed of w.rss_feeds) {
        try {
          items.push(...parseFeed(await fetchRawText(feed, d), "RSS"));
        } catch (e) {
          failures.push(e instanceof Error ? e.message : "feed could not be read");
        }
      }
      if (failures.length === w.rss_feeds.length) throw new Error(failures[0] ?? "No feed could be read.");
      return items;
    },
  };
}

/** Local-development collector: plausible headlines built from the watch's keywords. Never used in production. */
export function fakeWatchCollector(source: string, now: () => Date = () => new Date()): WatchCollector {
  return {
    source,
    async collect(w) {
      const k = w.keywords[0] ?? "topic";
      const hour = Math.floor(now().getTime() / 3_600_000);
      const base = now().toISOString();
      return [0, 1, 2].map((i) => ({
        source,
        title: `${k}: sample development number ${i + 1} (${hour})`,
        snippet: `A sample report about ${k}. This is generated for local testing only.`,
        url: `https://example.com/sample/${encodeURIComponent(k)}/${hour}-${i}`,
        publishedAt: base,
      }));
    },
  };
}

/**
 * Collectors available here. Google News and RSS work with no keys. Reddit, Web search and YouTube need a scraping
 * provider key and are added when it exists. Sample collectors can be switched on outside production only.
 */
export function watchCollectorsFromEnv(env: { NODE_ENV?: string; ALERT_COLLECTORS?: string }): Map<string, WatchCollector> {
  const map = new Map<string, WatchCollector>([
    ["Google News", googleNewsCollector()],
    ["RSS", rssCollector()],
  ]);
  if (env.ALERT_COLLECTORS === "fake") {
    if (env.NODE_ENV === "production") throw new Error("ALERT_COLLECTORS=fake is not allowed in production.");
    for (const s of ["Google News", "RSS", "Reddit", "Web", "YouTube"]) map.set(s, fakeWatchCollector(s));
  }
  return map;
}
