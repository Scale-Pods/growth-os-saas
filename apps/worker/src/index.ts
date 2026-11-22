import { createServer } from "node:http";
import { PgBoss } from "pg-boss";
import { createClient } from "@supabase/supabase-js";
import {
  JOB_QUEUES,
  QUEUE_NAMES,
  QUEUE_RETRY,
  RESCUE_AFTER_MINUTES,
  createLogger,
  isJobQueue,
  jobPayloadSchema,
  postPayloadSchema,
  validateWorkerEnv,
  type JobQueueName,
} from "@growth-os/shared";
import { runJob, type Handler } from "./runner";
import { supabaseJobStore } from "./store";
import { dummyHandler } from "./handlers/dummy";
import { mediaNormalizeHandler } from "./handlers/media-normalize";
import { r2FromEnv } from "./r2";
import { getSocialProvider } from "@growth-os/social";
import { publishPost } from "./publish";
import { supabaseHealthStore, supabasePublishStore } from "./publish-store";
import { runHealthCheck } from "./health-check";
import { buildGatewayDeps, DEFAULT_TEXT_MODEL } from "./research/ai-deps";
import { collectorsFromEnv } from "./research/collectors";
import { supabaseResearchStore } from "./research/store";
import { intelligenceHandler } from "./research/intelligence";
import { strategyHandler, strategySectionHandler } from "./research/strategy";
import { trendScanHandler } from "./research/trends";
import { fetchPageText } from "./web-text";
import { AppError } from "@growth-os/shared";

const log = createLogger({ service: "worker" });

/** Queues that call AI providers and are limited per organization. */
const GATED_QUEUES = new Set<string>([QUEUE_NAMES.AI_TEXT, QUEUE_NAMES.AI_IMAGE, QUEUE_NAMES.AI_VIDEO, QUEUE_NAMES.TRENDS_SCAN]);

/** One queue can carry several kinds of job (ai.text does). Route by the job's kind; an unknown kind fails with a reason. */
function byKind(map: Record<string, Handler>): Handler {
  return async (ctx) => {
    const h = map[ctx.job.kind];
    if (!h) throw new AppError("INTERNAL_ERROR", `This worker cannot run "${ctx.job.kind}" jobs.`, 500);
    return h(ctx);
  };
}


