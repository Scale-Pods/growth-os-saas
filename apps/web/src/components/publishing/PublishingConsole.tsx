"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  RotateCw,
  Calendar,
  XCircle,
  AlertCircle,
  FileText,
  Clock,
  Plus,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { retryPostAction, cancelPostAction, reschedulePostAction } from "@/app/publishing/actions";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

export interface PublishingPostItem extends ScheduledPost {
  account?: SocialAccount;
  error?: string | null;
}

interface PublishingConsoleProps {
  posts: PublishingPostItem[];
}

type FilterTab = "all" | "published" | "scheduled" | "failed" | "draft";

export function PublishingConsole({ posts }: PublishingConsoleProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedPost, setSelectedPost] = useState<PublishingPostItem | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const toast = useToast();

  // Tab counts
  const counts = {
    all: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    failed: posts.filter((p) => p.status === "failed").length,
    draft: posts.filter((p) => p.status === "draft").length,
  };

  const filteredPosts = posts.filter((p) => {
    if (activeTab === "all") return true;
    return p.status === activeTab;
  });

  const handleRetry = async (postId: string) => {
    setActionPending(true);
    try {
      const res = await retryPostAction({ id: postId });
      if (res.ok) {
        toast.notify("Post release has been dispatched to the publishing scheduler.", "success");
        setSelectedPost(null);
      } else {
        toast.notify(res.error.message, "error");
      }
    } catch {
      toast.notify("An unexpected error occurred while retrying.", "error");
    } finally {
      setActionPending(false);
    }
  };

  const handleCancel = async (postId: string) => {
    setActionPending(true);
    try {
      const res = await cancelPostAction({ id: postId });
      if (res.ok) {
        toast.notify("The scheduled post has been canceled.", "success");
        setSelectedPost(null);
      } else {
        toast.notify(res.error.message, "error");
      }
    } catch {
      toast.notify("An unexpected error occurred while canceling.", "error");
    } finally {
      setActionPending(false);
    }
  };

  const handleReschedule = async (postId: string) => {
    // 24 hours from now default stub for instant reschedule
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setActionPending(true);
    try {
      const res = await reschedulePostAction({ id: postId, scheduledFor: tomorrow });
      if (res.ok) {
        toast.notify("Post rescheduled for 24 hours from now.", "success");
        setSelectedPost(null);
      } else {
        toast.notify(res.error.message, "error");
      }
    } catch {
      toast.notify("An unexpected error occurred while rescheduling.", "error");
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-panel border border-border/60 overflow-x-auto max-w-full">
          {(
            [
              { key: "all", label: "All", count: counts.all },
              { key: "published", label: "Published", count: counts.published },
              { key: "scheduled", label: "Scheduled", count: counts.scheduled },
              { key: "failed", label: "Failed", count: counts.failed },
              { key: "draft", label: "Drafts", count: counts.draft },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-fill-tertiary"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive
                      ? "bg-background/20 text-background"
                      : "bg-fill-secondary text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <Link
          href="/publishing/new"
          className="btn-primary text-xs px-3.5 py-2 inline-flex items-center gap-1.5 rounded-xl shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Post</span>
        </Link>
      </div>

      {/* Grid of Post Tiles */}
      {filteredPosts.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title={`No ${activeTab === "all" ? "" : activeTab} posts`}
          hint={
            activeTab === "failed"
              ? "All recent deliveries succeeded without errors."
              : activeTab === "published"
              ? "Posts will appear here once they are published to your channels."
              : "Create a post or draft to start building your campaign queue."
          }
          action={
            <Link
              href="/publishing/new"
              className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 rounded-xl shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create post</span>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPosts.map((post) => {
            const hasMedia = Array.isArray(post.media) && post.media.length > 0;
            const timeStr = post.scheduled_for || post.published_at || post.created_at;
            const formattedTime = new Date(timeStr).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="card p-5 hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between group space-y-4 bg-gradient-to-b from-card to-card/90"
              >
                <div className="space-y-3.5">
                  {/* Top Bar: Platform & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlatformBadge platform={post.account?.platform || "linkedin"} size="sm" />
                      <span className="text-xs font-bold text-foreground truncate">
                        {post.account?.display_name || "Channel"}
                      </span>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>

                  {/* Image Placeholder */}
                  <div className="w-full h-36 rounded-xl bg-panel/70 border border-border/70 flex items-center justify-center text-muted-foreground relative overflow-hidden group-hover:border-primary/30 transition-all shadow-inner">
                    {hasMedia ? (
                      <div className="flex items-center gap-2 text-xs text-foreground font-medium">
                        <ImageIcon className="w-5 h-5 text-primary" />
                        <span>{post.media.length} attached {post.media.length === 1 ? "asset" : "assets"}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground/60">
                        <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                        <span className="font-medium text-[11px]">Text Post</span>
                      </div>
                    )}
                  </div>

                  {/* Caption snippet */}
                  <p className="text-xs text-foreground/90 line-clamp-3 leading-relaxed group-hover:text-foreground transition-colors">
                    {post.caption || "No caption text"}
                  </p>
                </div>

                {/* Footer Time & Error hint */}
                <div className="pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <div className="flex items-center gap-1.5 font-sans">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                    <span>{formattedTime}</span>
                  </div>

                  {post.status === "failed" && (
                    <span className="text-destructive font-semibold flex items-center gap-1 font-sans">
                      <AlertCircle className="w-3 h-3" />
                      Failed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL / PREVIEW MODAL */}
      {selectedPost && (
        <Modal
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          title="Post Details & Controls"
          size="lg"
        >
          <div className="space-y-5 pt-2">
            {/* Header info */}
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-panel/60 border border-border/60">
              <div className="flex items-center gap-2.5">
                <PlatformBadge
                  platform={selectedPost.account?.platform || "linkedin"}
                  size="md"
                />
                <div>
                  <div className="text-xs font-bold text-foreground">
                    {selectedPost.account?.display_name || "Connected Channel"}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">
                    {selectedPost.account?.platform || "Platform"}
                  </div>
                </div>
              </div>

              <StatusBadge status={selectedPost.status} />
            </div>

            {/* Error Message if failed */}
            {selectedPost.status === "failed" && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Delivery Failure Reason</span>
                </div>
                <p className="text-xs leading-relaxed">
                  {selectedPost.last_error_message ||
                    selectedPost.error ||
                    "Authentication expired or API rate limit exceeded. Please reconnect channel."}
                </p>
              </div>
            )}

            {/* Full Caption */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                Caption
              </div>
              <div className="p-4 rounded-xl border border-border/60 bg-panel text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {selectedPost.caption || "No caption text"}
              </div>
            </div>

            {/* Live Link if post_url exists */}
            {selectedPost.post_url && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Live on platform</span>
                </div>
                <a
                  href={selectedPost.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>Open live post</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Actions for different states */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border/40">
              <div className="text-xs text-muted-foreground">
                {selectedPost.scheduled_for
                  ? `Scheduled: ${new Date(selectedPost.scheduled_for).toLocaleString()}`
                  : `Created: ${new Date(selectedPost.created_at).toLocaleDateString()}`}
              </div>

              <div className="flex items-center gap-2">
                {selectedPost.status === "failed" && (
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => handleRetry(selectedPost.id)}
                    className="btn-primary text-xs px-3.5 py-2 inline-flex items-center gap-1.5 rounded-xl shadow-sm"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${actionPending ? "animate-spin" : ""}`} />
                    <span>Retry Dispatch</span>
                  </button>
                )}

                {selectedPost.status === "scheduled" && (
                  <>
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={() => handleReschedule(selectedPost.id)}
                      className="btn-ghost text-xs px-3.5 py-2 inline-flex items-center gap-1.5 rounded-xl border border-border"
                    >
                      <Calendar className="w-3.5 h-3.5 text-secondary" />
                      <span>Reschedule (+24h)</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={() => handleCancel(selectedPost.id)}
                      className="text-xs px-3.5 py-2 rounded-xl text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 border border-destructive/20"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel Post</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
