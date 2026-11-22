import { AppError } from "./errors";

const MB = 1024 * 1024;

export type UploadKind = "logo" | "post-image" | "post-video" | "pdf" | "reference-image";

interface Rule {
  maxBytes: number;
  types: readonly string[];
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Upload rules per kind. SVG and HTML are never accepted here: SVG logos need the sanitizer from P03
 * and are converted to PNG before they are stored.
 */
export const UPLOAD_RULES: Record<UploadKind, Rule> = {
  logo: { maxBytes: 5 * MB, types: IMAGE_TYPES },
  "post-image": { maxBytes: 20 * MB, types: IMAGE_TYPES },
  "reference-image": { maxBytes: 20 * MB, types: IMAGE_TYPES },
  "post-video": { maxBytes: 200 * MB, types: ["video/mp4", "video/quicktime"] },
  pdf: { maxBytes: 100 * MB, types: ["application/pdf"] },
};

export const UPLOAD_KINDS = Object.keys(UPLOAD_RULES) as UploadKind[];
export const UPLOADS_PER_USER_PER_HOUR = 50;
export const PRESIGN_EXPIRES_SECONDS = 600;
/** Images are shrunk to this longest side after upload. */
export const MAX_IMAGE_SIDE = 2160;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

export function validateUploadRequest(input: { kind: UploadKind; contentType: string; size: number }): void {
  const rule = UPLOAD_RULES[input.kind];
  if (!rule) throw new AppError("VALIDATION_ERROR", "Unknown upload type.", 400);
  // Exact match only: parameters such as "; x=image/png" make the value fail the list.
  const ct = input.contentType.trim().toLowerCase();
  if (!rule.types.includes(ct)) {
    throw new AppError("VALIDATION_ERROR", `That file type is not allowed here. Allowed: ${rule.types.map((t) => EXT[t]).join(", ")}.`, 400);
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new AppError("VALIDATION_ERROR", "The file is empty.", 400);
  }
  if (input.size > rule.maxBytes) {
    throw new AppError("VALIDATION_ERROR", `That file is too large. The limit is ${Math.round(rule.maxBytes / MB)} MB.`, 413);
  }
}

export function extensionFor(contentType: string): string {
  const ext = EXT[contentType.trim().toLowerCase()];
  if (!ext) throw new AppError("VALIDATION_ERROR", "Unsupported file type.", 400);
  return ext;
}

/** `org/{org}/brand/{brand|none}/{kind}/{uuid}.{ext}`: unguessable, extension chosen from the type, never from the user. */
export function buildObjectKey(args: { orgId: string; brandId: string | null; kind: UploadKind; contentType: string }): string {
  return `org/${args.orgId}/brand/${args.brandId ?? "none"}/${args.kind}/${crypto.randomUUID()}.${extensionFor(args.contentType)}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY_RE = new RegExp(`^org/(${UUID})/brand/(${UUID}|none)/(logo|post-image|reference-image|post-video|pdf)/${UUID}\\.[a-z0-9]{2,4}$`);

/** Parse a key we generated. Anything else (traversal, other prefixes, odd kinds) returns null. */
export function parseObjectKey(key: string): { orgId: string; brandId: string | null; kind: UploadKind } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { orgId: m[1]!, brandId: m[2] === "none" ? null : m[2]!, kind: m[3] as UploadKind };
}

/** Identify a file from its first bytes. The declared type must agree with this. */
export function sniffContentType(b: Uint8Array): string | null {
  const at = (i: number) => b[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50)
    return "image/webp";
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return "application/pdf";
  if (at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) {
    // ISO base media file: "qt  " is QuickTime, anything else (isom, mp42, ...) is MP4.
    return at(8) === 0x71 && at(9) === 0x74 ? "video/quicktime" : "video/mp4";
  }
  return null;
}
