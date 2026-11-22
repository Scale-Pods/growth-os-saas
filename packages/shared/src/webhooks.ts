import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

/** Webhooks older (or newer) than this many seconds are refused, even with a valid signature. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface VerifyInput {
  /** The exact bytes received, as text. Never a re-serialised JSON object. */
  rawBody: string;
  signature: string | null | undefined;
  /** Unix seconds as sent by the provider. */
  timestamp: number;
  secret: string;
  nowSec?: number;
}

/**
 * Verify an HMAC-SHA256 signature over `${timestamp}.${rawBody}` using a constant-time compare,
 * and reject stale timestamps. Throws a typed error; returns nothing on success.
 */
export function verifyWebhookSignature(input: VerifyInput): void {
  if (!input.secret) {
    throw new AppError("INTERNAL_ERROR", "Webhook secret is not configured", 500);
  }
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(input.timestamp) || Math.abs(nowSec - input.timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new AppError("UNAUTHORIZED", "Webhook timestamp is outside the allowed window", 401);
  }
  const given = (input.signature ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) {
    throw new AppError("UNAUTHORIZED", "Invalid webhook signature", 401);
  }
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.rawBody}`).digest();
  const actual = Buffer.from(given, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError("UNAUTHORIZED", "Invalid webhook signature", 401);
  }
}

/** Storage for replay protection. `insert` returns false when (provider, eventId) was already stored. */
export interface WebhookReceiptStore {
  insert(provider: string, eventId: string): Promise<boolean>;
}

export interface ReceiveInput extends VerifyInput {
  provider: string;
  eventId: string;
  store: WebhookReceiptStore;
}

export type ReceiveResult = { status: "processed" } | { status: "duplicate" };

/**
 * The webhook pipeline: verify signature and timestamp, store a receipt, run the handler once.
 * Handlers should only enqueue work and return fast. A replay returns "duplicate" (answer 200).
 */
export async function receiveWebhook(input: ReceiveInput, handler: () => Promise<void>): Promise<ReceiveResult> {
  verifyWebhookSignature(input);
  const isNew = await input.store.insert(input.provider, input.eventId);
  if (!isNew) return { status: "duplicate" };
  await handler();
  return { status: "processed" };
}
