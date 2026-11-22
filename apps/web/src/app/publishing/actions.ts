"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, PLATFORM_LIMITS, validatePostContent, type MediaKindKey, type PlatformKey } from "@growth-os/shared";
import type { Json, ScheduledPost } from "@growth-os/db";
import { withOrgAction, type OrgContext } from "@/lib/api/with-org";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { kickPublishScheduler } from "@/lib/server-only/queue";

const uuid = z.string().uuid();
const mediaRef = z.object({ asset_id: uuid }).strict();
const isoTime = z.string().datetime({ offset: true });

const saveInput = z
  .object({
    brandId: uuid,
    accountIds: z.array(uuid).min(1).max(10),
    caption: z.string().max(5000),
    media: z.array(mediaRef).max(20).default([]),
    platformOptions: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
    mode: z.enum(["draft", "schedule"]),
    scheduledFor: isoTime.optional(),
  })
  .strict();

const updateInput = z
  .object({
    id: uuid,
    caption: z.string().max(5000).optional(),
    media: z.array(mediaRef).max(20).optional(),
    platformOptions: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
    mode: z.enum(["draft", "schedule"]).optional(),
    scheduledFor: isoTime.optional(),
  })
  .strict();

const idInput = z.object({ id: uuid }).strict();
const rescheduleInput = z.object({ id: uuid, scheduledFor: isoTime }).strict();

const OPTS = { feature: "publishing", level: "edit" } as const;

/** Media kinds of a post's attachments, so platform rules can be checked (RLS: own workspace only). */
async function mediaKinds(ctx: OrgContext, media: { asset_id: string }[]): Promise<MediaKindKey[]> {
  if (media.length === 0) return [];
  const ids = media.map((m) => m.asset_id);
  const { data, error } = await ctx.supabase.from("media_assets").select("id, kind").in("id", ids);
  if (error) throw new AppError("INTERNAL_ERROR", "Could not check the attached files.", 500);
  const byId = new Map((data ?? []).map((a) => [a.id, a.kind]));
  return ids.map((id) => {
    const kind = byId.get(id);
    if (!kind) throw new AppError("NOT_FOUND", "One of the attached files was not found. Attach it again.", 404);
    return kind === "pdf" ? "pdf" : kind === "post-video" ? "video" : "image";
  });
}

/** Create one post per selected channel. Drafts may be incomplete; scheduled posts must pass the platform rules. */
export const savePostsAction = withOrgAction({ ...OPTS, input: saveInput }, async (ctx, i) => {
  if (i.mode === "schedule" && !i.scheduledFor) throw new AppError("VALIDATION_ERROR", "Choose a time to schedule this post.", 400);

  const { data: accounts, error: aErr } = await ctx.supabase
    .from("social_accounts")
    .select("id, platform, status, brand_id")
    .in("id", i.accountIds)
    .eq("org_id", ctx.orgId)
    .eq("brand_id", i.brandId);
  if (aErr) throw new AppError("INTERNAL_ERROR", "Could not load the channels.", 500);
  if (!accounts || accounts.length !== new Set(i.accountIds).size) throw new AppError("NOT_FOUND", "One of the channels was not found for this brand.", 404);

  if (i.mode === "schedule") {
    const kinds = await mediaKinds(ctx, i.media);
    for (const a of accounts) {
      if (a.status !== "active") throw new AppError("VALIDATION_ERROR", "A selected channel needs to be reconnected first.", 400);
      const check = validatePostContent(a.platform as PlatformKey, i.caption, kinds);
      if (!check.ok) throw new AppError("VALIDATION_ERROR", check.message, 400);
    }
  }

  const rows = accounts.map((a) => ({
    org_id: ctx.orgId,
    brand_id: i.brandId,
    social_account_id: a.id,
    caption: i.caption,
    media: i.media as unknown as Json[],
    platform_options: i.platformOptions,
    status: i.mode === "schedule" ? ("scheduled" as const) : ("draft" as const),
    scheduled_for: i.mode === "schedule" ? i.scheduledFor! : null,
    created_by: ctx.user.id,
  }));
  // The database refuses past or too-soon times and any change outside the allowed states.
  const { data, error } = await ctx.supabase.from("scheduled_posts").insert(rows).select("id");
  if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
  revalidatePath("/publishing");
  revalidatePath("/calendar");
  return { postIds: (data ?? []).map((r) => r.id) };
});

