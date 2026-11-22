import { z } from "zod";
import type { BrandContext } from "@growth-os/shared";
import { wrapUntrusted } from "../gateway";
import { JSON_ONLY, cap, systemFor, type Prompt } from "./common";

export type StrategyKey =
  | "campaign_planning"
  | "weekly_content_strategy"
  | "content_pillars"
  | "platform_strategy"
  | "lead_generation_strategy"
  | "cta_strategy";
export type StrategyScopeKey = "day" | "week" | "month";

export interface StrategyInput {
  scope: StrategyScopeKey;
  /** Empty = any relevant platform. */
  platform: string;
  /** Empty = the AI decides the mix. */
  contentType: string;
  signals: { source: string; topic: string; reason?: string | null }[];
  /** Today's date (YYYY-MM-DD) in the customer's calendar. */
  today: string;
  /** Short summary of the latest intelligence report, when one exists. */
  intelligenceSummary?: string | null;
}

interface SectionDef {
  key: StrategyKey;
  title: string;
  instruction: string;
  shape: string;
}

export const STRATEGY_SECTIONS: readonly SectionDef[] = [
  {
    key: "campaign_planning",
    title: "Campaign planning",
    instruction: "Propose 1 to 3 campaigns with a clear objective, duration, key message and channels.",
    shape: '{"campaigns":[{"name":"","objective":"","duration":"","key_message":"","channels":[""]}]}',
  },
  {
    key: "weekly_content_strategy",
    title: "Weekly content strategy",
    instruction: "Plan the weeks inside the chosen scope: a theme per week and the posts that support it.",
    shape: '{"weeks":[{"week":"","theme":"","posts":[{"day":"","platform":"","content_type":"","idea":""}]}]}',
  },
  {
    key: "content_pillars",
    title: "Content pillars",
    instruction: "For EACH pillar listed in the brand block, explain why it matters for this audience and give example angles. Use the brand's own pillars; do not invent new ones.",
    shape: '{"pillars":[{"name":"","why":"","example_angles":[""]}]}',
  },
  {
    key: "platform_strategy",
    title: "Platform strategy",
    instruction: "For each relevant platform, state its role, a realistic posting cadence, the best formats and a few tips.",
    shape: '{"platforms":[{"platform":"","role":"","cadence":"","formats":[""],"tips":[""]}]}',
  },
  {
    key: "lead_generation_strategy",
    title: "Lead generation strategy",
    instruction: "Give practical lead-generation tactics, each with what it is and how success is measured.",
    shape: '{"tactics":[{"name":"","description":"","metric":""}]}',
  },
  {
    key: "cta_strategy",
    title: "CTA strategy",
    instruction: "Recommend calls to action and where to place them. Prefer the brand's approved CTAs.",
    shape: '{"ctas":[{"cta":"","where":"","rationale":""}]}',
  },
];

const ROLE = "You are a senior content strategist building a marketing plan for a small team.";

function context(ctx: BrandContext, input: StrategyInput): string[] {
  const parts: string[] = [
    `Planning scope: ${input.scope}. Today is ${input.today}.`,
    `Platform focus: ${input.platform || "any relevant platform"}.`,
    `Content type: ${input.contentType || "choose the best mix"}.`,
  ];
  if (ctx.pillars.length) parts.push(`Brand pillars: ${ctx.pillars.map((p) => `${p.name} (${p.targetSharePct}%)`).join(", ")}.`);
  if (input.intelligenceSummary) parts.push("Latest intelligence summary (untrusted material):", wrapUntrusted("intelligence", cap(input.intelligenceSummary, 4000)));
  if (input.signals.length) {
    const list = input.signals.slice(0, 30).map((s, i) => `${i + 1}. [${cap(s.source, 40)}] ${cap(s.topic, 300)}${s.reason ? ` - ${cap(s.reason, 200)}` : ""}`).join("\n");
    parts.push("Trends to build on (untrusted material from the web):", wrapUntrusted("trend", list));
  } else {
    parts.push("No specific trends were chosen: build a general strategy from the brand profile.");
  }
  return parts;
}

export function buildStrategySectionPrompt(key: StrategyKey, ctx: BrandContext, input: StrategyInput): Prompt {
  const def = STRATEGY_SECTIONS.find((s) => s.key === key);
  if (!def) throw new Error(`Unknown strategy section: ${key}`);
  const parts = [`Write the "${def.title}" part of the strategy.`, def.instruction, ...context(ctx, input)];
  if (key === "cta_strategy" && ctx.voice.approvedCtas.length) parts.push(`Approved CTAs you may recommend: ${ctx.voice.approvedCtas.map((c) => `"${c}"`).join(", ")}.`);
  parts.push(`JSON shape: ${def.shape}`, JSON_ONLY);
  return { system: systemFor(ROLE, ctx, ["Keep each text value short and concrete (one or two sentences)."]), user: parts.join("\n\n") };
}

export interface CalendarWindow {
  start: string;
  end: string;
  maxItems: number;
}

const DAYS: Record<StrategyScopeKey, { days: number; max: number }> = { day: { days: 0, max: 3 }, week: { days: 6, max: 14 }, month: { days: 29, max: 30 } };

