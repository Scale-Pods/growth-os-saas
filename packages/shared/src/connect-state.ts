import { createHash, randomBytes } from "node:crypto";

/**
 * Connect-flow state: a random secret we hand to the provider and get back unchanged.
 * Only its SHA-256 hash is stored, so a database leak cannot be used to forge a callback.
 *
 * NOTE: uses node:crypto, so it is NOT exported from the package index (client components import the index).
 * Import as "@growth-os/shared/src/connect-state" from server code only.
 */
export function newConnectState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashConnectState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}
