import type { BrandContext } from "@growth-os/shared";

const norm = (s: string) => s.toLowerCase().replace(/[\s,]+/g, "");

/**
 * Patterns that look like a claim, not like scheduling: percentages, money, multipliers and big-number words.
 * ("3 posts a week", "4 weeks", "5 hours" are plain numbers and are NOT flagged.)
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\b\d[\d,.]*\s?%/g,
  /[$€£₹]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion|thousand))?/gi,
  /\b\d[\d,.]*\s?(?:x|×)(?!\w)/gi,
  /\b\d[\d,.]*\s?(?:million|billion|thousand)\b/gi,
];

/**
 * Statistics in a model answer that are NOT in the brand's approved facts. Only enforced while
 * "Only cite approved facts" is on. A brand with no approved facts may state no statistics at all.
 */
export function findUnapprovedStatistics(text: string, ctx: BrandContext): string[] {
  if (!ctx.onlyCiteApprovedFacts) return [];
  const facts = ctx.facts.map((f) => norm(f.statement));
  const found = new Set<string>();
  for (const re of CLAIM_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const token = m[0].trim();
      const n = norm(token);
      if (!facts.some((f) => f.includes(n))) found.add(token);
    }
  }
  return [...found];
}
