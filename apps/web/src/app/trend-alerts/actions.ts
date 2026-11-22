"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, WATCH_FREQUENCIES, WATCH_SOURCES, estimateWatchMonthlyCredits, isAcceptableWebhookUrl } from "@growth-os/shared";
import { withOrgAction } from "@/lib/api/with-org";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { enqueueJob } from "@/lib/server-only/queue";
import type { TrendWatch } from "@growth-os/db";

const uuid = z.string().uuid();
const OPTS = { feature: "trend_alerts", level: "edit" } as const;
const term = z.string().trim().min(1).max(80);
const frequency = z.union(WATCH_FREQUENCIES.map((f) => z.literal(f)) as unknown as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]);
const feedUrl = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Feed addresses must start with http:// or https://");

const watchFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  keywords: z.array(term).min(1).max(10),
  excludes: z.array(term).max(10).optional(),
  sources: z.array(z.enum(WATCH_SOURCES)).min(1).max(5).optional(),
  rssFeeds: z.array(feedUrl).max(5).optional(),
  region: z.string().trim().regex(/^[A-Za-z]{2}$/, "Use a two-letter country code").optional(),
  lookbackHours: z.number().int().min(6).max(168).optional(),
  relevanceThreshold: z.number().int().min(0).max(100).optional(),
  frequencyMinutes: frequency.optional(),
  monthlyBudgetCredits: z.number().int().min(1).max(10_000).optional(),
};

/** What the customer is shown before turning a watch on. Pure and free to call. */
export const estimateWatchAction = withOrgAction(
  { ...OPTS, level: "view", input: z.object({ frequencyMinutes: frequency, monthlyBudgetCredits: z.number().int().min(1).max(10_000) }).strict() },
  async (_ctx, i) => estimateWatchMonthlyCredits({ frequencyMinutes: i.frequencyMinutes, budget: i.monthlyBudgetCredits }),
);

/** Create a watch plus a default "tell me in the app" rule, so a new watch is useful straight away. */
export const createWatchAction = withOrgAction({ ...OPTS, input: z.object({ brandId: uuid, ...watchFields, status: z.enum(["active", "paused"]).optional() }).strict() }, async (ctx, i) => {
  const { data: brand } = await ctx.supabase.from("brands").select("id").eq("id", i.brandId).eq("org_id", ctx.orgId).maybeSingle();
  if (!brand) throw new AppError("NOT_FOUND", "That brand was not found in this workspace.", 404);
  if ((i.sources ?? ["Google News"]).includes("RSS") && (i.rssFeeds ?? []).length === 0) {
    throw new AppError("VALIDATION_ERROR", "Add at least one feed address to use the RSS source.", 400);
  }

  // The database refuses over-limit watches and enforces the shape; the guard trigger controls what a browser may set.
  const { data, error } = await ctx.supabase
    .from("trend_watches")
    .insert({
      org_id: ctx.orgId,
      brand_id: i.brandId,
      name: i.name,
      description: i.description ?? null,
      keywords: i.keywords,
      excludes: i.excludes ?? [],
      sources: i.sources ?? ["Google News"],
      rss_feeds: i.rssFeeds ?? [],
      region: (i.region ?? "US").toUpperCase(),
      lookback_hours: i.lookbackHours ?? 48,
      relevance_threshold: i.relevanceThreshold ?? 60,
      frequency_minutes: (i.frequencyMinutes ?? 60) as 30 | 60 | 120 | 240 | 720 | 1440,
      monthly_budget_credits: i.monthlyBudgetCredits ?? 100,
      status: i.status ?? "active",
    })
    .select("id")
    .single();
  if (error || !data) throw new AppError("VALIDATION_ERROR", error?.message ?? "Could not create the watch.", 400);

  const rule = await ctx.supabase.from("trend_rules").insert({ org_id: ctx.orgId, watch_id: data.id, name: "Tell me in the app", channel: "in_app", min_relevance: 70, min_importance: "medium", digest: "immediate" });
  if (rule.error) ctx.log.error("could not create the default rule", { watch_id: data.id, error: rule.error.message });
  revalidatePath("/trend-alerts");
  return { watchId: data.id, estimate: estimateWatchMonthlyCredits({ frequencyMinutes: i.frequencyMinutes ?? 60, budget: i.monthlyBudgetCredits ?? 100 }) };
});

export const updateWatchAction = withOrgAction(
  { ...OPTS, input: z.object({ watchId: uuid, ...Object.fromEntries(Object.entries(watchFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])), status: z.enum(["active", "paused"]).optional() }).strict() },
  async (ctx, i) => {
    const patch: Partial<TrendWatch> = {};
    const map: Record<string, string> = { name: "name", description: "description", keywords: "keywords", excludes: "excludes", sources: "sources", rssFeeds: "rss_feeds", region: "region", lookbackHours: "lookback_hours", relevanceThreshold: "relevance_threshold", frequencyMinutes: "frequency_minutes", monthlyBudgetCredits: "monthly_budget_credits", status: "status" };
    for (const [k, col] of Object.entries(map)) {
      const v = (i as Record<string, unknown>)[k];
      if (v !== undefined) (patch as Record<string, unknown>)[col] = k === "region" ? String(v).toUpperCase() : v;
    }
    if (Object.keys(patch).length === 0) throw new AppError("VALIDATION_ERROR", "Nothing to change.", 400);
    // The database guard refuses spend/schedule fields and the budget_paused state from a browser.
    const { data, error } = await ctx.supabase.from("trend_watches").update(patch).eq("id", i.watchId).eq("org_id", ctx.orgId).select("id");
    if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
    if (!data || data.length === 0) throw new AppError("NOT_FOUND", "That watch was not found.", 404);
    revalidatePath("/trend-alerts");
    return { watchId: i.watchId };
  },
);

