import React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { FileText, Plus } from "lucide-react";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

interface RecentActivityProps {
  posts: ScheduledPost[];
  accountsById: Map<string, SocialAccount>;
}

export function RecentActivity({ posts, accountsById }: RecentActivityProps) {
  const latestPosts = posts.slice(0, 5);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
        <Link href="/publishing" className="text-xs text-muted-foreground hover:text-foreground">
          View all
        </Link>
      </div>

      {latestPosts.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No recent posts"
          hint="Create your first post or draft to start building your campaign feed."
          action={
            <Link
              href="/publishing/new"
              className="btn-primary text-xs px-3.5 py-2 inline-flex items-center gap-1.5 rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create post</span>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {latestPosts.map((post) => {
            const account = accountsById.get(post.social_account_id);
            const relativeTime = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

            return (
              <div
                key={post.id}
                className="p-3 rounded-xl border border-border/60 bg-panel/60 hover:bg-panel transition-all flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <PlatformBadge platform={account?.platform || "linkedin"} size="sm" />
                    <span className="text-[11px] text-muted-foreground truncate">
                      {account?.display_name || "Channel"}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground line-clamp-1">
                    {post.caption || "Untitled post"}
                  </p>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    {relativeTime}
                  </span>
                </div>

                <div className="shrink-0">
                  <StatusBadge status={post.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
