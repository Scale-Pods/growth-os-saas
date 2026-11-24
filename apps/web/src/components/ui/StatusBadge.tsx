import { Badge, type BadgeTone } from "./Badge";

export type PostStatus = "draft" | "in_review" | "approved" | "scheduled" | "publishing" | "published" | "failed" | "queued" | "running" | "done" | "canceled";

const MAP: Record<PostStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "grey", label: "Draft" },
  in_review: { tone: "orange", label: "In review" },
  approved: { tone: "green", label: "Approved" },
  scheduled: { tone: "blue", label: "Scheduled" },
  publishing: { tone: "blue", label: "Publishing" },
  published: { tone: "green", label: "Published" },
  failed: { tone: "orange", label: "Failed" },
  queued: { tone: "grey", label: "Queued" },
  running: { tone: "blue", label: "Running" },
  done: { tone: "green", label: "Done" },
  canceled: { tone: "grey", label: "Canceled" },
};

/** green = published/done, blue = scheduled/running, orange = failed/needs attention. */
export function StatusBadge({ status }: { status: PostStatus }) {
  const m = MAP[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
