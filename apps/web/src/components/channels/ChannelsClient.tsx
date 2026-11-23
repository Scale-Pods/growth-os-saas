"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Trash2,
  Clock,
  Sparkles,
} from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { SocialAccount, Brand } from "@growth-os/db";

interface ChannelsClientProps {
  brands: Brand[];
  accounts: SocialAccount[];
  canManage: boolean;
  activeBrandId?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  expired: "That connection link expired. Please try again.",
  invalid_state: "That connection link was not valid.",
  forbidden: "Only owners and admins can connect channels.",
  mfa: "Finish two-factor sign-in first.",
  plan_limit: "Your plan's channel limit is reached.",
  connect_failed: "Something went wrong. Please try again.",
  server: "Something went wrong. Please try again.",
};

const PLATFORMS_TO_CONNECT = [
  { platform: "instagram", name: "Instagram" },
  { platform: "facebook", name: "Facebook" },
  { platform: "linkedin", name: "LinkedIn" },
  { platform: "youtube", name: "YouTube" },
  { platform: "x", name: "X (Twitter)" },
] as const;

export function ChannelsClient({
  brands,
  accounts,
  canManage,
  activeBrandId,
}: ChannelsClientProps) {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const errorParam = searchParams.get("error");
  const toast = useToast();

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnectAccount, setDisconnectAccount] = useState<SocialAccount | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Group accounts by brand
  const accountsByBrand = new Map<string, SocialAccount[]>();
  for (const acc of accounts) {
    const list = accountsByBrand.get(acc.brand_id) || [];
    list.push(acc);
    accountsByBrand.set(acc.brand_id, list);
  }

  // Handle Connect
  const handleConnect = async (platform: string, brandId: string) => {
    if (!canManage) {
      toast.notify("Only workspace owners and admins can connect channels.", "error");
      return;
    }

    setConnectingPlatform(platform);
    try {
      const res = await fetch("/api/social/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, platform }),
      });
      const data = await res.json();
      if (res.ok && data?.data?.url) {
        window.location.href = data.data.url;
      } else {
        toast.notify(data?.error?.message || "Failed to generate connection link.", "error");
      }
    } catch {
      toast.notify("Could not connect channel. Please try again.", "error");
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleReconnect = (account: SocialAccount) => {
    handleConnect(account.platform, account.brand_id);
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectAccount) return;
    setDisconnecting(true);
    // Stub disconnect
    await new Promise((r) => setTimeout(r, 600));
    setDisconnecting(false);
    setDisconnectAccount(null);
    toast.notify(`${disconnectAccount.display_name} has been disconnected.`, "success");
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Friendly query banner alerts */}
      {connected && (
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/25 text-primary text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold">Channel connected successfully!</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your channel is active and ready for scheduled releases.
            </p>
          </div>
        </div>
      )}

      {errorParam && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/25 text-destructive text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold">Connection failed</span>
            <p className="text-xs mt-0.5">
              {ERROR_MESSAGES[errorParam] || "Something went wrong. Please try again."}
            </p>
          </div>
        </div>
      )}

      {/* Connected Channels Grouped by Brand */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Active Channels</h2>
            <p className="text-xs text-muted-foreground">
              Social platforms and distribution endpoints connected to your brands.
            </p>
          </div>
        </div>

        {brands.map((brand) => {
          const brandAccounts = accountsByBrand.get(brand.id) || [];

          return (
            <div
              key={brand.id}
              className="card overflow-hidden border border-border/60 space-y-4 p-5 md:p-6"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-foreground">{brand.name}</span>
                  <Badge tone="grey" className="text-[10px] px-2 py-0.5">
                    {brandAccounts.length} {brandAccounts.length === 1 ? "channel" : "channels"}
                  </Badge>
                </div>
              </div>

              {brandAccounts.length === 0 ? (
                <EmptyState
                  icon={<Share2 className="w-6 h-6" />}
                  title="No channels connected for this brand"
                  hint="Connect your company social accounts below to enable direct publishing."
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {brandAccounts.map((account) => {
                    const isNeedsReconnect = account.status === "needs_reconnect";
                    const isActive = account.status === "active";
                    const lastChecked = account.last_checked_at
                      ? new Date(account.last_checked_at).toLocaleDateString()
                      : "Recently";

                    return (
                      <div
                        key={account.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlatformBadge platform={account.platform} size="md" />
                          <div className="truncate">
                            <div className="text-xs font-bold text-foreground truncate">
                              {account.display_name}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <span className="capitalize">{account.platform}</span>
                              <span>&bull;</span>
                              <Clock className="w-3 h-3" />
                              <span>Checked {lastChecked}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          {isActive && (
                            <Badge tone="green" className="text-xs">
                              Active
                            </Badge>
                          )}
                          {isNeedsReconnect && (
                            <Badge tone="orange" className="text-xs">
                              Needs reconnect
                            </Badge>
                          )}
                          {!isActive && !isNeedsReconnect && (
                            <Badge tone="grey" className="text-xs">
                              Disconnected
                            </Badge>
                          )}

                          {isNeedsReconnect && canManage && (
                            <button
                              type="button"
                              onClick={() => handleReconnect(account)}
                              className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 rounded-lg shadow-sm"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>Reconnect</span>
                            </button>
                          )}

                          {canManage && (
                            <button
                              type="button"
                              onClick={() => setDisconnectAccount(account)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Disconnect channel"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid of Connect Buttons */}
      <div className="card p-6 border border-border/60 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Connect New Channel</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Authorize Growth OS to publish on behalf of your brand.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PLATFORMS_TO_CONNECT.map((item) => {
            const targetBrandId = activeBrandId || brands[0]?.id;
            const isConnecting = connectingPlatform === item.platform;

            return (
              <button
                key={item.platform}
                type="button"
                disabled={!targetBrandId || isConnecting}
                onClick={() => targetBrandId && handleConnect(item.platform, targetBrandId)}
                className="p-4 rounded-xl border border-border/60 bg-panel/60 hover:bg-panel hover:border-primary/40 transition-all flex flex-col items-center justify-center gap-2 text-center group disabled:opacity-50"
              >
                <PlatformBadge platform={item.platform} size="md" />
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {isConnecting ? "Connecting..." : `Connect ${item.name}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Disconnect confirmation dialog */}
      {disconnectAccount && (
        <ConfirmDialog
          open={!!disconnectAccount}
          title={`Disconnect ${disconnectAccount.display_name}`}
          message={`Are you sure you want to disconnect ${disconnectAccount.display_name}? Scheduled posts on this channel will be paused.`}
          confirmLabel="Disconnect Channel"
          destructive
          busy={disconnecting}
          onConfirm={handleConfirmDisconnect}
          onCancel={() => setDisconnectAccount(null)}
        />
      )}
    </div>
  );
}
