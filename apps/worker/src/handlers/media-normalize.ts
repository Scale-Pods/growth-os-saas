import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, sniffContentType } from "@growth-os/shared";
import type { Handler } from "../runner";
import type { ObjectStore } from "../r2";
import { normalizeImage } from "./normalize-image";

/**
 * After an upload is confirmed: re-check the file really is the image it claims to be, shrink it to
 * <= 2160 px, strip metadata, write a thumbnail, and record the final size, dimensions and hash.
 * Idempotent: running it again on an already-normalized image changes nothing of substance.
 */
export function mediaNormalizeHandler(db: SupabaseClient, store: ObjectStore): Handler {
  return async ({ job, heartbeat }) => {
    const assetId = (job.input_ref as { assetId?: string } | null)?.assetId;
    if (!assetId) throw new AppError("VALIDATION_ERROR", "This job has no file attached.", 400);

    // Re-check the org: the asset must belong to the same workspace as the job.
    const { data: asset, error } = await db
      .from("media_assets")
      .select("id, org_id, path, content_type, kind")
      .eq("id", assetId)
      .eq("org_id", job.org_id)
      .maybeSingle();
    if (error) throw new Error(`load asset: ${error.message}`);
    if (!asset) throw new AppError("NOT_FOUND", "The uploaded file record could not be found.", 404);

    await heartbeat({ percent: 15, label: "Reading the file" });
    const original = await store.get(asset.path);
    if (sniffContentType(original) !== asset.content_type) {
      throw new AppError("VALIDATION_ERROR", "The file contents do not match its type, so it was rejected.", 422);
    }

    await heartbeat({ percent: 45, label: "Resizing and cleaning the image" });
    const out = await normalizeImage(original, asset.content_type);

    await heartbeat({ percent: 75, label: "Saving" });
    await store.put(asset.path, out.buffer, out.contentType);
    const thumbKey = asset.path.replace(/\/([^/]+)\.[a-z0-9]+$/, "/thumb-$1.webp");
    await store.put(thumbKey, out.thumbnail, "image/webp");

    const { error: upErr } = await db
      .from("media_assets")
      .update({ size_bytes: out.buffer.length, width: out.width, height: out.height, sha256: out.sha256 })
      .eq("id", asset.id)
      .eq("org_id", job.org_id);
    if (upErr) throw new Error(`update asset: ${upErr.message}`);

    return { output: { assetId: asset.id, width: out.width, height: out.height, thumbKey } };
  };
}
