import { z } from "zod";
import { AppError, UPLOAD_RULES, parseObjectKey, sniffContentType } from "@growth-os/shared";
import { withOrg } from "@/lib/api/with-org";
import { createJob } from "@/lib/api/jobs";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { deleteObject, headObject, readHead } from "@/lib/server-only/r2";

const input = z.object({ key: z.string().min(10).max(300) }).strict();

/**
 * Step 2 of an upload: the browser says it finished. The server checks the object really exists,
 * is within the size cap, and really is the type it claims, then records it and queues normalization.
 */
export const POST = withOrg({ feature: "brand", level: "view", input }, async (ctx, i) => {
  const parsed = parseObjectKey(i.key);
  // Only keys we generated, and only inside the caller's own workspace.
  if (!parsed || parsed.orgId !== ctx.orgId) throw new AppError("NOT_FOUND", "That upload was not found.", 404);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("media_assets").select("id").eq("path", i.key).maybeSingle();
  if (existing) return { assetId: existing.id };

  const head = await headObject(i.key);
  if (!head) throw new AppError("NOT_FOUND", "The file was not uploaded. Please try again.", 404);

  const rule = UPLOAD_RULES[parsed.kind];
  const declared = (head.contentType ?? "").toLowerCase();
  const sniffed = sniffContentType(await readHead(i.key));
  if (head.size <= 0 || head.size > rule.maxBytes || !sniffed || sniffed !== declared || !rule.types.includes(sniffed)) {
    // Refuse and remove: never keep a file that fails the checks.
    await deleteObject(i.key);
    throw new AppError("VALIDATION_ERROR", "That file did not pass our checks (size or type) and was removed.", 422);
  }

  const { data: asset, error } = await admin
    .from("media_assets")
    .insert({
      org_id: ctx.orgId,
      brand_id: parsed.brandId,
      path: i.key,
      kind: parsed.kind,
      content_type: sniffed,
      size_bytes: head.size,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !asset) {
    ctx.log.error("could not record media asset", { error: error?.message });
    throw new AppError("INTERNAL_ERROR", "Could not save the upload. Please try again.", 500);
  }

  if (sniffed.startsWith("image/")) {
    await createJob(ctx, { kind: "media.normalize", brandId: parsed.brandId, input: { assetId: asset.id } });
  }
  return { assetId: asset.id };
});
