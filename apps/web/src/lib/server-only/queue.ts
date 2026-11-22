import "server-only";
import { PgBoss } from "pg-boss";
import { AppError, JOB_KIND_TO_QUEUE, QUEUE_NAMES, QUEUE_RETRY } from "@growth-os/shared";

/**
 * Producer side of the queue. Only server code enqueues; the browser never talks to the queue.
 * This instance only sends: it does not run maintenance, scheduling or migrations (the worker owns those).
 */
let bossPromise: Promise<PgBoss> | null = null;

function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new AppError("INTERNAL_ERROR", "The job queue is not configured on this server.", 500);
    }
    bossPromise = (async () => {
      const boss = new PgBoss({ connectionString: url, max: 2, schedule: false, supervise: false, migrate: false });
      boss.on("error", () => {
        // Connection errors are surfaced on the next send; drop the cached instance so it reconnects.
        bossPromise = null;
      });
      await boss.start();
      return boss;
    })().catch((e) => {
      bossPromise = null;
      throw e;
    });
  }
  return bossPromise;
}

/** Enqueue a job row for the worker. Payload carries the id only. Throws if the queue cannot be reached. */
export async function enqueueJob(kind: string, jobId: string): Promise<void> {
  const queue = JOB_KIND_TO_QUEUE[kind];
  if (!queue) throw new AppError("VALIDATION_ERROR", `Unknown job kind: ${kind}`, 400);
  const boss = await getBoss();
  const id = await boss.send(queue, { jobId }, { ...QUEUE_RETRY });
  if (!id) throw new AppError("INTERNAL_ERROR", "The job could not be queued.", 500);
}

/**
 * Ask the worker to run the publish scheduler now instead of waiting for the next minute ("Post now").
 * Best effort: the scheduler also runs every minute, so a failure here only delays the post by up to a minute.
 */
export async function kickPublishScheduler(): Promise<boolean> {
  try {
    const boss = await getBoss();
    // singletonSeconds collapses a burst of clicks into one tick.
    await boss.send(QUEUE_NAMES.PUBLISH_SCHEDULER, {}, { singletonSeconds: 5 });
    return true;
  } catch {
    return false;
  }
}
