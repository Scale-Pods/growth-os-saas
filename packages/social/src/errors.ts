export type SocialErrorCode =
  | "AUTH_EXPIRED"
  | "RATE_LIMITED"
  | "MEDIA_INVALID"
  | "MEDIA_TOO_LARGE"
  | "PLATFORM_REJECTED"
  | "PROVIDER_DOWN"
  | "UNKNOWN";

const DEFAULTS: Record<SocialErrorCode, { message: string; retryable: boolean }> = {
  AUTH_EXPIRED: { message: "The connection to this channel has expired. Reconnect the channel and try again.", retryable: false },
  RATE_LIMITED: { message: "The platform asked us to slow down. We will try again shortly.", retryable: true },
  MEDIA_INVALID: { message: "The platform could not use the image or video. Check the file and try again.", retryable: false },
  MEDIA_TOO_LARGE: { message: "The image or video is too large for this platform. Use a smaller file.", retryable: false },
  PLATFORM_REJECTED: { message: "The platform rejected this post. Check the text and media against its rules.", retryable: false },
  PROVIDER_DOWN: { message: "The publishing service is not responding. We will try again shortly.", retryable: true },
  UNKNOWN: { message: "Something unexpected went wrong while posting. Check the channel to see whether it went out before you try again.", retryable: false },
};

/** Every provider failure, normalised: a code, a message a customer can read, and whether a retry can help. */
export class SocialError extends Error {
  constructor(
    public readonly code: SocialErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SocialError";
  }
}

export function socialError(code: SocialErrorCode, message?: string): SocialError {
  const d = DEFAULTS[code];
  return new SocialError(code, message ?? d.message, d.retryable);
}

export function isSocialErrorCode(v: string): v is SocialErrorCode {
  return v in DEFAULTS;
}
