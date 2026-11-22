import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, createLogger } from "@growth-os/shared";
import { receiveWebhook } from "@growth-os/shared/src/webhooks";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { supabaseReceiptStore } from "@/lib/server-only/webhook-store";
import { socialProvider } from "@/lib/server-only/social";

const log = createLogger({ service: "web", route: "social-webhook" });

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  account_id: z.string().min(1).max(200).optional(),
});

/**
 * Inbound events from the social provider (P04 webhook framework): the signature is verified over the RAW body,
 * the timestamp must be fresh, and every event id is stored so a replay is acknowledged but not processed again.
 * Handlers only update state and return fast.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SOCIAL_WEBHOOK_SECRET ?? "";
  const rawBody = await req.text();
  if (rawBody.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }

  try {
    const result = await receiveWebhook(
      {
        provider: socialProvider().name,
        eventId: event.id,
        rawBody,
        signature: req.headers.get("x-signature"),
        timestamp: Number(req.headers.get("x-timestamp")),
        secret,
        store: supabaseReceiptStore(),
      },
      async () => {
        if (event.type === "account.revoked" && event.account_id) {
          const { error } = await createAdminClient()
            .from("social_accounts")
            .update({ status: "needs_reconnect" })
            .eq("provider", socialProvider().name)
            .eq("provider_account_id", event.account_id);
          if (error) throw new Error(`could not flag account: ${error.message}`);
          log.warn("channel revoked by provider", { type: event.type });
        } else {
          // Post status and comment events are stored for P09; unknown types are acknowledged and logged.
          log.info("webhook event acknowledged", { type: event.type });
        }
      },
    );
    return NextResponse.json({ ok: true, status: result.status }, { status: 200 });
  } catch (e) {
    if (e instanceof AppError) {
      // Bad signature or stale timestamp: refuse. A missing secret is our fault (500), not the caller's.
      return NextResponse.json({ error: e.code === "UNAUTHORIZED" ? "unauthorized" : "server error" }, { status: e.statusCode });
    }
    log.error("webhook processing failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
