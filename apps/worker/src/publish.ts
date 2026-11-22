import { PLATFORM_LIMITS, validatePostContent, type PlatformKey } from "@growth-os/shared";
import { SocialError, socialError, type MediaItem, type SocialProvider } from "@growth-os/social";
import type { Logger } from "./runner";

export interface PostRecord {
  id: string;
  org_id: string;
  brand_id: string;
  social_account_id: string;
  caption: string;
  media: unknown[];
  platform_options: Record<string, unknown>;
  status: string;
  /** Incremented by the claim, so this is the number of the attempt now running. */
  attempts: number;
  provider_post_id: string | null;
}

export interface AccountRecord {
  id: string;
  org_id: string;
  provider: string;
  provider_account_id: string;
  platform: string;
  status: string;
}

export interface PublishStore {
  loadPost(postId: string): Promise<{ post: PostRecord; account: AccountRecord | null; orgActive: boolean } | null>;
  /** Resolve the post's media to short-lived links the provider can fetch. */
  mediaFor(post: PostRecord): Promise<MediaItem[]>;
  recordAttempt(a: { orgId: string; postId: string; attemptNo: number; outcome: "success" | "retryable_error" | "failed"; errorCode?: string; errorMessage?: string }): Promise<void>;
  setProviderPostId(postId: string, providerPostId: string, url: string | null): Promise<void>;
  markPublished(postId: string): Promise<void>;
  reschedule(postId: string, at: Date, code: string, message: string): Promise<void>;
  markFailed(postId: string, code: string, message: string): Promise<void>;
  setAccountStatus(accountId: string, status: "needs_reconnect" | "disconnected"): Promise<void>;
}

export interface PublishDeps {
  store: PublishStore;
  provider: SocialProvider;
  now: () => Date;
  log: Logger;
}

export type PublishOutcome = "published" | "rescheduled" | "failed" | "skipped";

/** Up to 3 attempts for rate limits and outages (1 min, then 2 min). Media problems get exactly one more try. */
const MAX_ATTEMPTS = 3;
const MEDIA_RETRY_MS = 30_000;
const retryDelayMs = (attempt: number) => 60_000 * 2 ** (attempt - 1);
const MEDIA_CODES = new Set(["MEDIA_INVALID", "MEDIA_TOO_LARGE"]);

/**
 * Publish one claimed post. Safe to run twice:
 *  - a post that already has a provider id is only marked published, never sent again;
 *  - the provider id is stored BEFORE the post is marked published;
 *  - the post id is the idempotency key, so a retry after a crash cannot create a second post.
 * Every failure ends in `failed` (with a customer-readable reason) or a scheduled retry. Nothing is swallowed.
 */
export async function publishPost(d: PublishDeps, postId: string): Promise<PublishOutcome> {
  const { store, provider, log } = d;
  const loaded = await store.loadPost(postId);
  if (!loaded) {
    log.error("post not found", { post_id: postId });
    return "skipped";
  }
  const { post, account, orgActive } = loaded;
  const ctx = { post_id: post.id, org_id: post.org_id, attempt: post.attempts };

  if (post.status !== "publishing") {
    log.info("post is not in publishing, skipping", { ...ctx, status: post.status });
    return "skipped";
  }

  const fail = async (code: string, message: string, accountStatus?: "needs_reconnect" | "disconnected") => {
    await store.recordAttempt({ orgId: post.org_id, postId: post.id, attemptNo: post.attempts, outcome: "failed", errorCode: code, errorMessage: message });
    await store.markFailed(post.id, code, message);
    if (accountStatus && account) await store.setAccountStatus(account.id, accountStatus);
    log.warn("post failed", { ...ctx, code });
    return "failed" as const;
  };

  // Already sent in an earlier run: just record the success.
  if (post.provider_post_id) {
    await store.markPublished(post.id);
    log.info("post already had a provider id, marked published without sending again", ctx);
    return "published";
  }

  if (!orgActive) return fail("FORBIDDEN", "This workspace is not active, so nothing was posted.");
  if (!account) return fail("NOT_FOUND", "The channel for this post was removed, so nothing was posted. Reconnect the channel and try again.");
  if (account.status !== "active") {
    return fail("AUTH_EXPIRED", "This channel needs to be reconnected before it can post. Reconnect it and try again.");
  }

  // Platform rules and media, checked before the provider is called.
  let media: MediaItem[];
  try {
    media = await store.mediaFor(post);
  } catch (e) {
    if (e instanceof SocialError) return fail(e.code, e.message);
    throw e;
  }
  const platform = account.platform as PlatformKey;
  if (!PLATFORM_LIMITS[platform]) return fail("PLATFORM_REJECTED", "That platform is not supported.");
  const check = validatePostContent(platform, post.caption, media.map((m) => m.type));
  if (!check.ok) return fail(check.code, check.message);

  let result;
  try {
    result = await provider.publish({
      idempotencyKey: post.id,
      providerAccountId: account.provider_account_id,
      platform,
      caption: post.caption,
      media,
      options: post.platform_options,
    });
  } catch (e) {
    const err = e instanceof SocialError ? e : socialError("UNKNOWN");
    if (!(e instanceof SocialError)) log.error("unexpected provider error", { ...ctx, error: e instanceof Error ? e.message : String(e) });

    if (err.code === "AUTH_EXPIRED") return fail(err.code, err.message, "needs_reconnect");

    const canRetry = err.retryable ? post.attempts < MAX_ATTEMPTS : MEDIA_CODES.has(err.code) ? post.attempts < 2 : false;
    if (canRetry) {
      const delay = err.retryable ? retryDelayMs(post.attempts) : MEDIA_RETRY_MS;
      await store.recordAttempt({ orgId: post.org_id, postId: post.id, attemptNo: post.attempts, outcome: "retryable_error", errorCode: err.code, errorMessage: err.message });
      await store.reschedule(post.id, new Date(d.now().getTime() + delay), err.code, err.message);
      log.warn("post will be retried", { ...ctx, code: err.code, delay_ms: delay });
      return "rescheduled";
    }
    return fail(err.code, err.message);
  }

  // Provider confirmed. Store its id first, then record success, then mark published.
  await store.setProviderPostId(post.id, result.providerPostId, result.url);
  await store.recordAttempt({ orgId: post.org_id, postId: post.id, attemptNo: post.attempts, outcome: "success" });
  await store.markPublished(post.id);
  log.info("post published", ctx);
  return "published";
}
