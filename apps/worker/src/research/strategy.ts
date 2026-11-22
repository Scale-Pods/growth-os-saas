import { AppError } from "@growth-os/shared";
import {
  STRATEGY_SECTIONS,
  buildCalendarPrompt,
  buildStrategySectionPrompt,
  buildStrategySummaryPrompt,
  calendarWindow,
  findUnapprovedStatistics,
  generateJson,
  generateText,
  validateCalendar,
  validateStrategySection,
  type CalendarEntry,
  type GatewayDeps,
  type StrategyInput,
  type StrategyKey,
} from "@growth-os/ai";
import type { BrandContext } from "@growth-os/shared";
import type { Handler, Logger } from "../runner";
import { childId } from "./ids";
import { removeUnapprovedStatistics } from "./clean";
import type { ResearchStore, StrategyRow } from "./store";

interface Deps {
  store: ResearchStore;
  gateway: GatewayDeps;
  model: string;
  now: () => Date;
  log: Logger;
}

const SECTION_TOKENS = 1200;
const CALENDAR_TOKENS = 2500;

function today(input: unknown, now: Date): string {
  const t = (input as { today?: unknown } | null)?.today;
  return typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : now.toISOString().slice(0, 10);
}

async function inputFor(d: Deps, orgId: string, brandId: string, row: StrategyRow, todayStr: string): Promise<StrategyInput> {
  const found = await d.store.signalsFor(row.source_signal_ids, orgId, brandId);
  // The snapshot keeps the strategy readable even if signals were pruned later.
  const signals = found.length ? found : row.source_signals_snapshot.map((s) => ({ source: s.source, topic: s.topic, reason: null as string | null }));
  return {
    scope: row.scope,
    platform: row.platform,
    contentType: row.content_type,
    signals,
    today: todayStr,
    intelligenceSummary: await d.store.latestIntelligenceSummary(orgId, brandId),
  };
}

/** Run one JSON part. Invented statistics are rejected inside the validator, so the gateway's single retry covers them. */
function sectionRunner(d: Deps, ctx: BrandContext, orgId: string, userId: string | null, jobId: string) {
  const reject = (value: unknown) => {
    const bad = findUnapprovedStatistics(JSON.stringify(value), ctx);
    if (bad.length) throw new Error(`unsupported statistics: ${bad.join(", ")}`);
  };
  return {
    async section(key: StrategyKey, input: StrategyInput): Promise<Record<string, unknown>> {
      const p = buildStrategySectionPrompt(key, ctx, input);
      const r = await generateJson(d.gateway, {
        orgId, userId, jobId: childId(jobId, key), model: d.model, system: p.system, user: p.user, maxOutputTokens: SECTION_TOKENS,
        validate: (v) => {
          const out = validateStrategySection(key, v);
          reject(out);
          return out;
        },
      });
      return r.data;
    },
    async calendar(input: StrategyInput): Promise<CalendarEntry[]> {
      const p = buildCalendarPrompt(ctx, input);
      const window = calendarWindow(input.today, input.scope);
      const r = await generateJson(d.gateway, {
        orgId, userId, jobId: childId(jobId, "content_calendar"), model: d.model, system: p.system, user: p.user, maxOutputTokens: CALENDAR_TOKENS,
        validate: (v) => {
          const items = validateCalendar(v, window);
          reject(items);
          return items;
        },
      });
      return r.data;
    },
    async summary(sections: Record<string, unknown>): Promise<string> {
      const p = buildStrategySummaryPrompt(ctx, sections);
      const r = await generateText(d.gateway, { orgId, userId, jobId: childId(jobId, "summary"), model: d.model, system: p.system, user: p.user, maxOutputTokens: 500 });
      return removeUnapprovedStatistics(r.text, ctx);
    },
  };
}

/** Builds a whole strategy: six parts, a calendar and a summary. Parts are saved as they finish. */
export function strategyHandler(d: Deps): Handler {
  return async ({ job, heartbeat }) => {
    if (!job.brand_id) throw new AppError("VALIDATION_ERROR", "This job has no brand.", 400);
    const row = await d.store.getStrategyForJob(job.id, job.org_id);
    if (!row) throw new AppError("NOT_FOUND", "The strategy for this job could not be found.", 404);
    if (row.status === "completed" || row.status === "approved") return { output: { strategyId: row.id, skipped: true } };

    const ctx = await d.store.loadBrandContext(job.org_id, job.brand_id);
    const input = await inputFor(d, job.org_id, job.brand_id, row, today(job.input_ref, d.now()));
    const run = sectionRunner(d, ctx, job.org_id, job.created_by, job.id);
    const sections: Record<string, unknown> = { ...row.sections };
    const total = STRATEGY_SECTIONS.length + 2;
    let step = 0;

    try {
      for (const def of STRATEGY_SECTIONS) {
        step++;
        if (sections[def.key]) continue;
        const value = await run.section(def.key, input);
        sections[def.key] = value;
        await d.store.saveStrategySection(row.id, job.org_id, def.key, value);
        await heartbeat({ percent: Math.round((step / total) * 100), label: def.title });
      }
      step++;
      if (row.content_calendar.length === 0) {
        const items = await run.calendar(input);
        await d.store.saveCalendar(row.id, job.org_id, items);
        await heartbeat({ percent: Math.round((step / total) * 100), label: "Content calendar" });
      }
      const summary = await run.summary(sections);
      await d.store.finishStrategy(row.id, job.org_id, summary);
      await heartbeat({ percent: 100, label: "Done" });
      return { output: { strategyId: row.id } };
    } catch (e) {
      const reason = e instanceof AppError ? e.message : "Something went wrong while building the strategy.";
      await d.store.failStrategy(row.id, job.org_id, `${Object.keys(sections).length} of ${STRATEGY_SECTIONS.length} parts finished. ${reason}`);
      throw e;
    }
  };
}

/** Regenerate ONE part (or the calendar) of a finished strategy. If it fails, the old content stays. */
export function strategySectionHandler(d: Deps): Handler {
  return async ({ job, heartbeat }) => {
    if (!job.brand_id) throw new AppError("VALIDATION_ERROR", "This job has no brand.", 400);
    const inp = (job.input_ref ?? {}) as { strategy_id?: string; section?: string };
    const strategyId = typeof inp.strategy_id === "string" ? inp.strategy_id : "";
    const section = typeof inp.section === "string" ? inp.section : "";
    const isCalendar = section === "content_calendar";
    const def = STRATEGY_SECTIONS.find((s) => s.key === section);
    if (!isCalendar && !def) throw new AppError("VALIDATION_ERROR", "That strategy part is not known.", 400);

    const row = await d.store.getStrategy(strategyId, job.org_id);
    if (!row || (row.status !== "completed" && row.status !== "approved")) throw new AppError("NOT_FOUND", "That strategy was not found or is not ready.", 404);

    const ctx = await d.store.loadBrandContext(job.org_id, job.brand_id);
    const input = await inputFor(d, job.org_id, job.brand_id, row, today(job.input_ref, d.now()));
    const run = sectionRunner(d, ctx, job.org_id, job.created_by, job.id);

    await heartbeat({ percent: 10, label: isCalendar ? "Content calendar" : def!.title });
    if (isCalendar) await d.store.saveCalendar(row.id, job.org_id, await run.calendar(input));
    else await d.store.saveStrategySection(row.id, job.org_id, def!.key, await run.section(def!.key, input));
    await heartbeat({ percent: 100, label: "Done" });
    return { output: { strategyId: row.id, section } };
  };
}
