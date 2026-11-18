import { z } from "zod";

const nodeEnv = z.enum(["development", "test", "production"]).default("development");

export const webEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    // Required in production; optional locally until a feature needs it.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    // Optional until the phase that uses them (P04 media, P01 Turnstile).
    NEXT_PUBLIC_MEDIA_DOMAIN: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SUPABASE_SERVICE_ROLE_KEY"],
        message: "Required in production",
      });
    }
  });

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Needed from P04.
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

type RawEnv = Record<string, string | undefined>;

function parseEnv<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, env: RawEnv, label: string): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Report variable names and reasons only, never values.
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid ${label} environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** Throws (listing the bad variable names) when the web environment is invalid. */
export function validateWebEnv(env: RawEnv): WebEnv {
  return parseEnv(webEnvSchema, env, "web");
}

/** Throws (listing the bad variable names) when the worker environment is invalid. */
export function validateWorkerEnv(env: RawEnv): WorkerEnv {
  return parseEnv(workerEnvSchema, env, "worker");
}
