/**
 * QA fixture CLI (OVE-173). Seed, reset, or verify the ONE designated QA test
 * account on the development project (`overload-dev`). Never Production.
 *
 *   # Export the DEVELOPMENT values in this shell first (.env is never read):
 *   #   DATABASE_URL  NEXT_PUBLIC_SUPABASE_URL  (DIRECT_URL, if set, must match)
 *   npm run qa:verify -- --user-id <uuid> --confirm-ref vdxrmfadikwzodjljbdi
 *   npm run qa:seed   -- --user-id <uuid> --confirm-ref vdxrmfadikwzodjljbdi
 *       … --execute --confirm-user <same uuid>        (empty account only)
 *   npm run qa:reset  -- --user-id <uuid> --confirm-ref vdxrmfadikwzodjljbdi
 *       … --execute --confirm-destroy <same uuid>     (deletes its training data)
 *
 * Every command is read-only unless --execute is given. Before any connection
 * the guard refuses Production in every form (no override), refuses the local
 * stack and every hosted project except the development one, and requires
 * DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL to name that same project. After
 * connecting, the database identity marker must match, the auth user must
 * exist with a profile, and its email must be on a reserved test domain.
 * Nothing is chosen automatically: the account is always named.
 */
import {
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../operator/target-identity";
import { DEV_PROJECT_REF } from "../operator/provision-dev-test-user/provision";
import { maskEmail } from "../demo/guard";

export const QA_COMMANDS = ["seed", "reset", "verify"] as const;
export type QaCommand = (typeof QA_COMMANDS)[number];

const VALUE_FLAGS = new Set([
  "--user-id",
  "--confirm-ref",
  "--confirm-user",
  "--confirm-destroy",
  "--email",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QaCliArgs = {
  command: string | undefined;
  userId: string | undefined;
  confirmRef: string | undefined;
  confirmUser: string | undefined;
  confirmDestroy: string | undefined;
  email: string | undefined;
  execute: boolean;
  unexpected: string[];
};

export function parseArgs(argv: string[]): QaCliArgs {
  const [command, ...rest] = argv;
  const values: Record<string, string> = {};
  let execute = false;
  const unexpected: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--execute") execute = true;
    else if (VALUE_FLAGS.has(arg) && i + 1 < rest.length)
      values[arg] = rest[++i];
    else unexpected.push(arg);
  }
  return {
    command,
    userId: values["--user-id"],
    confirmRef: values["--confirm-ref"],
    confirmUser: values["--confirm-user"],
    confirmDestroy: values["--confirm-destroy"],
    email: values["--email"],
    execute,
    unexpected,
  };
}

/** Validates the arguments; returns an error message or null. Pure. */
export function argsProblem(args: QaCliArgs): string | null {
  if (!QA_COMMANDS.includes(args.command as QaCommand))
    return `The first argument must be one of: ${QA_COMMANDS.join(", ")}.`;
  if (args.unexpected.length > 0)
    return `Unexpected argument(s): ${args.unexpected.join(" ")}. (There is no --force; see docs/technical/qa-fixture-account.md.)`;
  if (!args.userId || !UUID.test(args.userId))
    return "--user-id <uuid> is required: the QA account is always named explicitly.";
  if (!args.confirmRef)
    return `--confirm-ref ${DEV_PROJECT_REF} is required: the QA fixture runs only on the development project.`;
  if (args.confirmRef.trim().toLowerCase() !== DEV_PROJECT_REF)
    return `--confirm-ref must be the development project (${DEV_PROJECT_REF}); the QA fixture runs nowhere else.`;
  if (args.command === "verify" && args.execute)
    return "verify is read-only; --execute is not accepted.";
  if (args.command !== "seed" && args.confirmUser)
    return "--confirm-user belongs to seed; reset is confirmed with --confirm-destroy.";
  if (args.command !== "reset" && args.confirmDestroy)
    return "--confirm-destroy belongs to reset only.";
  if (
    args.command === "seed" &&
    args.execute &&
    args.confirmUser !== args.userId
  )
    return "seed --execute also needs --confirm-user <the same uuid>.";
  if (
    args.command === "reset" &&
    args.execute &&
    args.confirmDestroy !== args.userId
  )
    return "reset --execute deletes that account's training data: it needs --confirm-destroy <the same uuid>.";
  return null;
}

/**
 * The environment guard, before any connection: the development project
 * only, cross-checked by DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL, Production
 * refused with no override, the local stack refused. Pure.
 */
export function assertQaEnvironment(
  env: Record<string, string | undefined>,
  confirmRef: string,
): VerifiedTarget {
  const target = assertOperatorTarget({
    env,
    uses: ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    confirmRef,
    production: "refuse",
    allowLocal: false,
  });
  if (
    target.kind !== "hosted" ||
    target.production ||
    target.ref !== DEV_PROJECT_REF
  ) {
    throw new TargetRefused(
      `Refusing: the QA fixture runs only on the development project (${DEV_PROJECT_REF}).`,
    );
  }
  return target;
}

/** A refusal: printed, exit code 1, after the database connection is closed. */
class CliRefusal extends Error {}

function fail(message: string): never {
  throw new CliRefusal(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const problem = argsProblem(args);
  if (problem) fail(problem);
  const command = args.command as QaCommand;

  let target: VerifiedTarget;
  try {
    target = assertQaEnvironment(process.env, args.confirmRef!);
  } catch (error) {
    if (error instanceof TargetRefused) fail(error.message);
    throw error;
  }

  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-pg"),
  ]);
  const { accountFor } = await import("@/lib/data/operator");
  const qa = await import("./qa");
  const fixture = await import("./fixture");

  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    try {
      await verifyTargetMarker(target, (sql) => base.$queryRawUnsafe(sql));
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : "Identity marker check failed.",
      );
    }
    const userId = args.userId!;
    const rows = await base.$queryRawUnsafe<{ email: string | null }[]>(
      `SELECT email::text AS email FROM auth.users WHERE id = $1::uuid`,
      userId,
    );
    if (rows.length !== 1)
      fail(
        "Refusing: no auth user has that id on this project. Create the QA account first (docs/technical/qa-fixture-account.md §1). Nothing was read or written.",
      );
    const email = rows[0].email;
    if (!email)
      fail(
        "Refusing: that auth user has no email, so it cannot be a designated test account. Nothing was written.",
      );
    if (args.email && args.email.trim().toLowerCase() !== email.toLowerCase())
      fail(
        "Refusing: --email does not match that account. Nothing was written.",
      );
    try {
      qa.assertQaTestEmail(email);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    let account: Awaited<ReturnType<typeof accountFor>>;
    try {
      account = await accountFor(userId, base);
    } catch {
      fail(
        "Refusing: that auth user has no Overload profile yet. Sign in once on the staging web app (or run the dev test-user provisioner), then retry. Nothing was written.",
      );
    }

    console.log(
      `Overload QA fixture — ${command.toUpperCase()}${command === "verify" ? " (read-only)" : args.execute ? " — EXECUTE" : " — DRY RUN (no changes)"}`,
    );
    console.log(`  target:   ${describeTarget(target)}`);
    console.log(`  account:  ${userId} (${maskEmail(email)})`);
    console.log(
      `  fixture:  ${fixture.QA_FIXTURE_VERSION}   time zone: ${fixture.QA_TIME_ZONE}`,
    );

    if (command === "verify") {
      const v = await qa.verifyQaFixture(account);
      console.log(
        `  status:   ${v.status.toUpperCase()}${v.anchorIso ? `   baseline date: ${v.anchorIso}` : ""}   today: ${v.todayIso}`,
      );
      for (const c of v.checks)
        console.log(
          `  ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`,
        );
      if (v.status === "stale")
        console.log(
          "\nThe baseline was set on an earlier day; reset to make today's workout line up.",
        );
      if (v.status === "empty") console.log("\nNo training data: run seed.");
      if (v.status === "drifted") process.exitCode = 2;
      return;
    }

    const inspection = await qa.inspectQaTarget(account);
    console.log(
      qa.formatCounts(
        "  current training rows:",
        inspection.counts,
        inspection.expected,
      ),
    );
    if (command === "seed" && inspection.state !== "empty")
      fail(
        "\nRefusing: the account already holds training data. Use reset. Nothing was written.",
      );
    if (command === "reset") {
      console.log(
        `\n  reset deletes: ${qa.QA_RESET_MODELS.join(", ")} (this account only)`,
      );
      console.log(`  reset keeps:   ${qa.QA_PRESERVED_MODELS.join("; ")}`);
      if (inspection.importsHoldingABlock > 0)
        fail(
          `\nRefusing: ${inspection.importsHoldingABlock} plan-import session(s) point at a block. Clear them with the plan-import cleanup tool first. Nothing was written.`,
        );
    }
    if (!args.execute) {
      console.log(
        `\nNothing written. Re-run with --execute ${command === "seed" ? "--confirm-user" : "--confirm-destroy"} ${userId} to ${command}.`,
      );
      return;
    }

    const result =
      command === "seed"
        ? await qa.executeQaSeed(account, { email })
        : await qa.executeQaReset(account, { email });
    console.log(
      `\n${command === "seed" ? "Seeded" : "Reset"} in one transaction. Baseline date: ${result.anchorIso}.`,
    );
    if (result.deleted)
      console.log(qa.formatCounts("  training rows deleted:", result.deleted));
    console.log(qa.formatCounts("  training rows now:", result.created));
    console.log("\nNot seeded, by design:");
    for (const line of fixture.QA_NOT_SEEDED) console.log(`  - ${line}`);
  } finally {
    await base.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
