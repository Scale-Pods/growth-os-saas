import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBrandContext, type BrandContext } from "@growth-os/shared";
import type { CalendarEntry, RankedSignal } from "@growth-os/ai";
import type { BrandFact, BrandKit, BrandPillar, BrandProfile, BrandVoice } from "@growth-os/db";

export interface StrategyRow {
  id: string;
  status: string;
  scope: "day" | "week" | "month";
  platform: string;
  content_type: string;
  source_signal_ids: string[];
  source_signals_snapshot: { id: string; source: string; topic: string }[];
  sections: Record<string, unknown>;
  content_calendar: CalendarEntry[];
  ai_summary?: string | null;
  error_detail?: string | null;
}

export interface RunResult {
  status: "completed" | "partial";
  sourcesCompleted: string[];
  sourceStatus: Record<string, { ok: boolean; items?: number; reason?: string }>;
  summary: string;
}

/** Everything the research handlers read and write. Every call is scoped by org id, which the handler takes from the job row. */
export interface ResearchStore {
  loadBrandContext(orgId: string, brandId: string): Promise<BrandContext>;
  listCompetitors(orgId: string, brandId: string): Promise<{ name: string; website: string | null }[]>;
  websiteUrl(orgId: string, brandId: string): Promise<string | null>;

  getReportForJob(jobId: string, orgId: string): Promise<{ id: string; status: string; sections: Record<string, string> } | null>;
  saveReportSection(reportId: string, orgId: string, key: string, text: string): Promise<void>;
  finishReport(reportId: string, orgId: string, fullReport: string): Promise<void>;
  failReport(reportId: string, orgId: string, message: string): Promise<void>;

  getStrategyForJob(jobId: string, orgId: string): Promise<StrategyRow | null>;
  getStrategy(strategyId: string, orgId: string): Promise<StrategyRow | null>;
  signalsFor(ids: string[], orgId: string, brandId: string): Promise<{ source: string; topic: string; reason: string | null }[]>;
  latestIntelligenceSummary(orgId: string, brandId: string): Promise<string | null>;
  saveStrategySection(strategyId: string, orgId: string, key: string, value: unknown): Promise<void>;
  saveCalendar(strategyId: string, orgId: string, items: CalendarEntry[]): Promise<void>;
  finishStrategy(strategyId: string, orgId: string, summary: string): Promise<void>;
  failStrategy(strategyId: string, orgId: string, message: string): Promise<void>;

  getRunForJob(jobId: string, orgId: string): Promise<{ id: string; status: string; sources_requested: string[] } | null>;
  setRunRunning(runId: string, orgId: string): Promise<void>;
  finishRun(runId: string, orgId: string, result: RunResult, signals: RankedSignal[]): Promise<void>;
  failRun(runId: string, orgId: string, message: string): Promise<void>;
}

