/**
 * One-time import of the lifter's real plan into the database in DATABASE_URL.
 * Admin tooling: never imported by `src/`, no route, no browser surface.
 *
 *   npm run import:plan                                   # DRY RUN (default): reads only
 *   npm run import:plan -- --apply --confirm-host <host>  # writes, in one transaction
 *
 * The dry run prints the target host, every gym / exercise / session / cardio
 * decision, and any blocker. --apply refuses unless the dry run is clean and
 * <host> exactly matches the DATABASE_URL host (no secrets are printed).
 */
import "dotenv/config";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { BLOCKS, SESSIONS } from "./plan";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function target() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }
  const host = url.hostname.toLowerCase();
  const user = decodeURIComponent(url.username).toLowerCase();
  // The app's Supabase project must be the same environment as the database.
  const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let project = "local";
  if (appUrl) {
    const appHost = new URL(appUrl).hostname.toLowerCase();
    const ref = /^([a-z0-9]+)\.supabase\.(co|com|in|net)$/.exec(appHost)?.[1];
    if (ref) {
      project = ref;
      if (!(user.endsWith(`.${ref}`) || host === `db.${ref}.supabase.co`)) {
        fail(
          `Refusing: DATABASE_URL does not belong to the Supabase project "${ref}" in NEXT_PUBLIC_SUPABASE_URL.`,
        );
      }
    } else if (!LOCAL_HOSTS.has(appHost) || !LOCAL_HOSTS.has(host)) {
      fail(
        "Refusing: the database and NEXT_PUBLIC_SUPABASE_URL are different environments.",
      );
    }
  }
  return {
    host,
    project,
    local: LOCAL_HOSTS.has(host),
    database: url.pathname.replace(/^\//, "") || "postgres",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirmIdx = args.indexOf("--confirm-host");
  const confirmHost = confirmIdx >= 0 ? args[confirmIdx + 1] : undefined;
  // Anything else is a mistake — e.g. PowerShell swallowing `--`, so npm eats
  // --apply/--confirm-host and only the host arrives. Fail loudly, never
  // silently fall back to a different mode.
  const unexpected = args.filter(
    (a, i) =>
      a !== "--apply" &&
      a !== "--confirm-host" &&
      !(args[i - 1] === "--confirm-host" && i === confirmIdx + 1),
  );
  if (unexpected.length) {
    fail(
      `Unexpected argument(s): ${unexpected.join(" ")}\n` +
        "In PowerShell, npm drops options after `--`. Run the script directly instead:\n" +
        "  npx tsx --conditions=react-server scripts/import/real-plan/cli.ts --apply --confirm-host <host>",
    );
  }

  const t = target();
  if (apply && confirmHost !== t.host) {
    fail(
      `Refusing to write: re-run with --apply --confirm-host ${t.host} after reviewing the dry run.`,
    );
  }

  // Loaded only after the target checks: these create the Prisma client.
  const { prisma } = await import("@/lib/db");
  const { inspect, applyImport, verifyImport } = await import("./import");

  try {
    const ins = await inspect(prisma);
    const out: string[] = [];
    out.push(
      `${apply ? "IMPORT" : "DRY RUN (no writes)"} — real training plan`,
    );
    out.push(``);
    out.push(`## Environment`);
    out.push(
      `  Database host   ${t.host}${t.local ? " (LOCAL)" : " (REMOTE)"} / ${t.database}`,
    );
    out.push(`  Supabase project ${t.project}`);
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
        `  npx tsx --conditions=react-server scripts/import/real-plan/cli.ts --apply --confirm-host ${t.host}`,
      );
      console.log(out.join("\n"));
      return;
    }
    console.log(out.join("\n"));

    const result = await applyImport(prisma, ins);
    const failures = await verifyImport(prisma, ins, result);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
