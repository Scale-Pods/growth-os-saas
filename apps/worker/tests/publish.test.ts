import assert from "node:assert/strict";
import { FakeSocialProvider, type MediaItem } from "@growth-os/social";
import { publishPost, type AccountRecord, type PostRecord, type PublishStore } from "../src/publish";

const NOW = new Date("2026-12-01T10:00:00.000Z");
const quietLog = { info() {}, warn() {}, error() {} };

interface World {
  post: PostRecord;
  account: AccountRecord | null;
  orgActive: boolean;
  media: MediaItem[];
  log: string[];
  attempts: Array<{ attemptNo: number; outcome: string; errorCode?: string }>;
  rescheduledAt: Date | null;
  failed: { code: string; message: string } | null;
  accountStatus: string | null;
  providerPostId: string | null;
  failSetProviderId: boolean;
}

function makeWorld(over: { post?: Partial<PostRecord>; account?: Partial<AccountRecord> | null; orgActive?: boolean; media?: MediaItem[] } = {}): World {
  return {
    post: {
      id: "11111111-1111-4111-8111-111111111111",
      org_id: "org-1",
      brand_id: "brand-1",
      social_account_id: "acct-row-1",
      caption: "Hello world",
      media: [],
      platform_options: {},
      status: "publishing",
      attempts: 1,
      provider_post_id: null,
      ...over.post,
    },
    account: over.account === null ? null : { id: "acct-row-1", org_id: "org-1", provider: "fake", provider_account_id: "prov-acct-1", platform: "linkedin", status: "active", ...over.account },
    orgActive: over.orgActive ?? true,
    media: over.media ?? [],
    log: [],
    attempts: [],
    rescheduledAt: null,
    failed: null,
    accountStatus: null,
    providerPostId: null,
    failSetProviderId: false,
  };
}

function makeStore(w: World): PublishStore {
  return {
    async loadPost() {
      return { post: w.post, account: w.account, orgActive: w.orgActive };
    },
    async mediaFor() {
      return w.media;
    },
    async recordAttempt(a) {
      w.attempts = w.attempts.filter((x) => x.attemptNo !== a.attemptNo);
      w.attempts.push({ attemptNo: a.attemptNo, outcome: a.outcome, errorCode: a.errorCode });
      w.log.push(`attempt:${a.attemptNo}:${a.outcome}`);
    },
    async setProviderPostId(_id, providerPostId) {
      if (w.failSetProviderId) throw new Error("db down while saving provider id");
      w.providerPostId = providerPostId;
      w.post.provider_post_id = providerPostId;
      w.log.push("store-provider-id");
    },
    async markPublished() {
      assert.ok(w.post.provider_post_id, "published must never be written before the provider id is stored");
      w.post.status = "published";
      w.log.push("published");
    },
    async reschedule(_id, at, code) {
      w.rescheduledAt = at;
      w.post.status = "scheduled";
      w.log.push(`rescheduled:${code}`);
    },
    async markFailed(_id, code, message) {
      w.failed = { code, message };
      w.post.status = "failed";
      w.log.push(`failed:${code}`);
    },
    async setAccountStatus(_id, status) {
      w.accountStatus = status;
    },
  };
}

const run = (w: World, provider = new FakeSocialProvider()) =>
  publishPost({ store: makeStore(w), provider, now: () => NOW, log: quietLog }, w.post.id).then((outcome) => ({ outcome, provider }));

