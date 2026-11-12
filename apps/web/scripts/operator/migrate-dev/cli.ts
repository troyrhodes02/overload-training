/**
 * Development migration wrapper (OVE-111). The ONLY sanctioned way to apply
 * Prisma migrations to the hosted development Supabase project.
 *
 *   npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref <dev ref>
 *       → DRY RUN (default): identity guard, identity marker, then the
 *         read-only `prisma migrate status`.
 *   … --execute
 *       → `prisma migrate deploy` (applies pending migrations; never resets,
 *         never pushes, never creates a migration).
 *
 * Order, all before Prisma's CLI is started:
 *   1. assertOperatorTarget — DATABASE_URL, DIRECT_URL and
 *      NEXT_PUBLIC_SUPABASE_URL must all be exported and name the SAME
 *      project; a hosted project needs --confirm-ref <its ref>; PRODUCTION is
 *      refused outright, with no flag that changes that.
 *   2. verifyTargetMarker — a read-only query proves the connected database
 *      carries `overload-target:<ref>`.
 *   3. The Prisma CLI runs with this process's environment. prisma.config.ts
 *      loads `.env`, but dotenv never overrides an exported variable, and all
 *      three were required to be exported in step 1.
 *
 * This wrapper never loads `.env` itself, so the guard sees only what the
 * operator exported. It also accepts the local Supabase CLI stack (no
 * confirmation needed there). Production migrations stay a human runbook step
 * (`prisma migrate deploy` with a fresh backup), never this tool.
 */
import { spawnSync } from "node:child_process";
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../target-identity";

export type MigrateDevArgs = {
  confirmRef: string | undefined;
  execute: boolean;
  unexpected: string[];
};

export function parseArgs(argv: string[]): MigrateDevArgs {
  let confirmRef: string | undefined;
  let execute = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") execute = true;
    else if (arg === "--confirm-ref" && i + 1 < argv.length)
      confirmRef = argv[++i];
    else unexpected.push(arg);
  }
  return { confirmRef, execute, unexpected };
}

/**
 * The guard step, separated for tests: refuses Production and anything not
 * provably the confirmed project. Never opens a connection.
 */
export function guardMigrationTarget(
  env: Record<string, string | undefined>,
  args: MigrateDevArgs,
): VerifiedTarget {
  if (args.unexpected.includes("--confirm-host")) {
    throw new TargetRefused(CONFIRM_HOST_RETIRED);
  }
  if (args.unexpected.length > 0) {
    throw new TargetRefused(
      `Unexpected argument(s): ${args.unexpected.join(" ")}. ` +
        "In PowerShell, npm drops options after `--`; run with npx tsx directly.",
    );
  }
  return assertOperatorTarget({
    env,
    uses: ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    confirmRef: args.confirmRef,
    production: "refuse",
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function readMarker(target: VerifiedTarget): Promise<void> {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-pg"),
  ]);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });
  try {
    const outcome = await verifyTargetMarker(target, (sql) =>
      db.$queryRawUnsafe(sql),
    );
    console.log(`  identity marker: ${outcome}`);
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let target: VerifiedTarget;
  try {
    target = guardMigrationTarget(process.env, args);
  } catch (error) {
    if (error instanceof TargetRefused) fail(`REFUSED: ${error.message}`);
    throw error;
  }

  console.log(
    `Overload dev migration — ${args.execute ? "EXECUTE (prisma migrate deploy)" : "DRY RUN (prisma migrate status)"}`,
  );
  console.log(`  target: ${describeTarget(target)}`);
  try {
    await readMarker(target);
  } catch (error) {
    if (error instanceof TargetRefused) fail(`REFUSED: ${error.message}`);
    fail("REFUSED: could not connect to read the identity marker.");
  }

  const prismaCli = require.resolve("prisma/build/index.js");
  const command = args.execute ? "deploy" : "status";
  const result = spawnSync(process.execPath, [prismaCli, "migrate", command], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error)
    fail(`Could not start the Prisma CLI: ${result.error.message}`);
  if (!args.execute) {
    const confirm =
      target.kind === "hosted" ? ` --confirm-ref ${target.ref}` : "";
    console.log(
      `\nprisma migrate status exited ${result.status} (non-zero is expected while migrations are pending). Nothing was applied.` +
        `\nTo apply: re-run with${confirm} --execute`,
    );
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
