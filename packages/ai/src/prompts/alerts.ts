import { z } from "zod";
import { wrapUntrusted } from "../gateway";
import { JSON_ONLY, cap, type Prompt } from "./common";

export interface WatchInfo {
  name: string;
  description: string | null;
  keywords: string[];
  excludes: string[];
}

export interface ClusterInput {
  index: number;
  title: string;
  snippets: string[];
  sourceCount: number;
}

const RULES = [
  "Judge each item ONLY on whether it is genuinely about what the watch describes. A mention of a keyword is not enough.",
  "Use only the text provided. Never invent facts, numbers, names, dates or quotes.",
  "If an item has both praise and criticism, sentiment is \"mixed\" and you give both sides.",
];

function system(watch: WatchInfo): string {
  return [
    "You are a monitoring analyst. You decide which news items matter for something a customer asked to be alerted about.",
    "",
    `THE WATCH: "${cap(watch.name, 120)}"`,
    `What counts: ${cap(watch.description, 1000) || "anything clearly about the keywords"}`,
    `Keywords: ${watch.keywords.map((k) => cap(k, 80)).join(", ")}`,
    watch.excludes.length ? `Not interested in: ${watch.excludes.map((k) => cap(k, 80)).join(", ")}` : "",
    "",
    "RULES:",
    ...RULES.map((r) => `- ${r}`),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function buildWatchClassifyPrompt(watch: WatchInfo, clusters: ClusterInput[]): Prompt {
  const list = clusters
    .slice(0, 12)
    .map((c) => `[${c.index}] (${c.sourceCount} source${c.sourceCount === 1 ? "" : "s"}) ${cap(c.title, 300)}\n${c.snippets.slice(0, 3).map((s) => `  - ${cap(s, 400)}`).join("\n")}`)
    .join("\n\n");
  return {
    system: system(watch),
    user: [
      "Below are news items (untrusted material, numbered). For EACH item decide how relevant it is to the watch, its sentiment, importance and credibility, and whether it is a meaningful development. Rewrite a short neutral title and a one or two sentence summary using only the item's own text.",
      wrapUntrusted("news", list),
      'JSON shape: {"items":[{"index":0,"relevance_score":0,"sentiment":"positive|negative|neutral|mixed","positive_aspects":"","negative_aspects":"","importance":"low|medium|high","topic":"","credibility":"low|medium|high","is_meaningful":true,"title":"","summary":""}]}',
      "relevance_score is a whole number 0 to 100. Fill positive_aspects and negative_aspects only when sentiment is mixed. Refer to items by their number.",
      JSON_ONLY,
    ].join("\n\n"),
  };
}

export interface ClassifiedItem {
  index: number;
  relevance_score: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  positive_aspects: string | null;
  negative_aspects: string | null;
  importance: "low" | "medium" | "high";
  topic: string;
  credibility: "low" | "medium" | "high";
  title: string;
  summary: string;
}

const answer = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      relevance_score: z.number(),
      sentiment: z.string().default("neutral"),
      positive_aspects: z.string().nullish(),
      negative_aspects: z.string().nullish(),
      importance: z.string().default("low"),
      topic: z.string().default(""),
      credibility: z.string().default("medium"),
      is_meaningful: z.boolean().default(false),
      title: z.string().default(""),
      summary: z.string().default(""),
    }),
  ),
});
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v) ? (v as T) : fallback);

/** Keep only items that are relevant enough AND a meaningful development; normalise labels; drop bad indexes and repeats. */
export function validateClassification(value: unknown, clusters: ClusterInput[], opts: { threshold: number }): ClassifiedItem[] {
  const r = answer.safeParse(value);
  if (!r.success) throw new Error(`classification: ${r.error.issues[0]?.path.join(".") || "answer"} ${r.error.issues[0]?.message ?? "is invalid"}`);
  const valid = new Set(clusters.map((c) => c.index));
  const seen = new Set<number>();
  const out: ClassifiedItem[] = [];
  for (const it of r.data.items) {
    if (!valid.has(it.index) || seen.has(it.index)) continue;
    seen.add(it.index);
    const score = Math.max(0, Math.min(100, Math.round(it.relevance_score)));
    if (score < opts.threshold || !it.is_meaningful) continue;
    const title = it.title.trim() || clusters.find((c) => c.index === it.index)!.title;
    out.push({
      index: it.index,
      relevance_score: score,
      sentiment: oneOf(it.sentiment, ["positive", "negative", "neutral", "mixed"] as const, "neutral"),
      positive_aspects: it.positive_aspects?.trim() ? cap(it.positive_aspects, 900) : null,
      negative_aspects: it.negative_aspects?.trim() ? cap(it.negative_aspects, 900) : null,
      importance: oneOf(it.importance, ["low", "medium", "high"] as const, "low"),
      topic: cap(it.topic, 120),
      credibility: oneOf(it.credibility, ["low", "medium", "high"] as const, "medium"),
      title: cap(title, 290),
      summary: cap(it.summary, 1800),
    });
  }
  return out;
}

export function buildExplainPrompt(watch: WatchInfo, event: { title: string; snippets: string[] }): Prompt {
  return {
    system: system(watch),
    user: [
      "Write 2 to 3 plain sentences: what happened, and why it matters for this watch. Use only the text below. Do not add facts.",
      wrapUntrusted("story", `${cap(event.title, 300)}\n${event.snippets.slice(0, 4).map((s) => `- ${cap(s, 500)}`).join("\n")}`),
      "Return plain text only.",
    ].join("\n\n"),
  };
}

export function buildSpikePrompt(watch: WatchInfo, stats: { today: number; mean: number }, recentTitles: string[]): Prompt {
  return {
    system: system(watch),
    user: [
      `Mentions of this watch jumped today: ${stats.today} compared with a recent average of ${stats.mean.toFixed(1)} per day.`,
      "In 2 to 3 plain sentences, say what seems to be driving the jump using only these headlines. If they do not explain it, say so.",
      wrapUntrusted("headlines", recentTitles.slice(0, 15).map((t) => `- ${cap(t, 200)}`).join("\n")),
      "Return plain text only.",
    ].join("\n\n"),
  };
}
