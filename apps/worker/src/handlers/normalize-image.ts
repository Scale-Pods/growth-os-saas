import { createHash } from "node:crypto";
import sharp from "sharp";
import { AppError, MAX_IMAGE_SIDE } from "@growth-os/shared";

export interface NormalizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  sha256: string;
  thumbnail: Buffer;
  contentType: string;
}

const THUMB_SIDE = 400;

/**
 * Resize so the longest side is at most MAX_IMAGE_SIDE (never enlarge), rotate by EXIF orientation,
 * strip all metadata (location, device, owner), and make a small WebP thumbnail.
 * Output keeps the original format so the stored path and content type stay valid.
 */
export async function normalizeImage(input: Buffer, contentType: string): Promise<NormalizedImage> {
  try {
    const base = sharp(input, { failOn: "error" }).rotate().resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
    // sharp removes metadata by default unless withMetadata() is called.
    const pipeline = contentType === "image/png" ? base.clone().png() : contentType === "image/webp" ? base.clone().webp({ quality: 88 }) : base.clone().jpeg({ quality: 88, mozjpeg: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(data).resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    return {
      buffer: data,
      width: info.width,
      height: info.height,
      sha256: createHash("sha256").update(data).digest("hex"),
      thumbnail,
      contentType,
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", "That file could not be read as an image. Please upload a PNG, JPG or WebP.", 422);
  }
}
