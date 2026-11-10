/**
 * Workout Plan Import & Review (Pitch 22, OVE-109) — operator cleanup CLI for
 * abandoned import sources (see ./cleanup.ts and the production runbook).
 * Operator tooling; a human runs it. This is the MANUAL stand-in for the reliable
 * <=24h scheduled purge the repo's infrastructure cannot yet guarantee (no
 * scheduler/cron/queue — an architecture non-goal); see ./cleanup.ts header.
 *
 *   npx tsx --conditions=react-server scripts/operator/plan-import-cleanup/cli.ts \
 *     [--now <ISO instant>] [--confirm-ref <project ref>]      # DRY RUN (default)
 *   ... --execute                                              # writes, one tx/batch
 *
 * Connects with DIRECT_URL and deletes Storage objects through
 * NEXT_PUBLIC_SUPABASE_URL. Before ANY connection, the target-identity guard
 * (../target-identity.ts, OVE-111) identifies the project from DATABASE_URL,
 * DIRECT_URL and NEXT_PUBLIC_SUPABASE_URL (every one that is set must agree).
 * A hosted project needs --confirm-ref <its ref> (a hostname is never
 * confirmation) plus its database identity marker; PRODUCTION additionally
 * needs --production. --confirm-host is retired. Prints the target and COUNTS
 * ONLY — never a user id, filename, source text, or draft. The dry run lists
 * exactly what would be purged; confirm the counts first.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { removeSourceObjects } from "@/lib/import/storage";
import { executeCleanup, formatPlan, planCleanup } from "./cleanup";
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../target-identity";

const VALUE_FLAGS = new Set(["--now", "--confirm-ref"]);

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
    now: values["--now"] ? new Date(values["--now"]) : new Date(),
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
  if (Number.isNaN(args.now.getTime())) fail("--now is not a valid instant.");

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
    const plan = await planCleanup(db, { now: args.now });
    console.log(
      `Overload plan-import cleanup - ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}  target=${describeTarget(target)}`,
    );
    console.log(formatPlan(plan));
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to purge.");
      return;
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
  } catch (error) {
    if (error instanceof TargetRefused) fail(`\n${error.message}`);
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
