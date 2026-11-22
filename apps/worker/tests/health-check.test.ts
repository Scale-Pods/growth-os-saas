import assert from "node:assert/strict";
import { FakeSocialProvider } from "@growth-os/social";
import { runHealthCheck, type HealthStore } from "../src/health-check";

const warnings: string[] = [];
const errors: string[] = [];
const log = {
  info() {},
  warn(m: string) {
    warnings.push(m);
  },
  error(m: string) {
    errors.push(m);
  },
};

async function main() {
  const accounts = [
    { id: "a1", org_id: "o1", provider_account_id: "ok-1", platform: "instagram" },
    { id: "a2", org_id: "o1", provider_account_id: "expired-2", platform: "linkedin" },
    { id: "a3", org_id: "o2", provider_account_id: "gone-3", platform: "facebook" },
    { id: "a4", org_id: "o2", provider_account_id: "boom-4", platform: "x" },
    { id: "a5", org_id: "o2", provider_account_id: "ok-5", platform: "youtube" },
  ];
  const status = new Map<string, string>();
  const checked = new Set<string>();
  const store: HealthStore = {
    async listActive() {
      return accounts;
    },
    async markChecked(id, newStatus) {
      checked.add(id);
      if (newStatus) status.set(id, newStatus);
    },
  };
  const provider = new FakeSocialProvider();
  const real = provider.checkAccount.bind(provider);
  provider.checkAccount = async (id) => {
    if (id.startsWith("boom-")) throw new Error("provider exploded");
    return real(id);
  };

  const summary = await runHealthCheck({ store, provider, log });

  assert.equal(status.get("a2"), "needs_reconnect", "expired login is flagged for reconnect");
  assert.equal(status.get("a3"), "disconnected", "removed account is flagged disconnected");
  assert.equal(status.has("a1"), false, "healthy accounts keep their status");
  assert.equal(status.has("a5"), false);
  assert.ok(checked.has("a1") && checked.has("a5"), "healthy accounts get a fresh last-checked time");
  assert.equal(checked.has("a4"), false, "an account whose check errored is not marked as checked");
  assert.ok(errors.length >= 1, "the provider failure is logged, not swallowed");
  assert.ok(warnings.length >= 2, "each flagged account is logged so a notification can follow");
  assert.deepEqual(summary, { checked: 4, flagged: 2, errors: 1 }, "one failing account does not stop the rest");

  process.stdout.write("✓ health check tests PASSED\n");
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
