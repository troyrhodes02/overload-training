/**
 * Plans, Billing & Promo Codes — founding-member comp grant CLI (spec RD-10;
 * see ./grant.ts and the production runbook). Operator tooling; a human runs it.
 *
 *   npx tsx --conditions=react-server scripts/operator/founding-members/cli.ts \
 *     --before <ISO instant> [--confirm-ref <project ref>]   # DRY RUN (default)
 *   … --execute                                             # writes, one transaction
 *
 * Connects with DIRECT_URL. Before ANY connection, the target-identity guard
 * (../target-identity.ts, OVE-111) identifies the project from DATABASE_URL,
 * DIRECT_URL and NEXT_PUBLIC_SUPABASE_URL. A hosted project needs
 * --confirm-ref <its ref> (a hostname is never confirmation) plus its database
 * identity marker; PRODUCTION additionally needs --production. Prints the
 * target and counts only. The dry run lists exactly which accounts would be
 * granted; confirm the set first.
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
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../target-identity";

const VALUE_FLAGS = new Set(["--before", "--confirm-ref"]);

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
    // Default cutoff: now (every existing account). An explicit --before makes
    // the batch reproducible across runs.
    before: values["--before"] ?? new Date().toISOString(),
    confirmRef: values["--confirm-ref"],
    production,
    execute,
    unexpected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unexpected.includes("--confirm-host")) fail(CONFIRM_HOST_RETIRED);
  if (args.unexpected.length > 0)
    fail(`Unexpected argument(s): ${args.unexpected.join(" ")}`);

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
    const plan = await planFoundingMembers(db, { cutoffIso: args.before });
    console.log(
      `Overload founding-member comp — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}  target=${describeTarget(target)}`,
    );
    console.log(formatPlan(plan));
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to grant.");
      return;
    }
    const result = await executeFoundingMembers(db, plan);
    console.log(`\nGranted in one transaction: ${result.created} comp(s).`);
  } catch (error) {
    if (error instanceof TargetRefused) fail(`\n${error.message}`);
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
