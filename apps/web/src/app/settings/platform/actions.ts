"use server";

import { z } from "zod";
import { withOrgAction } from "@/lib/api/with-org";
import { createJob } from "@/lib/api/jobs";

const input = z.object({ fail: z.boolean().optional(), steps: z.number().int().min(1).max(60).optional() }).strict();

/** Starts a harmless proof-of-life job. Owners and admins only (the `settings` feature at full level). */
export const runTestJobAction = withOrgAction({ feature: "team", level: "full", input }, async (ctx, i) => {
  const { jobId } = await createJob(ctx, {
    kind: "dummy",
    input: { fail: i.fail ?? false, steps: i.steps ?? 8, stepMs: 1000 },
  });
  return { jobId };
});
