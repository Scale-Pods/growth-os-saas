import { createHash } from "node:crypto";

/**
 * A job makes several AI calls (one per report section, strategy part, ...). Each call reserves credits under its own
 * id so one failure releases only its own reservation. The id is DERIVED from the job id and a name, so a retry of the
 * same step reuses the same reservation and can never be charged twice.
 */
export function childId(parent: string, name: string): string {
  const h = createHash("sha1").update(`${parent}:${name}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; // version 5
  h[8] = (h[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