function must(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function supabaseResearchStore(db: SupabaseClient): ResearchStore {
  const strategyCols = "id, status, scope, platform, content_type, source_signal_ids, source_signals_snapshot, sections, content_calendar, ai_summary, error_detail";
  return {
    async loadBrandContext(orgId, brandId) {
      const [brand, profile, kit, voice, facts, pillars] = await Promise.all([
        db.from("brands").select("*").eq("id", brandId).eq("org_id", orgId).maybeSingle(),
        db.from("brand_profiles").select("*").eq("brand_id", brandId).eq("org_id", orgId).maybeSingle(),
        db.from("brand_kits").select("*").eq("brand_id", brandId).eq("org_id", orgId).maybeSingle(),
        db.from("brand_voice").select("*").eq("brand_id", brandId).eq("org_id", orgId).maybeSingle(),
        db.from("brand_facts").select("*").eq("brand_id", brandId).eq("org_id", orgId),
        db.from("brand_pillars").select("*").eq("brand_id", brandId).eq("org_id", orgId),
      ]);
      must(brand.error, "load brand");
      if (!brand.data) throw new Error("brand not found");
      return buildBrandContext({
        brand: brand.data,
        profile: (profile.data as BrandProfile | null) ?? null,
        kit: (kit.data as BrandKit | null) ?? null,
        voice: (voice.data as BrandVoice | null) ?? null,
        facts: (facts.data as BrandFact[] | null) ?? [],
        pillars: (pillars.data as BrandPillar[] | null) ?? [],
      });
    },
    async listCompetitors(orgId, brandId) {
      const { data, error } = await db.from("competitors").select("name, website_url").eq("brand_id", brandId).eq("org_id", orgId).limit(15);
      must(error, "load competitors");
      return (data ?? []).map((c) => ({ name: c.name as string, website: (c.website_url as string | null) ?? null }));
    },
    async websiteUrl(orgId, brandId) {
      const { data, error } = await db.from("brand_profiles").select("website_url").eq("brand_id", brandId).eq("org_id", orgId).maybeSingle();
      must(error, "load website");
      return (data?.website_url as string | null) ?? null;
    },

    async getReportForJob(jobId, orgId) {
      const { data, error } = await db.from("intelligence_reports").select("id, status, sections").eq("job_id", jobId).eq("org_id", orgId).maybeSingle();
      must(error, "load report");
      return data ? { id: data.id as string, status: data.status as string, sections: (data.sections ?? {}) as Record<string, string> } : null;
    },
    async saveReportSection(reportId, orgId, key, text) {
      const { data, error } = await db.from("intelligence_reports").select("sections").eq("id", reportId).eq("org_id", orgId).single();
      must(error, "read sections");
      const sections = { ...((data?.sections ?? {}) as Record<string, string>), [key]: text };
      const up = await db.from("intelligence_reports").update({ sections }).eq("id", reportId).eq("org_id", orgId);
      must(up.error, "save section");
    },
    async finishReport(reportId, orgId, fullReport) {
      const { error } = await db.from("intelligence_reports").update({ status: "completed", full_report: fullReport, error_message: null }).eq("id", reportId).eq("org_id", orgId);
      must(error, "finish report");
    },
    async failReport(reportId, orgId, message) {
      const { error } = await db.from("intelligence_reports").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", reportId).eq("org_id", orgId);
      must(error, "fail report");
    },

    async getStrategyForJob(jobId, orgId) {
      const { data, error } = await db.from("strategies").select(strategyCols).eq("job_id", jobId).eq("org_id", orgId).maybeSingle();
      must(error, "load strategy");
      return (data as StrategyRow | null) ?? null;
    },
    async getStrategy(strategyId, orgId) {
      const { data, error } = await db.from("strategies").select(strategyCols).eq("id", strategyId).eq("org_id", orgId).maybeSingle();
      must(error, "load strategy");
      return (data as StrategyRow | null) ?? null;
    },
    async signalsFor(ids, orgId, brandId) {
      if (ids.length === 0) return [];
      const { data, error } = await db.from("trend_signals").select("source, topic, relevance_reason").in("id", ids).eq("org_id", orgId).eq("brand_id", brandId);
      must(error, "load signals");
      return (data ?? []).map((s) => ({ source: s.source as string, topic: s.topic as string, reason: (s.relevance_reason as string | null) ?? null }));
    },
    async latestIntelligenceSummary(orgId, brandId) {
      const { data, error } = await db
        .from("intelligence_reports")
        .select("full_report")
        .eq("org_id", orgId)
        .eq("brand_id", brandId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      must(error, "load latest report");
      return (data?.full_report as string | null) ?? null;
    },
    async saveStrategySection(strategyId, orgId, key, value) {
      const { data, error } = await db.from("strategies").select("sections").eq("id", strategyId).eq("org_id", orgId).single();
      must(error, "read sections");
      const sections = { ...((data?.sections ?? {}) as Record<string, unknown>), [key]: value };
      const up = await db.from("strategies").update({ sections }).eq("id", strategyId).eq("org_id", orgId);
      must(up.error, "save strategy section");
    },
    async saveCalendar(strategyId, orgId, items) {
      const { error } = await db.from("strategies").update({ content_calendar: items }).eq("id", strategyId).eq("org_id", orgId);
      must(error, "save calendar");
    },
    async finishStrategy(strategyId, orgId, summary) {
      const { error } = await db.from("strategies").update({ status: "completed", ai_summary: summary.slice(0, 10000), error_detail: null }).eq("id", strategyId).eq("org_id", orgId).eq("status", "processing");
      must(error, "finish strategy");
    },
    async failStrategy(strategyId, orgId, message) {
      const { error } = await db.from("strategies").update({ status: "failed", error_detail: message.slice(0, 1000) }).eq("id", strategyId).eq("org_id", orgId).eq("status", "processing");
      must(error, "fail strategy");
    },

    async getRunForJob(jobId, orgId) {
      const { data, error } = await db.from("trend_runs").select("id, status, sources_requested").eq("job_id", jobId).eq("org_id", orgId).maybeSingle();
      must(error, "load run");
      return data ? { id: data.id as string, status: data.status as string, sources_requested: (data.sources_requested ?? []) as string[] } : null;
    },
    async setRunRunning(runId, orgId) {
      const { error } = await db.from("trend_runs").update({ status: "running" }).eq("id", runId).eq("org_id", orgId);
      must(error, "start run");
    },
    async finishRun(runId, orgId, result, signals) {
      const { data: run, error: rErr } = await db.from("trend_runs").select("brand_id").eq("id", runId).eq("org_id", orgId).single();
      must(rErr, "load run brand");
      if (signals.length > 0) {
        const { error } = await db.from("trend_signals").insert(
          signals.map((s) => ({
            org_id: orgId,
            brand_id: run!.brand_id as string,
            run_id: runId,
            source: s.source.slice(0, 60),
            topic: s.topic.slice(0, 500),
            relevance_score: s.relevance_score,
            relevance_reason: s.relevance_reason.slice(0, 1000),
            url: s.url ? s.url.slice(0, 1000) : null,
            meta: (s.meta ?? {}) as never,
          })),
        );
        must(error, "save signals");
      }
      const { error } = await db
        .from("trend_runs")
        .update({ status: result.status, sources_completed: result.sourcesCompleted, source_status: result.sourceStatus as never, ai_summary: result.summary.slice(0, 10000), finished_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("org_id", orgId);
      must(error, "finish run");
    },
    async failRun(runId, orgId, message) {
      const { error } = await db.from("trend_runs").update({ status: "failed", error_message: message.slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", runId).eq("org_id", orgId);
      must(error, "fail run");
    },
  };
}