async function main() {
  // Fails loudly: a missing variable stops the process before any job can run.
  const env = validateWorkerEnv(process.env);
  log.info("environment validated");

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const store = supabaseJobStore(db);
  const objects = r2FromEnv(process.env);
  /** Handlers by queue. Later phases add theirs here; a queue without a handler is not consumed. */
  const gateway = buildGatewayDeps(db, process.env);
  const research = supabaseResearchStore(db);
  const model = process.env.AI_DEFAULT_TEXT_MODEL || DEFAULT_TEXT_MODEL;
  const researchDeps = { store: research, gateway, model, now: () => new Date(), log };
  const collectors = collectorsFromEnv({ NODE_ENV: process.env.NODE_ENV, TREND_COLLECTORS: process.env.TREND_COLLECTORS });
  const HANDLERS: Partial<Record<JobQueueName, Handler>> = {
    [QUEUE_NAMES.SYSTEM_DUMMY]: dummyHandler,
    [QUEUE_NAMES.MEDIA_NORMALIZE]: mediaNormalizeHandler(db, objects),
    [QUEUE_NAMES.AI_TEXT]: byKind({
      "intelligence.generate": intelligenceHandler({ store: research, gateway, model, fetchPage: (u) => fetchPageText(u), log }),
      "strategy.generate": strategyHandler(researchDeps),
      "strategy.regenerate_section": strategySectionHandler(researchDeps),
    }),
    [QUEUE_NAMES.TRENDS_SCAN]: trendScanHandler({ store: research, gateway, model, collectors, log }),
  };

  // Fails at startup in production if SOCIAL_PROVIDER is not chosen (never falls back to the fake there).
  const provider = getSocialProvider(process.env);
  log.info("social provider", { provider: provider.name });

  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (e: unknown) => log.error("queue error", { error: e instanceof Error ? e.message : String(e) }));
  await boss.start();

  for (const name of [
    ...JOB_QUEUES,
    QUEUE_NAMES.SYSTEM_RESCUE,
    QUEUE_NAMES.SYSTEM_RECONCILE,
    QUEUE_NAMES.PUBLISH_SCHEDULER,
    QUEUE_NAMES.PUBLISH_POST,
    QUEUE_NAMES.SOCIAL_TOKEN_CHECK,
  ]) {
    await boss.createQueue(name, QUEUE_RETRY);
  }

  let shuttingDown = false;
  let inFlight = 0;

  for (const name of JOB_QUEUES) {
    const handler = HANDLERS[name];
    if (!handler) {
      log.info("no handler yet, queue not consumed", { queue: name });
      continue;
    }
    await boss.work<{ jobId?: string }>(name, { localConcurrency: 2 }, async (jobs) => {
      for (const j of jobs) {
        if (shuttingDown) throw new Error("worker is shutting down");
        const parsed = jobPayloadSchema.safeParse(j.data);
        if (!parsed.success) {
          // A malformed payload can never succeed. Log it and drop it (nothing to write to: no job id).
          log.error("invalid job payload, dropped", { queue: name, queue_job_id: j.id });
          continue;
        }
        inFlight++;
        try {
          await runJob(
            {
              store,
              log,
              requeue: async (jobId, delaySeconds) => {
                await boss.send(name, { jobId }, { startAfter: delaySeconds });
              },
            },
            // retryCount counts retries already made; the queue's retryLimit is the last allowed number.
            { jobId: parsed.data.jobId, gated: GATED_QUEUES.has(name), attempt: { isLast: j.retryCount >= QUEUE_RETRY.retryLimit } },
            handler,
          );
        } finally {
          inFlight--;
        }
      }
    });
    log.info("consuming queue", { queue: name });
  }

  // Rescue: every minute, fail running jobs with no heartbeat and give their credits back.
  await boss.work(QUEUE_NAMES.SYSTEM_RESCUE, async () => {
    const { data, error } = await db.rpc("rescue_stuck_jobs", { p_minutes: RESCUE_AFTER_MINUTES });
    if (error) throw new Error(`rescue failed: ${error.message}`);
    if (typeof data === "number" && data > 0) log.warn("rescued stuck jobs", { count: data });
    // Posts stuck in `publishing`: back to scheduled (up to 3 tries), then failed. A post already sent is never resent.
    const posts = await db.rpc("rescue_stuck_posts", { p_minutes: RESCUE_AFTER_MINUTES });
    if (posts.error) throw new Error(`post rescue failed: ${posts.error.message}`);
    if (typeof posts.data === "number" && posts.data > 0) log.warn("rescued stuck posts", { count: posts.data });
  });
  await boss.schedule(QUEUE_NAMES.SYSTEM_RESCUE, "* * * * *");

  // Daily reconciliation: a negative balance must never exist.
  await boss.work(QUEUE_NAMES.SYSTEM_RECONCILE, async () => {
    const { data, error } = await db.rpc("credits_reconcile");
    if (error) throw new Error(`reconcile failed: ${error.message}`);
    if (Array.isArray(data) && data.length > 0) log.error("NEGATIVE CREDIT BALANCE FOUND", { orgs: data.length });
  });
  await boss.schedule(QUEUE_NAMES.SYSTEM_RECONCILE, "0 3 * * *");

  // ---- Publishing -------------------------------------------------------------------------------
  const publishStore = supabasePublishStore(db, objects);

  // Every minute: claim due posts atomically (no two workers can take the same post) and queue each one.
  await boss.work(QUEUE_NAMES.PUBLISH_SCHEDULER, async () => {
    const { data, error } = await db.rpc("claim_due_posts", { p_limit: 50 });
    if (error) throw new Error(`claim failed: ${error.message}`);
    for (const row of data ?? []) {
      try {
        await boss.send(QUEUE_NAMES.PUBLISH_POST, { postId: row.id }, { ...QUEUE_RETRY });
      } catch (e) {
        // The row stays `publishing`; the rescue job returns it to the schedule. Never ignored: logged with ids.
        log.error("could not queue a claimed post", { post_id: row.id, org_id: row.org_id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if ((data?.length ?? 0) > 0) log.info("claimed due posts", { count: data?.length });
  });
  await boss.schedule(QUEUE_NAMES.PUBLISH_SCHEDULER, "* * * * *");

  await boss.work<{ postId?: string }>(QUEUE_NAMES.PUBLISH_POST, { localConcurrency: 5 }, async (jobs) => {
    for (const j of jobs) {
      if (shuttingDown) throw new Error("worker is shutting down");
      const parsed = postPayloadSchema.safeParse(j.data);
      if (!parsed.success) {
        log.error("invalid publish payload, dropped", { queue_job_id: j.id });
        continue;
      }
      inFlight++;
      try {
        await publishPost({ store: publishStore, provider, now: () => new Date(), log }, parsed.data.postId);
      } finally {
        inFlight--;
      }
    }
  });

  // Daily: is each connected account's login still valid?
  await boss.work(QUEUE_NAMES.SOCIAL_TOKEN_CHECK, async () => {
    const summary = await runHealthCheck({ store: supabaseHealthStore(db), provider, log });
    log.info("channel health check done", summary);
  });
  await boss.schedule(QUEUE_NAMES.SOCIAL_TOKEN_CHECK, "0 4 * * *");

  // Health endpoint for Railway.
  const port = Number(process.env.PORT ?? 8080);
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(shuttingDown ? 503 : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: !shuttingDown, inFlight }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => log.info("health endpoint listening", { port }));

  // Graceful shutdown: stop taking new jobs, let the current ones finish.
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal, inFlight });
    server.close();
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  log.info("worker ready", { queues: JOB_QUEUES.filter((q) => isJobQueue(q) && HANDLERS[q]) });
}

main().catch((err: unknown) => {
  log.error("fatal error during startup", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
