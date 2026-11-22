import assert from "node:assert/strict";
import { AppError } from "@growth-os/shared";
import { runJob, RetryableJobError, type JobRow, type JobStore } from "../src/runner";

function makeStore(rows: JobRow[], running = 0) {
  const state = {
    rows: new Map(rows.map((r) => [r.id, { ...r }])),
    runningInOrg: running,
    released: [] as string[],
    progress: [] as unknown[],
    heartbeats: 0,
    output: new Map<string, unknown>(),
    error: new Map<string, { code: string; message: string }>(),
  };
  const store: JobStore = {
    async load(id) {
      return state.rows.get(id) ?? null;
    },
    async countRunning() {
      return state.runningInOrg;
    },
    async markRunning(id) {
      const r = state.rows.get(id)!;
      if (r.status !== "queued") return false;
      r.status = "running";
      return true;
    },
    async heartbeat(_id, progress) {
      state.heartbeats++;
      state.progress.push(progress);
    },
    async markDone(id, output) {
      state.rows.get(id)!.status = "done";
      state.output.set(id, output);
    },
    async markFailed(id, code, message) {
      state.rows.get(id)!.status = "failed";
      state.error.set(id, { code, message });
    },
    async markQueued(id) {
      state.rows.get(id)!.status = "queued";
    },
    async releaseCredits(_org, id) {
      state.released.push(id);
    },
  };
  return { state, store };
}

const row = (id: string, status: JobRow["status"] = "queued"): JobRow => ({
  id,
  org_id: "org-1",
  brand_id: null,
  kind: "dummy",
  status,
  input_ref: null,
  created_by: "user-1",
});
const quietLog = { info() {}, warn() {}, error() {} };

async function main() {
  // done: the handler runs once, progress is written, the row ends as done with output
  {
    const { state, store } = makeStore([row("j1")]);
    const requeued: string[] = [];
    const res = await runJob(
      { store, requeue: async (id) => void requeued.push(id), log: quietLog },
      { jobId: "j1", gated: true, attempt: { isLast: false } },
      async (ctx) => {
        await ctx.heartbeat({ percent: 50 });
        return { output: { ok: true } };
      },
    );
    assert.equal(res, "done");
    assert.equal(state.rows.get("j1")!.status, "done");
    assert.deepEqual(state.output.get("j1"), { ok: true });
    assert.deepEqual(state.progress, [{ percent: 50 }]);
    assert.deepEqual(state.released, [], "no release on success");
  }

  // a human-readable failure is written to the row and credits are released; nothing is swallowed
  {
    const { state, store } = makeStore([row("j2")]);
    const res = await runJob(
      { store, requeue: async () => {}, log: quietLog },
      { jobId: "j2", gated: true, attempt: { isLast: false } },
      async () => {
        throw new AppError("PROVIDER_ERROR", "The render service did not respond; nothing was charged", 502);
      },
    );
    assert.equal(res, "failed");
    assert.equal(state.rows.get("j2")!.status, "failed");
    assert.deepEqual(state.error.get("j2"), { code: "PROVIDER_ERROR", message: "The render service did not respond; nothing was charged" });
    assert.deepEqual(state.released, ["j2"]);
  }

  // an unexpected error never leaks internals into the row, but still fails it with a reason
  {
    const { state, store } = makeStore([row("j3")]);
    await runJob(
      { store, requeue: async () => {}, log: quietLog },
      { jobId: "j3", gated: true, attempt: { isLast: false } },
      async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");
      },
    );
    const e = state.error.get("j3")!;
    assert.equal(e.code, "INTERNAL_ERROR");
    assert.ok(!e.message.includes("hunter2") && !e.message.includes("10.0.0.5"), "no internals in the user-visible message");
    assert.ok(e.message.length > 10);
  }

  // idempotent: a finished job is never run again
  {
    const { store } = makeStore([row("j4", "done")]);
    let ran = false;
    const res = await runJob(
      { store, requeue: async () => {}, log: quietLog },
      { jobId: "j4", gated: true, attempt: { isLast: false } },
      async () => {
        ran = true;
        return {};
      },
    );
    assert.equal(res, "skipped");
    assert.equal(ran, false);
  }

  // per-org concurrency cap: with 2 already running, the third waits (stays queued) and is requeued later
  {
    const { state, store } = makeStore([row("j5")], 2);
    const requeued: Array<[string, number]> = [];
    let ran = false;
    const res = await runJob(
      { store, requeue: async (id, delay) => void requeued.push([id, delay]), log: quietLog },
      { jobId: "j5", gated: true, attempt: { isLast: false } },
      async () => {
        ran = true;
        return {};
      },
    );
    assert.equal(res, "requeued");
    assert.equal(ran, false);
    assert.equal(state.rows.get("j5")!.status, "queued");
    assert.equal(requeued.length, 1);
    assert.ok(requeued[0]![1] > 0);
  }

  // an ungated queue (e.g. dummy / render) ignores the AI per-org cap
  {
    const { store } = makeStore([row("j6")], 5);
    const res = await runJob(
      { store, requeue: async () => {}, log: quietLog },
      { jobId: "j6", gated: false, attempt: { isLast: false } },
      async () => ({}),
    );
    assert.equal(res, "done");
  }

  // retryable error with attempts left: back to queued, error rethrown so the queue retries
  {
    const { state, store } = makeStore([row("j7")]);
    await assert.rejects(
      runJob(
        { store, requeue: async () => {}, log: quietLog },
        { jobId: "j7", gated: true, attempt: { isLast: false } },
        async () => {
          throw new RetryableJobError("provider 503");
        },
      ),
      /provider 503/,
    );
    assert.equal(state.rows.get("j7")!.status, "queued");
    assert.deepEqual(state.released, [], "credits stay reserved while a retry is coming");
  }

  // retryable error on the last attempt: failed with a reason and credits released
  {
    const { state, store } = makeStore([row("j8")]);
    const res = await runJob(
      { store, requeue: async () => {}, log: quietLog },
      { jobId: "j8", gated: true, attempt: { isLast: true } },
      async () => {
        throw new RetryableJobError("provider 503");
      },
    );
    assert.equal(res, "failed");
    assert.equal(state.rows.get("j8")!.status, "failed");
    assert.deepEqual(state.released, ["j8"]);
    assert.ok(state.error.get("j8")!.message.length > 10);
  }

  // a row that does not exist is reported, not crashed on
  {
    const { store } = makeStore([]);
    const res = await runJob(
      { store, requeue: async () => {}, log: quietLog },
      { jobId: "missing", gated: true, attempt: { isLast: false } },
      async () => ({}),
    );
    assert.equal(res, "skipped");
  }

  console.log("✓ worker runner tests PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
