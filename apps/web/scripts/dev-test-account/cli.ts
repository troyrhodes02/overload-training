/**
 * Create one disposable development test account, ready for one scenario
 * (Pitch 21f spec §11, RD-26). Operator tooling for the ONE development
 * project (`overload-dev`): never Production, never imported by `src/`, no
 * route. It provisions the account and seeds it in one go:
 *
 *   # Export the DEVELOPMENT values in this shell first (never from .env):
 *   #   DATABASE_URL  DIRECT_URL  NEXT_PUBLIC_SUPABASE_URL  SUPABASE_SERVICE_ROLE_KEY
 *   npm run dev:test-account -- --email 21f-gym@example.com --profile gym \
 *     --confirm-ref vdxrmfadikwzodjljbdi             # DRY RUN (default), writes nothing
 *   … --execute                                      # creates and seeds
 *   … --username <name>                              # optional (default: from the email)
 *
 * Profiles (profiles.ts): standard, gym, bodyweight, cardio, missed (21f), and
 * the Pitch 21g insight scenarios: progress, hold, reactive-deload, rir,
 * scheduled-deload, post-deload, insufficient, edit, free, entitlement,
 * summary, recovery, isolation-a, isolation-b. After seeding, an ENGINE
 * CHECK prints today's calls as the gated server reader states them and
 * compares them with the profile's promise (exit code 2 on a mismatch).
 *
 *   … --email <existing test account> --access free|pro --confirm-ref …
 *     switches that account's comp Pro off or on (21g RD-16; access.ts),
 *     then prints its plan and the engine check again.
 *
 * It adds no write path of its own. The account is created by the
 * provisioning tool's own module (a confirmed auth user, its profile, comp
 * Pro), and its training data by the demo seed (the application's own write
 * modules, one transaction). The story is anchored to the account's own
 * today when the command runs (yesterday for `missed`).
 *
 * Guards, before any connection: Production is refused with no override, only
 * the development project is accepted, the service-role key must belong to
 * it, the email must be on a reserved test domain, and the database's
 * identity marker must match. Never loads .env. Create-only: an account that
 * already holds this fixture is left alone, and one holding anything else is
 * refused. It never edits, merges, resets, or deletes.
 *
 * The password is written ONLY to an owner-only file outside the repository
 * (~/.overload-dev/accounts/<email>.txt) and is never printed.
 */