export const deleteWatchAction = withOrgAction({ ...OPTS, input: z.object({ watchId: uuid }).strict() }, async (ctx, i) => {
  const { data, error } = await ctx.supabase.from("trend_watches").delete().eq("id", i.watchId).eq("org_id", ctx.orgId).select("id");
  if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
  if (!data || data.length === 0) throw new AppError("NOT_FOUND", "That watch was not found.", 404);
  revalidatePath("/trend-alerts");
  return { watchId: i.watchId };
});

const ruleFields = z
  .object({
    name: z.string().trim().min(1).max(120),
    watchId: uuid.nullable().optional(),
    minRelevance: z.number().int().min(0).max(100).optional(),
    minImportance: z.enum(["low", "medium", "high"]).optional(),
    sentiments: z.array(z.enum(["positive", "negative", "neutral", "mixed"])).max(4).optional(),
    channel: z.enum(["in_app", "slack", "webhook"]),
    target: z.string().trim().max(500).optional(),
    digest: z.enum(["immediate", "daily", "weekly"]).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

function checkTarget(channel: string, target: string | undefined) {
  if (channel === "in_app") return;
  if (!target || !isAcceptableWebhookUrl(target)) {
    throw new AppError("VALIDATION_ERROR", "Enter a public https address for this destination (not a local or private one).", 400);
  }
}

export const createRuleAction = withOrgAction({ ...OPTS, input: ruleFields }, async (ctx, i) => {
  checkTarget(i.channel, i.target);
  const { data, error } = await ctx.supabase
    .from("trend_rules")
    .insert({
      org_id: ctx.orgId,
      watch_id: i.watchId ?? null,
      name: i.name,
      min_relevance: i.minRelevance ?? 70,
      min_importance: i.minImportance ?? "medium",
      sentiments: i.sentiments ?? [],
      channel: i.channel,
      target: i.channel === "in_app" ? null : i.target!,
      digest: i.digest ?? "immediate",
      enabled: i.enabled ?? true,
    })
    .select("id")
    .single();
  if (error || !data) throw new AppError("VALIDATION_ERROR", error?.message ?? "Could not create the rule.", 400);
  revalidatePath("/trend-alerts");
  return { ruleId: data.id };
});

export const deleteRuleAction = withOrgAction({ ...OPTS, input: z.object({ ruleId: uuid }).strict() }, async (ctx, i) => {
  const { data, error } = await ctx.supabase.from("trend_rules").delete().eq("id", i.ruleId).eq("org_id", ctx.orgId).select("id");
  if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
  if (!data || data.length === 0) throw new AppError("NOT_FOUND", "That rule was not found.", 404);
  revalidatePath("/trend-alerts");
  return { ruleId: i.ruleId };
});

const REFUSED: Record<string, string> = {
  paused: "This watch is paused. Resume it to run a check.",
  budget: "This watch has used its monthly budget. Raise the budget or wait for next month.",
  running: "A check is already running for this watch.",
  inactive: "This workspace is not active.",
  missing: "That watch was not found.",
};

/** "Check now". Same path as the schedule: the job and its run are created together, then queued. */
export const runWatchNowAction = withOrgAction({ ...OPTS, input: z.object({ watchId: uuid }).strict() }, async (ctx, i) => {
  // RLS: only a watch of the caller's own workspace is visible here.
  const { data: w } = await ctx.supabase.from("trend_watches").select("id").eq("id", i.watchId).eq("org_id", ctx.orgId).maybeSingle();
  if (!w) throw new AppError("NOT_FOUND", "That watch was not found.", 404);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_watch_run", { p_watch: i.watchId, p_trigger: "manual", p_user: ctx.user.id });
  const row = data?.[0];
  if (error || !row) throw new AppError("INTERNAL_ERROR", "Could not start the check. Please try again.", 500);
  if (row.refused || !row.job_id || !row.run_id) throw new AppError("VALIDATION_ERROR", REFUSED[row.refused ?? ""] ?? "This watch cannot run right now.", 400);

  try {
    await enqueueJob("alerts.run", row.job_id);
  } catch (e) {
    ctx.log.error("could not enqueue watch check", { job_id: row.job_id, error: e instanceof Error ? e.message : String(e) });
    const message = "The job queue is not reachable right now. Nothing was charged. Please try again in a minute.";
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("jobs").update({ status: "failed", error_code: "QUEUE_UNAVAILABLE", error_message: message, finished_at: now }).eq("id", row.job_id),
      admin.from("trend_watch_runs").update({ status: "failed", error_message: message, finished_at: now }).eq("id", row.run_id),
    ]);
    throw new AppError("INTERNAL_ERROR", message, 503);
  }
  revalidatePath("/trend-alerts");
  return { jobId: row.job_id, runId: row.run_id };
});
