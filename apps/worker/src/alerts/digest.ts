import { AppError } from "@growth-os/shared";
import type { Logger } from "../runner";
import type { RuleRow } from "./run";

export interface DigestItem {
  deliveryId: string;
  rule: RuleRow & { org_id: string };
  watchId: string;
  watchName: string;
  event: { id: string; title: string; summary: string | null; importance: string; relevance_score: number; primary_url: string | null };
}

export interface DigestStore {
  /** Stories waiting for the given digest period, with the rule that queued them. */
  queued(period: "daily" | "weekly"): Promise<DigestItem[]>;
  mark(deliveryId: string, status: "sent" | "failed", error?: string): Promise<void>;
  recipients(orgId: string): Promise<string[]>;
  notify(rows: { org_id: string; user_id: string; type: string; title: string; body?: string | null; link?: string | null }[]): Promise<void>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Send the queued stories as ONE message per rule (not one per story). Each delivery is marked sent or failed.
 * A failing endpoint is recorded with a readable reason and never hides the other rules' digests.
 */
export async function runDigest(
  d: { store: DigestStore; post: (url: string, body: unknown) => Promise<{ ok: boolean; status: number }>; log: Logger },
  period: "daily" | "weekly",
): Promise<{ rules: number; stories: number; failed: number }> {
  const items = (await d.store.queued(period)).filter((i) => i.rule.enabled && i.rule.digest === period);
  const byRule = new Map<string, DigestItem[]>();
  for (const i of items) byRule.set(i.rule.id, [...(byRule.get(i.rule.id) ?? []), i]);

  let failed = 0;
  for (const group of byRule.values()) {
    const rule = group[0]!.rule;
    const label = period === "daily" ? "Daily" : "Weekly";
    const title = `${label} digest: ${group.length} ${group.length === 1 ? "story" : "stories"}`;
    const lines = group.map((g) => `${g.event.title}${g.event.summary ? ` — ${g.event.summary}` : ""}${g.event.primary_url ? ` (${g.event.primary_url})` : ""}`);
    try {
      if (rule.channel === "in_app") {
        const users = await d.store.recipients(rule.org_id);
        await d.store.notify(users.map((user_id) => ({ org_id: rule.org_id, user_id, type: "trend_digest", title, body: lines.join("\n").slice(0, 950), link: "/trend-alerts" })));
      } else {
        const payload =
          rule.channel === "slack"
            ? { text: `*${esc(title)}*\n${group.map((g) => `• ${esc(g.event.title)}${g.event.primary_url ? ` ${g.event.primary_url}` : ""}`).join("\n")}` }
            : { type: "trend_digest", period, stories: group.map((g) => ({ id: g.event.id, watch: g.watchName, title: g.event.title, summary: g.event.summary, url: g.event.primary_url, importance: g.event.importance })) };
        const res = await d.post(rule.target ?? "", payload);
        if (!res.ok) throw new Error(`The ${rule.channel} endpoint answered ${res.status || "no response"}.`);
      }
      for (const g of group) await d.store.mark(g.deliveryId, "sent");
    } catch (e) {
      failed += group.length;
      const msg = (e instanceof AppError || e instanceof Error ? e.message : "The digest could not be delivered.").slice(0, 400);
      for (const g of group) await d.store.mark(g.deliveryId, "failed", msg);
      d.log.warn("digest delivery failed", { org_id: rule.org_id, channel: rule.channel });
    }
  }
  return { rules: byRule.size, stories: items.length, failed };
}
