import React from "react";
import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import type { ScheduledPost, SocialAccount } from "@growth-os/db";

interface ThisWeekStripProps {
  posts: ScheduledPost[];
  accountsById: Map<string, SocialAccount>;
}

export function ThisWeekStrip({ posts, accountsById }: ThisWeekStripProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate next 7 days: today through today + 6
  const next7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Group scheduled posts by YYYY-MM-DD
  const postsByDay = new Map<string, ScheduledPost[]>();
  for (const p of posts) {
    if (p.status !== "scheduled" || !p.scheduled_for) continue;
    const dateKey = p.scheduled_for.slice(0, 10);
    const existing = postsByDay.get(dateKey) || [];
    existing.push(p);
    postsByDay.set(dateKey, existing);
  }

  const daysData = next7Days.map((date, idx) => {
    const dateKey = date.toISOString().slice(0, 10);
    const dayPosts = postsByDay.get(dateKey) || [];
    const isToday = idx === 0;

    return {
      date,
      dateKey,
      dayName: dayNames[date.getDay()],
      dateNumber: date.getDate(),
      isToday,
      posts: dayPosts,
    };
  });

  const totalThisWeek = daysData.reduce((acc, d) => acc + d.posts.length, 0);

  // Find next upcoming scheduled post
  const nextScheduled = posts
    .filter((p) => p.status === "scheduled" && p.scheduled_for)
    .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())[0];

  const nextAccount = nextScheduled ? accountsById.get(nextScheduled.social_account_id) : undefined;

  return (
    <Card className="flex flex-col justify-between space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 text-primary flex items-center justify-center">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">This Week</h2>
            <p className="text-xs text-muted-foreground">7-day upcoming release schedule</p>
          </div>
        </div>
        <Link
          href="/calendar"
          className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
        >
          Full calendar <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 7-Day Strip Columns */}
      <div className="grid grid-cols-7 gap-2">
        {daysData.map((d) => (
          <div
            key={d.dateKey}
            className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center justify-between min-h-[110px] transition-all ${
              d.isToday
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-border/60 bg-panel/50 hover:bg-panel"
            }`}
          >
            <div className="text-center">
              <div
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  d.isToday ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {d.dayName}
              </div>
              <div className="text-xs font-semibold text-foreground mt-0.5">
                {d.dateNumber}
              </div>
              {d.isToday && (
                <span className="text-[9px] text-primary font-medium block">Today</span>
              )}
            </div>

            {d.posts.length > 0 ? (
              <div className="w-full flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-foreground">
                  {d.posts.length}
                </span>
                <div className="flex flex-wrap justify-center gap-1">
                  {d.posts.map((p) => {
                    const acc = accountsById.get(p.social_account_id);
                    return (
                      <PlatformBadge
                        key={p.id}
                        platform={acc?.platform || "linkedin"}
                        size="sm"
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/50">None</span>
            )}
          </div>
        ))}
      </div>

      {/* Next scheduled info strip or empty hint */}
      <div className="p-3.5 rounded-xl bg-fill-tertiary border border-border/60 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {nextScheduled ? (
          <>
            <span className="truncate max-w-sm">
              Next up: {nextScheduled.caption.slice(0, 50)}...
              {nextAccount ? ` on ${nextAccount.display_name}` : ""}
            </span>
            <span className="font-semibold text-foreground shrink-0">
              {new Date(nextScheduled.scheduled_for!).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </>
        ) : (
          <>
            <span>{totalThisWeek === 0 ? "No posts scheduled for the next 7 days." : "Queue ready."}</span>
            <Link href="/publishing/new" className="font-semibold text-primary hover:underline">
              Schedule a post &rarr;
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}
