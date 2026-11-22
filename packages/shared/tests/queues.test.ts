import assert from "node:assert/strict";
import { jobPayloadSchema, isJobQueue, JOB_KIND_TO_QUEUE, JOB_QUEUES, QUEUE_NAMES } from "../src";

assert.ok(jobPayloadSchema.safeParse({ jobId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }).success);
assert.ok(!jobPayloadSchema.safeParse({ jobId: "not-a-uuid" }).success, "ids only, and valid ids");
assert.ok(!jobPayloadSchema.safeParse({}).success);
// extra data in a payload is dropped, never passed through
const parsed = jobPayloadSchema.parse({ jobId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", org_id: "evil", prompt: "x" });
assert.deepEqual(Object.keys(parsed), ["jobId"]);

assert.ok(isJobQueue(QUEUE_NAMES.AI_TEXT));
assert.ok(!isJobQueue("publish.post"), "publish queue is not a job-table queue");
// every kind maps to a registered job queue
for (const q of Object.values(JOB_KIND_TO_QUEUE)) assert.ok(JOB_QUEUES.includes(q));
assert.equal(JOB_KIND_TO_QUEUE["rm -rf"], undefined);

console.log("✓ queues tests PASSED");
