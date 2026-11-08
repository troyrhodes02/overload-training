/**
 * Workout Plan Import & Review (Pitch 22, OVE-109) — operator cleanup CLI for
 * abandoned import sources (see ./cleanup.ts and the production runbook).
 * Operator tooling; a human runs it. This is the MANUAL stand-in for the reliable
 * <=24h scheduled purge the repo's infrastructure cannot yet guarantee (no
 * scheduler/cron/queue — an architecture non-goal); see ./cleanup.ts header.
 *
 *   npx tsx --conditions=react-server scripts/operator/plan-import-cleanup/cli.ts \
 *     [--now <ISO instant>]                                  # DRY RUN (default)
 *   ... --execute [--confirm-host <db host>]                 # writes, one tx/batch
 *
 * Connects with DIRECT_URL. A non-local host is refused on --execute unless
 * --confirm-host equals it exactly. Prints the host and COUNTS ONLY — never a
 * user id, filename, source text, or draft. The dry run lists exactly what would
 * be purged; confirm the counts first.
 *
 * WARNING: the repository's .env may hold PRODUCTION values. Export DIRECT_URL
 * for the database you mean; the dry run prints the host first.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { removeSourceObjects } from "@/lib/import/storage";
import { executeCleanup, formatPlan, planCleanup } from "./cleanup";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const VALUE_FLAGS = new Set(["--now", "--confirm-host"]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  let execute = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") execute = true;
    else if (VALUE_FLAGS.has(arg) && i + 1 < argv.length)
      values[arg] = argv[++i];
    else unexpected.push(arg);
  }
  return {
    now: values["--now"] ? new Date(values["--now"]) : new Date(),
    confirmHost: values["--confirm-host"],
    execute,
    unexpected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unexpected.length > 0)
    fail(`Unexpected argument(s): ${args.unexpected.join(" ")}`);
  if (Number.isNaN(args.now.getTime())) fail("--now is not a valid instant.");

  const raw = process.env.DIRECT_URL;
  if (!raw) fail("DIRECT_URL is not set.");
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    fail("DIRECT_URL is not a valid URL.");
  }
  const local = LOCAL_HOSTS.has(host);

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: raw }),
  });
  try {
    const plan = await planCleanup(db, { now: args.now });
    console.log(
      `Overload plan-import cleanup - ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}  host=${host}`,
    );
    console.log(formatPlan(plan));
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to purge.");
      return;
    }
    if (!local && args.confirmHost?.toLowerCase() !== host) {
      fail(
        `\nRefusing to write to non-local host ${host} without --confirm-host ${host}.`,
      );
    }
    const result = await executeCleanup(
      db,
      plan,
      removeSourceObjects,
      args.now,
    );
    console.log(
      `\nPurged ${result.purged} expired session(s); cleared ${result.tombstonesCleared} tombstone(s); ${result.objectsFailed} object batch(es) left for retry.`,
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
