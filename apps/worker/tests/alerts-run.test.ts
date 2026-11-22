import assert from "node:assert/strict";
import { AppError } from "@growth-os/shared";
import { ProviderFailure, type CreditLedger, type Embedder, type MeteredDeps, type TextProvider, type TextRequest } from "@growth-os/ai";
import type { TrendWatch } from "@growth-os/db";
import { alertsRunHandler, type AlertsStore, type RuleRow, type NewEvent } from "../src/alerts/run";
import type { RawMention } from "../src/alerts/pipeline";
import { urlHash } from "../src/alerts/pipeline";
import type { WatchCollector } from "../src/alerts/collectors";
import type { HandlerContext, JobRow } from "../src/runner";

const quietLog = { info() {}, warn() {}, error() {} };
const NOW = new Date("2026-12-01T12:00:00.000Z");
const iso = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// ---- watch and store ------------------------------------------------------------------------------
function watch(over: Partial<TrendWatch> = {}): TrendWatch {
  return {
    id: "w1", org_id: "org-1", brand_id: "brand-1", name: "OpenAI image models", description: "New model releases, not general company news",
    keywords: ["OpenAI"], excludes: [], sources: ["Google News"], rss_feeds: [], region: "US", lookback_hours: 48, relevance_threshold: 60, frequency_minutes: 60,
    monthly_budget_credits: 100, status: "active", spent_credits_month: 0, month_key: "2026-12", next_run_at: iso(0), last_run_at: null, created_by: "user-1", created_at: iso(100), updated_at: iso(100), ...over,
  };
}

interface Mem {
  watch: TrendWatch | null;
  runStatus: string;
  seen: Set<string>;
  events: (NewEvent & { id: string })[];
  bumps: { id: string; add: number }[];
  mentions: { url_hash: string; event_id: string | null; title: string }[];
  todayRelevant: number;
  history: number[];
  spikeToday: boolean;
  stats: { count: number; mean: number; std: number }[];
  rules: RuleRow[];
  deliveries: { event_id: string; rule_id: string; channel: string; status: string; error?: string }[];
  notices: { user_id: string; title: string; body: string | null; link: string | null }[];
  recipients: string[];
  spend: number[];
  spendStatus: string;
  finished: { status: string; found: number; new_items: number; kept: number; alerts: number; credits: number; source_status: Record<string, unknown>; error: string | null } | null;
}
function mem(over: Partial<Mem> = {}): Mem {
  return { watch: watch(), runStatus: "running", seen: new Set(), events: [], bumps: [], mentions: [], todayRelevant: 0, history: [], spikeToday: false, stats: [], rules: [], deliveries: [], notices: [], recipients: ["user-1", "admin-2"], spend: [], spendStatus: "active", finished: null, ...over };
}
let eventSeq = 0;
function store(m: Mem, existing: { id: string; embedding: number[]; source_count: number }[] = []): AlertsStore {
  return {
    async getRunForJob() {
      return { id: "run-1", watch_id: "w1", status: m.runStatus };
    },
    async loadWatch() {
      return m.watch;
    },
    async seenHashes(_w, hashes) {
      return new Set(hashes.filter((h) => m.seen.has(h)));
    },
    async recentEvents() {
      return existing;
    },
    async insertEvent(e) {
      const id = `ev-${++eventSeq}`;
      m.events.push({ ...e, id });
      return id;
    },
    async bumpEvent(id, add) {
      m.bumps.push({ id, add });
    },
    async insertMentions(rows) {
      for (const r of rows) m.mentions.push({ url_hash: r.url_hash, event_id: r.event_id, title: r.title });
    },
    async relevantMentionsToday() {
      return m.todayRelevant + m.mentions.filter((x) => x.event_id).length;
    },
    async statsHistory() {
      return m.history;
    },
    async upsertStats(_o, _w, _d, count, mean, std) {
      m.stats.push({ count, mean, std });
    },
    async hasSpikeToday() {
      return m.spikeToday;
    },
    async recentTitles() {
      return ["Headline one", "Headline two"];
    },
    async listRules() {
      return m.rules;
    },
    async deliveryExists(eventId, ruleId) {
      return m.deliveries.some((d) => d.event_id === eventId && d.rule_id === ruleId);
    },
    async recordDelivery(d) {
      m.deliveries.push({ event_id: d.eventId, rule_id: d.ruleId, channel: d.channel, status: d.status, error: d.error });
    },
    async recipients() {
      return m.recipients;
    },
    async notify(rows) {
      for (const r of rows) m.notices.push({ user_id: r.user_id, title: r.title, body: r.body ?? null, link: r.link ?? null });
    },
    async recordSpend(_w, credits) {
      m.spend.push(credits);
      return m.spendStatus;
    },
    async finishRun(_id, _org, r) {
      m.finished = { status: r.status, found: r.found, new_items: r.newItems, kept: r.kept, alerts: r.alerts, credits: r.credits, source_status: r.sourceStatus, error: r.error ?? null };
    },
  };
}

