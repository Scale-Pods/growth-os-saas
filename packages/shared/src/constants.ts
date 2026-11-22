export const QUEUE_NAMES = {
  AI_TEXT: "ai.text",
  AI_IMAGE: "ai.image",
  AI_VIDEO: "ai.video",
  RENDER_CAROUSEL: "render.carousel",
  RENDER_VIDEO: "render.video",
  PUBLISH_POST: "publish.post",
  PUBLISH_SCHEDULER: "publish.scheduler",
  ANALYTICS_SYNC: "analytics.sync",
  TRENDS_SCAN: "trends.scan",
  ALERTS_RUN: "alerts.run",
  NOTIFY_SEND: "notify.send",
  BILLING_RECONCILE: "billing.reconcile",
  SOCIAL_TOKEN_CHECK: "social.token_check",
  SYSTEM_DUMMY: "system.dummy",
  SYSTEM_RESCUE: "system.rescue",
  SYSTEM_RECONCILE: "system.reconcile",
  MEDIA_NORMALIZE: "media.normalize",
  ALERTS_SCHEDULER: "alerts.scheduler",
  ALERTS_DIGEST: "alerts.digest",
} as const;

export const CONCURRENCY_LIMITS = {
  AI_JOBS_PER_ORG: 2,
  AI_JOBS_GLOBAL: 10,
  RENDER_JOBS_GLOBAL: 2,
} as const;

export const CREDIT_DEFAULTS = {
  CREDITS_PER_USD: 100,
  TRIAL_CREDITS: 200,
  TRIAL_DAYS: 14,
} as const;


/** Spend ceilings. Per job, in USD, enforced by the gateway before the provider is called. */
export const COST_CAPS = {
  JOB_USD_DEFAULT: 1,
  JOB_USD_VIDEO: 5,
} as const;

/** Running jobs with no heartbeat for this long are failed by the rescue job. */
export const RESCUE_AFTER_MINUTES = 10;
