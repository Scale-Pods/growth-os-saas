import { AppError } from "@growth-os/shared";
import {
  INTELLIGENCE_SECTIONS,
  buildIntelligenceSectionPrompt,
  buildIntelligenceSummaryPrompt,
  findUnapprovedStatistics,
  generateText,
  type Evidence,
  type GatewayDeps,
  type IntelligenceKey,
  type Prompt,
} from "@growth-os/ai";
import type { Handler, Logger } from "../runner";
import { childId } from "./ids";
import { removeUnapprovedStatistics } from "./clean";
import type { ResearchStore } from "./store";

/** Marks a section we did not send to the model because there was nothing to analyse. */
const NO_ANALYSIS = "_No analysis available._";

const NO_DATA: Record<"instagram" | "facebook" | "linkedin", string> = {
  instagram: `${NO_ANALYSIS}\n\nAutomatic collection from Instagram is not set up yet, so there is nothing to analyse here. We did not guess.`,
  facebook: `${NO_ANALYSIS}\n\nAutomatic collection from Facebook is not set up yet, so there is nothing to analyse here. We did not guess.`,
  linkedin: `${NO_ANALYSIS}\n\nAutomatic collection from LinkedIn is not set up yet, so there is nothing to analyse here. We did not guess.`,
};

interface Deps {
  store: ResearchStore;
  gateway: GatewayDeps;
  model: string;
  /** Fetch a web page as plain text (safe against private addresses). */
  fetchPage: (url: string) => Promise<string>;
  log: Logger;
}

/**
 * Builds the business intelligence report, one section at a time. Sections that have no evidence to analyse are
 * written as an honest "no analysis available" note without calling the model (no cost, no invented analysis).
 * Finished sections are saved as they complete, so a failure keeps the work done so far and a retry only does the rest.
 */
export function intelligenceHandler(d: Deps): Handler {
  return async ({ job, heartbeat }) => {
    if (!job.brand_id) throw new AppError("VALIDATION_ERROR", "This job has no brand.", 400);
    const report = await d.store.getReportForJob(job.id, job.org_id);
    if (!report) throw new AppError("NOT_FOUND", "The report for this job could not be found.", 404);
    if (report.status === "completed") return { output: { reportId: report.id, skipped: true } };

    const ctx = await d.store.loadBrandContext(job.org_id, job.brand_id);
    const sections: Record<string, string> = { ...report.sections };
    const total = INTELLIGENCE_SECTIONS.length + 1;
    let step = 0;

    const ai = async (key: string, prompt: Prompt): Promise<string> => {
      const base = { orgId: job.org_id, userId: job.created_by, model: d.model, system: prompt.system, maxOutputTokens: 1500 };
      let text = (await generateText(d.gateway, { ...base, jobId: childId(job.id, key), user: prompt.user })).text;
      const bad = findUnapprovedStatistics(text, ctx);
      if (bad.length) {
        text = (
          await generateText(d.gateway, {
            ...base,
            jobId: childId(job.id, `${key}:retry`),
            user: `${prompt.user}\n\nYour previous answer contained statistics that are not approved: ${bad.join(", ")}. Rewrite the section without any statistics except the approved facts.`,
          })
        ).text;
      }
      return removeUnapprovedStatistics(text, ctx);
    };

    try {
      const url = await d.store.websiteUrl(job.org_id, job.brand_id);
      const competitors = await d.store.listCompetitors(job.org_id, job.brand_id);

      // Evidence: only the website can be collected today. A failure is recorded in the section, it does not fail the report.
      let websiteText: string | null = null;
      let websiteNote = `${NO_ANALYSIS}\n\nNo website address is set for this brand. Add it in the brand profile to get this analysis.`;
      if (url && !sections.website) {
        try {
          websiteText = await d.fetchPage(url);
          if (!websiteText.trim()) {
            websiteText = null;
            websiteNote = `${NO_ANALYSIS}\n\nThe website returned no readable text.`;
          }
        } catch (e) {
          const reason = e instanceof AppError ? e.message : "The website could not be read.";
          websiteNote = `${NO_ANALYSIS}\n\n${reason} Check the address in the brand profile and run the report again.`;
          d.log.warn("website could not be read", { job_id: job.id, org_id: job.org_id });
        }
      }
      const evidence: Evidence = { website: websiteText };

      for (const section of INTELLIGENCE_SECTIONS) {
        const key = section.key as IntelligenceKey;
        step++;
        if (sections[key]) continue; // already done in an earlier run

        let text: string;
        if (key === "instagram" || key === "facebook" || key === "linkedin") {
          text = NO_DATA[key as "instagram" | "facebook" | "linkedin"];
        } else if (key === "website") {
          text = websiteText ? await ai(key, buildIntelligenceSectionPrompt(key, ctx, { evidence, competitors })) : websiteNote;
        } else if (key === "competitors") {
          text = competitors.length ? await ai(key, buildIntelligenceSectionPrompt(key, ctx, { evidence, competitors })) : `${NO_ANALYSIS}\n\nNo competitors have been listed for this brand yet. Add some in the brand profile to get this analysis.`;
        } else if (key === "seo") {
          text = websiteText ? await ai(key, buildIntelligenceSectionPrompt(key, ctx, { evidence, competitors })) : `${NO_ANALYSIS}\n\nThere was no website text to analyse, so no SEO analysis was written.`;
        } else {
          text = await ai(key, buildIntelligenceSectionPrompt(key, ctx, { evidence, competitors }));
        }
        sections[key] = text;
        await d.store.saveReportSection(report.id, job.org_id, key, text);
        await heartbeat({ percent: Math.round((step / total) * 100), label: section.title });
      }

      // The summary only uses sections the model actually wrote.
      const written = Object.fromEntries(Object.entries(sections).filter(([, v]) => !v.startsWith(NO_ANALYSIS)));
      const summary = await ai("summary", buildIntelligenceSummaryPrompt(ctx, written as Partial<Record<IntelligenceKey, string>>));
      await d.store.finishReport(report.id, job.org_id, summary);
      await heartbeat({ percent: 100, label: "Done" });
      return { output: { reportId: report.id, sections: Object.keys(sections).length } };
    } catch (e) {
      const done = Object.keys(sections).length;
      const reason = e instanceof AppError ? e.message : "Something went wrong while writing the report.";
      await d.store.failReport(report.id, job.org_id, `${done} of ${INTELLIGENCE_SECTIONS.length} sections finished. ${reason}`);
      throw e;
    }
  };
}