export function calendarWindow(today: string, scope: StrategyScopeKey): CalendarWindow {
  const d = new Date(`${today}T00:00:00Z`);
  const spec = DAYS[scope];
  const end = new Date(d.getTime() + spec.days * 86_400_000);
  return { start: today, end: end.toISOString().slice(0, 10), maxItems: spec.max };
}

export function buildCalendarPrompt(ctx: BrandContext, input: StrategyInput): Prompt {
  const w = calendarWindow(input.today, input.scope);
  return {
    system: systemFor(ROLE, ctx),
    user: [
      `Build a content calendar with at most ${w.maxItems} items. Every scheduled_date must be between ${w.start} and ${w.end} (YYYY-MM-DD), or null if the date is flexible.`,
      ...context(ctx, input),
      `For each item give platform, content_type (for example post, carousel, video, story), a short title, a one-sentence hook, and the brand pillar it serves${ctx.pillars.length ? ` (one of: ${ctx.pillars.map((p) => p.name).join(", ")})` : ""}.`,
      'JSON shape: {"items":[{"scheduled_date":"YYYY-MM-DD","platform":"","content_type":"","title":"","hook":"","pillar":""}]}',
      JSON_ONLY,
    ].join("\n\n"),
  };
}

export function buildStrategySummaryPrompt(ctx: BrandContext, sections: Record<string, unknown>): Prompt {
  return {
    system: systemFor(ROLE, ctx),
    user: [
      "Write a 4 to 6 sentence plain-language summary of this strategy for the team. Use only what is in it.",
      wrapUntrusted("strategy", cap(JSON.stringify(sections), 12_000)),
      "Return plain text only.",
    ].join("\n\n"),
  };
}

// ---- validators ---------------------------------------------------------------------------------
const txt = (max = 600) => z.string().trim().min(1).max(max);
const list = (max = 300) => z.array(txt(max)).min(1).max(12);

const SCHEMAS: Record<StrategyKey, z.ZodTypeAny> = {
  campaign_planning: z.object({
    campaigns: z.array(z.object({ name: txt(120), objective: txt(), duration: txt(80), key_message: txt(), channels: list(60) })).min(1).max(5),
  }),
  weekly_content_strategy: z.object({
    weeks: z
      .array(z.object({ week: txt(60), theme: txt(200), posts: z.array(z.object({ day: txt(40), platform: txt(40), content_type: txt(40), idea: txt() })).min(1).max(20) }))
      .min(1)
      .max(6),
  }),
  content_pillars: z.object({ pillars: z.array(z.object({ name: txt(100), why: txt(), example_angles: list() })).min(1).max(10) }),
  platform_strategy: z.object({
    platforms: z.array(z.object({ platform: txt(40), role: txt(), cadence: txt(120), formats: list(80), tips: list() })).min(1).max(10),
  }),
  lead_generation_strategy: z.object({ tactics: z.array(z.object({ name: txt(120), description: txt(), metric: txt(200) })).min(1).max(10) }),
  cta_strategy: z.object({ ctas: z.array(z.object({ cta: txt(160), where: txt(200), rationale: txt() })).min(1).max(10) }),
};

/** Check the shape of a model's answer for one strategy section. Throws a readable error if it does not fit. */
export function validateStrategySection(key: StrategyKey, value: unknown): Record<string, unknown> {
  const schema = SCHEMAS[key];
  if (!schema) throw new Error(`Unknown strategy section: ${key}`);
  const r = schema.safeParse(value);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`${key}: ${i?.path.join(".") || "answer"} ${i?.message ?? "is invalid"}${i?.code === "too_small" ? " (needs at least one entry)" : ""}`);
  }
  return r.data as Record<string, unknown>;
}

const calendarItem = z.object({
  scheduled_date: z.string().nullable(),
  platform: txt(40),
  content_type: txt(40),
  title: txt(200),
  hook: z.string().trim().max(400).optional(),
  pillar: z.string().trim().max(100).optional(),
});

export interface CalendarEntry {
  scheduled_date: string | null;
  platform: string;
  content_type: string;
  title: string;
  hook?: string;
  pillar?: string;
}

export function validateCalendar(value: unknown, window: CalendarWindow): CalendarEntry[] {
  const parsed = z.object({ items: z.array(calendarItem).min(1) }).safeParse(value);
  if (!parsed.success) throw new Error(`calendar: ${parsed.error.issues[0]?.path.join(".") || "answer"} ${parsed.error.issues[0]?.message ?? "is invalid"}`);
  const items = parsed.data.items;
  if (items.length > window.maxItems) throw new Error(`calendar: at most ${window.maxItems} items are allowed for this scope`);
  for (const it of items) {
    if (it.scheduled_date === null) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.scheduled_date) || Number.isNaN(Date.parse(`${it.scheduled_date}T00:00:00Z`))) {
      throw new Error(`calendar: "${it.scheduled_date}" is not a valid date (use YYYY-MM-DD)`);
    }
    if (it.scheduled_date < window.start || it.scheduled_date > window.end) {
      throw new Error(`calendar: ${it.scheduled_date} is outside the window ${window.start} to ${window.end}`);
    }
  }
  return items;
}
