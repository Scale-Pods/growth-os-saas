import { AppError } from "./errors";

export const FEATURE_LEVELS = { none: 0, view: 1, edit: 2, full: 3 } as const;
export type FeatureLevelName = keyof typeof FEATURE_LEVELS;

export const MAX_BODY_BYTES = 1_000_000; // 1 MB cap (02-architecture §4)
export const RATE_LIMITS = { read: { limit: 120, windowMs: 60_000 }, write: { limit: 30, windowMs: 60_000 } } as const;

const ORG_KEYS = new Set(["org_id", "orgid", "organization_id", "organizationid"]);

/** Rejects any request payload that tries to name an organization. org_id only ever comes from the session. */
export function assertNoOrgInInput(value: unknown, path = "body"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoOrgInInput(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ORG_KEYS.has(k.toLowerCase())) {
        throw new AppError("VALIDATION_ERROR", `${path}.${k} is not accepted: the organization is taken from your session.`, 400);
      }
      assertNoOrgInInput(v, `${path}.${k}`);
    }
  }
}

/** Fixed-window per-key limiter. In-memory: protects one server instance; the edge (Cloudflare) is the global limiter. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private now: () => number = Date.now) {}

  /** Returns seconds to wait when over the limit, or 0 when allowed. */
  check(key: string, limit: number, windowMs: number): number {
    const t = this.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + windowMs });
      this.prune(t);
      return 0;
    }
    if (cur.count >= limit) return Math.max(1, Math.ceil((cur.resetAt - t) / 1000));
    cur.count += 1;
    return 0;
  }

  private prune(t: number) {
    if (this.hits.size < 5000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

export function enforceRateLimit(limiter: RateLimiter, userId: string, kind: "read" | "write"): void {
  const { limit, windowMs } = RATE_LIMITS[kind];
  const wait = limiter.check(`${userId}:${kind}`, limit, windowMs);
  if (wait > 0) throw new AppError("RATE_LIMITED", `Too many requests. Try again in ${wait}s.`, 429);
}

export function httpStatusFor(err: AppError): number {
  return err.statusCode;
}
