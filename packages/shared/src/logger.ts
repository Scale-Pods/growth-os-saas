export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  request_id?: string;
  org_id?: string;
  job_id?: string;
  [key: string]: unknown;
}

const SECRET_KEY = /(key|secret|token|password|authorization|cookie)/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(v)]),
    );
  }
  return value;
}

export interface Logger {
  debug(msg: string, extra?: LogContext): void;
  info(msg: string, extra?: LogContext): void;
  warn(msg: string, extra?: LogContext): void;
  error(msg: string, extra?: LogContext): void;
  child(ctx: LogContext): Logger;
}

/** Structured JSON logger. Every line can carry request_id, org_id, job_id. Secret-looking keys are redacted. */
export function createLogger(base: LogContext = {}): Logger {
  const write = (level: LogLevel, msg: string, extra?: LogContext) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(redact({ ...base, ...extra }) as object) });
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
  };
  return {
    debug: (m, e) => write("debug", m, e),
    info: (m, e) => write("info", m, e),
    warn: (m, e) => write("warn", m, e),
    error: (m, e) => write("error", m, e),
    child: (ctx) => createLogger({ ...base, ...ctx }),
  };
}