import fs from "node:fs";
import {
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../operator/target-identity";
import {
  guardProvisionTarget,
  supabaseAdmin,
  writeCredentialsFile,
} from "../operator/provision-dev-test-user/cli";
import {
  DEFAULT_TIME_ZONE,
  DEV_PROJECT_REF,
  ProvisionRefused,
  executeProvision,
  generatePassword,
  planProvision,
} from "../operator/provision-dev-test-user/provision";
import {
  anchorFor,
  argsProblem,
  credentialsFileFor,
  parseArgs,
  profileOf,
  usernameFor,
  type AccessValue,
  type ProfileName,
} from "./profiles";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const problem = argsProblem(args);
  if (problem) fail(problem);
  const email = args.email!;
  const access = args.access as AccessValue | undefined;
  const profile = (args.profile ?? "standard") as ProfileName;
  const username = args.username ?? usernameFor(email);
  const spec = profileOf(profile);
  const { variant } = spec;

  // Guards FIRST, before any module that could open a connection is loaded.
  let target: VerifiedTarget;
  try {
    target = assertOperatorTarget({
      env: process.env,
      uses: ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      confirmRef: args.confirmRef,
      production: "refuse",
      allowLocal: false,
    });
    // The provisioning tool's own guard: this project only, and a service
    // role key that belongs to it.
    guardProvisionTarget(process.env, args);
  } catch (error) {
    if (error instanceof TargetRefused) fail(error.message);
    throw error;
  }
  if (target.kind !== "hosted" || target.ref !== DEV_PROJECT_REF) {
    fail(
      `Refusing: this tool writes only to the development project ${DEV_PROJECT_REF}.`,
    );
  }

  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-pg"),
  ]);
  const { accountFor } = await import("@/lib/data/operator");
  const { todayIso } = await import("@overload/shared/plan/calendar");
  const { executeDemoSeed, formatInspection, inspectDemoTarget } =
    await import("../demo/seed");
  const { engineReport, planLabel } = await import("./engine-report");
  const { executeAccess, planAccess } = await import("./access");

  // The provisioner uses the direct connection; the seed, like the demo seed,
  // the runtime (pooled) one.
  const direct = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });
  const pooled = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    for (const db of [direct, pooled]) {
      await verifyTargetMarker(target, (sql) => db.$queryRawUnsafe(sql));
    }
    const auth = supabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const input = {
      email,
      username,
      timeZone: DEFAULT_TIME_ZONE,
      grantPro: spec.access === "pro",
    };
    const file = credentialsFileFor(email);

    /** Print today's calls as the server says them; mismatch → exit 2. */
    const check = async (userId: string) => {
      const account = await accountFor(userId, pooled);
      console.log(`  plan:     ${await planLabel(account)}`);
      const report = await engineReport(
        account,
        access ? { expect: [], deloadWeek: null } : spec,
      );
      console.log("\nEngine check (the gated server reader, read-only):");
      for (const line of report.lines) console.log(line);
      if (report.problems.length > 0) {
        console.log("\nENGINE CHECK MISMATCH:");
        for (const p of report.problems) console.log(`  - ${p}`);
        console.log(
          "The data is real and was kept. Use a NEW email for a fresh account, and report this.",
        );
        process.exitCode = 2;
      } else if (
        !access &&
        (spec.expect.length > 0 || spec.unfinished !== null)
      ) {
        console.log("ENGINE CHECK PASSED");
      }
    };

    console.log(
      `Overload dev test account — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}  target=${describeTarget(target)}`,
    );
    console.log(`  email:    ${email}`);

    if (access) {
      // Switch an EXISTING test account's plan (Pitch 21g RD-16).
      const userId = await auth.findUserIdByEmail(email);
      if (!userId)
        fail("\nRefusing: no account has that email. Nothing was changed.");
      const before = await accountFor(userId, pooled);
      console.log(`  plan now: ${await planLabel(before)}`);
      const plan = await planAccess(direct, userId, access);
      if (plan.refusal) fail(`\nREFUSED. ${plan.refusal} Nothing was changed.`);
      const verb = args.execute ? "" : "would ";
      console.log(
        `  switch:   ${plan.action === "nothing" ? `already ${access === "pro" ? "Pro" : "Free"}: nothing to do` : plan.action === "revoke-comp" ? `${verb}end its comp Pro (Free)` : `${verb}grant comp Pro (no Stripe)`}`,
      );
      if (!args.execute) {
        console.log("\nNothing written. Re-run with --execute to switch it.");
        return;
      }
      await executeAccess(direct, userId, plan);
      console.log("\nSwitched. The next read of any screen uses the new plan.");
      await check(userId);
      return;
    }

    console.log(
      `  profile:  ${profile} (fixture: ${variant}; ${spec.access === "free" ? "Free plan" : "Pro, comp"})`,
    );

    const plan = await planProvision(direct, auth, input);
    // The Free scenario needs an account with no Pro at all (review #9): an
    // existing account's comp, trial, or billing would leave it Pro.
    if (spec.access === "free" && plan.userId) {
      const free = await planAccess(direct, plan.userId, "free");
      if (free.activeComps > 0 || free.activeTrial || free.billingRows > 0) {
        fail(
          `\nRefusing: this account already has Pro (${free.activeComps > 0 ? "comp" : free.activeTrial ? "a trial" : "a billing record"}), so it can't be the Free scenario. Use a new email${free.activeComps > 0 && !free.activeTrial && free.billingRows === 0 ? ", or run --access free first" : ""}. Nothing was changed.`,
        );
      }
    }
    console.log(
      `  account:  ${plan.authUser === "exists" ? `exists (${plan.userId}); its password is not changed` : `would be created (email pre-confirmed, no email sent, ${spec.access === "free" ? "Free: no comp" : "comp Pro"})`}`,
    );

    if (!args.execute) {
      if (plan.userId && plan.profile === "exists") {
        const account = await accountFor(plan.userId, pooled);
        console.log(
          `  anchor:   ${anchorFor(profile, todayIso(account.timeZone))} (${account.timeZone})`,
        );
        console.log(
          formatInspection(await inspectDemoTarget(account, variant)),
        );
      } else {
        console.log("  training: would seed the fixture into the new account");
      }
      console.log("\nNothing written. Re-run with --execute to create it.");
      return;
    }

    if (plan.authUser === "will-create" && fs.existsSync(file)) {
      fail(
        `\nRefusing: ${file} already exists but that account does not. Move the file aside first. Nothing was changed.`,
      );
    }
    // The password is written to its file BEFORE the auth user exists, so it
    // can never be lost; if provisioning then fails, the file is removed.
    let wroteFile = false;
    let provisioned;
    try {
      provisioned = await executeProvision(direct, auth, input, () => {
        const password = generatePassword();
        writeCredentialsFile(email, password, file);
        wroteFile = true;
        return password;
      });
    } catch (error) {
      if (wroteFile) fs.rmSync(file, { force: true });
      throw error;
    }

    const account = await accountFor(provisioned.userId, pooled);
    const anchor = anchorFor(profile, todayIso(account.timeZone));
    console.log(`  user id:  ${provisioned.userId} (${provisioned.status})`);
    console.log(`  anchor:   ${anchor} (${account.timeZone})`);

    const inspection = await inspectDemoTarget(account, variant);
    if (inspection.state === "conflict") {
      console.log(formatInspection(inspection));
      fail(
        "\nREFUSED. This account holds other training data; nothing was seeded. Use a new email for a fresh account.",
      );
    }
    if (inspection.state === "seeded") {
      console.log(
        "\nAlready seeded with this fixture. Nothing written. Its dates are from the day it was seeded: use a new email for a fresh one.",
      );
    } else {
      const result = await executeDemoSeed(account, anchor, variant);
      console.log(
        `\nSeeded in one transaction: ${result.created.gyms} gyms, ${result.created.loggedSessions} workouts, ${result.created.loggedSets} sets, ${result.created.plannedCardio} planned cardio, ${result.created.cardioLogs} cardio logs.`,
      );
    }
    console.log(
      fs.existsSync(file)
        ? `Password file (owner-only, never printed): ${file}`
        : "No password file for this account on this Mac (it was created elsewhere).",
    );
    await check(provisioned.userId);
  } catch (error) {
    if (error instanceof TargetRefused || error instanceof ProvisionRefused)
      fail(`\n${error.message}`);
    throw error;
  } finally {
    await Promise.all([direct.$disconnect(), pooled.$disconnect()]);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
