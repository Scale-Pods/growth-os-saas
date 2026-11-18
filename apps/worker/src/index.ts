import { QUEUE_NAMES, createLogger, validateWorkerEnv } from "@growth-os/shared";

const log = createLogger({ service: "worker" });

async function main() {
  // Fails loudly: a missing variable stops the process before any job can run.
  validateWorkerEnv(process.env);
  log.info("environment validated");
  log.info("queues registered", { queues: Object.values(QUEUE_NAMES) });
  log.info("worker ready");
}

main().catch((err: unknown) => {
  log.error("fatal error during startup", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
