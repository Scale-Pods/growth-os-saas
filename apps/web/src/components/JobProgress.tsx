"use client";

import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { JOB_ETA_SECONDS } from "@growth-os/shared";
import { useJob } from "@/lib/use-job";

function eta(kind: string, percent: number): string | null {
  const total = JOB_ETA_SECONDS[kind];
  if (!total) return null;
  const left = Math.max(0, Math.round(total * (1 - percent / 100)));
  if (left < 5) return "almost done";
  return left >= 90 ? `about ${Math.round(left / 60)} min left (estimate)` : `about ${left}s left (estimate)`;
}

interface JobProgressProps {
  jobId: string;
  label?: string;
  onRetry?: () => void;
}

/** Live progress for one job: label, percent, estimated time left, queued state, and a failed state with the reason. */
export function JobProgress({ jobId, label, onRetry }: JobProgressProps) {
  const { job, error } = useJob(jobId);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!job) return <p className="text-xs text-muted-foreground">Loading status…</p>;

  const percent = Math.min(100, Math.max(0, Number(job.progress?.percent ?? (job.status === "done" ? 100 : 0))));
  const step = typeof job.progress?.label === "string" ? job.progress.label : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {job.status === "done" && <CheckCircle2 className="h-4 w-4 text-primary" />}
        {job.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
        {job.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {job.status === "queued" && <Clock className="h-4 w-4 text-muted-foreground" />}
        <span>{label ?? job.kind}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground capitalize">{job.status}</span>
      </div>

      {(job.status === "running" || job.status === "queued" || job.status === "done") && (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill-tertiary" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>
              {job.status === "queued" ? "Waiting in line…" : step ?? (job.status === "done" ? "Finished" : "Working…")}
            </span>
            <span>{job.status === "running" ? eta(job.kind, percent) : job.status === "done" ? "100%" : null}</span>
          </div>
        </>
      )}

      {job.status === "failed" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-destructive">{job.error_message ?? "This job failed."}</p>
          {onRetry && (
            <button onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-fill-tertiary">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
