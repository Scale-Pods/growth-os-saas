import { z } from "zod";
import {
  AppError,
  FEATURE_LEVELS,
  RateLimiter,
  UPLOADS_PER_USER_PER_HOUR,
  UPLOAD_KINDS,
  buildObjectKey,
  validateUploadRequest,
  type UploadKind,
} from "@growth-os/shared";
import { withOrg } from "@/lib/api/with-org";
import { presignPut } from "@/lib/server-only/r2";

const limiter = new RateLimiter();

const input = z
  .object({
    kind: z.enum(UPLOAD_KINDS as [UploadKind, ...UploadKind[]]),
    contentType: z.string().min(3).max(100),
    size: z.number().int().positive(),
    brandId: z.string().uuid().optional(),
  })
  .strict();

/** Which feature a member needs (at edit level) to upload each kind of file. */
const FEATURE_FOR_KIND: Record<UploadKind, string> = {
  logo: "brand",
  "post-image": "studio",
  "reference-image": "studio",
  "post-video": "studio",
  pdf: "studio",
};

/** Step 1 of an upload: check everything, then hand back a 10-minute PUT URL for one exact file. */
export const POST = withOrg({ feature: "brand", level: "view", input }, async (ctx, i) => {
  const retry = limiter.check(ctx.user.id, UPLOADS_PER_USER_PER_HOUR, 60 * 60 * 1000);
  if (retry > 0) throw new AppError("RATE_LIMITED", "You have uploaded a lot of files in the last hour. Please wait a little and try again.", 429);

  validateUploadRequest({ kind: i.kind, contentType: i.contentType, size: i.size });

  // The wrapper only proved the caller is a member. Check the level for this specific kind of file.
  const feature = FEATURE_FOR_KIND[i.kind];
  const { data: level, error: levelErr } = await ctx.supabase.rpc("my_feature_level", { p_org: ctx.orgId, p_feature: feature });
  if (levelErr) throw new AppError("INTERNAL_ERROR", "Could not check your access.", 500);
  if ((level ?? 0) < FEATURE_LEVELS.edit) {
    throw new AppError("FORBIDDEN", `You need Edit access to ${feature} to upload this. An admin can grant it in Team & access.`, 403);
  }

  if (i.brandId) {
    // RLS only returns brands of the caller's own workspace.
    const { data: brand } = await ctx.supabase.from("brands").select("id").eq("id", i.brandId).eq("org_id", ctx.orgId).maybeSingle();
    if (!brand) throw new AppError("NOT_FOUND", "That brand was not found in this workspace.", 404);
  }

  // TODO(P10): enforce the plan's storage quota here once plan_limits has a storage key.
  const key = buildObjectKey({ orgId: ctx.orgId, brandId: i.brandId ?? null, kind: i.kind, contentType: i.contentType });
  const url = await presignPut(key, i.contentType.trim().toLowerCase(), i.size);
  return { key, url, method: "PUT", headers: { "Content-Type": i.contentType.trim().toLowerCase() }, expiresIn: 600 };
});
