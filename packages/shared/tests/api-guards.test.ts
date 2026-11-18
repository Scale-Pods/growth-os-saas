import assert from "node:assert/strict";
import { assertNoOrgInInput, RateLimiter, enforceRateLimit, AppError } from "../src";

// org_id may never come from the request
assert.throws(() => assertNoOrgInInput({ org_id: "x" }), /not accepted/);
assert.throws(() => assertNoOrgInInput({ nested: { list: [{ orgId: "x" }] } }), /not accepted/);
assert.throws(() => assertNoOrgInInput({ Organization_ID: "x" }), /not accepted/);
assert.doesNotThrow(() => assertNoOrgInInput({ name: "ok", brand_id: "b" }));
assert.doesNotThrow(() => assertNoOrgInInput("string"));

// rate limiter: window, limit, reset
let t = 0;
const rl = new RateLimiter(() => t);
for (let i = 0; i < 3; i++) assert.equal(rl.check("u", 3, 1000), 0);
assert.ok(rl.check("u", 3, 1000) > 0, "4th hit in the window is refused");
assert.equal(rl.check("other", 3, 1000), 0, "keys are independent");
t = 1001;
assert.equal(rl.check("u", 3, 1000), 0, "window resets");

// enforceRateLimit throws a typed RATE_LIMITED error
const rl2 = new RateLimiter(() => 0);
for (let i = 0; i < 30; i++) enforceRateLimit(rl2, "u", "write");
try {
  enforceRateLimit(rl2, "u", "write");
  assert.fail("expected throw");
} catch (e) {
  assert.ok(e instanceof AppError && e.code === "RATE_LIMITED" && e.statusCode === 429);
}

console.log("✓ api-guards tests PASSED");
