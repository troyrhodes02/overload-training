/**
 * Plans, Billing & Promo Codes — founding-member comp grant CLI (spec RD-10;
 * see ./grant.ts and the production runbook). Operator tooling; a human runs it.
 *
 *   npx tsx --conditions=react-server scripts/operator/founding-members/cli.ts \
 *     --before <ISO instant>                               # DRY RUN (default)
 *   … --execute [--confirm-host <db host>]                 # writes, one transaction
 *
 * Connects with DIRECT_URL. A non-local host is refused on --execute unless
 * --confirm-host equals it exactly. Prints the host and counts only. The dry
 * run lists exactly which accounts would be granted; confirm the set first.
 *
 * WARNING: the repository's .env may hold PRODUCTION values. Export DIRECT_URL
 * for the database you mean; the dry run prints the host first.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  FoundingMembersRefused,
  executeFoundingMembers,
  formatPlan,
  planFoundingMembers,
} from "./grant";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const VALUE_FLAGS = new Set(["--before", "--confirm-host"]);

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
    // Default cutoff: now (every existing account). An explicit --before makes
    // the batch reproducible across runs.
    before: values["--before"] ?? new Date().toISOString(),
    confirmHost: values["--confirm-host"],
    execute,
    unexpected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unexpected.length > 0)
    fail(`Unexpected argument(s): ${args.unexpected.join(" ")}`);

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
    const plan = await planFoundingMembers(db, { cutoffIso: args.before });
    console.log(
      `Overload founding-member comp — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}  host=${host}`,
    );
    console.log(formatPlan(plan));
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to grant.");
      return;
    }
    if (!local && args.confirmHost?.toLowerCase() !== host) {
      fail(
        `\nRefusing to write to non-local host ${host} without --confirm-host ${host}.`,
      );
    }
    const result = await executeFoundingMembers(db, plan);
    console.log(`\nGranted in one transaction: ${result.created} comp(s).`);
  } catch (error) {
    if (error instanceof FoundingMembersRefused)
      fail(`\n${error.message}\nNothing was changed.`);
    throw error;
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