// ---- AI fakes ----------------------------------------------------------------------------------------
/** A tiny "meaning" space: [openai-image, office, weather]. */
const embed = (t: string): number[] => {
  const x = t.toLowerCase();
  if (/office/.test(x)) return [0, 1, 0];
  if (/weather|rain/.test(x)) return [0, 0, 1];
  if (/openai|image model|renders/.test(x)) return [1, 0, 0];
  return [0, 0, 0];
};
class Ai {
  texts: TextRequest[] = [];
  embedCalls = 0;
  classify: (req: TextRequest) => string = (req) => {
    const idx = [...req.user.matchAll(/^\[(\d+)\]/gm)].map((x) => Number(x[1]));
    return JSON.stringify({ items: idx.map((index) => ({ index, relevance_score: 90, sentiment: "positive", importance: "high", topic: "model release", credibility: "high", is_meaningful: true, title: `Story ${index}`, summary: "A faster image model shipped.", positive_aspects: "", negative_aspects: "" })) });
  };
  text: TextProvider = {
    generate: async (req) => {
      this.texts.push(req);
      if (/Mentions of this watch jumped/.test(req.user)) return { text: "Headlines suggest a launch drove the jump.", inputTokens: 300, outputTokens: 60 };
      if (/why it matters/i.test(req.user)) return { text: "It shows the model is improving, which matters for image workflows.", inputTokens: 300, outputTokens: 60 };
      const out = this.classify(req);
      if (out === "FAIL") throw new ProviderFailure("down", 500, false);
      return { text: out, inputTokens: 800, outputTokens: 400 };
    },
  };
  embedder: Embedder = {
    embed: async (_m, inputs) => {
      this.embedCalls++;
      return { vectors: inputs.map(embed), tokens: inputs.length * 30 };
    },
  };
}
function metered(ai: Ai) {
  const s = { balance: 1000, log: [] as string[], reserved: new Map<string, number>() };
  const ledger: CreditLedger = {
    async reserve({ jobId, credits }) {
      s.balance -= credits;
      s.reserved.set(jobId, credits);
      s.log.push(`reserve:${credits}`);
    },
    async settle({ jobId, actualCredits }) {
      const r = s.reserved.get(jobId)!;
      s.balance += r - Math.min(r, actualCredits);
      s.log.push(`settle:${Math.min(r, actualCredits)}`);
    },
    async release({ jobId }) {
      s.balance += s.reserved.get(jobId) ?? 0;
      s.log.push("release");
    },
  };
  const deps: MeteredDeps = {
    ledger,
    usage: { record: async () => {} },
    costs: { get: async (model) => ({ model, unit: "per_1k_tokens", usdPerUnit: model.includes("embedding") ? 0.00002 : 0.0006 }) },
    providerFor: () => ai.text,
    embedderFor: () => ai.embedder,
    sleep: async () => {},
  };
  return { deps, s };
}

// ---- collectors --------------------------------------------------------------------------------------
const collector = (source: string, items: RawMention[], fail?: string): WatchCollector => ({
  source,
  async collect() {
    if (fail) throw new Error(fail);
    return items;
  },
});
const m1 = (host: string, title: string, snippet = "The new OpenAI image model renders in half the time.", hoursAgo = 2): RawMention => ({ source: "Google News", title, snippet, url: `https://${host}.example/story`, publishedAt: iso(hoursAgo) });

const job: JobRow = { id: "11111111-1111-4111-8111-111111111111", org_id: "org-1", brand_id: "brand-1", kind: "alerts.run", status: "running", input_ref: { watch_id: "w1" }, created_by: "user-1" };
const hctx: HandlerContext = { job, heartbeat: async () => {} };

