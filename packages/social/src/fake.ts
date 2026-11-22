import { createHash } from "node:crypto";
import { isSocialErrorCode, socialError } from "./errors";
import { SOCIAL_PLATFORMS, type AccountHealth, type ProviderAccount, type PublishRequest, type PublishResult, type SocialPlatform, type SocialProvider } from "./types";

/**
 * A pretend provider for tests and local development. It posts nothing anywhere.
 *
 * Failures are driven by markers in the caption, so they also work when the web app and the worker are
 * separate processes:
 *   [fail:CODE]       always fails with CODE (e.g. AUTH_EXPIRED, RATE_LIMITED, PROVIDER_DOWN, MEDIA_INVALID)
 *   [fail-once:CODE]  fails the first try for that post, then succeeds
 * Account ids starting "expired-" report needs_reconnect, "gone-" report disconnected.
 */
export class FakeSocialProvider implements SocialProvider {
  readonly name = "fake";
  /** How many distinct posts were really "sent". A repeat of the same idempotency key does not count. */
  sentCount = 0;
  private readonly sent = new Map<string, PublishResult>();
  private readonly failedOnce = new Set<string>();

  async getConnectUrl({ state, platform, redirectUri }: { state: string; platform: SocialPlatform; redirectUri: string }): Promise<string> {
    const u = new URL(redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("fake_platform", platform);
    return u.toString();
  }

  async accountsFromCallback({ params, brandId }: { params: Record<string, string>; brandId: string }): Promise<ProviderAccount[]> {
    const platform = params.fake_platform as SocialPlatform | undefined;
    if (!platform || !SOCIAL_PLATFORMS.includes(platform)) throw new Error("The platform in the connection response is not supported.");
    // Stable per brand and platform: reconnecting updates the same account instead of adding a second one.
    const id = `fake-${platform}-${createHash("sha256").update(brandId).digest("hex").slice(0, 8)}`;
    return [{ providerAccountId: id, platform, displayName: `Fake ${platform} account`, avatarUrl: null }];
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const marker = /\[(fail|fail-once):([A-Z_]+)\]/.exec(req.caption);
    if (marker && isSocialErrorCode(marker[2]!)) {
      if (marker[1] === "fail") throw socialError(marker[2]!);
      if (!this.failedOnce.has(req.idempotencyKey)) {
        this.failedOnce.add(req.idempotencyKey);
        throw socialError(marker[2]!);
      }
    }
    const existing = this.sent.get(req.idempotencyKey);
    if (existing) return existing;
    const id = `fake_${createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 12)}`;
    const result: PublishResult = { providerPostId: id, url: `https://example.com/fake/${id}` };
    this.sent.set(req.idempotencyKey, result);
    this.sentCount++;
    return result;
  }

  async checkAccount(providerAccountId: string): Promise<{ status: AccountHealth }> {
    if (providerAccountId.startsWith("expired-")) return { status: "needs_reconnect" };
    if (providerAccountId.startsWith("gone-")) return { status: "disconnected" };
    return { status: "active" };
  }
}
