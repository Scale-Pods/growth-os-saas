/** Platform rules the composer, the API and the publisher all share (pure data and checks, safe in the browser). */

export type PlatformKey = "instagram" | "facebook" | "linkedin" | "linkedin_page" | "youtube" | "x" | "tiktok" | "threads" | "pinterest";
export type MediaKindKey = "image" | "video" | "pdf";

export const SOCIAL_PLATFORM_LIST: readonly PlatformKey[] = [
  "instagram",
  "facebook",
  "linkedin",
  "linkedin_page",
  "youtube",
  "x",
  "tiktok",
  "threads",
  "pinterest",
];

interface PlatformLimit {
  label: string;
  /** Maximum caption length (for YouTube: the title). */
  captionMax: number;
  /** The post cannot go out without at least one of these media kinds. */
  requiresMedia: boolean;
  allowedMedia: readonly MediaKindKey[];
  maxMedia: number;
}

export const PLATFORM_LIMITS: Record<PlatformKey, PlatformLimit> = {
  instagram: { label: "Instagram", captionMax: 2200, requiresMedia: true, allowedMedia: ["image", "video"], maxMedia: 10 },
  facebook: { label: "Facebook", captionMax: 63206, requiresMedia: false, allowedMedia: ["image", "video"], maxMedia: 10 },
  linkedin: { label: "LinkedIn", captionMax: 3000, requiresMedia: false, allowedMedia: ["image", "video", "pdf"], maxMedia: 9 },
  linkedin_page: { label: "LinkedIn Page", captionMax: 3000, requiresMedia: false, allowedMedia: ["image", "video", "pdf"], maxMedia: 9 },
  youtube: { label: "YouTube", captionMax: 100, requiresMedia: true, allowedMedia: ["video"], maxMedia: 1 },
  x: { label: "X", captionMax: 280, requiresMedia: false, allowedMedia: ["image", "video"], maxMedia: 4 },
  tiktok: { label: "TikTok", captionMax: 2200, requiresMedia: true, allowedMedia: ["video"], maxMedia: 1 },
  threads: { label: "Threads", captionMax: 500, requiresMedia: false, allowedMedia: ["image", "video"], maxMedia: 10 },
  pinterest: { label: "Pinterest", captionMax: 500, requiresMedia: true, allowedMedia: ["image"], maxMedia: 1 },
};

export type ContentCheck = { ok: true } | { ok: false; code: "PLATFORM_REJECTED" | "MEDIA_INVALID"; message: string };

/** Check a post against its platform before we ever call a provider. Failing here costs nothing and says why. */
export function validatePostContent(platform: PlatformKey, caption: string, media: readonly MediaKindKey[]): ContentCheck {
  const rule = PLATFORM_LIMITS[platform];
  if (!rule) return { ok: false, code: "PLATFORM_REJECTED", message: "That platform is not supported." };
  const text = caption.trim();

  if (text.length === 0 && media.length === 0) {
    return { ok: false, code: "PLATFORM_REJECTED", message: "Add some text or media before posting." };
  }
  if (text.length > rule.captionMax) {
    return {
      ok: false,
      code: "PLATFORM_REJECTED",
      message: `${rule.label} allows at most ${rule.captionMax.toLocaleString("en")} characters. Yours is ${text.length.toLocaleString("en")}.`,
    };
  }
  if (rule.requiresMedia && media.length === 0) {
    return { ok: false, code: "MEDIA_INVALID", message: `${rule.label} posts need ${rule.allowedMedia.join(" or ")}. Add one and try again.` };
  }
  if (media.length > rule.maxMedia) {
    return { ok: false, code: "MEDIA_INVALID", message: `${rule.label} allows at most ${rule.maxMedia} file(s) per post.` };
  }
  const bad = media.find((m) => !rule.allowedMedia.includes(m));
  if (bad) {
    return { ok: false, code: "MEDIA_INVALID", message: `${rule.label} does not accept ${bad} files. Allowed: ${rule.allowedMedia.join(", ")}.` };
  }
  return { ok: true };
}
