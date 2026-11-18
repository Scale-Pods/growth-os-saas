// Runs tests/isolation.sql against Postgres.
//  - CI / any machine with psql: set DATABASE_URL.
//  - Local: uses the Supabase container started by `supabase start` (needs Docker).
import { spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sqlFile = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "isolation.sql");
const url = process.env.DATABASE_URL;
const [cmd, args] = url
  ? ["psql", [url, "-v", "ON_ERROR_STOP=1", "-q"]]
  : ["docker", ["exec", "-i", "supabase_db_growth-os-saas", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"]];

const child = spawnSync(cmd, args, { stdio: [openSync(sqlFile, "r"), "inherit", "inherit"] });
if (child.error) {
  process.stderr.write(`Could not run ${cmd}: ${child.error.message}\n`);
  process.exit(1);
}
process.exit(child.status ?? 1);
