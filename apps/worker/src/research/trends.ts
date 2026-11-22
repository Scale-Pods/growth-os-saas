import { AppError } from "@growth-os/shared";
import { buildTrendRankingPrompt, generateJson, validateTrendRanking, type GatewayDeps, type RawTrendItem } from "@growth-os/ai";
import type { Handler, Logger } from "../runner";
import { childId } from "./ids";
import type { TrendCollector } from "./collectors";
import type { ResearchStore } from "./store";

interface Deps {
  store: ResearchStore;
  gateway: GatewayDeps;
  model: string;
  collectors: Map<string, TrendCollector>;
  log: Logger;
}

const DEFAULT_COUNT = 10;
const MIN_SCORE = 40;

/**
 * Collect from each chosen source, rank everything once against the brand, and save the signals.
 * One source failing never fails the run: the result says which sources worked ("4 of 5 sources used").
 * If NOTHING could be collected the run fails with a reason, and the model is never called (no cost).
 */
export function trendScanHandler(d: Deps): Handler {
  return async ({ job, heartbeat }) => {
    if (!job.brand_id) throw new AppError("VALIDATION_ERROR", "This job has no brand.", 400);
    const run = await d.store.getRunForJob(job.id, job.org_id);
    if (!run) throw new AppError("NOT_FOUND", "The scan for this job could not be found.", 404);
    if (run.status === "completed" || run.status === "partial") return { output: { runId: run.id, skipped: true } };

    const ctx = await d.store.loadBrandContext(job.org_id, job.brand_id);
    const counts = ((job.input_ref ?? {}) as { counts?: Record<string, number> }).counts ?? {};
    await d.store.setRunRunning(run.id, job.org_id);

    const status: Record<string, { ok: boolean; items?: number; reason?: string }> = {};
    const items: RawTrendItem[] = [];
    let i = 0;
    for (const source of run.sources_requested) {
      i++;
      const collector = d.collectors.get(source);
      if (!collector) {
        status[source] = { ok: false, reason: "This source is not available yet." };
      } else {
        try {
          const n = Math.max(1, Math.min(50, Math.round(counts[source] ?? DEFAULT_COUNT)));
          const got = (await collector.collect({ ctx, count: n })).map((it) => ({ ...it, topic: it.topic.trim().slice(0, 500) })).filter((it) => it.topic);
          items.push(...got);
          status[source] = { ok: true, items: got.length };
        } catch (e) {
          // Recorded, not hidden: the run shows which source failed and why.
          const reason = (e instanceof Error ? e.message : String(e)).slice(0, 200);
          status[source] = { ok: false, reason };
          d.log.warn("trend source failed", { job_id: job.id, org_id: job.org_id, source });
        }
      }
      await heartbeat({ percent: Math.round((i / (run.sources_requested.length + 1)) * 100), label: `Collected ${source}` });
    }

    const okSources = Object.entries(status).filter(([, s]) => s.ok).map(([k]) => k);
    if (items.length === 0) {
      const reasons = Object.entries(status).map(([k, s]) => `${k}: ${s.reason ?? "no results"}`).join("; ");
      const message = `None of the sources returned anything (${reasons}). Nothing was charged.`.slice(0, 1000);
      await d.store.failRun(run.id, job.org_id, message);
      throw new AppError("PROVIDER_ERROR", message, 502);
    }

    try {
      const p = buildTrendRankingPrompt(ctx, items);
      const ranked = await generateJson(d.gateway, {
        orgId: job.org_id, userId: job.created_by, jobId: childId(job.id, "rank"), model: d.model, system: p.system, user: p.user, maxOutputTokens: 3000,
        validate: (v) => validateTrendRanking(v, items, { minScore: MIN_SCORE }),
      });
      const complete = okSources.length === run.sources_requested.length;
      await d.store.finishRun(run.id, job.org_id, { status: complete ? "completed" : "partial", sourcesCompleted: okSources, sourceStatus: status, summary: ranked.data.summary || `${ranked.data.signals.length} relevant trends found.` }, ranked.data.signals);
      await heartbeat({ percent: 100, label: "Done" });
      return { output: { runId: run.id, signals: ranked.data.signals.length, sourcesUsed: okSources.length, sourcesRequested: run.sources_requested.length } };
    } catch (e) {
      const reason = e instanceof AppError ? e.message : "Something went wrong while ranking the trends.";
      await d.store.failRun(run.id, job.org_id, reason);
      throw e;
    }
  };
}
