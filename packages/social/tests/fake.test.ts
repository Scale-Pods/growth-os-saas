import assert from "node:assert/strict";
import { FakeSocialProvider, SocialError, socialError, getSocialProvider, type PublishRequest } from "../src";

const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({
  idempotencyKey: "post-1",
  providerAccountId: "acct-1",
  platform: "instagram",
  caption: "Hello world",
  media: [],
  options: {},
  ...over,
});

async function expectError(p: Promise<unknown>, code: string, retryable: boolean) {
  try {
    await p;
    assert.fail("expected SocialError " + code);
  } catch (e) {
    assert.ok(e instanceof SocialError, "typed error, got " + String(e));
    assert.equal(e.code, code);
    assert.equal(e.retryable, retryable);
    assert.ok(e.message.length > 10, "human readable message");
  }
}

async function main() {
  // taxonomy: every code has a human message and a clear retry flag
  const expectedRetry: Record<string, boolean> = {
    AUTH_EXPIRED: false,
    RATE_LIMITED: true,
    MEDIA_INVALID: false,
    MEDIA_TOO_LARGE: false,
    PLATFORM_REJECTED: false,
    PROVIDER_DOWN: true,
    UNKNOWN: false,
  };
  for (const [code, retry] of Object.entries(expectedRetry)) {
    const e = socialError(code as never);
    assert.equal(e.retryable, retry, code);
    assert.ok(e.message.length > 10);
  }

  const fake = new FakeSocialProvider();

  // publish returns an id and a link, and counts one real send
  const r1 = await fake.publish(req());
  assert.match(r1.providerPostId, /^fake_/);
  assert.ok(r1.url?.startsWith("https://"));
  assert.equal(fake.sentCount, 1);

  // idempotent: the same key never posts twice (this is what makes a retry after a crash safe)
  const r2 = await fake.publish(req());
  assert.equal(r2.providerPostId, r1.providerPostId);
  assert.equal(fake.sentCount, 1, "second publish with the same key is not a second post");
  const r3 = await fake.publish(req({ idempotencyKey: "post-2" }));
  assert.notEqual(r3.providerPostId, r1.providerPostId);
  assert.equal(fake.sentCount, 2);

  // failures can be simulated from the caption, so they also work across processes (web, worker) in local dev
  await expectError(fake.publish(req({ idempotencyKey: "k1", caption: "x [fail:AUTH_EXPIRED]" })), "AUTH_EXPIRED", false);
  await expectError(fake.publish(req({ idempotencyKey: "k2", caption: "x [fail:RATE_LIMITED]" })), "RATE_LIMITED", true);
  await expectError(fake.publish(req({ idempotencyKey: "k3", caption: "x [fail:PROVIDER_DOWN]" })), "PROVIDER_DOWN", true);
  await expectError(fake.publish(req({ idempotencyKey: "k4", caption: "x [fail:MEDIA_INVALID]" })), "MEDIA_INVALID", false);
  assert.equal(fake.sentCount, 2, "failed sends are not counted as posts");

  // a failure that clears: [fail-once:CODE] fails the first try only
  await expectError(fake.publish(req({ idempotencyKey: "k5", caption: "x [fail-once:RATE_LIMITED]" })), "RATE_LIMITED", true);
  const ok = await fake.publish(req({ idempotencyKey: "k5", caption: "x [fail-once:RATE_LIMITED]" }));
  assert.match(ok.providerPostId, /^fake_/);

  // connect flow: the URL carries our state and goes back to our callback
  const url = await fake.getConnectUrl({ state: "STATE123", platform: "instagram", redirectUri: "http://localhost:3000/api/social/callback" });
  assert.ok(url.includes("state=STATE123"));
  assert.ok(url.startsWith("http://localhost:3000/api/social/callback"));

  // the callback produces accounts for the platform, stable per brand so reconnecting updates rather than duplicates
  const a1 = await fake.accountsFromCallback({ params: { fake_platform: "instagram" }, brandId: "11111111-1111-4111-8111-111111111111" });
  const a2 = await fake.accountsFromCallback({ params: { fake_platform: "instagram" }, brandId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(a1.length, 1);
  assert.equal(a1[0]!.providerAccountId, a2[0]!.providerAccountId);
  assert.equal(a1[0]!.platform, "instagram");
  await assert.rejects(fake.accountsFromCallback({ params: { fake_platform: "myspace" }, brandId: "b" }), /platform/i);

  // health check: accounts can be marked as expired for testing
  assert.equal((await fake.checkAccount("acct-1")).status, "active");
  assert.equal((await fake.checkAccount("expired-acct")).status, "needs_reconnect");
  assert.equal((await fake.checkAccount("gone-acct")).status, "disconnected");

  // the factory never silently falls back to the fake in production
  assert.equal(getSocialProvider({ NODE_ENV: "development" }).name, "fake");
  assert.equal(getSocialProvider({ NODE_ENV: "production", SOCIAL_PROVIDER: "fake" }).name, "fake");
  assert.throws(() => getSocialProvider({ NODE_ENV: "production" }), /SOCIAL_PROVIDER/);
  assert.throws(() => getSocialProvider({ NODE_ENV: "development", SOCIAL_PROVIDER: "zernio" }), /not available/i);

  process.stdout.write("✓ social provider tests PASSED\n");
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