/** Edit a draft, scheduled, failed or canceled post. The database guards which changes are allowed. */
export const updatePostAction = withOrgAction({ ...OPTS, input: updateInput }, async (ctx, i) => {
  const patch: Partial<ScheduledPost> = {};
  if (i.caption !== undefined) patch.caption = i.caption;
  if (i.media !== undefined) patch.media = i.media as unknown as Json[];
  if (i.platformOptions !== undefined) patch.platform_options = i.platformOptions;
  if (i.mode === "schedule") {
    if (!i.scheduledFor) throw new AppError("VALIDATION_ERROR", "Choose a time to schedule this post.", 400);
    patch.status = "scheduled";
    patch.scheduled_for = i.scheduledFor;
  } else if (i.mode === "draft") {
    patch.status = "draft";
    patch.scheduled_for = null;
  }
  if (Object.keys(patch).length === 0) throw new AppError("VALIDATION_ERROR", "Nothing to change.", 400);

  const { data, error } = await ctx.supabase.from("scheduled_posts").update(patch).eq("id", i.id).eq("org_id", ctx.orgId).select("id");
  if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
  if (!data || data.length === 0) throw new AppError("NOT_FOUND", "That post was not found, or it can no longer be edited.", 404);
  revalidatePath("/publishing");
  revalidatePath("/calendar");
  return { id: i.id };
});

export const cancelPostAction = withOrgAction({ ...OPTS, input: idInput }, async (ctx, i) => {
  const { data, error } = await ctx.supabase.from("scheduled_posts").update({ status: "canceled", scheduled_for: null }).eq("id", i.id).eq("org_id", ctx.orgId).select("id");
  if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
  if (!data || data.length === 0) throw new AppError("NOT_FOUND", "That post was not found, or it can no longer be canceled.", 404);
  revalidatePath("/publishing");
  revalidatePath("/calendar");
  return { id: i.id };
});

export const reschedulePostAction = withOrgAction({ ...OPTS, input: rescheduleInput }, async (ctx, i) => {
  const { data, error } = await ctx.supabase.from("scheduled_posts").update({ status: "scheduled", scheduled_for: i.scheduledFor }).eq("id", i.id).eq("org_id", ctx.orgId).select("id");
  if (error) throw new AppError("VALIDATION_ERROR", error.message, 400);
  if (!data || data.length === 0) throw new AppError("NOT_FOUND", "That post was not found, or it can no longer be rescheduled.", 404);
  revalidatePath("/publishing");
  revalidatePath("/calendar");
  return { id: i.id };
});

/**
 * "Post now" and "Retry": release the post for immediate publishing. The user's own session may not set the
 * time to "now" (the database requires 5 minutes ahead), so after checking permission and the platform
 * rules with the user's session, the server makes the change with the service role, scoped to this workspace.
 */
async function releaseNow(ctx: OrgContext, id: string) {
  const { data: post, error } = await ctx.supabase
    .from("scheduled_posts")
    .select("id, status, caption, media, social_account_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL_ERROR", "Could not load the post.", 500);
  if (!post) throw new AppError("NOT_FOUND", "That post was not found.", 404);
  if (!["draft", "scheduled", "failed", "canceled"].includes(post.status)) {
    throw new AppError("VALIDATION_ERROR", "This post is already being published or has been published.", 400);
  }

  const { data: account } = await ctx.supabase.from("social_accounts").select("platform, status").eq("id", post.social_account_id).eq("org_id", ctx.orgId).maybeSingle();
  if (!account) throw new AppError("NOT_FOUND", "The channel for this post was not found.", 404);
  if (account.status !== "active") throw new AppError("VALIDATION_ERROR", "This channel needs to be reconnected before it can post.", 400);
  if (!PLATFORM_LIMITS[account.platform as PlatformKey]) throw new AppError("VALIDATION_ERROR", "That platform is not supported.", 400);

  const refs = (Array.isArray(post.media) ? post.media : []) as { asset_id: string }[];
  const check = validatePostContent(account.platform as PlatformKey, post.caption, await mediaKinds(ctx, refs));
  if (!check.ok) throw new AppError("VALIDATION_ERROR", check.message, 400);

  const { data: updated, error: upErr } = await createAdminClient()
    .from("scheduled_posts")
    .update({ status: "scheduled", scheduled_for: new Date().toISOString(), attempts: 0, last_error_code: null, last_error_message: null, locked_at: null })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .in("status", ["draft", "scheduled", "failed", "canceled"])
    .select("id");
  if (upErr) throw new AppError("INTERNAL_ERROR", "Could not start publishing. Please try again.", 500);
  if (!updated || updated.length === 0) throw new AppError("VALIDATION_ERROR", "This post is already being published.", 400);

  const kicked = await kickPublishScheduler();
  if (!kicked) ctx.log.warn("could not wake the scheduler; the post will go out within a minute", { post_id: id });
  revalidatePath("/publishing");
  revalidatePath("/calendar");
  return { id, startsWithin: kicked ? "seconds" : "a minute" };
}

export const postNowAction = withOrgAction({ ...OPTS, input: idInput }, async (ctx, i) => releaseNow(ctx, i.id));
export const retryPostAction = withOrgAction({ ...OPTS, input: idInput }, async (ctx, i) => releaseNow(ctx, i.id));
