/**
 * Multi-User Foundation — Stage 2 operator CLI (see ./backfill.ts and the
 * production runbook docs/runs/08-multi-user-foundation-runbook.md).
 *
 *   npx tsx --conditions=react-server scripts/operator/account-ownership/cli.ts \
 *     --email <account email> --time-zone <IANA zone>            # DRY RUN (default)
 *     [--confirm-ref <project ref>] [--production]
 *   … --execute                                                  # writes, one transaction
 *
 * Connects with DIRECT_URL (the migration connection). Before ANY connection,
 * the target-identity guard (../target-identity.ts, OVE-111) identifies the
 * project from DATABASE_URL, DIRECT_URL and NEXT_PUBLIC_SUPABASE_URL. A hosted
 * project needs --confirm-ref <its ref> (a hostname is never confirmation)
 * plus its database identity marker; PRODUCTION additionally needs
 * --production. Prints the target and counts only — never a connection string
 * or password.
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
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../target-identity";

const VALUE_FLAGS = new Set(["--email", "--time-zone", "--confirm-ref"]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  let execute = false;
  let production = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") execute = true;
    else if (arg === "--production") production = true;
    else if (VALUE_FLAGS.has(arg) && i + 1 < argv.length)
      values[arg] = argv[++i];
    else unexpected.push(arg);
  }
  return {
    email: values["--email"],
    timeZone: values["--time-zone"],
    confirmRef: values["--confirm-ref"],
    production,
    execute,
    unexpected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unexpected.includes("--confirm-host")) fail(CONFIRM_HOST_RETIRED);
  if (args.unexpected.length > 0) {
    fail(
      `Unexpected argument(s): ${args.unexpected.join(" ")}\n` +
        "In PowerShell, npm drops options after `--`; run the script with npx tsx directly (see the runbook).",
    );
  }
  if (!args.email || !args.timeZone) {
    fail(
      "Usage: --email <account email> --time-zone <IANA zone> [--confirm-ref <ref>] [--production] [--execute]",
    );
  }

  // Identity first — before any connection is opened.
  let target: VerifiedTarget;
  try {
    target = assertOperatorTarget({
      env: process.env,
      uses: ["DIRECT_URL"],
      confirmRef: args.confirmRef,
      production: "explicit-opt-in",
      productionOptIn: args.production,
    });
  } catch (error) {
    if (error instanceof TargetRefused) fail(error.message);
    throw error;
  }

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });
  try {
    await verifyTargetMarker(target, (sql) => db.$queryRawUnsafe(sql));
    const input = { email: args.email, timeZone: args.timeZone };
    const plan = await planOwnershipBackfill(db, input);
    console.log(
      `Overload ownership assignment — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}`,
    );
    console.log(formatPlan(plan, describeTarget(target)));
    if (plan.refusals.length > 0) process.exit(1);
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to assign.");
      return;
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
      "\nDone. Next: Stage 3 (npx prisma migrate deploy applies 9_account_ownership_2_enforce).",
    );
  } catch (error) {
    if (error instanceof TargetRefused) fail(`\n${error.message}`);
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