function build(m: Mem, ai: Ai, collectors: WatchCollector[], posts: { url: string; body: unknown }[] = [], postResult: { ok: boolean; status: number } = { ok: true, status: 200 }, existing: { id: string; embedding: number[]; source_count: number }[] = []) {
  const meteredDeps = metered(ai);
  const handler = alertsRunHandler({
    store: store(m, existing),
    metered: meteredDeps.deps,
    textModel: "gpt-4o-mini",
    embedModel: "text-embedding-3-small",
    collectors: new Map(collectors.map((c) => [c.source, c])),
    post: async (url, body) => {
      posts.push({ url, body });
      return postResult;
    },
    now: () => NOW,
    log: quietLog,
  });
  return { handler, ledger: meteredDeps.s };
}
const inAppRule = (o: Partial<RuleRow> = {}): RuleRow => ({ id: "rule-1", watch_id: null, min_relevance: 70, min_importance: "medium", sentiments: [], channel: "in_app", target: null, digest: "immediate", enabled: true, ...o });

async function main() {
  // ---- the whole funnel: one story from three outlets, noise dropped, alert delivered -----------------
  {
    const m = mem({ rules: [inAppRule()] });
    m.seen.add(urlHash("https://old.example/story"));
    const ai = new Ai();
    const items = [
      m1("verge", "OpenAI ships a faster image model"),
      m1("wired", "OpenAI's new image model arrives"),
      m1("ars", "OpenAI image model renders faster"),
      m1("tmz", "OpenAI opens a new office in Paris", "A new office."), // off topic (company news)
      m1("wx", "Rain expected this weekend", "Weather forecast for the weekend."),
      { ...m1("old", "Already seen story"), url: "https://old.example/story" },
    ];
    const { handler, ledger } = build(m, ai, [collector("Google News", items)]);
    const out = await handler(hctx);

    assert.equal(m.finished?.status, "done");
    assert.equal(m.finished?.found, 6);
    assert.equal(m.finished?.new_items, 5, "the already-seen link is skipped before anything is paid for");
    assert.equal(m.events.length, 1, "three outlets on one story become one story");
    assert.equal(m.events[0]!.source_count, 3);
    assert.equal(m.events[0]!.is_alert, true);
    assert.ok(m.events[0]!.why_it_matters && m.events[0]!.why_it_matters.length > 10, "the explanation is written for alerts");
    assert.equal(m.mentions.filter((x) => x.event_id).length, 3);
    assert.equal(m.mentions.filter((x) => !x.event_id).length, 2, "irrelevant items are remembered too, so they are never paid for again");
    assert.equal(ai.embedCalls, 1, "one embedding call for the whole check");
    assert.equal(ai.texts.filter((t) => /Below are news items/.test(t.user)).length, 1, "one classification call for the story");
    assert.ok(!ai.texts.some((t) => /Rain expected/.test(t.user)), "irrelevant items never reach the language model");
    assert.deepEqual(ledger.log.map((x) => x.split(":")[0]), ["reserve", "settle"], "one reservation for the whole run");
    assert.ok((m.finished?.credits ?? 0) >= 1);
    assert.deepEqual(m.spend, [m.finished!.credits], "the real cost is recorded against the monthly budget");
    assert.equal(m.notices.length, 2, "the alert reaches the watch owner and admins");
    assert.match(m.notices[0]!.link ?? "", /trend-alerts/);
    assert.equal(m.deliveries.length, 1);
    assert.equal(m.deliveries[0]!.status, "sent");
    assert.equal(m.finished?.alerts, 1);
    assert.ok(out);
  }

  // ---- nothing new: the check is free ----------------------------------------------------------------
  {
    const m = mem({ rules: [inAppRule()] });
    m.seen.add(urlHash("https://verge.example/story"));
    const ai = new Ai();
    const { handler, ledger } = build(m, ai, [collector("Google News", [m1("verge", "Same old story")])]);
    await handler(hctx);
    assert.equal(m.finished?.status, "done");
    assert.equal(m.finished?.credits, 0);
    assert.equal(ai.embedCalls + ai.texts.length, 0, "no model is called when there is nothing new");
    assert.deepEqual(ledger.log, [], "no reservation is even made");
    assert.deepEqual(m.spend.filter((c) => c > 0), []);
  }

  // ---- a story we already stored is recognised, not announced again --------------------------------------
  {
    const m = mem({ rules: [inAppRule()] });
    const ai = new Ai();
    const existing = [{ id: "ev-old", embedding: [1, 0, 0], source_count: 2 }];
    const { handler } = build(m, ai, [collector("Google News", [m1("cnn", "OpenAI image model update")])], [], { ok: true, status: 200 }, existing);
    await handler(hctx);
    assert.equal(m.events.length, 0, "no second event for the same story");
    assert.deepEqual(m.bumps, [{ id: "ev-old", add: 1 }], "the existing story gains a source");
    assert.equal(ai.texts.length, 0, "no classification is paid for a story we already have");
    assert.equal(m.deliveries.length, 0, "and it is not announced again");
    assert.equal(m.mentions.find((x) => x.event_id)?.event_id, "ev-old");
  }

  // ---- source failures ------------------------------------------------------------------------------------
  {
    const m = mem({ watch: watch({ sources: ["Google News", "RSS"] }), rules: [] });
    const ai = new Ai();
    const { handler } = build(m, ai, [collector("Google News", [m1("verge", "OpenAI ships a faster image model")]), collector("RSS", [], "feed is down")]);
    await handler(hctx);
    assert.equal(m.finished?.status, "done");
    const ss = m.finished!.source_status as Record<string, { ok: boolean; reason?: string }>;
    assert.equal(ss["Google News"]!.ok, true);
    assert.equal(ss["RSS"]!.ok, false);
    assert.match(ss["RSS"]!.reason ?? "", /feed is down/);
  }
  {
    const m = mem({ watch: watch({ sources: ["Google News", "Reddit"] }) });
    const ai = new Ai();
    const { handler, ledger } = build(m, ai, [collector("Google News", [], "blocked")]); // Reddit has no collector at all
    await assert.rejects(handler(hctx), (e: unknown) => e instanceof AppError && /could be read|none of the sources/i.test(e.message));
    assert.equal(m.finished?.status, "failed");
    assert.match(m.finished?.error ?? "", /Reddit/);
    assert.equal(ai.embedCalls + ai.texts.length, 0);
    assert.deepEqual(ledger.log, [], "a check that could read nothing costs nothing");
  }

  // ---- model answers that cannot be used ------------------------------------------------------------------
  {
    const m = mem({ rules: [inAppRule()] });
    const ai = new Ai();
    ai.classify = () => "this is not json";
    const { handler, ledger } = build(m, ai, [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]);
    await assert.rejects(handler(hctx), (e: unknown) => e instanceof AppError);
    assert.equal(m.finished?.status, "failed");
    assert.equal(m.mentions.length, 0, "nothing is stored, so the next check tries these items again");
    assert.equal(m.events.length, 0);
    assert.equal(ledger.balance, 1000, "the failed check is not charged");
    assert.deepEqual(m.spend, []);
  }
  {
    // one bad answer, then a good one: recovered by the single retry
    const m = mem({ rules: [] });
    const ai = new Ai();
    let n = 0;
    const good = ai.classify;
    ai.classify = (req) => (n++ === 0 ? "```json\n{ broken" : good(req));
    const { handler } = build(m, ai, [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]);
    await handler(hctx);
    assert.equal(m.finished?.status, "done");
    assert.equal(m.events.length, 1);
  }

  // ---- spikes ---------------------------------------------------------------------------------------------
  {
    const m = mem({ rules: [inAppRule()], history: [2, 3, 2, 3, 2, 3, 2], todayRelevant: 19 });
    const ai = new Ai();
    const { handler } = build(m, ai, [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]);
    await handler(hctx);
    const spike = m.events.find((e) => e.kind === "spike");
    assert.ok(spike, "a jump well above the recent normal creates a spike alert");
    assert.equal(spike!.is_alert, true);
    assert.match(spike!.summary ?? "", /headlines/i);
    assert.ok(m.stats.length === 1 && m.stats[0]!.count >= 20, "today's count is stored for tomorrow's baseline");
    // the same day, a second check does not repeat the spike alert
    const m2 = mem({ rules: [inAppRule()], history: [2, 3, 2, 3, 2, 3, 2], todayRelevant: 19, spikeToday: true });
    const { handler: h2 } = build(m2, new Ai(), [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]);
    await h2(hctx);
    assert.equal(m2.events.filter((e) => e.kind === "spike").length, 0);
  }

  // ---- rules and delivery -----------------------------------------------------------------------------------
  {
    const posts: { url: string; body: unknown }[] = [];
    const m = mem({
      rules: [
        inAppRule({ id: "r-app" }),
        inAppRule({ id: "r-slack", channel: "slack", target: "https://hooks.slack.com/services/T/B/x", min_importance: "high" }),
        inAppRule({ id: "r-hook", channel: "webhook", target: "https://hooks.example/alerts", min_relevance: 99 }), // too strict: must not fire
        inAppRule({ id: "r-digest", digest: "daily" }), // goes to the digest, not now
        inAppRule({ id: "r-off", enabled: false }),
      ],
    });
    const { handler } = build(m, new Ai(), [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])], posts);
    await handler(hctx);
    const byRule = Object.fromEntries(m.deliveries.map((d) => [d.rule_id, d.status]));
    assert.deepEqual(byRule, { "r-app": "sent", "r-slack": "sent", "r-digest": "queued_digest" });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]!.url, "https://hooks.slack.com/services/T/B/x");
    assert.match(JSON.stringify(posts[0]!.body), /Story 0|image model/i);
    assert.equal(m.notices.length, 2, "the digest rule did not notify now");
  }
  {
    // a failing webhook is recorded, never hidden, and does not fail the check
    const posts: { url: string; body: unknown }[] = [];
    const m = mem({ rules: [inAppRule({ id: "r-hook", channel: "webhook", target: "https://hooks.example/alerts" })] });
    const { handler } = build(m, new Ai(), [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])], posts, { ok: false, status: 500 });
    await handler(hctx);
    assert.equal(m.finished?.status, "done");
    assert.equal(m.deliveries[0]!.status, "failed");
    assert.match(m.deliveries[0]!.error ?? "", /500/);
    // a rejected (private) target is also just a failed delivery
    const m2 = mem({ rules: [inAppRule({ id: "r-hook", channel: "webhook", target: "https://hooks.example/alerts" })] });
    const meteredDeps = metered(new Ai());
    const h2 = alertsRunHandler({
      store: store(m2),
      metered: meteredDeps.deps,
      textModel: "gpt-4o-mini",
      embedModel: "text-embedding-3-small",
      collectors: new Map([["Google News", collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]]),
      post: async () => {
        throw new AppError("VALIDATION_ERROR", "That web address is not allowed.", 400);
      },
      now: () => NOW,
      log: quietLog,
    });
    await h2(hctx);
    assert.equal(m2.deliveries[0]!.status, "failed");
    assert.match(m2.deliveries[0]!.error ?? "", /not allowed/i);
  }
  {
    // never delivered twice for the same story and rule (a re-run after a crash)
    const m = mem({ rules: [inAppRule({ id: "r-app" })] });
    m.deliveries.push({ event_id: "ev-1", rule_id: "r-app", channel: "in_app", status: "sent" });
    eventSeq = 0; // the next event is ev-1
    const { handler } = build(m, new Ai(), [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]);
    await handler(hctx);
    assert.equal(m.deliveries.length, 1, "no second delivery");
    assert.equal(m.notices.length, 0);
  }

  // ---- budget ---------------------------------------------------------------------------------------------------
  {
    const m = mem({ rules: [], spendStatus: "budget_paused" });
    const { handler } = build(m, new Ai(), [collector("Google News", [m1("verge", "OpenAI ships a faster image model")])]);
    await handler(hctx);
    assert.equal(m.finished?.status, "done");
    assert.ok(m.notices.some((n) => /monthly budget/i.test(n.title + (n.body ?? ""))), "the owner is told the watch stopped for budget");
  }

  // ---- housekeeping ------------------------------------------------------------------------------------------------
  {
    const m = mem({ runStatus: "done" });
    const ai = new Ai();
    const { handler } = build(m, ai, [collector("Google News", [m1("verge", "x")])]);
    await handler(hctx);
    assert.equal(ai.embedCalls, 0, "a finished run is never run again");
    assert.equal(m.finished, null);
    const gone = mem({ watch: null });
    const { handler: h2 } = build(gone, ai, []);
    await assert.rejects(h2(hctx), (e: unknown) => e instanceof AppError);
    assert.equal(gone.finished?.status, "failed");
  }

  process.stdout.write("✓ alerts run tests PASSED\n");
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
