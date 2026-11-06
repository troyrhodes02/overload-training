/**
 * Demo seed CLI (Public Landing Page & Changelog, spec §13; RD-16). Operator
 * tooling for an ISOLATED LOCAL stack only.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *   npm run demo:seed -- --user-id <uuid> [--email <addr>] [--anchor YYYY-MM-DD]
 *       → DRY RUN (default): prints the target, its state, and the counts.
 *   … --execute --confirm-user <same uuid>
 *       → writes the fixture in one transaction (only into an EMPTY account).
 *
 * It never loads .env (the repo's .env points at PRODUCTION). The guard runs
 * before any connection and refuses the production project, any hosted
 * Supabase host, and any non-loopback database — with no override flag.
 */
import { DemoSeedRefused, assertSafeEnvironment, maskEmail } from "./guard";

const VALUE_FLAGS = new Set([
  "--user-id",
  "--email",
  "--anchor",
  "--confirm-user",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DemoCliArgs = {
  userId: string | undefined;
  email: string | undefined;
  anchor: string | undefined;
  confirmUser: string | undefined;
  execute: boolean;
  unexpected: string[];
};

export function parseArgs(argv: string[]): DemoCliArgs {
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
    userId: values["--user-id"],
    email: values["--email"],
    anchor: values["--anchor"],
    confirmUser: values["--confirm-user"],
    execute,
    unexpected,
  };
}

/** Validates the arguments; returns an error message or null. */
export function argsProblem(args: DemoCliArgs): string | null {
  if (args.unexpected.length > 0)
    return `Unexpected argument(s): ${args.unexpected.join(" ")}`;
  if (!args.userId || !UUID.test(args.userId))
    return "--user-id <uuid> is required: the demo account is always named explicitly.";
  if (args.anchor && !/^\d{4}-\d{2}-\d{2}$/.test(args.anchor))
    return "--anchor must be YYYY-MM-DD.";
  if (args.execute && args.confirmUser !== args.userId)
    return "--execute also needs --confirm-user <the same uuid>, as an explicit confirmation of the target.";
  return null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const problem = argsProblem(args);
  if (problem) fail(problem);

  // Guard FIRST — before any module that could open a connection is loaded.
  let host: string;
  let databaseUrl: string;
  try {
    ({ host, databaseUrl } = assertSafeEnvironment(process.env));
  } catch (error) {
    if (error instanceof DemoSeedRefused) fail(`REFUSED: ${error.message}`);
    throw error;
  }

  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-pg"),
  ]);
  const { accountFor } = await import("@/lib/data/operator");
  const { todayIso } = await import("@/lib/plan/calendar");
  const { DEMO_FIXTURE_VERSION } = await import("./fixture");
  const { executeDemoSeed, formatInspection, inspectDemoTarget } =
    await import("./seed");

  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const userId = args.userId!;
    // Identity check: the auth user exists, and (if given) the email matches.
    const rows = await base.$queryRawUnsafe<{ email: string }[]>(
      `SELECT email::text AS email FROM auth.users WHERE id = $1::uuid`,
      userId,
    );
    if (rows.length !== 1) fail("No auth user has that id on this database.");
    const email = rows[0].email;
    if (args.email && args.email.trim().toLowerCase() !== email.toLowerCase())
      fail("The --email cross-check does not match that user. Nothing read.");

    const account = await accountFor(userId, base);
    const anchor = args.anchor ?? todayIso(account.timeZone);
    const inspection = await inspectDemoTarget(account);

    console.log(
      `Overload demo seed — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}`,
    );
    console.log(`  host:     ${host} (loopback)`);
    console.log(`  account:  ${userId} (${maskEmail(email)})`);
    console.log(`  fixture:  ${DEMO_FIXTURE_VERSION}   anchor: ${anchor}`);
    console.log(formatInspection(inspection));

    if (!args.execute) {
      console.log(
        "\nNothing written. Re-run with --execute --confirm-user <uuid> to seed.",
      );
      return;
    }
    if (inspection.state === "seeded") {
      console.log("\nAlready seeded with this fixture. Nothing written.");
      return;
    }
    if (inspection.state === "conflict") fail("\nREFUSED. Nothing written.");

    const result = await executeDemoSeed(account, anchor);
    console.log(
      `\nSeeded in one transaction: ${result.created.loggedSessions} workouts, ${result.created.loggedSets} sets.`,
    );
  } finally {
    await base.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
