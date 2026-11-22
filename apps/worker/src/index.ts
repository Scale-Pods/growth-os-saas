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
  validateWorkerEnv,
  type JobQueueName,
} from "@growth-os/shared";
import { runJob, type Handler } from "./runner";
import { supabaseJobStore } from "./store";
import { dummyHandler } from "./handlers/dummy";

const log = createLogger({ service: "worker" });

/** Queues that call AI providers and are limited per organization. */
const GATED_QUEUES = new Set<string>([QUEUE_NAMES.AI_TEXT, QUEUE_NAMES.AI_IMAGE, QUEUE_NAMES.AI_VIDEO]);

/** Handlers by queue. Later phases add theirs here; a queue without a handler is not consumed. */
const HANDLERS: Partial<Record<JobQueueName, Handler>> = {
  [QUEUE_NAMES.SYSTEM_DUMMY]: dummyHandler,
};

async function main() {
  // Fails loudly: a missing variable stops the process before any job can run.
  const env = validateWorkerEnv(process.env);
  log.info("environment validated");

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const store = supabaseJobStore(db);
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (e: unknown) => log.error("queue error", { error: e instanceof Error ? e.message : String(e) }));
  await boss.start();

  for (const name of [...JOB_QUEUES, QUEUE_NAMES.SYSTEM_RESCUE, QUEUE_NAMES.SYSTEM_RECONCILE]) {
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
  });
  await boss.schedule(QUEUE_NAMES.SYSTEM_RESCUE, "* * * * *");

  // Daily reconciliation: a negative balance must never exist.
  await boss.work(QUEUE_NAMES.SYSTEM_RECONCILE, async () => {
    const { data, error } = await db.rpc("credits_reconcile");
    if (error) throw new Error(`reconcile failed: ${error.message}`);
    if (Array.isArray(data) && data.length > 0) log.error("NEGATIVE CREDIT BALANCE FOUND", { orgs: data.length });
  });
  await boss.schedule(QUEUE_NAMES.SYSTEM_RECONCILE, "0 3 * * *");

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
