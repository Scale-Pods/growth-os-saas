import { validateWebEnv } from "@growth-os/shared";

/** Runs once when the server starts. An invalid environment stops the app. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateWebEnv(process.env);
  }
}
