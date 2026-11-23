"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string | Date;
  readAt?: string | Date | null;
  href?: string;
}

export interface NotificationBellProps {
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
}

export function NotificationBell({
  notifications,
  onMarkAllRead,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((prev) => !prev)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center border border-border/80 bg-panel text-muted-foreground hover:text-foreground hover:bg-fill-secondary transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive animate-pulse" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notification list"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-border/60 flex items-center justify-between bg-card">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/15 text-destructive border border-destructive/25">
                  {unreadCount} new
                </span>
              )}
            </div>

            {notifications.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                onClick={() => onMarkAllRead()}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List or Empty State */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
            {notifications.length === 0 ? (
              <div className="py-8 px-4 text-center flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-fill-tertiary flex items-center justify-center text-muted-foreground border border-glass-border">
                  <CheckCheck className="w-5 h-5 text-primary" />
                </div>
                <div className="text-xs font-semibold text-foreground">
                  You&apos;re all caught up
                </div>
                <p className="text-[11px] text-muted-foreground max-w-[200px]">
                  No new notifications right now. Alerts will appear here.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const dateObj =
                  typeof item.createdAt === "string"
                    ? new Date(item.createdAt)
                    : item.createdAt;
                const timeAgo = formatDistanceToNow(dateObj, { addSuffix: true });
                const isUnread = !item.readAt;

                const content = (
                  <div
                    key={item.id}
                    className={`p-3.5 flex items-start gap-3 hover:bg-fill-quaternary transition-colors ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-fill-tertiary flex items-center justify-center text-primary shrink-0 mt-0.5 border border-glass-border">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {timeAgo}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                        {item.body}
                      </p>
                    </div>
                  </div>
                );

                return item.href ? (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block focus:outline-none focus:bg-fill-quaternary"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
