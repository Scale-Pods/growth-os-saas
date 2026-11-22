import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrendWatch } from "@growth-os/db";
import type { DigestItem, DigestStore } from "./digest";
import type { AlertsStore, RuleRow } from "./run";

function must(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const DAY_MS = 86_400_000;
const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Who should hear about a watch: the workspace's owners and admins, plus the person who made the watch (if still a member). */
async function recipientsFor(db: SupabaseClient, orgId: string, creatorId: string | null): Promise<string[]> {
  const { data, error } = await db.from("memberships").select("user_id, role").eq("org_id", orgId).eq("status", "active");
  must(error, "load recipients");
  const ids = new Set<string>();
  for (const m of data ?? []) {
    if (m.role === "owner" || m.role === "admin" || m.user_id === creatorId) ids.add(m.user_id as string);
  }
  return [...ids];
}

export function supabaseAlertsStore(db: SupabaseClient): AlertsStore {
  return {
    async getRunForJob(jobId, orgId) {
      const { data, error } = await db.from("trend_watch_runs").select("id, watch_id, status").eq("job_id", jobId).eq("org_id", orgId).maybeSingle();
      must(error, "load run");
      return data ? { id: data.id as string, watch_id: data.watch_id as string, status: data.status as string } : null;
    },
    async loadWatch(watchId, orgId) {
      const { data, error } = await db.from("trend_watches").select("*").eq("id", watchId).eq("org_id", orgId).maybeSingle();
      must(error, "load watch");
      return (data as TrendWatch | null) ?? null;
    },
    async seenHashes(watchId, hashes) {
      const seen = new Set<string>();
      for (const part of chunk(hashes, 150)) {
        const { data, error } = await db.from("trend_mentions").select("url_hash").eq("watch_id", watchId).in("url_hash", part);
        must(error, "check seen links");
        for (const r of data ?? []) seen.add(r.url_hash as string);
      }
      return seen;
    },
    async recentEvents(watchId, sinceIso) {
      const { data, error } = await db.from("trend_events").select("id, embedding, source_count").eq("watch_id", watchId).eq("kind", "story").gte("last_seen_at", sinceIso).limit(300);
      must(error, "load recent stories");
      return (data ?? []).map((e) => ({ id: e.id as string, embedding: (e.embedding ?? []) as number[], source_count: e.source_count as number }));
    },
    async insertEvent(e) {
      const { data, error } = await db.from("trend_events").insert(e).select("id").single();
      must(error, "save story");
      return data!.id as string;
    },
    async bumpEvent(eventId, addSources, seenAtIso) {
      const { data, error } = await db.from("trend_events").select("source_count").eq("id", eventId).single();
      must(error, "read story");
      const up = await db.from("trend_events").update({ source_count: ((data?.source_count as number) ?? 1) + addSources, last_seen_at: seenAtIso }).eq("id", eventId);
      must(up.error, "update story");
    },
    async insertMentions(rows) {
      for (const part of chunk(rows, 100)) {
        const { error } = await db.from("trend_mentions").upsert(part, { onConflict: "watch_id,url_hash", ignoreDuplicates: true });
        must(error, "save links");
      }
    },
    async relevantMentionsToday(watchId, dayStartIso) {
      const { count, error } = await db.from("trend_mentions").select("id", { count: "exact", head: true }).eq("watch_id", watchId).not("event_id", "is", null).gte("created_at", dayStartIso);
      must(error, "count today");
      return count ?? 0;
    },
    async statsHistory(watchId, beforeDay) {
      const from = new Date(Date.parse(`${beforeDay}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
      const { data, error } = await db.from("trend_stats_daily").select("day, mention_count").eq("watch_id", watchId).gte("day", from).lt("day", beforeDay).order("day", { ascending: true });
      must(error, "load history");
      if (!data || data.length === 0) return [];
      // Days with no row had no relevant mentions: count them as zero, from the first known day up to yesterday.
      const byDay = new Map(data.map((r) => [r.day as string, r.mention_count as number]));
      const out: number[] = [];
      for (let t = Date.parse(`${data[0]!.day}T00:00:00Z`); t < Date.parse(`${beforeDay}T00:00:00Z`); t += DAY_MS) {
        out.push(byDay.get(new Date(t).toISOString().slice(0, 10)) ?? 0);
      }
      return out;
    },
    async upsertStats(orgId, watchId, day, count, mean, std) {
      const { error } = await db.from("trend_stats_daily").upsert({ org_id: orgId, watch_id: watchId, day, mention_count: count, mean_7d: mean, stddev_7d: std }, { onConflict: "watch_id,day" });
      must(error, "save stats");
    },
    async hasSpikeToday(watchId, dayStartIso) {
      const { count, error } = await db.from("trend_events").select("id", { count: "exact", head: true }).eq("watch_id", watchId).eq("kind", "spike").gte("created_at", dayStartIso);
      must(error, "check spike");
      return (count ?? 0) > 0;
    },
    async recentTitles(watchId, limit) {
      const { data, error } = await db.from("trend_mentions").select("title").eq("watch_id", watchId).order("created_at", { ascending: false }).limit(limit);
      must(error, "load headlines");
      return (data ?? []).map((r) => r.title as string);
    },
    async listRules(orgId, watchId) {
      const { data, error } = await db
        .from("trend_rules")
        .select("id, watch_id, min_relevance, min_importance, sentiments, channel, target, digest, enabled")
        .eq("org_id", orgId)
        .eq("enabled", true)
        .or(`watch_id.is.null,watch_id.eq.${watchId}`);
      must(error, "load rules");
      return (data ?? []) as RuleRow[];
    },
    async deliveryExists(eventId, ruleId) {
      const { count, error } = await db.from("trend_deliveries").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("rule_id", ruleId);
      must(error, "check delivery");
      return (count ?? 0) > 0;
    },
    async recordDelivery(d) {
      const { error } = await db.from("trend_deliveries").upsert(
        { org_id: d.orgId, event_id: d.eventId, rule_id: d.ruleId, channel: d.channel, status: d.status, error: d.error ?? null, sent_at: d.status === "sent" ? new Date().toISOString() : null },
        { onConflict: "event_id,rule_id", ignoreDuplicates: true },
      );
      must(error, "record delivery");
    },
    async recipients(orgId, creatorId) {
      return recipientsFor(db, orgId, creatorId);
    },
    async notify(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("notifications").insert(rows);
      must(error, "send notifications");
    },
    async recordSpend(watchId, credits) {
      const { data, error } = await db.rpc("record_watch_spend", { p_watch: watchId, p_credits: credits });
      must(error, "record spend");
      return String(data);
    },
    async finishRun(runId, orgId, r) {
      const { error } = await db
        .from("trend_watch_runs")
        .update({ status: r.status, source_status: r.sourceStatus, found: r.found, new_items: r.newItems, kept: r.kept, alerts: r.alerts, credits_spent: r.credits, error_message: r.error?.slice(0, 1000) ?? null, finished_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("org_id", orgId);
      must(error, "finish run");
    },
  };
}

export function supabaseDigestStore(db: SupabaseClient): DigestStore {
  return {
    async queued(period) {
      const { data, error } = await db
        .from("trend_deliveries")
        .select("id, trend_rules!inner(id, org_id, watch_id, min_relevance, min_importance, sentiments, channel, target, digest, enabled), trend_events!inner(id, title, summary, importance, relevance_score, primary_url, watch_id, trend_watches(name))")
        .eq("status", "queued_digest")
        .eq("trend_rules.digest", period)
        .limit(500);
      must(error, "load digest queue");
      const rows = (data ?? []) as unknown as {
        id: string;
        trend_rules: RuleRow & { org_id: string };
        trend_events: { id: string; title: string; summary: string | null; importance: string; relevance_score: number; primary_url: string | null; watch_id: string; trend_watches: { name: string } | null };
      }[];
      return rows.map<DigestItem>((r) => ({
        deliveryId: r.id,
        rule: r.trend_rules,
        watchId: r.trend_events.watch_id,
        watchName: r.trend_events.trend_watches?.name ?? "",
        event: { id: r.trend_events.id, title: r.trend_events.title, summary: r.trend_events.summary, importance: r.trend_events.importance, relevance_score: r.trend_events.relevance_score, primary_url: r.trend_events.primary_url },
      }));
    },
    async mark(deliveryId, status, error) {
      const { error: e } = await db.from("trend_deliveries").update({ status, error: error?.slice(0, 480) ?? null, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", deliveryId);
      must(e, "mark delivery");
    },
    async recipients(orgId) {
      return recipientsFor(db, orgId, null);
    },
    async notify(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("notifications").insert(rows);
      must(error, "send notifications");
    },
  };
}
