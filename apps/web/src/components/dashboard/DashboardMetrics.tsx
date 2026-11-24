import React from "react";
import { MetricTile } from "@/components/ui/MetricTile";
import { CalendarDays, Send, AlertCircle, FileText } from "lucide-react";

interface DashboardMetricsProps {
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  draftCount: number;
}

export function DashboardMetrics({
  scheduledCount,
  publishedCount,
  failedCount,
  draftCount,
}: DashboardMetricsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricTile
        label="Scheduled"
        value={String(scheduledCount)}
        subtext="In publishing queue"
        accent="blue"
        icon={<CalendarDays className="w-4 h-4" />}
      />
      <MetricTile
        label="Published"
        value={String(publishedCount)}
        subtext="Active on channels"
        accent="green"
        icon={<Send className="w-4 h-4" />}
      />
      <MetricTile
        label="Needs Attention"
        value={String(failedCount)}
        subtext={failedCount > 0 ? "Failed dispatches" : "Zero delivery errors"}
        accent="orange"
        icon={<AlertCircle className="w-4 h-4" />}
      />
      <MetricTile
        label="Drafts"
        value={String(draftCount)}
        subtext="Engagement: Available after publish"
        accent="blue"
        icon={<FileText className="w-4 h-4" />}
      />
    </div>
  );
}
