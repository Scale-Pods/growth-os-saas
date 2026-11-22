/** Everything the gateway needs from the outside world, passed in so it can be tested with fakes. */

export interface CreditLedger {
  /** Throws an Error whose message contains INSUFFICIENT_CREDITS, MEMBER_CAP_REACHED or ORG_NOT_ACTIVE when refused. */
  reserve(args: { orgId: string; userId: string | null; jobId: string; credits: number }): Promise<void>;
  settle(args: { orgId: string; jobId: string; actualCredits: number }): Promise<void>;
  release(args: { orgId: string; jobId: string }): Promise<void>;
}

export interface UsageRecord {
  orgId: string;
  userId: string | null;
  jobId: string | null;
  model: string;
  units: number;
  costUsd: number;
  credits: number;
}

export interface UsageRecorder {
  record(usage: UsageRecord): Promise<void>;
}

export interface TextRequest {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface TextResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** A provider failure. `retryable` is true for rate limits (429) and server errors (5xx). */
export class ProviderFailure extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderFailure";
  }
}

export interface TextProvider {
  generate(req: TextRequest): Promise<TextResponse>;
}

/** Content check on model output. Returns a reason when the content must not be used. */
export interface Moderator {
  check(text: string): Promise<{ flagged: boolean; reason?: string }>;
}