async function main() {
  // 1. success: provider id is stored BEFORE the post is marked published, one real send, attempt recorded
  {
    const w = makeWorld();
    const { outcome, provider } = await run(w);
    assert.equal(outcome, "published");
    assert.equal(provider.sentCount, 1);
    assert.equal(w.post.status, "published");
    assert.deepEqual(w.log, ["store-provider-id", "attempt:1:success", "published"], "id stored first, then published");
  }

  // 2. nothing to do: row missing, or not in publishing (already handled)
  {
    const w = makeWorld({ post: { status: "published", provider_post_id: "x" } });
    const { outcome, provider } = await run(w);
    assert.equal(outcome, "skipped");
    assert.equal(provider.sentCount, 0);
    const store = makeStore(w);
    store.loadPost = async () => null;
    const out = await publishPost({ store, provider: new FakeSocialProvider(), now: () => NOW, log: quietLog }, w.post.id);
    assert.equal(out, "skipped");
  }

  // 3. a post that already has a provider id was already sent: mark published, never send again
  {
    const w = makeWorld({ post: { provider_post_id: "fake_already" } });
    const { outcome, provider } = await run(w);
    assert.equal(outcome, "published");
    assert.equal(provider.sentCount, 0, "must not post a second time");
    assert.equal(w.post.status, "published");
  }

  // 4. crash after the provider accepted the post but before we saved its id: the retry does not duplicate
  {
    const w = makeWorld();
    const provider = new FakeSocialProvider();
    w.failSetProviderId = true;
    await assert.rejects(run(w, provider), /db down/);
    assert.equal(provider.sentCount, 1, "the first run did post once");
    assert.equal(w.post.status, "publishing", "row is left for the rescue job, not marked published");
    w.failSetProviderId = false;
    const second = await run(w, provider);
    assert.equal(second.outcome, "published");
    assert.equal(provider.sentCount, 1, "retry reuses the same idempotency key, so no duplicate post");
  }

  // 5. expired login: failed straight away, no retry, channel flagged for reconnect
  {
    const w = makeWorld({ post: { caption: "hi [fail:AUTH_EXPIRED]" } });
    const { outcome } = await run(w);
    assert.equal(outcome, "failed");
    assert.equal(w.failed?.code, "AUTH_EXPIRED");
    assert.equal(w.accountStatus, "needs_reconnect");
    assert.equal(w.rescheduledAt, null, "AUTH_EXPIRED is never retried");
    assert.ok((w.failed?.message ?? "").toLowerCase().includes("reconnect"));
  }

  // 6. rate limited: retried with growing back-off (1 min, 2 min), then fails on the third attempt
  {
    const w1 = makeWorld({ post: { caption: "x [fail:RATE_LIMITED]", attempts: 1 } });
    assert.equal((await run(w1)).outcome, "rescheduled");
    assert.equal(w1.rescheduledAt?.getTime(), NOW.getTime() + 60_000);
    const w2 = makeWorld({ post: { caption: "x [fail:RATE_LIMITED]", attempts: 2 } });
    assert.equal((await run(w2)).outcome, "rescheduled");
    assert.equal(w2.rescheduledAt?.getTime(), NOW.getTime() + 120_000);
    const w3 = makeWorld({ post: { caption: "x [fail:RATE_LIMITED]", attempts: 3 } });
    assert.equal((await run(w3)).outcome, "failed");
    assert.equal(w3.failed?.code, "RATE_LIMITED");
    assert.ok(w3.attempts.some((a) => a.attemptNo === 3 && a.outcome === "failed"));
    assert.ok(w1.attempts.some((a) => a.attemptNo === 1 && a.outcome === "retryable_error"));
  }

  // 7. provider down behaves like rate limiting
  {
    const w = makeWorld({ post: { caption: "x [fail:PROVIDER_DOWN]", attempts: 1 } });
    assert.equal((await run(w)).outcome, "rescheduled");
  }

  // 8. media problems get exactly one automatic retry (after re-checking the file), then fail
  {
    const w1 = makeWorld({ post: { caption: "x [fail:MEDIA_INVALID]", attempts: 1 } });
    assert.equal((await run(w1)).outcome, "rescheduled");
    assert.equal(w1.rescheduledAt?.getTime(), NOW.getTime() + 30_000);
    const w2 = makeWorld({ post: { caption: "x [fail:MEDIA_INVALID]", attempts: 2 } });
    assert.equal((await run(w2)).outcome, "failed");
    assert.equal(w2.failed?.code, "MEDIA_INVALID");
  }

  // 9. a platform rejection is final
  {
    const w = makeWorld({ post: { caption: "x [fail:PLATFORM_REJECTED]" } });
    assert.equal((await run(w)).outcome, "failed");
    assert.equal(w.rescheduledAt, null);
  }

  // 10. a flaky failure that clears: attempt 1 is rescheduled, attempt 2 publishes
  {
    const provider = new FakeSocialProvider();
    const w = makeWorld({ post: { caption: "x [fail-once:RATE_LIMITED]", attempts: 1 } });
    assert.equal((await run(w, provider)).outcome, "rescheduled");
    w.post.status = "publishing";
    w.post.attempts = 2;
    assert.equal((await run(w, provider)).outcome, "published");
    assert.equal(provider.sentCount, 1);
  }

  // 11. unexpected errors fail the post with a safe message (no internals leak into what the customer sees)
  {
    const w = makeWorld();
    const provider = new FakeSocialProvider();
    provider.publish = async () => {
      throw new Error("ECONNREFUSED 10.0.0.5:443 token=secret123");
    };
    const { outcome } = await run(w, provider);
    assert.equal(outcome, "failed");
    assert.equal(w.failed?.code, "UNKNOWN");
    assert.ok(!w.failed!.message.includes("secret123") && !w.failed!.message.includes("10.0.0.5"));
  }

  // 12. a channel that needs reconnecting fails the post up front, without calling the provider
  {
    const w = makeWorld({ account: { status: "needs_reconnect" } });
    const { outcome, provider } = await run(w);
    assert.equal(outcome, "failed");
    assert.equal(provider.sentCount, 0);
    assert.equal(w.failed?.code, "AUTH_EXPIRED");
  }

  // 13. a deleted channel fails the post with a clear reason
  {
    const w = makeWorld({ account: null });
    const { outcome } = await run(w);
    assert.equal(outcome, "failed");
    assert.match(w.failed!.message, /channel/i);
  }

  // 14. an inactive workspace publishes nothing
  {
    const w = makeWorld({ orgActive: false });
    const { outcome, provider } = await run(w);
    assert.equal(outcome, "failed");
    assert.equal(provider.sentCount, 0);
  }

  // 15. platform rules are checked before any provider call (Instagram needs media; X has 280 characters)
  {
    const w = makeWorld({ account: { platform: "instagram" } });
    const { outcome, provider } = await run(w);
    assert.equal(outcome, "failed");
    assert.equal(provider.sentCount, 0);
    assert.equal(w.failed?.code, "MEDIA_INVALID");
    const w2 = makeWorld({ account: { platform: "x" }, post: { caption: "a".repeat(300) } });
    assert.equal((await run(w2)).outcome, "failed");
    assert.equal(w2.failed?.code, "PLATFORM_REJECTED");
  }

  // 16. media is handed to the provider as signed links, and checked against the platform's allowed kinds
  {
    const w = makeWorld({ account: { platform: "instagram" }, media: [{ url: "https://signed.example/a.jpg", type: "image" }] });
    const provider = new FakeSocialProvider();
    let seen: MediaItem[] = [];
    const real = provider.publish.bind(provider);
    provider.publish = async (req) => {
      seen = req.media;
      return real(req);
    };
    const { outcome } = await run(w, provider);
    assert.equal(outcome, "published");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.url, "https://signed.example/a.jpg");
  }

  process.stdout.write("✓ publish handler tests PASSED\n");
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
