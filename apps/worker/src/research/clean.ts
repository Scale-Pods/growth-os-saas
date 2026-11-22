import { findUnapprovedStatistics } from "@growth-os/ai";
import type { BrandContext } from "@growth-os/shared";

/** Remove every sentence that contains one of the given statistics. */
export function stripSentencesWith(text: string, tokens: string[]): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => s.trim() && !tokens.some((t) => s.includes(t)))
    .join(" ")
    .trim();
}

/** Final safety net: if invented statistics survive the retry, cut the sentences that carry them. */
export function removeUnapprovedStatistics(text: string, ctx: BrandContext): string {
  const bad = findUnapprovedStatistics(text, ctx);
  return bad.length ? stripSentencesWith(text, bad) : text;
}
