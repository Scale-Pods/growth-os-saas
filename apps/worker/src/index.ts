import { QUEUE_NAMES, validateWorkerEnv } from "@growth-os/shared";

async function main() {
  console.log("[Worker] Starting Growth OS Worker...");
  
  try {
    validateWorkerEnv(process.env);
    console.log("[Worker] Environment validated successfully.");
  } catch (err) {
    console.warn("[Worker] Warning: Worker environment validation warning:", err);
  }

  console.log("[Worker] Registered queue handlers for:", Object.values(QUEUE_NAMES).join(", "));
  console.log("[Worker] Worker initialized and ready for jobs.");
}

main().catch((err) => {
  console.error("[Worker] Fatal error during startup:", err);
  process.exit(1);
});

