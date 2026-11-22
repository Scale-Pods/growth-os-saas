import "server-only";
import type { WebhookReceiptStore } from "@growth-os/shared/src/webhooks";
import { createAdminClient } from "@/lib/server-only/supabase-admin";

/** Replay protection backed by `webhook_receipts` (unique per provider + event id). */
export function supabaseReceiptStore(): WebhookReceiptStore {
  return {
    async insert(provider, eventId) {
      const { error } = await createAdminClient().from("webhook_receipts").insert({ provider, event_id: eventId });
      if (!error) return true;
      if (error.code === "23505") return false; // already received: the caller answers 200 without reprocessing
      throw new Error(`could not store webhook receipt: ${error.message}`);
    },
  };
}
