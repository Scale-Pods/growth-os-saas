import assert from "node:assert/strict";
import { estimateWatchMonthlyCredits, WATCH_FREQUENCIES, isAcceptableWebhookUrl, WATCH_SOURCES } from "../src";

// ---- cost estimate shown before a watch is turned on --------------------------------------------
{
  const daily = estimateWatchMonthlyCredits({ frequencyMinutes: 1440, budget: 1000 });
  const hourly = estimateWatchMonthlyCredits({ frequencyMinutes: 60, budget: 1000 });
  const halfHourly = estimateWatchMonthlyCredits({ frequencyMinutes: 30, budget: 10_000 });
  assert.equal(daily.checksPerMonth, 30);
  assert.equal(hourly.checksPerMonth, 720);
  assert.equal(halfHourly.checksPerMonth, 1440);
  assert.ok(daily.typical < hourly.typical && hourly.typical < halfHourly.typical, "checking more often costs more");
  assert.ok(hourly.typical <= hourly.max, "typical never exceeds the worst case");
  // the budget is the ceiling on both numbers: the customer can never be told it might cost more than they allowed
  const capped = estimateWatchMonthlyCredits({ frequencyMinutes: 30, budget: 50 });
  assert.equal(capped.max, 50);
  assert.ok(capped.typical <= 50);
  assert.ok(capped.willStopAtBudget, "it is clear the watch will stop at the budget");
  assert.equal(estimateWatchMonthlyCredits({ frequencyMinutes: 1440, budget: 1000 }).willStopAtBudget, false);
}
assert.deepEqual([...WATCH_FREQUENCIES], [30, 60, 120, 240, 720, 1440]);
assert.ok(WATCH_SOURCES.includes("Google News") && WATCH_SOURCES.includes("RSS"));

// ---- webhook and Slack addresses ------------------------------------------------------------------
for (const ok of ["https://hooks.slack.com/services/T000/B000/xyz", "https://example.com/hook", "https://alerts.mycompany.io:8443/in?k=v"]) {
  assert.equal(isAcceptableWebhookUrl(ok), true, ok);
}
for (const bad of [
  "http://example.com/hook", // not https
  "https://localhost/hook",
  "https://127.0.0.1/hook",
  "https://10.0.0.5/hook",
  "https://192.168.1.10/hook",
  "https://172.16.0.1/hook",
  "https://169.254.169.254/latest/meta-data",
  "https://[::1]/hook",
  "https://user:pw@example.com/hook",
  "https://printer.local/hook",
  "ftp://example.com/hook",
  "javascript:alert(1)",
  "not a url",
  "",
  "https://example.com/" + "a".repeat(600),
]) {
  assert.equal(isAcceptableWebhookUrl(bad), false, bad);
}

process.stdout.write("✓ alerts shared tests PASSED\n");
