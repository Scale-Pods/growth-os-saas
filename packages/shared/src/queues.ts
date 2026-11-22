import { z } from "zod";
import { QUEUE_NAMES } from "./constants";

/**
 * Payloads carry ids only. A handler reloads the row, re-checks the org and status,
 * and never trusts anything else that travelled through the queue.
 */
export const jobPayloadSchema = z.object({ jobId: z.string().uuid() });
export type JobPayload = z.infer<typeof jobPayloadSchema>;

/** Publishing queues carry the id of a row in `scheduled_posts`. */
export const postPayloadSchema = z.object({ postId: z.string().uuid() });
export type PostPayload = z.infer<typeof postPayloadSchema>;

/** Queues that are driven by a row in the `jobs` table. */
export const JOB_QUEUES = [
  QUEUE_NAMES.AI_TEXT,
  QUEUE_NAMES.AI_IMAGE,
  QUEUE_NAMES.AI_VIDEO,
  QUEUE_NAMES.RENDER_CAROUSEL,
  QUEUE_NAMES.RENDER_VIDEO,
  QUEUE_NAMES.SYSTEM_DUMMY,
  QUEUE_NAMES.MEDIA_NORMALIZE,
  QUEUE_NAMES.TRENDS_SCAN,
  QUEUE_NAMES.ALERTS_RUN,
] as const;

export type JobQueueName = (typeof JOB_QUEUES)[number];

export function isJobQueue(name: string): name is JobQueueName {
  return (JOB_QUEUES as readonly string[]).includes(name);
}

/** Job kinds the web app may create. The kind decides the queue. Unknown kinds are refused. */
export const JOB_KIND_TO_QUEUE: Record<string, JobQueueName> = {
  dummy: QUEUE_NAMES.SYSTEM_DUMMY,
  "ai.text": QUEUE_NAMES.AI_TEXT,
  "ai.image": QUEUE_NAMES.AI_IMAGE,
  "ai.video": QUEUE_NAMES.AI_VIDEO,
  "render.carousel": QUEUE_NAMES.RENDER_CAROUSEL,
  "render.video": QUEUE_NAMES.RENDER_VIDEO,
  "media.normalize": QUEUE_NAMES.MEDIA_NORMALIZE,
  "intelligence.generate": QUEUE_NAMES.AI_TEXT,
  "strategy.generate": QUEUE_NAMES.AI_TEXT,
  "strategy.regenerate_section": QUEUE_NAMES.AI_TEXT,
  "trends.scan": QUEUE_NAMES.TRENDS_SCAN,
  "alerts.run": QUEUE_NAMES.ALERTS_RUN,
};

/** Retry policy: provider errors retry with back-off; validation and credit failures never retry. */
export const QUEUE_RETRY = { retryLimit: 3, retryDelay: 15, retryBackoff: true } as const;
export const NO_RETRY = { retryLimit: 0 } as const;

/** Per-kind rough durations (seconds) for the progress UI. Always shown as estimates. */
export const JOB_ETA_SECONDS: Record<string, number> = {
  dummy: 10,
  "ai.text": 15,
  "ai.image": 25,
  "ai.video": 180,
  "render.carousel": 30,
  "render.video": 120,
  "media.normalize": 5,
  "intelligence.generate": 90,
  "strategy.generate": 120,
  "strategy.regenerate_section": 25,
  "trends.scan": 60,
  "alerts.run": 30,
};

/**
 * Rough credit cost shown BEFORE an action runs (the real cost is settled afterwards and is usually lower).
 * Kept here so the screens and the server agree.
 */
export const ESTIMATED_CREDITS: Record<string, number> = {
  "intelligence.generate": 8,
  "strategy.generate": 12,
  "strategy.regenerate_section": 2,
  "trends.scan": 4,
};
