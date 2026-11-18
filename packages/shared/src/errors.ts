export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "MFA_REQUIRED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PLAN_LIMIT_EXCEEDED"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "PROVIDER_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

