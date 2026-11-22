import { AppError } from "@growth-os/shared";
import {
  buildExplainPrompt,
  buildSpikePrompt,
  buildWatchClassifyPrompt,
  runMetered,
  stripCodeFences,
  validateClassification,
  type ClassifiedItem,
  type ClusterInput,
  type MeteredDeps,
  type WatchInfo,
} from "@growth-os/ai";
import type { TrendWatch } from "@growth-os/db";
import type { Handler, Logger } from "../runner";
import { childId } from "../research/ids";
import type { WatchCollector } from "./collectors";
import { clusterItems, detectSpike, filterItems, matchExisting, matchRules, relevanceFilter, urlHash, type HashedMention, type RawMention, type RuleLike, type StoryCluster } from "./pipeline";

export interface RuleRow extends RuleLike {
  channel: "in_app" | "slack" | "webhook";
  target: string | null;
  digest: "immediate" | "daily" | "weekly";
}

export interface NewEvent {
  org_id: string;
  brand_id: string;
  watch_id: string;
  kind: "story" | "spike";
  title: string;
  summary: string | null;
  primary_url: string | null;
  source_count: number;
  relevance_score: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  positive_aspects: string | null;
  negative_aspects: string | null;
  importance: "low" | "medium" | "high";
  topic: string | null;
  why_it_matters: string | null;
  is_alert: boolean;
  embedding: number[];
}

export interface MentionRow {
  org_id: string;
  watch_id: string;
  run_id: string;
  event_id: string | null;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  url_hash: string;
  published_at: string | null;
}

export interface AlertsStore {
  getRunForJob(jobId: string, orgId: string): Promise<{ id: string; watch_id: string; status: string } | null>;
  loadWatch(watchId: string, orgId: string): Promise<TrendWatch | null>;
  seenHashes(watchId: string, hashes: string[]): Promise<Set<string>>;
  recentEvents(watchId: string, sinceIso: string): Promise<{ id: string; embedding: number[]; source_count: number }[]>;
  insertEvent(e: NewEvent): Promise<string>;
  bumpEvent(eventId: string, addSources: number, seenAtIso: string): Promise<void>;
  insertMentions(rows: MentionRow[]): Promise<void>;
  relevantMentionsToday(watchId: string, dayStartIso: string): Promise<number>;
  statsHistory(watchId: string, beforeDay: string): Promise<number[]>;
  upsertStats(orgId: string, watchId: string, day: string, count: number, mean: number, std: number): Promise<void>;
  hasSpikeToday(watchId: string, dayStartIso: string): Promise<boolean>;
  recentTitles(watchId: string, limit: number): Promise<string[]>;
  listRules(orgId: string, watchId: string): Promise<RuleRow[]>;
  deliveryExists(eventId: string, ruleId: string): Promise<boolean>;
  recordDelivery(d: { orgId: string; eventId: string; ruleId: string; channel: string; status: "sent" | "failed" | "queued_digest"; error?: string }): Promise<void>;
  recipients(orgId: string, creatorId: string | null): Promise<string[]>;
  notify(rows: { org_id: string; user_id: string; type: string; title: string; body?: string | null; link?: string | null }[]): Promise<void>;
  recordSpend(watchId: string, credits: number): Promise<string>;
  finishRun(
    runId: string,
    orgId: string,
    r: { status: "done" | "failed"; sourceStatus: Record<string, { ok: boolean; items?: number; reason?: string }>; found: number; newItems: number; kept: number; alerts: number; credits: number; error?: string },
  ): Promise<void>;
}

interface Deps {
  store: AlertsStore;
  metered: MeteredDeps;
  textModel: string;
  embedModel: string;
  collectors: Map<string, WatchCollector>;
  /** Post JSON to a customer-supplied address (Slack, webhook). Must refuse private addresses itself. */
  post: (url: string, body: unknown) => Promise<{ ok: boolean; status: number }>;
  now: () => Date;
  log: Logger;
}

