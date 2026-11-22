/** Pure rules for Trend Alerts shared by the screens, the API and the worker (safe in the browser). */

export const WATCH_FREQUENCIES = [30, 60, 120, 240, 720, 1440] as const;
export type WatchFrequency = (typeof WATCH_FREQUENCIES)[number];

/** Sources a watch can use. Google News and RSS work without any provider key. */
export const WATCH_SOURCES = ["Google News", "RSS", "Reddit", "Web", "YouTube"] as const;

const MIN_PER_MONTH = 30 * 24 * 60;

/**
 * The estimate shown BEFORE a watch is turned on. A check that finds nothing new costs nothing; one that finds new items
 * costs about 1 credit. We assume roughly 1 check in 3 finds something new ("typical") and show every check finding
 * something as the worst case ("max"). The monthly budget is the ceiling on both: the watch stops when it is reached.
 */
export function estimateWatchMonthlyCredits(a: { frequencyMinutes: number; budget: number }): { checksPerMonth: number; typical: number; max: number; willStopAtBudget: boolean } {
  const checks = Math.floor(MIN_PER_MONTH / a.frequencyMinutes);
  const uncappedMax = checks;
  const uncappedTypical = Math.ceil(checks / 3);
  return {
    checksPerMonth: checks,
    typical: Math.min(uncappedTypical, a.budget),
    max: Math.min(uncappedMax, a.budget),
    willStopAtBudget: uncappedMax > a.budget,
  };
}

/**
 * First line of defence for a Slack or webhook address: https only, no credentials, no obviously private or local host.
 * The worker checks again at send time by resolving the name (this cannot see DNS), so both layers are needed.
 */
export function isAcceptableWebhookUrl(raw: string): boolean {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.includes(":")) return false; // IPv6 literal
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  return true;
}
