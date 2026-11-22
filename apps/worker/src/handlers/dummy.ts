import { AppError } from "@growth-os/shared";
import type { Handler } from "../runner";

interface DummyInput {
  steps?: number;
  stepMs?: number;
  /** Test switch: make the job fail with a readable message. */
  fail?: boolean;
}

/**
 * Proof-of-life job for the platform: reports progress, finishes, and can be told to fail.
 * Used by the "Run a test job" button and by the acceptance checks. It calls no provider and costs nothing.
 */
export const dummyHandler: Handler = async ({ job, heartbeat }) => {
  const input = (job.input_ref ?? {}) as DummyInput;
  const steps = Math.min(Math.max(input.steps ?? 5, 1), 60);
  const stepMs = Math.min(Math.max(input.stepMs ?? 1000, 0), 5000);

  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, stepMs));
    await heartbeat({ percent: Math.round((i / steps) * 100), label: `Step ${i} of ${steps}` });
    if (input.fail && i === Math.ceil(steps / 2)) {
      throw new AppError("PROVIDER_ERROR", "This is the test failure you asked for. Nothing was charged.", 502);
    }
  }
  return { output: { message: "Test job finished", steps } };
};
