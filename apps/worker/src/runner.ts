import { AppError, CONCURRENCY_LIMITS } from "@growth-os/shared";

export interface JobRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  kind: string;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  input_ref: unknown;
  created_by: string | null;
}

/** Everything the runner needs from storage. The real one talks to Supabase with the service role. */
export interface JobStore {
  load(jobId: string): Promise<JobRow | null>;
  countRunning(orgId: string): Promise<number>;
  /** Claim the job. Returns false when it is no longer queued (another worker has it, or it finished). */
  markRunning(jobId: string): Promise<boolean>;
  heartbeat(jobId: string, progress: unknown): Promise<void>;
  markDone(jobId: string, output: unknown, costCredits: number): Promise<void>;
  markFailed(jobId: string, code: string, message: string): Promise<void>;
  markQueued(jobId: string): Promise<void>;
  releaseCredits(orgId: string, jobId: string): Promise<void>;
}

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

export interface RunnerDeps {
  store: JobStore;
  /** Put the job back on the queue after `delaySeconds` (used when the org is at its concurrency cap). */
  requeue(jobId: string, delaySeconds: number): Promise<void>;
  log: Logger;
}

export interface HandlerContext {
  job: JobRow;
  heartbeat(progress: unknown): Promise<void>;
}

export interface HandlerResult {
  output?: unknown;
  costCredits?: number;
}

export type Handler = (ctx: HandlerContext) => Promise<HandlerResult>;

/** Throw this for provider hiccups worth retrying (429, 5xx, timeouts). Everything else fails the job. */
export class RetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableJobError";
  }
}

export type RunOutcome = "done" | "failed" | "skipped" | "requeued";

export interface RunArgs {
  jobId: string;
  /** Apply the per-org AI concurrency cap (AI queues). */
  gated: boolean;
  attempt: { isLast: boolean };
}

const REQUEUE_DELAY_SECONDS = 15;
const HEARTBEAT_EVERY_MS = 30_000;

/**
 * The lifecycle every handler runs inside:
 * load row -> re-check status -> concurrency gate -> claim -> run -> write done or failed.
 * A job never stays `running` after this returns, and a failure always writes a reason.
 */
export async function runJob(d: RunnerDeps, args: RunArgs, handler: Handler): Promise<RunOutcome> {
  const { store, log } = d;
  const job = await store.load(args.jobId);
  if (!job) {
    log.error("job row not found", { job_id: args.jobId });
    return "skipped";
  }
  const ctxLog = { job_id: job.id, org_id: job.org_id, kind: job.kind };

  if (job.status !== "queued") {
    log.info("job is not queued, skipping", { ...ctxLog, status: job.status });
    return "skipped";
  }

  if (args.gated) {
    const running = await store.countRunning(job.org_id);
    if (running >= CONCURRENCY_LIMITS.AI_JOBS_PER_ORG) {
      await d.requeue(job.id, REQUEUE_DELAY_SECONDS);
      log.info("org at concurrency cap, job stays queued", { ...ctxLog, running });
      return "requeued";
    }
  }

  const claimed = await store.markRunning(job.id);
  if (!claimed) {
    log.info("job already claimed elsewhere", ctxLog);
    return "skipped";
  }

  const timer = setInterval(() => {
    store.heartbeat(job.id, undefined).catch((e: unknown) => log.warn("heartbeat failed", { ...ctxLog, error: String(e) }));
  }, HEARTBEAT_EVERY_MS);

  try {
    const result = await handler({ job, heartbeat: (p) => store.heartbeat(job.id, p) });
    await store.markDone(job.id, result.output ?? null, result.costCredits ?? 0);
    log.info("job done", ctxLog);
    return "done";
  } catch (e) {
    if (e instanceof RetryableJobError && !args.attempt.isLast) {
      // Credits stay reserved: another attempt is coming. The error is rethrown so the queue retries.
      await store.markQueued(job.id);
      log.warn("job failed, will retry", { ...ctxLog, error: e.message });
      throw e;
    }
    let code = "INTERNAL_ERROR";
    let message = "Something went wrong while running this job. Nothing was charged. Please try again.";
    if (e instanceof AppError) {
      code = e.code;
      message = e.message;
    } else if (e instanceof RetryableJobError) {
      code = "PROVIDER_ERROR";
      message = "The service we depend on did not respond after several tries. Nothing was charged. Please try again later.";
    }
    log.error("job failed", { ...ctxLog, code, error: e instanceof Error ? e.message : String(e) });
    await store.markFailed(job.id, code, message);
    await store.releaseCredits(job.org_id, job.id);
    return "failed";
  } finally {
    clearInterval(timer);
  }
}
