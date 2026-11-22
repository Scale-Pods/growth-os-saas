import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { AppError } from "../src";
import { verifyWebhookSignature, receiveWebhook, type WebhookReceiptStore } from "../src/webhooks";

const secret = "test-secret";
const raw = JSON.stringify({ id: "evt_1", type: "demo" });
const now = 1_700_000_000;
const sign = (ts: number, body = raw, s = secret) => createHmac("sha256", s).update(`${ts}.${body}`).digest("hex");

function expectCode(fn: () => void, code: string) {
  try {
    fn();
    assert.fail("expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError, "typed error");
    assert.equal(e.code, code);
  }
}

// good signature passes
assert.doesNotThrow(() => verifyWebhookSignature({ rawBody: raw, signature: sign(now), timestamp: now, secret, nowSec: now }));
// bad signature, wrong secret, tampered body, malformed signature
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: "0".repeat(64), timestamp: now, secret, nowSec: now }), "UNAUTHORIZED");
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: sign(now, raw, "other"), timestamp: now, secret, nowSec: now }), "UNAUTHORIZED");
expectCode(() => verifyWebhookSignature({ rawBody: raw + " ", signature: sign(now), timestamp: now, secret, nowSec: now }), "UNAUTHORIZED");
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: "zz", timestamp: now, secret, nowSec: now }), "UNAUTHORIZED");
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: undefined, timestamp: now, secret, nowSec: now }), "UNAUTHORIZED");
// timestamps older than 5 minutes (or far in the future) are refused even with a valid signature
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: sign(now - 301), timestamp: now - 301, secret, nowSec: now }), "UNAUTHORIZED");
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: sign(now + 301), timestamp: now + 301, secret, nowSec: now }), "UNAUTHORIZED");
assert.doesNotThrow(() => verifyWebhookSignature({ rawBody: raw, signature: sign(now - 299), timestamp: now - 299, secret, nowSec: now }));
// a missing secret is a server fault, never a pass
expectCode(() => verifyWebhookSignature({ rawBody: raw, signature: sign(now), timestamp: now, secret: "", nowSec: now }), "INTERNAL_ERROR");

async function main() {
  // receipts: first delivery is processed, a replay is acknowledged but not processed again
  const seen = new Set<string>();
  const store: WebhookReceiptStore = {
    async insert(provider, eventId) {
      const k = `${provider}:${eventId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    },
  };
  let handled = 0;
  const input = { provider: "demo", eventId: "evt_1", rawBody: raw, signature: sign(now), timestamp: now, secret, nowSec: now, store };
  const first = await receiveWebhook(input, async () => {
    handled++;
  });
  assert.equal(first.status, "processed");
  const replay = await receiveWebhook(input, async () => {
    handled++;
  });
  assert.equal(replay.status, "duplicate");
  assert.equal(handled, 1, "handler ran once");
  // a bad signature never reaches the store or the handler
  const badStore: WebhookReceiptStore = {
    async insert() {
      assert.fail("store must not be touched for an unsigned request");
    },
  };
  await assert.rejects(
    receiveWebhook({ ...input, signature: "0".repeat(64), store: badStore, eventId: "evt_2" }, async () => {
      handled++;
    }),
    /signature/i,
  );
  assert.equal(handled, 1);


  console.log("✓ webhooks tests PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
