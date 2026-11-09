/**
 * One-time import of the lifter's real plan into the database in DATABASE_URL.
 * Admin tooling: never imported by `src/`, no route, no browser surface.
 *
 *   npm run import:plan -- --account-email <email> [--confirm-ref <ref>]   # DRY RUN (default)
 *   … --apply                                                              # writes, one transaction
 *
 * Before ANY connection, the target-identity guard (scripts/operator/
 * target-identity.ts, OVE-111) identifies the project from DATABASE_URL,
 * DIRECT_URL and NEXT_PUBLIC_SUPABASE_URL. A hosted project needs
 * --confirm-ref <its ref> (a hostname is never confirmation) plus its database
 * identity marker; PRODUCTION additionally needs --production. The dry run
 * prints the target, the target account (resolved from the email to exactly
 * one auth user, which must already have a profile), every gym / exercise /
 * session / cardio decision, and any blocker. --apply refuses unless the dry
 * run is clean. No secrets are printed. The account is never inferred
 * (CLAUDE.md → Operator tasks; Multi-User Foundation R19).
 */
import "dotenv/config";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { BLOCKS, SESSIONS } from "./plan";
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../../operator/target-identity";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const VALUE_FLAGS = new Set(["--account-email", "--confirm-ref"]);

export function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  let apply = false;
  let production = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--production") production = true;
    else if (VALUE_FLAGS.has(arg) && i + 1 < argv.length)
      values[arg] = argv[++i];
    else unexpected.push(arg);
  }
  return {
    accountEmail: values["--account-email"],
    confirmRef: values["--confirm-ref"],
    apply,
    production,
    unexpected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { apply, accountEmail } = args;
  if (args.unexpected.includes("--confirm-host")) fail(CONFIRM_HOST_RETIRED);
  // Anything else is a mistake — e.g. PowerShell swallowing `--`, so npm eats
  // the flags and only their values arrive. Fail loudly, never silently fall
  // back to a different mode.
  if (args.unexpected.length) {
    fail(
      `Unexpected argument(s): ${args.unexpected.join(" ")}\n` +
        "In PowerShell, npm drops options after `--`. Run the script directly instead:\n" +
        "  npx tsx --conditions=react-server scripts/import/real-plan/cli.ts --account-email <email> [--confirm-ref <ref>] --apply",
    );
  }
  if (!accountEmail) {
    fail(
      "Name the target account: --account-email <email>. The import never infers it.",
    );
  }

  // Identity first — before the module that builds the Prisma client loads.
  let t: VerifiedTarget;
  try {
    t = assertOperatorTarget({
      env: process.env,
      uses: ["DATABASE_URL"],
      confirmRef: args.confirmRef,
      production: "explicit-opt-in",
      productionOptIn: args.production,
    });
  } catch (error) {
    if (error instanceof TargetRefused) fail(error.message);
    throw error;
  }

  // Loaded only after the target checks: these create the Prisma client.
  const { prisma } = await import("@/lib/db");
  const { inspect, applyImport, verifyImport, resolveTargetAccount } =
    await import("./import");
  const { accountFor } = await import("@/lib/data/operator");

  try {
    try {
      await verifyTargetMarker(t, (sql) => prisma.$queryRawUnsafe(sql));
    } catch (error) {
      if (error instanceof TargetRefused) fail(error.message);
      throw error;
    }
    const target = await resolveTargetAccount(prisma, accountEmail);
    if ("error" in target) fail(`Refusing: ${target.error}`);
    const account = await accountFor(target.userId);
    const ins = await inspect(prisma, account);
    const out: string[] = [];
    out.push(
      `${apply ? "IMPORT" : "DRY RUN (no writes)"} — real training plan`,
    );
    out.push(``);
    out.push(`## Environment`);
    out.push(`  Target          ${describeTarget(t)}`);
    out.push(`  Target account  ${target.email} → ${target.userId}`);
    out.push(
      `  Auth accounts   ${ins.authAccounts ?? "n/a"} (never created or changed)`,
    );
    out.push(
      `  Migrations      ${ins.pendingMigrations.length ? `PENDING: ${ins.pendingMigrations.join(", ")}` : "all applied (cardio supported)"}`,
    );
    out.push(``);
    out.push(`## Gyms`);
    for (const g of ins.gyms)
      out.push(
        `  ${g.action === "reuse" ? "REUSE " : "CREATE"} ${g.name}${g.id ? `  (${g.id})` : ""}`,
      );
    out.push(``);
    out.push(`## Mesocycles`);
    out.push(
      `  Existing: ${ins.mesocycles.length ? ins.mesocycles.map((m) => `"${m.name}" [${m.status}${m.startDate ? `, ${m.startDate}` : ""}]`).join("; ") : "none"}`,
    );
    for (const [i, b] of BLOCKS.entries()) {
      out.push(
        `  CREATE "${b.name}" — starts ${b.startDate}, ${b.lengthWeeks} weeks, scheduled deload week ${b.deloadEveryWeeks}, ${i === 0 ? "ACTIVE" : "DRAFT (clone-forward of Block 1; activate it yourself around Nov 23)"}`,
      );
    }
    out.push(``);
    out.push(`## Exercises (requested → production)`);
    for (const e of ins.exercises) {
      const gv = e.equipmentType
        ? isGymVariable({ equipmentType: e.equipmentType as never })
          ? ", per-gym baseline"
          : ""
        : "";
      const status = e.match === "missing" ? "MISSING" : e.match;
      out.push(
        `  ${status.padEnd(13)} ${e.ref.requested} → ${e.productionName ?? e.ref.name}  [${e.equipmentType ?? "?"}${gv}]  ${e.id ?? (e.match === "create-custom" ? "(new custom)" : "(not in library)")}`,
      );
    }
    out.push(``);
    out.push(`## Weekly schedule (both blocks)`);
    const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const s of SESSIONS) {
      out.push(
        `  ${days[s.dayOfWeek]}  ${s.name}${s.cardio ? `  + cardio: ${s.cardio.type} — ${s.cardio.durationMin} min` : "  (no cardio)"}`,
      );
      for (const [i, slot] of s.slots.entries()) {
        const name =
          ins.exercises.find((e) => e.ref === slot.ex)?.productionName ??
          slot.ex.name;
        out.push(
          `       ${i + 1}. ${name} — ${slot.sets} × ${slot.repMin}–${slot.repMax}`,
        );
      }
    }
    out.push(`  Sun  rest`);
    out.push(``);
    out.push(`## Not imported (by design)`);
    out.push(
      `  RIR, rest periods, coaching/progression notes, cardio pace/miles/intervals/incline/speed, optional Wed/Sat cardio,`,
    );
    out.push(`  working weights, gym baselines, logged workouts/sets, goals.`);
    if (ins.warnings.length) {
      out.push(``);
      out.push(`## Warnings`);
      for (const w of ins.warnings) out.push(`  ! ${w}`);
    }
    out.push(``);
    if (ins.alreadyImported) {
      out.push(
        `ALREADY IMPORTED — both blocks exist exactly as planned. Nothing to do.`,
      );
      console.log(out.join("\n"));
      return;
    }
    if (ins.blockers.length) {
      out.push(`## BLOCKED — nothing will be written`);
      for (const b of ins.blockers) out.push(`  ✗ ${b}`);
      console.log(out.join("\n"));
      process.exitCode = 1;
      return;
    }
    if (!apply) {
      out.push(`Dry run clean. To write (works in PowerShell too):`);
      out.push(
        `  npx tsx --conditions=react-server scripts/import/real-plan/cli.ts --account-email ${target.email}` +
          (t.kind === "hosted"
            ? ` --confirm-ref ${t.ref}${t.production ? " --production" : ""}`
            : "") +
          " --apply",
      );
      console.log(out.join("\n"));
      return;
    }
    console.log(out.join("\n"));

    const result = await applyImport(account, ins);
    const failures = await verifyImport(prisma, account, ins, result);
    console.log(`\n## Import written (one transaction)`);
    console.log(
      `  Block 1 ${result.block1Id} (active) · Block 2 ${result.block2Id} (draft)`,
    );
    for (const [n, id] of Object.entries(result.gyms))
      console.log(`  Gym ${n}: ${id}`);
    for (const [n, id] of Object.entries(result.customExercises))
      console.log(`  Custom exercise ${n}: ${id}`);
    if (failures.length) {
      console.error(
        `\nVERIFICATION FAILED:\n${failures.map((f) => `  ✗ ${f}`).join("\n")}`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `\nVerified ✓ — every record re-read and matched; no history, baselines, goals, or existing rows touched.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
