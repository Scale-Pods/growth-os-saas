import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Badge } from "@/components/ui/Badge";
import { Share2, Plus } from "lucide-react";
import type { SocialAccount } from "@growth-os/db";

interface ConnectedPlatformsProps {
  accounts: SocialAccount[];
}

export function ConnectedPlatforms({ accounts }: ConnectedPlatformsProps) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Connected Channels</h2>
        <Link
          href="/settings/channels"
          className="text-xs text-primary hover:underline font-medium"
        >
          Manage
        </Link>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Share2 className="w-6 h-6" />}
          title="No channels connected"
          hint="Connect your first social channel to begin automated publishing."
          action={
            <Link
              href="/settings/channels"
              className="btn-primary text-xs px-3.5 py-2 inline-flex items-center gap-1.5 rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect channel</span>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {accounts.map((account) => {
            const isNeedsReconnect = account.status === "needs_reconnect";
            const isActive = account.status === "active";

            return (
              <div
                key={account.id}
                className="p-3.5 rounded-2xl border border-border/70 bg-gradient-to-r from-card to-card/90 hover:border-primary/40 hover:shadow-md transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PlatformBadge platform={account.platform} size="sm" />
                  <div className="truncate">
                    <div className="text-xs font-bold text-foreground truncate">
                      {account.display_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground capitalize font-medium">
                      {account.platform}
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {isActive && (
                    <Badge tone="green" className="text-[10px] px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Active
                    </Badge>
                  )}
                  {isNeedsReconnect && (
                    <Badge tone="orange" className="text-[10px] px-2 py-0.5">
                      Needs reconnect
                    </Badge>
                  )}
                  {!isActive && !isNeedsReconnect && (
                    <Badge tone="grey" className="text-[10px] px-2 py-0.5">
                      Disconnected
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
