import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  AppError,
  FEATURE_LEVELS,
  MAX_BODY_BYTES,
  RateLimiter,
  assertNoOrgInInput,
  createLogger,
  enforceRateLimit,
  type FeatureLevelName,
  type Logger,
} from "@growth-os/shared";
import type { Database, OrgRole } from "@growth-os/db";
import { createClient } from "@/lib/supabase/server";
import { mfaStatusFor } from "@/lib/mfa";

/** What every handler receives. orgId is derived on the server, never from the request. */
export interface OrgContext {
  user: User;
  orgId: string;
  role: OrgRole;
  /** Level (0-3) the caller holds for the required feature. */
  level: number;
  /** User-scoped client: row-level security applies. */
  supabase: SupabaseClient<Database>;
  log: Logger;
  requestId: string;
}

export interface WithOrgOptions<S extends z.ZodTypeAny | undefined> {
  /** Feature key from feature_access (e.g. "team", "brand", "studio"). */
  feature: string;
  /** Minimum level required. */
  level: FeatureLevelName;
  /** zod schema for the input (JSON body, or the argument of a server action). */
  input?: S;
  /** Counts toward the write bucket (30/min) instead of the read bucket (120/min). Default: true for non-GET. */
  write?: boolean;
}

type Input<S> = S extends z.ZodTypeAny ? z.infer<S> : undefined;

const limiter = new RateLimiter();
export const ACTIVE_ORG_COOKIE = "active_org_id";

/** Authenticate, resolve the active org from the session, check membership + feature level. */
export async function requireOrgContext(feature: string, level: FeatureLevelName, write: boolean): Promise<OrgContext> {
  return buildContext(feature, level, write);
}

async function buildContext(feature: string, level: FeatureLevelName, write: boolean): Promise<OrgContext> {
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new AppError("UNAUTHORIZED", "Please sign in to continue.", 401);

  enforceRateLimit(limiter, user.id, write ? "write" : "read");

  // Active org: cookie preference, validated against real memberships (lookup, not JWT claims,
  // so removing a member takes effect on the very next request).
  const { data: memberships, error: memErr } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (memErr) throw new AppError("INTERNAL_ERROR", "Could not load your workspace.", 500, memErr.message);

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const orgId = memberships?.find((m) => m.org_id === preferred)?.org_id ?? memberships?.[0]?.org_id;
  if (!orgId) throw new AppError("FORBIDDEN", "You are not a member of any active workspace.", 403);

  const { data: role, error: roleErr } = await supabase.rpc("my_role", { p_org: orgId });
  if (roleErr) throw new AppError("INTERNAL_ERROR", "Could not check your access.", 500, roleErr.message);
  if (!role) throw new AppError("FORBIDDEN", "Your access to this workspace is not active.", 403);

  if ((await mfaStatusFor(supabase, role)) !== "ok") {
    throw new AppError("MFA_REQUIRED", "Two-factor authentication is required for owners and admins. Complete it at /security/mfa.", 403);
  }

  const { data: levelNum, error: levelErr } = await supabase.rpc("my_feature_level", {
    p_org: orgId,
    p_feature: feature,
  });
  if (levelErr) throw new AppError("INTERNAL_ERROR", "Could not check your access.", 500, levelErr.message);

  const needed = FEATURE_LEVELS[level];
  if ((levelNum ?? 0) < needed) {
    throw new AppError("FORBIDDEN", `You need ${level} access to ${feature}. An admin can grant it in Team & access.`, 403);
  }

  return {
    user,
    orgId,
    role,
    level: levelNum ?? 0,
    supabase,
    requestId,
    log: createLogger({ request_id: requestId, org_id: orgId, user_id: user.id }),
  };
}

function parseInput<S extends z.ZodTypeAny | undefined>(schema: S, raw: unknown): Input<S> {
  if (!schema) return undefined as Input<S>;
  assertNoOrgInInput(raw);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError(
      "VALIDATION_ERROR",
      `${first?.path.join(".") || "input"}: ${first?.message ?? "invalid"}`,
      400,
      parsed.error.issues,
    );
  }
  return parsed.data as Input<S>;
}

function toAppError(err: unknown, log?: Logger): AppError {
  if (err instanceof AppError) return err;
  (log ?? createLogger()).error("unhandled error", { error: err instanceof Error ? err.message : String(err) });
  // Never leak internals to the client.
  return new AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
}

/**
 * Route handler wrapper: authenticate -> resolve org from session -> permission ->
 * rate limit -> validate (zod) -> act -> typed response `{ data }` or `{ error: { code, message } }`.
 */
export function withOrg<S extends z.ZodTypeAny | undefined = undefined, T = unknown>(
  options: WithOrgOptions<S>,
  handler: (ctx: OrgContext, input: Input<S>, req: NextRequest) => Promise<T>,
) {
  return async (req: NextRequest): Promise<Response> => {
    let ctx: OrgContext | undefined;
    try {
      ctx = await buildContext(options.feature, options.level, options.write ?? req.method !== "GET");

      let raw: unknown = undefined;
      if (options.input) {
        if (req.method === "GET") {
          raw = Object.fromEntries(new URL(req.url).searchParams);
        } else {
          const text = await req.text();
          if (text.length > MAX_BODY_BYTES) throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
          try {
            raw = text ? JSON.parse(text) : {};
          } catch {
            throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
          }
        }
      }
      const input = parseInput(options.input as S, raw);
      const data = await handler(ctx, input, req);
      return NextResponse.json({ data }, { status: 200, headers: { "x-request-id": ctx.requestId } });
    } catch (err) {
      const e = toAppError(err, ctx?.log);
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.statusCode, headers: ctx ? { "x-request-id": ctx.requestId } : undefined },
      );
    }
  };
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Same guarantees for server actions. Returns an ActionResult instead of throwing across the boundary. */
export function withOrgAction<S extends z.ZodTypeAny | undefined = undefined, T = unknown>(
  options: WithOrgOptions<S>,
  handler: (ctx: OrgContext, input: Input<S>) => Promise<T>,
) {
  return async (raw?: unknown): Promise<ActionResult<T>> => {
    let ctx: OrgContext | undefined;
    try {
      ctx = await buildContext(options.feature, options.level, options.write ?? true);
      const input = parseInput(options.input as S, raw);
      return { ok: true, data: await handler(ctx, input) };
    } catch (err) {
      const e = toAppError(err, ctx?.log);
      return { ok: false, error: { code: e.code, message: e.message } };
    }
  };
}
