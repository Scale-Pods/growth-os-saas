import { renderPromptHeader, type BrandContext } from "@growth-os/shared";

export interface Prompt {
  system: string;
  user: string;
}

/** Cap untrusted or customer-supplied text so prompts stay bounded (and a huge page cannot drown the instructions). */
export function cap(text: string | null | undefined, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) + "\n[truncated]" : t;
}

/**
 * The system prompt: a role, then the standard brand block (voice, banned words, the LITERAL approved facts and the
 * metric safety rule), then the working rules. Brand data is data from `brandContext`, never hard-coded.
 */
export function systemFor(role: string, ctx: BrandContext, extraRules: string[] = []): string {
  const rules = [
    "Base every claim on the evidence or brand profile you are given.",
    "Never invent statistics, follower counts, rankings, prices, quotes, customers or competitor facts.",
    "If evidence is missing, say exactly what is missing instead of guessing.",
    ...extraRules,
  ];
  return `${role}\n\n${renderPromptHeader(ctx)}\nWORKING RULES:\n${rules.map((r) => `- ${r}`).join("\n")}`;
}

export const JSON_ONLY = "Reply with ONLY valid JSON in exactly the shape described. No commentary and no code fences.";
