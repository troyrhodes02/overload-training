/**
 * Multi-User Foundation — Stage 2 operator CLI (see ./backfill.ts and the
 * production runbook docs/runs/08-multi-user-foundation-runbook.md).
 *
 *   npx tsx --conditions=react-server scripts/operator/account-ownership/cli.ts \
 *     --email <account email> --time-zone <IANA zone>            # DRY RUN (default)
 *   … --execute [--confirm-host <db host>]                       # writes, one transaction
 *
 * Connects with DIRECT_URL (the migration connection). A non-local host is
 * refused on --execute unless --confirm-host equals it exactly. Prints the
 * host and counts only — never a connection string or password.
 *
 * WARNING: the repository's .env has held PRODUCTION values. Export DIRECT_URL
 * explicitly for the database you mean; the dry run prints the host first.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BackfillRefused,
  executeOwnershipBackfill,
  formatPlan,
  planOwnershipBackfill,
} from "./backfill";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const VALUE_FLAGS = new Set(["--email", "--time-zone", "--confirm-host"]);

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
    email: values["--email"],
    timeZone: values["--time-zone"],
    confirmHost: values["--confirm-host"],
    execute,
    unexpected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unexpected.length > 0) {
    fail(
      `Unexpected argument(s): ${args.unexpected.join(" ")}\n` +
        "In PowerShell, npm drops options after `--`; run the script with npx tsx directly (see the runbook).",
    );
  }
  if (!args.email || !args.timeZone) {
    fail(
      "Usage: --email <account email> --time-zone <IANA zone> [--execute [--confirm-host <host>]]",
    );
  }
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
    const input = { email: args.email, timeZone: args.timeZone };
    const plan = await planOwnershipBackfill(db, input);
    console.log(
      `Overload ownership assignment — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}`,
    );
    console.log(formatPlan(plan, host));
    if (plan.refusals.length > 0) process.exit(1);
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to assign.");
      return;
    }
    if (!local && args.confirmHost?.toLowerCase() !== host) {
      fail(
        `\nRefusing to write to non-local host ${host} without --confirm-host ${host}.`,
      );
    }
    const result = await executeOwnershipBackfill(db, input);
    console.log("\nAssigned in one transaction:");
    for (const [table, count] of Object.entries(result.assigned)) {
      console.log(`  ${table.padEnd(24)} ${count}`);
    }
    console.log(`  favorites copied         ${result.favoritesCopied}`);
    console.log(`  profile created          ${result.profileCreated ? 1 : 0}`);
    console.log("\nBefore → after (rows, value checksum excluding user_id):");
    for (const [table, b] of Object.entries(result.before)) {
      const a = result.after[table];
      console.log(
        `  ${table.padEnd(24)} ${b.count} → ${a.count}  ${b.checksum === a.checksum ? "identical" : "CHANGED"}`,
      );
    }
    console.log(
      "\nDone. Next: Stage 3 (npx prisma migrate deploy applies 10_account_ownership_enforce).",
    );
  } catch (error) {
    if (error instanceof BackfillRefused)
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
