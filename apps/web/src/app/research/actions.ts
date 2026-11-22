"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@growth-os/shared";
import { withOrgAction } from "@/lib/api/with-org";
import { startContentJob } from "@/lib/api/content-jobs";

const uuid = z.string().uuid();
const SOURCES = ["Reddit", "Instagram", "YouTube", "Google Search", "Google Trends"] as const;
const SECTIONS = ["campaign_planning", "weekly_content_strategy", "content_pillars", "platform_strategy", "lead_generation_strategy", "cta_strategy", "content_calendar"] as const;
const OPTS = { feature: "strategy", level: "edit" } as const;

/** The customer's calendar date (YYYY-MM-DD). It must be within a day of the server's, so a wrong clock cannot skew a plan. */
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => Math.abs(Date.parse(`${d}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) <= 86_400_000 * 1, "Date is out of range");

const brandOnly = z.object({ brandId: uuid }).strict();

export const startIntelligenceAction = withOrgAction({ ...OPTS, input: brandOnly }, async (ctx, i) => {
  const r = await startContentJob(ctx, "intelligence.generate", i.brandId, {});
  revalidatePath("/intelligence");
  return r;
});

export const startTrendScanAction = withOrgAction(
  {
    ...OPTS,
    input: z
      .object({
        brandId: uuid,
        sources: z.array(z.enum(SOURCES)).max(5).optional(),
        counts: z.record(z.enum(SOURCES), z.number().int().min(1).max(50)).optional(),
      })
      .strict(),
  },
  async (ctx, i) => {
    const r = await startContentJob(ctx, "trends.scan", i.brandId, { sources: i.sources ?? [], counts: i.counts ?? {} });
    revalidatePath("/trends");
    return r;
  },
);

export const startStrategyAction = withOrgAction(
  {
    ...OPTS,
    input: z
      .object({
        brandId: uuid,
        scope: z.enum(["day", "week", "month"]),
        platform: z.string().max(40).optional(),
        contentType: z.string().max(40).optional(),
        signalIds: z.array(uuid).max(50).optional(),
        today: localDate.optional(),
      })
      .strict(),
  },
  async (ctx, i) => {
    const r = await startContentJob(ctx, "strategy.generate", i.brandId, {
      scope: i.scope,
      platform: i.platform ?? "",
      content_type: i.contentType ?? "",
      signal_ids: i.signalIds ?? [],
      today: i.today ?? new Date().toISOString().slice(0, 10),
    });
    revalidatePath("/strategy");
    return r;
  },
);

export const regenerateStrategySectionAction = withOrgAction(
  { ...OPTS, input: z.object({ strategyId: uuid, section: z.enum(SECTIONS), today: localDate.optional() }).strict() },
  async (ctx, i) => {
    // RLS: only a strategy of the caller's own workspace is visible here.
    const { data: s } = await ctx.supabase.from("strategies").select("id, brand_id, status").eq("id", i.strategyId).eq("org_id", ctx.orgId).maybeSingle();
    if (!s) throw new AppError("NOT_FOUND", "That strategy was not found.", 404);
    if (s.status !== "completed" && s.status !== "approved") throw new AppError("VALIDATION_ERROR", "That strategy is not ready yet.", 400);
    const r = await startContentJob(ctx, "strategy.regenerate_section", s.brand_id, {
      strategy_id: s.id,
      section: i.section,
      today: i.today ?? new Date().toISOString().slice(0, 10),
    });
    revalidatePath("/strategy");
    return r;
  },
);

/** Approve a strategy. The database makes sure only one stays approved per brand (the previous one is demoted). */
export const approveStrategyAction = withOrgAction({ ...OPTS, input: z.object({ strategyId: uuid }).strict() }, async (ctx, i) => {
  const { error } = await ctx.supabase.rpc("approve_strategy", { p_strategy: i.strategyId });
  if (error) throw new AppError(error.code === "42501" ? "FORBIDDEN" : "VALIDATION_ERROR", error.message, error.code === "42501" ? 403 : 400);
  revalidatePath("/strategy");
  return { strategyId: i.strategyId };
});

export const acceptCompetitorCandidateAction = withOrgAction({ ...OPTS, input: z.object({ candidateId: uuid }).strict() }, async (ctx, i) => {
  const { data, error } = await ctx.supabase.rpc("accept_competitor_candidate", { p_candidate: i.candidateId });
  if (error) throw new AppError(error.code === "42501" ? "FORBIDDEN" : "VALIDATION_ERROR", error.message, error.code === "42501" ? 403 : 400);
  revalidatePath("/clients");
  return { competitorId: data };
});

export const rejectCompetitorCandidateAction = withOrgAction({ ...OPTS, input: z.object({ candidateId: uuid }).strict() }, async (ctx, i) => {
  const { error } = await ctx.supabase.rpc("reject_competitor_candidate", { p_candidate: i.candidateId });
  if (error) throw new AppError(error.code === "42501" ? "FORBIDDEN" : "VALIDATION_ERROR", error.message, error.code === "42501" ? 403 : 400);
  revalidatePath("/clients");
  return { candidateId: i.candidateId };
});
