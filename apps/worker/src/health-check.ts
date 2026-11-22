import type { SocialProvider } from "@growth-os/social";
import type { Logger } from "./runner";

export interface HealthAccount {
  id: string;
  org_id: string;
  provider_account_id: string;
  platform: string;
}

export interface HealthStore {
  /** Active accounts, least recently checked first. */
  listActive(limit: number): Promise<HealthAccount[]>;
  /** Record that the account was checked; pass a status only when it changed. */
  markChecked(accountId: string, newStatus: "needs_reconnect" | "disconnected" | null): Promise<void>;
}

/**
 * Daily check that each connected account still works. A broken login flips the account to
 * `needs_reconnect` (the UI then shows Reconnect). One account failing to check never stops the others,
 * and the failure is logged. Owner/admin notifications arrive with the notification centre (P08);
 * until then the warning log line is the signal.
 */
export async function runHealthCheck(d: { store: HealthStore; provider: SocialProvider; log: Logger }, limit = 500) {
  const summary = { checked: 0, flagged: 0, errors: 0 };
  const accounts = await d.store.listActive(limit);
  for (const a of accounts) {
    try {
      const { status } = await d.provider.checkAccount(a.provider_account_id);
      if (status === "active") {
        await d.store.markChecked(a.id, null);
      } else {
        await d.store.markChecked(a.id, status);
        summary.flagged++;
        d.log.warn("channel needs attention", { account_id: a.id, org_id: a.org_id, platform: a.platform, status });
      }
      summary.checked++;
    } catch (e) {
      summary.errors++;
      d.log.error("health check failed for a channel", { account_id: a.id, org_id: a.org_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return summary;
}
