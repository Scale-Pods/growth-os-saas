"use client";

import { useState, useTransition } from "react";
import { JobProgress } from "@/components/JobProgress";
import { useToast } from "@/components/ui/Toast";
import { runTestJobAction } from "./actions";

export function PlatformClient() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { notify } = useToast();

  function run(fail: boolean) {
    start(async () => {
      const res = await runTestJobAction({ fail });
      if (res.ok) setJobId(res.data.jobId);
      else notify(res.error.message, "error");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() => run(false)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ctaText hover:opacity-90 disabled:opacity-50"
        >
          Run a test job
        </button>
        <button
          disabled={pending}
          onClick={() => run(true)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-fill-tertiary disabled:opacity-50"
        >
          Run a test job that fails
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Test jobs cost nothing. They prove the background worker, live progress and error reporting work.</p>
      {jobId && <JobProgress jobId={jobId} label="Test job" onRetry={() => run(false)} />}
    </div>
  );
}