const SIMILARITY_FLOOR = 0.25; // below this a headline is not about the watch at all
const SAME_STORY = 0.88;
const MAX_ITEMS = 100;
const BATCH = 12;
const MAX_EXPLAINS = 5;
const ALERT_RELEVANCE = 85;
const DAY_MS = 86_400_000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const round = (v: number[]) => v.slice(0, 1536).map((x) => Math.round(x * 1e5) / 1e5);

type Alertable = { id: string; title: string; summary: string | null; why_it_matters: string | null; primary_url: string | null; importance: "low" | "medium" | "high"; relevance_score: number; sentiment: string; kind: "story" | "spike" };

/**
 * One Trend Alerts check for one watch. The funnel, cheapest stage first:
 * collect -> drop links already seen, excluded words, old items -> relevance by meaning (embeddings) -> merge the same story
 * -> classify only the NEW stories (batched) -> explain only real alerts -> spike check -> rules -> delivery.
 * The AI part is billed once for the whole run, and a run with nothing new calls no model and costs nothing.
 */
export function alertsRunHandler(d: Deps): Handler {
  return async ({ job, heartbeat }) => {
    const run = await d.store.getRunForJob(job.id, job.org_id);
    if (!run) throw new AppError("NOT_FOUND", "The check for this job could not be found.", 404);
    if (run.status !== "running") return { output: { runId: run.id, skipped: true } };

    const watch = await d.store.loadWatch(run.watch_id, job.org_id);
    if (!watch) {
      await d.store.finishRun(run.id, job.org_id, { status: "failed", sourceStatus: {}, found: 0, newItems: 0, kept: 0, alerts: 0, credits: 0, error: "This watch no longer exists." });
      throw new AppError("NOT_FOUND", "This watch no longer exists.", 404);
    }

    const sourceStatus: Record<string, { ok: boolean; items?: number; reason?: string }> = {};
    let found = 0;
    let newCount = 0;
    try {
      // 1. Collect from each source. One failing source never stops the others.
      const raw: RawMention[] = [];
      for (const source of watch.sources) {
        const c = d.collectors.get(source);
        if (!c) {
          sourceStatus[source] = { ok: false, reason: "This source is not available yet." };
          continue;
        }
        try {
          const got = await c.collect(watch);
          raw.push(...got);
          sourceStatus[source] = { ok: true, items: got.length };
        } catch (e) {
          sourceStatus[source] = { ok: false, reason: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
          d.log.warn("watch source failed", { job_id: job.id, org_id: job.org_id, source });
        }
      }
      if (!Object.values(sourceStatus).some((s) => s.ok)) {
        const why = Object.entries(sourceStatus).map(([k, s]) => `${k}: ${s.reason ?? "no result"}`).join("; ");
        throw new AppError("PROVIDER_ERROR", `None of the sources could be read (${why}). Nothing was charged.`.slice(0, 900), 502);
      }
      found = raw.length;
      await heartbeat({ percent: 20, label: "Collected" });

      // 2. Free filters
      const seen = await d.store.seenHashes(watch.id, [...new Set(raw.map((m) => (m.url ? urlHash(m.url) : "")).filter(Boolean))]);
      const filtered = filterItems({ items: raw, excludes: watch.excludes, lookbackHours: watch.lookback_hours, now: d.now(), seen });
      const fresh = [...filtered.kept].sort((a, b) => Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0")).slice(0, MAX_ITEMS);
      newCount = fresh.length;
      if (fresh.length === 0) {
        await d.store.finishRun(run.id, job.org_id, { status: "done", sourceStatus, found, newItems: 0, kept: 0, alerts: 0, credits: 0 });
        return { output: { runId: run.id, newItems: 0, credits: 0 } };
      }
      await heartbeat({ percent: 35, label: "Checking relevance" });

      const info: WatchInfo = { name: watch.name, description: watch.description, keywords: watch.keywords, excludes: watch.excludes };
      const estimateUsd = 0.01 + Math.ceil(fresh.length / BATCH) * 0.01;

      const result = await runMetered(
        d.metered,
        { orgId: job.org_id, userId: job.created_by, jobId: childId(job.id, "run"), estimateUsd, uses: { text: d.textModel, embed: d.embedModel } },
        async (m) => {
          // 3. Relevance by meaning
          const watchText = `${watch.name}. ${watch.description ?? ""} ${watch.keywords.join(", ")}`;
          const vectors = await m.embed([watchText, ...fresh.map((x) => `${x.title}. ${x.snippet ?? ""}`.slice(0, 600))]);
          const rel = relevanceFilter(fresh, vectors.slice(1), vectors[0]!, SIMILARITY_FLOOR);

          // 4. One story from many outlets; stories we already have are only updated
          const clusters = clusterItems(rel.kept.map((k) => ({ item: k.item, vector: k.vector })), SAME_STORY);
          const existing = await d.store.recentEvents(watch.id, new Date(d.now().getTime() - 3 * DAY_MS).toISOString());
          const known: { cluster: StoryCluster; eventId: string }[] = [];
          const novel: StoryCluster[] = [];
          for (const c of clusters) {
            const id = matchExisting(c.centroid, existing, SAME_STORY);
            if (id) known.push({ cluster: c, eventId: id });
            else novel.push(c);
          }
          await heartbeat({ percent: 55, label: "Reading new stories" });

          // 5. Classify only the new stories, batched
          const classified = new Map<number, ClassifiedItem>();
          for (let start = 0; start < novel.length; start += BATCH) {
            const inputs: ClusterInput[] = novel.slice(start, start + BATCH).map((c, i) => ({
              index: start + i,
              title: c.primary.title,
              snippets: c.members.map((x) => x.item.snippet || x.item.title).slice(0, 3),
              sourceCount: c.sourceCount,
            }));
            const p = buildWatchClassifyPrompt(info, inputs);
            let items: ClassifiedItem[] | null = null;
            for (let attempt = 0; attempt < 2 && !items; attempt++) {
              const text = await m.text({ system: p.system, user: p.user, maxOutputTokens: 2500, json: true });
              try {
                items = validateClassification(JSON.parse(stripCodeFences(text)), inputs, { threshold: watch.relevance_threshold });
              } catch {
                items = null;
              }
            }
            if (!items) throw new AppError("PROVIDER_ERROR", "The AI returned an answer we could not use. Nothing was charged. Please try again.", 502);
            for (const it of items) classified.set(it.index, it);
          }

          // 6. Explain only real alerts (rare, so a stronger explanation is affordable)
          const stories: { cluster: StoryCluster; ev: NewEvent }[] = [];
          for (const [index, it] of [...classified.entries()].sort((a, b) => a[0] - b[0])) {
            const cluster = novel[index]!;
            stories.push({
              cluster,
              ev: {
                org_id: job.org_id,
                brand_id: watch.brand_id,
                watch_id: watch.id,
                kind: "story",
                title: it.title,
                summary: it.summary || null,
                primary_url: cluster.primary.url,
                source_count: cluster.sourceCount,
                relevance_score: it.relevance_score,
                sentiment: it.sentiment,
                positive_aspects: it.positive_aspects,
                negative_aspects: it.negative_aspects,
                importance: it.importance,
                topic: it.topic || null,
                why_it_matters: null,
                is_alert: it.importance === "high" || it.relevance_score >= ALERT_RELEVANCE,
                embedding: round(cluster.centroid),
              },
            });
          }
          let explained = 0;
          for (const s of stories) {
            if (!s.ev.is_alert || explained >= MAX_EXPLAINS) continue;
            const p = buildExplainPrompt(info, { title: s.ev.title, snippets: s.cluster.members.map((x) => x.item.snippet || x.item.title) });
            s.ev.why_it_matters = (await m.text({ system: p.system, user: p.user, maxOutputTokens: 300 })).trim().slice(0, 1800) || null;
            explained++;
          }
          await heartbeat({ percent: 75, label: "Saving" });

          // 7. Save: events first, then every new link (so it is never paid for again)
          const nowIso = d.now().toISOString();
          const alerts: Alertable[] = [];
          const mentionRows: MentionRow[] = [];
          const toRow = (it: HashedMention, eventId: string | null): MentionRow => ({
            org_id: job.org_id, watch_id: watch.id, run_id: run.id, event_id: eventId, source: it.source, title: it.title.slice(0, 500),
            snippet: it.snippet ? it.snippet.slice(0, 2000) : null, url: it.url.slice(0, 1000), url_hash: it.hash, published_at: it.publishedAt,
          });
          const placed = new Set<string>();
          for (const s of stories) {
            const id = await d.store.insertEvent(s.ev);
            for (const mem of s.cluster.members) {
              placed.add(mem.item.hash);
              mentionRows.push(toRow(mem.item, id));
            }
            if (s.ev.is_alert) alerts.push({ id, title: s.ev.title, summary: s.ev.summary, why_it_matters: s.ev.why_it_matters, primary_url: s.ev.primary_url, importance: s.ev.importance, relevance_score: s.ev.relevance_score, sentiment: s.ev.sentiment, kind: "story" });
          }
          for (const k of known) {
            await d.store.bumpEvent(k.eventId, k.cluster.sourceCount, nowIso);
            for (const mem of k.cluster.members) {
              placed.add(mem.item.hash);
              mentionRows.push(toRow(mem.item, k.eventId));
            }
          }
          for (const item of fresh) if (!placed.has(item.hash)) mentionRows.push(toRow(item, null));
          await d.store.insertMentions(mentionRows);

          // 8. Volume check against this watch's own normal
          const day = nowIso.slice(0, 10);
          const dayStart = `${day}T00:00:00.000Z`;
          const todayCount = await d.store.relevantMentionsToday(watch.id, dayStart);
          const history = await d.store.statsHistory(watch.id, day);
          const spike = detectSpike(history, todayCount);
          await d.store.upsertStats(job.org_id, watch.id, day, todayCount, spike.mean, spike.std);
          if (spike.isSpike && !(await d.store.hasSpikeToday(watch.id, dayStart))) {
            const titles = await d.store.recentTitles(watch.id, 15);
            const p = buildSpikePrompt(info, { today: todayCount, mean: spike.mean }, titles);
            const why = (await m.text({ system: p.system, user: p.user, maxOutputTokens: 300 })).trim().slice(0, 1800);
            const spikeEv: NewEvent = {
              org_id: job.org_id, brand_id: watch.brand_id, watch_id: watch.id, kind: "spike", title: `Mentions of "${watch.name}" jumped`,
              summary: why || null, primary_url: null, source_count: 1, relevance_score: 95, sentiment: "neutral", positive_aspects: null, negative_aspects: null,
              importance: "high", topic: "volume spike", why_it_matters: why || null, is_alert: true, embedding: [],
            };
            const id = await d.store.insertEvent(spikeEv);
            alerts.push({ id, title: spikeEv.title, summary: spikeEv.summary, why_it_matters: spikeEv.why_it_matters, primary_url: null, importance: "high", relevance_score: 95, sentiment: "neutral", kind: "spike" });
          }
          return { alerts, kept: stories.length + known.length };
        },
      );

      // Bill the real cost against the watch's monthly budget; at the cap the watch stops by itself.
      const status = await d.store.recordSpend(watch.id, result.credits);
      const recipients = await d.store.recipients(job.org_id, watch.created_by);
      if (status === "budget_paused") {
        await d.store.notify(
          recipients.map((user_id) => ({ org_id: job.org_id, user_id, type: "trend_budget", title: `"${watch.name}" paused: monthly budget reached`, body: "This watch used its monthly credit budget, so it stopped checking. It restarts next month, or raise its budget to resume now.", link: `/trend-alerts?watch=${watch.id}` })),
        );
      }

      // Deliver (immediate rules now; digest rules are queued)
      const rules = await d.store.listRules(job.org_id, watch.id);
      let sent = 0;
      for (const a of result.value.alerts) sent += await deliver(d, job.org_id, watch, a, rules, recipients);

      await d.store.finishRun(run.id, job.org_id, { status: "done", sourceStatus, found, newItems: newCount, kept: result.value.kept, alerts: sent, credits: result.credits });
      await heartbeat({ percent: 100, label: "Done" });
      return { output: { runId: run.id, newItems: newCount, kept: result.value.kept, alerts: result.value.alerts.length, credits: result.credits } };
    } catch (e) {
      const reason = e instanceof AppError ? e.message : "Something went wrong during this check.";
      await d.store.finishRun(run.id, job.org_id, { status: "failed", sourceStatus, found, newItems: newCount, kept: 0, alerts: 0, credits: 0, error: reason });
      throw e;
    }
  };
}


async function deliver(d: Deps, orgId: string, watch: TrendWatch, a: Alertable, rules: RuleRow[], recipients: string[]): Promise<number> {
  const matched = matchRules({ watchId: watch.id, relevance_score: a.relevance_score, importance: a.importance, sentiment: a.sentiment }, rules);
  let sent = 0;
  for (const rule of matched) {
    if (await d.store.deliveryExists(a.id, rule.id)) continue; // never twice for the same story and rule
    if (rule.digest !== "immediate") {
      await d.store.recordDelivery({ orgId, eventId: a.id, ruleId: rule.id, channel: rule.channel, status: "queued_digest" });
      continue;
    }
    const body = a.why_it_matters || a.summary || "";
    try {
      if (rule.channel === "in_app") {
        await d.store.notify(recipients.map((user_id) => ({ org_id: orgId, user_id, type: "trend_alert", title: `${a.kind === "spike" ? "Spike" : "Alert"}: ${a.title}`.slice(0, 190), body: body.slice(0, 900) || null, link: `/trend-alerts?watch=${watch.id}` })));
      } else {
        const text = `*${esc(a.title)}*\n${esc(body)}${a.primary_url ? `\n${a.primary_url}` : ""}\n_Watch: ${esc(watch.name)}_`;
        const payload =
          rule.channel === "slack"
            ? { text }
            : { type: "trend_alert", watch: { id: watch.id, name: watch.name }, event: { id: a.id, kind: a.kind, title: a.title, summary: a.summary, why_it_matters: a.why_it_matters, url: a.primary_url, importance: a.importance, relevance_score: a.relevance_score, sentiment: a.sentiment } };
        const res = await d.post(rule.target ?? "", payload);
        if (!res.ok) {
          await d.store.recordDelivery({ orgId, eventId: a.id, ruleId: rule.id, channel: rule.channel, status: "failed", error: `The ${rule.channel} endpoint answered ${res.status || "no response"}.` });
          d.log.warn("alert delivery failed", { org_id: orgId, channel: rule.channel, status: res.status });
          continue;
        }
      }
      await d.store.recordDelivery({ orgId, eventId: a.id, ruleId: rule.id, channel: rule.channel, status: "sent" });
      sent++;
    } catch (e) {
      // Recorded, never hidden. The target address is not logged (it can contain a secret token).
      const msg = e instanceof AppError ? e.message : "The alert could not be delivered.";
      await d.store.recordDelivery({ orgId, eventId: a.id, ruleId: rule.id, channel: rule.channel, status: "failed", error: msg.slice(0, 400) });
      d.log.warn("alert delivery failed", { org_id: orgId, channel: rule.channel });
    }
  }
  return sent;
}
