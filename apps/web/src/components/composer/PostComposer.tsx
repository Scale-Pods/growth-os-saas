"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  Calendar,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Globe,
  Hash,
  X,
  FileText,
  Send,
} from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { useToast } from "@/components/ui/Toast";
import {
  PLATFORM_LIMITS,
  validatePostContent,
  type PlatformKey,
  type MediaKindKey,
} from "@growth-os/shared";
import type { SocialAccount } from "@growth-os/db";

interface PostComposerProps {
  accounts: SocialAccount[];
  brandId: string;
  brandName: string;
}

interface AttachedMedia {
  id: string;
  name: string;
  kind: MediaKindKey;
}

export function PostComposer({ accounts, brandName }: PostComposerProps) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>(
    accounts.length > 0 ? [accounts[0]!.id] : []
  );
  const [caption, setCaption] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mode, setMode] = useState<"draft" | "schedule">("schedule");
  const [mediaList, setMediaList] = useState<AttachedMedia[]>([]);

  // Timezone and Min Schedule Time (at least 5 minutes ahead)
  const [timeZone, setTimeZone] = useState("UTC");
  const [minDateTime, setMinDateTime] = useState("");
  const [scheduledDateTime, setScheduledDateTime] = useState("");

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {
      setTimeZone("UTC");
    }

    // Set initial schedule time to now + 15 minutes
    const future = new Date(Date.now() + 15 * 60 * 1000);
    const min = new Date(Date.now() + 5 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setMinDateTime(toLocalISO(min));
    setScheduledDateTime(toLocalISO(future));
  }, []);

  const fullText = caption + (hashtags.length > 0 ? "\n\n" + hashtags.join(" ") : "");
  const mediaKinds = mediaList.map((m) => m.kind);

  // Selected accounts list
  const selectedAccounts = accounts.filter((a) => selectedIds.includes(a.id));

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAddHashtag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      const tag = hashtagInput.trim().replace(/^#/, "");
      if (tag && !hashtags.includes(`#${tag}`)) {
        setHashtags((prev) => [...prev, `#${tag}`]);
        setHashtagInput("");
      }
    }
  };

  const removeHashtag = (tag: string) => {
    setHashtags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSimulateMediaUpload = (kind: MediaKindKey) => {
    const id = `media-${Date.now()}`;
    const newMedia: AttachedMedia = {
      id,
      name: `${kind === "image" ? "Campaign_Graphic" : kind === "video" ? "Promo_Reel" : "Pitch_Deck"}_${mediaList.length + 1}.${kind === "pdf" ? "pdf" : kind === "video" ? "mp4" : "png"}`,
      kind,
    };
    setMediaList((prev) => [...prev, newMedia]);
  };

  const handleRemoveMedia = (id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id));
  };

  // Check validation per selected platform
  const platformStatuses = selectedAccounts.map((account) => {
    const platform = account.platform as PlatformKey;
    const rule = PLATFORM_LIMITS[platform] || {
      captionMax: 3000,
      label: account.display_name,
      requiresMedia: false,
    };
    const currentLen = fullText.length;
    const isOverLimit = currentLen > rule.captionMax;
    const check = validatePostContent(platform, fullText, mediaKinds);

    return {
      account,
      platform,
      rule,
      currentLen,
      isOverLimit,
      check,
    };
  });

  const anyOverLimit = platformStatuses.some((ps) => ps.isOverLimit);
  const isTimeTooSoon =
    mode === "schedule" &&
    Boolean(scheduledDateTime && minDateTime && scheduledDateTime < minDateTime);

  const canSubmitSchedule =
    selectedAccounts.length > 0 &&
    !anyOverLimit &&
    !isTimeTooSoon &&
    (fullText.trim().length > 0 || mediaList.length > 0);

  const handleAction = (actionMode: "draft" | "schedule") => {
    toast.notify(
      actionMode === "draft"
        ? "Draft saving: Not connected yet."
        : `Post scheduling: Not connected yet.`,
      "success"
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 pb-16">
      {/* LEFT COLUMN: Controls & Input */}
      <div className="space-y-6">
        {/* Step 1: Channel Selector */}
        <div className="card p-5 border border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              1. Select Distribution Channels
            </label>
            <Link
              href="/settings/channels"
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Manage channels
            </Link>
          </div>

          {accounts.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-border/80 text-center text-xs text-muted-foreground">
              No channels connected for this brand.{" "}
              <Link href="/settings/channels" className="text-primary hover:underline font-semibold">
                Connect a channel
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {accounts.map((account) => {
                const isSelected = selectedIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => toggleAccount(account.id)}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2.5 text-left transition-all duration-150 ${
                      isSelected
                        ? "border-primary/60 bg-gradient-to-r from-primary/15 to-primary/5 shadow-sm ring-1 ring-primary/30"
                        : "border-border/70 bg-panel/50 hover:bg-panel hover:border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
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

                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-ctaText shadow-sm"
                          : "border-border"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2: Caption with Live Character Counters */}
        <div className="card p-5 border border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="composer-caption"
              className="text-xs font-bold text-foreground uppercase tracking-wider"
            >
              2. Write Caption
            </label>
          </div>

          <textarea
            id="composer-caption"
            rows={6}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write your high-converting copy, hook, and call to action..."
            className="w-full p-3.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm leading-relaxed transition-all resize-y"
          />

          {/* Live Character Counters per selected platform */}
          {selectedAccounts.length > 0 && (
            <div className="p-3 rounded-xl bg-fill-quaternary border border-glass-border space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Platform Character Counters
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {platformStatuses.map((ps) => (
                  <div
                    key={ps.account.id}
                    className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-1.5 ${
                      ps.isOverLimit
                        ? "border-destructive/40 bg-destructive/10 text-destructive font-bold"
                        : "border-border/60 bg-panel text-foreground"
                    }`}
                  >
                    <span className="capitalize text-[11px] truncate">
                      {ps.account.platform}
                    </span>
                    <span className="font-mono text-[11px] shrink-0">
                      {ps.currentLen} / {ps.rule.captionMax.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* Validation Messages from validatePostContent */}
              {platformStatuses.some((ps) => !ps.check.ok) && (
                <div className="space-y-1 pt-1">
                  {platformStatuses
                    .filter((ps) => !ps.check.ok)
                    .map((ps) => (
                      <div
                        key={ps.account.id}
                        className="text-[11px] text-destructive flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{(!ps.check.ok && ps.check.message) || ""}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Hashtag Tag Input */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-primary" />
              <span>Add Hashtags</span>
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-primary/10 text-primary border border-primary/20"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeHashtag(tag)}
                    className="hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={handleAddHashtag}
                placeholder="Type tag & press Enter..."
                className="px-2.5 py-1 text-xs rounded-lg border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/40 min-w-[140px]"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Attach Media */}
        <div className="card p-5 border border-border/60 space-y-3">
          <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
            3. Attach Media
          </label>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSimulateMediaUpload("image")}
              className="p-3 rounded-xl border border-dashed border-border/80 bg-panel/40 hover:bg-panel hover:border-primary/40 transition-all flex flex-col items-center justify-center gap-1 text-center"
            >
              <ImageIcon className="w-4 h-4 text-primary" />
              <span className="text-[11px] font-semibold text-foreground">+ Image</span>
            </button>
            <button
              type="button"
              onClick={() => handleSimulateMediaUpload("video")}
              className="p-3 rounded-xl border border-dashed border-border/80 bg-panel/40 hover:bg-panel hover:border-primary/40 transition-all flex flex-col items-center justify-center gap-1 text-center"
            >
              <Upload className="w-4 h-4 text-secondary" />
              <span className="text-[11px] font-semibold text-foreground">+ Video</span>
            </button>
            <button
              type="button"
              onClick={() => handleSimulateMediaUpload("pdf")}
              className="p-3 rounded-xl border border-dashed border-border/80 bg-panel/40 hover:bg-panel hover:border-primary/40 transition-all flex flex-col items-center justify-center gap-1 text-center"
            >
              <FileText className="w-4 h-4 text-destructive" />
              <span className="text-[11px] font-semibold text-foreground">+ PDF Carousel</span>
            </button>
          </div>

          {/* Uploaded media chips */}
          {mediaList.length > 0 && (
            <div className="space-y-1.5 pt-2">
              {mediaList.map((m) => (
                <div
                  key={m.id}
                  className="p-2 rounded-lg border border-border/60 bg-panel flex items-center justify-between text-xs"
                >
                  <span className="truncate text-foreground font-medium">{m.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(m.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 4: Schedule / Save Draft Controls */}
        <div className="card p-5 border border-border/60 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              4. Delivery Schedule
            </label>
            <div className="flex items-center gap-1.5 bg-panel p-1 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  mode === "schedule"
                    ? "bg-primary text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setMode("draft")}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  mode === "draft"
                    ? "bg-primary text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Draft
              </button>
            </div>
          </div>

          {mode === "schedule" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Release Date & Time</span>
                </span>
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  <Globe className="w-3 h-3 text-secondary" />
                  <span>{timeZone}</span>
                </span>
              </div>

              <input
                type="datetime-local"
                min={minDateTime}
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-panel text-foreground text-xs font-mono focus:outline-none focus:ring-2 transition-all ${
                  isTimeTooSoon
                    ? "border-destructive text-destructive focus:ring-destructive/40"
                    : "border-border focus:ring-primary/40"
                }`}
              />

              {isTimeTooSoon && (
                <div className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Release time must be at least 5 minutes in the future.</span>
                </div>
              )}
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleAction("draft")}
              className="w-full sm:w-auto btn-ghost text-xs px-5 py-2.5 rounded-xl border border-border inline-flex items-center justify-center gap-2"
            >
              <span>Save draft</span>
            </button>

            <button
              type="button"
              disabled={!canSubmitSchedule && mode === "schedule"}
              onClick={() => handleAction(mode)}
              className="w-full sm:flex-1 btn-primary text-xs px-5 py-2.5 rounded-xl font-bold shadow-md inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {mode === "schedule" ? "Schedule across channels" : "Save as draft"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Live Responsive Platform Preview Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Live Platform Preview</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            {selectedAccounts.length} preview {selectedAccounts.length === 1 ? "card" : "cards"}
          </span>
        </div>

        {selectedAccounts.length === 0 ? (
          <div className="card p-8 text-center text-xs text-muted-foreground border-dashed border-border/80">
            Select one or more channels to preview your post.
          </div>
        ) : (
          <div className="space-y-6">
            {selectedAccounts.map((account) => {
              const platform = account.platform;

              return (
                <div
                  key={account.id}
                  className="card p-5 border border-border/70 bg-card/90 shadow-sm space-y-3"
                >
                  {/* Platform Card Header */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                        {brandName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          {account.display_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <PlatformBadge platform={platform} size="sm" />
                          <span>&bull; Just now</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Caption Content */}
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {fullText || (
                      <span className="text-muted-foreground/60 italic">
                        Post caption preview will render here...
                      </span>
                    )}
                  </p>

                  {/* Platform-Specific Media Container Aspect Ratio */}
                  <div
                    className={`w-full rounded-xl bg-panel border border-border/60 flex items-center justify-center text-muted-foreground text-xs overflow-hidden ${
                      platform === "instagram"
                        ? "aspect-square"
                        : platform === "youtube"
                        ? "aspect-video"
                        : "aspect-[1.91/1]"
                    }`}
                  >
                    {mediaList.length > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <ImageIcon className="w-6 h-6 text-primary" />
                        <span className="font-semibold text-foreground">
                          {mediaList[0]!.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({platform === "instagram" ? "Square 1:1" : "Wide 1.91:1"})
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                        <ImageIcon className="w-6 h-6" />
                        <span>Media placeholder ({platform})</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
