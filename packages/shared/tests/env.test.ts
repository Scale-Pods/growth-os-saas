import assert from "node:assert/strict";
import { validateWebEnv, validateWorkerEnv, createLogger } from "../src";

const webOk = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

assert.throws(() => validateWebEnv({}), /NEXT_PUBLIC_SUPABASE_URL/);
assert.doesNotThrow(() => validateWebEnv({ ...webOk, NODE_ENV: "development" }));
assert.throws(() => validateWebEnv({ ...webOk, NODE_ENV: "production" }), /SUPABASE_SERVICE_ROLE_KEY/);
assert.throws(() => validateWorkerEnv({}), /DATABASE_URL/);
assert.doesNotThrow(() =>
  validateWorkerEnv({ DATABASE_URL: "postgres://x", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }),
);

// errors name variables, never values
try {
  validateWebEnv({ ...webOk, NEXT_PUBLIC_SUPABASE_URL: "super-secret-not-a-url" });
} catch (e) {
  assert.ok(!String((e as Error).message).includes("super-secret-not-a-url"));
}

// logger redacts secret-looking keys
let out = "";
const orig = process.stdout.write.bind(process.stdout);
process.stdout.write = ((s: string) => ((out += s), true)) as typeof process.stdout.write;
createLogger({ org_id: "o1" }).info("hi", { api_key: "abc", nested: { token: "t" } });
process.stdout.write = orig;
assert.ok(out.includes('"org_id":"o1"') && !out.includes("abc") && !out.includes('"t"'));

console.log("✓ env validation and logger tests PASSED");
