import "server-only";
import { getSocialProvider, type SocialProvider } from "@growth-os/social";

let provider: SocialProvider | null = null;

/** The configured social provider. In production SOCIAL_PROVIDER must be set on purpose (never defaults to the fake). */
export function socialProvider(): SocialProvider {
  provider ??= getSocialProvider({ NODE_ENV: process.env.NODE_ENV, SOCIAL_PROVIDER: process.env.SOCIAL_PROVIDER });
  return provider;
}
