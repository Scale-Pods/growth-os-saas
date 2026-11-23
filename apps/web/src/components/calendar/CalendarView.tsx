"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertCircle,
  Share2,
  Calendar as CalendarIcon,
  Globe,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

export interface CalendarPostItem extends ScheduledPost {
  account?: SocialAccount;
  error?: string | null;
}

interface CalendarViewProps {
  posts: CalendarPostItem[];
  currentMonth: string; // "YYYY-MM"
}

export function CalendarView({ posts, currentMonth }: CalendarViewProps) {
  const router = useRouter();
  const [selectedPost, setSelectedPost] = useState<CalendarPostItem | null>(null);
  const [timeZone, setTimeZone] = useState<string>("UTC");

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {
      setTimeZone("UTC");
    }
  }, []);

  // Parse YYYY-MM
  const [yearStr, monthStr] = currentMonth.split("-");
  const year = parseInt(yearStr || "2026", 10);
  const month = parseInt(monthStr || "12", 10) - 1; // 0-indexed

  const monthDate = new Date(Date.UTC(year, month, 1));
  const monthName = monthDate.toLocaleString("default", { month: "long", year: "numeric", timeZone: "UTC" });

  // Navigation handlers
  const handlePrevMonth = () => {
    const prev = new Date(Date.UTC(year, month - 1, 1));
    const param = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(`/calendar?month=${param}`);
  };

  const handleNextMonth = () => {
    const next = new Date(Date.UTC(year, month + 1, 1));
    const param = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(`/calendar?month=${param}`);
  };

  const handleToday = () => {
    const now = new Date();
    const param = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/calendar?month=${param}`);
  };

  // Build calendar matrix
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group posts by day number (1 .. daysInMonth)
  const postsByDay = new Map<number, CalendarPostItem[]>();
  for (const post of posts) {
    const dateStr = post.scheduled_for || post.created_at;
    const postDate = new Date(dateStr);
    // Check if post belongs to this year and month in local time
    if (postDate.getFullYear() === year && postDate.getMonth() === month) {
      const dayNum = postDate.getDate();
      const existing = postsByDay.get(dayNum) || [];
      existing.push(post);
      postsByDay.set(dayNum, existing);
    }
  }

  // Format time in browser's timezone
  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Chip style helper
  const getChipStyle = (status: string) => {
    switch (status) {
      case "published":
        return "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25";
      case "scheduled":
        return "bg-secondary/15 text-secondary border-secondary/30 hover:bg-secondary/25";
      case "failed":
        return "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25";
      default:
        return "bg-fill-tertiary text-muted-foreground border-border/60 hover:bg-fill-secondary";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls: Month switcher, Timezone, and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-border bg-panel p-1">
            <button
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-fill-secondary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-semibold text-foreground hover:bg-fill-secondary rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              title="Next Month"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-fill-secondary transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-lg md:text-xl font-bold text-foreground">
            {monthName}
          </h2>
        </div>

        {/* Timezone badge & New Post button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-panel px-3 py-1.5 rounded-xl border border-border/60">
            <Globe className="w-3.5 h-3.5 text-secondary" />
            <span className="font-mono text-[11px]">{timeZone}</span>
          </div>

          <Link
            href="/publishing/new"
            className="btn-primary text-xs px-3.5 py-2 inline-flex items-center gap-1.5 rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Post</span>
          </Link>
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="w-8 h-8" />}
          title={`No posts scheduled for ${monthName}`}
          hint="Plan your editorial campaign and schedule your content ahead of time."
          action={
            <Link
              href="/publishing/new"
              className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 rounded-xl shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule a post</span>
            </Link>
          }
        />
      ) : (
        <>
          {/* DESKTOP / TABLET MONTH GRID (Hidden on phones < 640px) */}
          <div className="hidden sm:block rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-border/60 bg-panel/60 text-center text-xs font-bold text-muted-foreground py-2.5">
              {dayHeaders.map((dh) => (
                <div key={dh}>{dh}</div>
              ))}
            </div>

            {/* Day Cells Matrix */}
            <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/40">
              {/* Empty leading cells */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="min-h-[120px] p-2 bg-fill-quaternary/30"
                />
              ))}

              {/* Month days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dayPosts = postsByDay.get(dayNum) || [];
                const isToday =
                  new Date().getDate() === dayNum &&
                  new Date().getMonth() === month &&
                  new Date().getFullYear() === year;

                return (
                  <div
                    key={`day-${dayNum}`}
                    className={`min-h-[120px] p-2 flex flex-col justify-between transition-colors ${
                      isToday ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "hover:bg-fill-quaternary/40"
                    }`}
                  >
                    {/* Day number header & disabled Add button */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-xs font-semibold rounded-md px-1.5 py-0.5 ${
                          isToday
                            ? "bg-primary text-background font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {dayNum}
                      </span>

                      <button
                        type="button"
                        disabled
                        title="Coming soon"
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/50 hover:text-muted-foreground rounded cursor-not-allowed transition-opacity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Post Chips */}
                    <div className="flex-1 space-y-1.5 overflow-hidden">
                      {dayPosts.map((post) => {
                        const time = formatTime(post.scheduled_for);
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={() => setSelectedPost(post)}
                            className={`w-full text-left p-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 transition-all truncate ${getChipStyle(
                              post.status
                            )}`}
                          >
                            <PlatformBadge
                              platform={post.account?.platform || "linkedin"}
                              size="sm"
                              className="shrink-0"
                            />
                            <span className="truncate font-medium flex-1">
                              {post.caption || "Untitled post"}
                            </span>
                            {time && (
                              <span className="text-[9px] font-mono opacity-80 shrink-0">
                                {time}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MOBILE LIST VIEW (Shown on < 640px) */}
          <div className="sm:hidden space-y-3">
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dayPosts = postsByDay.get(dayNum) || [];
              if (dayPosts.length === 0) return null; // Only show days with posts on mobile

              const dayDate = new Date(year, month, dayNum);
              const dayName = dayHeaders[dayDate.getDay()];

              return (
                <div
                  key={`mobile-day-${dayNum}`}
                  className="card p-4 space-y-2.5 border border-border/60"
                >
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                        {dayNum}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {dayName}, {monthName} {dayNum}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {dayPosts.length} {dayPosts.length === 1 ? "post" : "posts"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dayPosts.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setSelectedPost(post)}
                        className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${getChipStyle(
                          post.status
                        )}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PlatformBadge
                            platform={post.account?.platform || "linkedin"}
                            size="sm"
                          />
                          <span className="text-xs font-medium truncate">
                            {post.caption || "Untitled post"}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono shrink-0">
                          {formatTime(post.scheduled_for)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* DETAIL MODAL */}
      {selectedPost && (
        <Modal
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          title="Scheduled Post Details"
          size="md"
        >
          <div className="space-y-4 pt-2">
            {/* Header info */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-panel/60 border border-border/60">
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

            {/* Scheduled time info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Clock className="w-3.5 h-3.5 text-secondary" />
              <span>
                {selectedPost.scheduled_for
                  ? `Scheduled for: ${new Date(selectedPost.scheduled_for).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })} (${timeZone})`
                  : `Created: ${new Date(selectedPost.created_at).toLocaleDateString()}`}
              </span>
            </div>

            {/* Error Message if failed */}
            {selectedPost.status === "failed" && (
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4" />
                  <span>Dispatch Failed</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {selectedPost.error ||
                    "Authentication expired or API rate limit exceeded. Please reconnect channel or retry."}
                </p>
              </div>
            )}

            {/* Caption */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                Post Caption
              </div>
              <div className="p-3.5 rounded-xl border border-border/60 bg-panel text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {selectedPost.caption || "No caption provided."}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Link
                href="/publishing"
                className="text-xs font-medium px-3.5 py-2 rounded-xl text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>View in Publishing Console</span>
                <Share2 className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
