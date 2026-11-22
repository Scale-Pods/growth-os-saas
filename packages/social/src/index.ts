import { FakeSocialProvider } from "./fake";
import type { SocialProvider } from "./types";

export * from "./types";
export * from "./errors";
export { FakeSocialProvider } from "./fake";

/**
 * Pick the provider from the environment. In production a provider must be chosen on purpose:
 * we never silently publish to a fake. Real adapters are added here once the provider decision (ADR 0003) is made.
 */
export function getSocialProvider(env: { NODE_ENV?: string; SOCIAL_PROVIDER?: string }): SocialProvider {
  const name = env.SOCIAL_PROVIDER;
  if (!name && env.NODE_ENV === "production") {
    throw new Error("SOCIAL_PROVIDER must be set in production (the fake provider is never used by default there).");
  }
  if (!name || name === "fake") return new FakeSocialProvider();
  throw new Error(`Social provider "${name}" is not available yet.`);
}
