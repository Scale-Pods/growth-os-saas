import { createHash } from "node:crypto";

/**
 * The cheap, deterministic stages of a Trend Alerts check. None of these call a model: they decide what is even worth
 * sending to one (the funnel that keeps a check inexpensive).
 */

export interface RawMention {
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  publishedAt: string | null;
}
export interface HashedMention extends RawMention {
  hash: string;
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$)/i;

/** The same page can arrive with different tracking junk; identity ignores it. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export function urlHash(raw: string): string {
  return createHash("sha256").update(normalizeUrl(raw)).digest("hex");
}

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface FilterResult {
  kept: HashedMention[];
  dropped: { duplicate: number; seen: number; excluded: number; tooOld: number; noLink: number };
}

/** Stage 1: no link, repeats, already-seen links, excluded words, and anything older than the lookback are dropped for free. */
export function filterItems(a: { items: RawMention[]; excludes: string[]; lookbackHours: number; now: Date; seen: Set<string> }): FilterResult {
  const dropped = { duplicate: 0, seen: 0, excluded: 0, tooOld: 0, noLink: 0 };
  const kept: HashedMention[] = [];
  const inBatch = new Set<string>();
  const excludes = a.excludes.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const cutoff = a.now.getTime() - a.lookbackHours * 3_600_000;
  for (const m of a.items) {
    if (!m.url || !/^https?:\/\//i.test(m.url.trim())) {
      dropped.noLink++;
      continue;
    }
    const hash = urlHash(m.url);
    if (inBatch.has(hash)) {
      dropped.duplicate++;
      continue;
    }
    inBatch.add(hash);
    if (a.seen.has(hash)) {
      dropped.seen++;
      continue;
    }
    const text = `${m.title} ${m.snippet ?? ""}`.toLowerCase();
    if (excludes.some((e) => text.includes(e))) {
      dropped.excluded++;
      continue;
    }
    if (m.publishedAt && Date.parse(m.publishedAt) < cutoff) {
      dropped.tooOld++;
      continue;
    }
    kept.push({ ...m, hash });
  }
  return { kept, dropped };
}

/** Stage 2: keep items whose meaning is close to what the watch describes. */
export function relevanceFilter(items: HashedMention[], vectors: number[][], watchVector: number[], floor: number) {
  const kept: { item: HashedMention; vector: number[]; similarity: number }[] = [];
  let belowFloor = 0;
  items.forEach((item, i) => {
    const vector = vectors[i] ?? [];
    const similarity = cosine(vector, watchVector);
    if (similarity >= floor) kept.push({ item, vector, similarity });
    else belowFloor++;
  });
  return { kept, belowFloor };
}

export interface StoryCluster {
  members: { item: HashedMention; vector: number[] }[];
  /** How many independent outlets (distinct websites) cover it. */
  sourceCount: number;
  primary: HashedMention;
  centroid: number[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Stage 3: the same story from many outlets becomes ONE story. */
export function clusterItems(entries: { item: HashedMention; vector: number[] }[], threshold: number): StoryCluster[] {
  const groups: { members: { item: HashedMention; vector: number[] }[]; sum: number[] }[] = [];
  for (const e of entries) {
    let target: (typeof groups)[number] | undefined;
    for (const g of groups) {
      const centroid = g.sum.map((v) => v / g.members.length);
      if (cosine(e.vector, centroid) >= threshold) {
        target = g;
        break;
      }
    }
    if (!target) {
      groups.push({ members: [e], sum: [...e.vector] });
    } else {
      target.members.push(e);
      target.sum = target.sum.map((v, i) => v + (e.vector[i] ?? 0));
    }
  }
  return groups.map((g) => {
    const primary = [...g.members].sort((x, y) => (y.item.snippet?.length ?? 0) - (x.item.snippet?.length ?? 0))[0]!.item;
    return {
      members: g.members,
      sourceCount: new Set(g.members.map((m) => hostOf(m.item.url))).size,
      primary,
      centroid: g.sum.map((v) => v / g.members.length),
    };
  });
}

/** A story we already stored (earlier runs) is recognised, so it is not announced twice. */
export function matchExisting(vector: number[], existing: { id: string; embedding: number[] }[], threshold: number): string | null {
  let best: { id: string; s: number } | null = null;
  for (const e of existing) {
    if (e.embedding.length === 0) continue;
    const s = cosine(vector, e.embedding);
    if (s >= threshold && (!best || s > best.s)) best = { id: e.id, s };
  }
  return best?.id ?? null;
}

/** Stage 5: is today's volume far above this watch's own recent normal? (No model call.) */
export function detectSpike(history: number[], today: number): { isSpike: boolean; mean: number; std: number; z: number } {
  if (history.length < 3) return { isSpike: false, mean: 0, std: 0, z: 0 };
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
  const std = Math.max(Math.sqrt(variance), 1);
  const z = (today - mean) / std;
  // Both a statistical jump AND a real absolute rise: 2 mentions instead of 0 is noise.
  return { isSpike: z >= 3 && today - mean >= 5, mean, std, z };
}

const RANK = { low: 0, medium: 1, high: 2 } as const;

export interface RuleLike {
  id: string;
  watch_id: string | null;
  min_relevance: number;
  min_importance: "low" | "medium" | "high";
  sentiments: string[];
  enabled: boolean;
}

/** Stage 6: which rules fire for this story. */
export function matchRules<R extends RuleLike>(ev: { watchId: string; relevance_score: number; importance: "low" | "medium" | "high"; sentiment: string }, rules: R[]): R[] {
  return rules.filter(
    (r) =>
      r.enabled &&
      (r.watch_id === null || r.watch_id === ev.watchId) &&
      ev.relevance_score >= r.min_relevance &&
      RANK[ev.importance] >= RANK[r.min_importance] &&
      (r.sentiments.length === 0 || r.sentiments.includes(ev.sentiment)),
  );
}
