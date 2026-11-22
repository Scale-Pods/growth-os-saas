export type SocialPlatform = "instagram" | "facebook" | "linkedin" | "linkedin_page" | "youtube" | "x" | "tiktok" | "threads" | "pinterest";

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
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

export type AccountHealth = "active" | "needs_reconnect" | "disconnected";

export interface MediaItem {
  /** A short-lived URL the provider can fetch. */
  url: string;
  type: "image" | "video" | "pdf";
}

export interface PublishRequest {
  /** Our post id. A provider must treat a repeat of the same key as the same post (never post twice). */
  idempotencyKey: string;
  /** The provider's id for the connected account (we never hold the login token). */
  providerAccountId: string;
  platform: SocialPlatform;
  caption: string;
  media: MediaItem[];
  options: Record<string, unknown>;
}

export interface PublishResult {
  providerPostId: string;
  /** Link to the live post, when the provider returns one. */
  url: string | null;
}

export interface ProviderAccount {
  providerAccountId: string;
  platform: SocialPlatform;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * The one door to every social provider. Adapters (bundle.social, Zernio, direct APIs) implement this and
 * nothing else in the app talks to a provider. All failures are thrown as `SocialError`.
 */
export interface SocialProvider {
  readonly name: string;
  /** URL the customer is sent to, to connect an account. `state` must come back unchanged. */
  getConnectUrl(args: { state: string; platform: SocialPlatform; redirectUri: string }): Promise<string>;
  /** After the provider redirects back: which accounts did the customer connect? */
  accountsFromCallback(args: { params: Record<string, string>; brandId: string }): Promise<ProviderAccount[]>;
  publish(req: PublishRequest): Promise<PublishResult>;
  /** Is the connection still valid? Used by the daily health check. */
  checkAccount(providerAccountId: string): Promise<{ status: AccountHealth }>;
}
