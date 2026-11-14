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

