/**
 * Scenario seeding CLI (dev tooling only).
 *
 *   npm run seed:scenario -- --list
 *   npm run seed:scenario -- established
 *   npm run seed:scenario -- plateau --date 2026-10-12
 *   npm run seed:scenario -- fresh --no-verify
 *
 * Replaces the local database's application data with one scenario's
 * timeline for the SAME single lifter (auth accounts are never touched), then
 * verifies through the application's own read layer that the intended states
 * derive. Refuses any target that is not unambiguously local (./guard.ts).
 * See docs/dev/scenario-seeding.md.
 */
import "dotenv/config";
import { parseIsoDate, todayIso } from "@/lib/plan/calendar";
import { assertScenarioTargetAllowed } from "./guard";
import { SCENARIOS, findScenario } from "./registry";

const USAGE = `Usage: npm run seed:scenario -- <scenario> [--date YYYY-MM-DD] [--no-verify]
       npm run seed:scenario -- --list`;

function list(): string {
  const width = Math.max(...SCENARIOS.map((s) => s.key.length));
  return SCENARIOS.map(
    (s) => `  ${s.key.padEnd(width)}  ${s.description}`,
  ).join("\n");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(`${USAGE}\n\nScenarios:\n${list()}`);
    return;
  }
  if (args.includes("--list")) {
    console.log(`Scenarios:\n${list()}`);
    return;
  }

  let key: string | undefined;
  let anchorIso = todayIso();
  let verify = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--date") {
      const value = args[++i];
      if (!value || !parseIsoDate(value))
        fail(`--date needs a real date (YYYY-MM-DD).\n${USAGE}`);
      anchorIso = value;
    } else if (a.startsWith("--date=")) {
      const value = a.slice("--date=".length);
      if (!parseIsoDate(value))
        fail(`--date needs a real date (YYYY-MM-DD).\n${USAGE}`);
      anchorIso = value;
    } else if (a === "--no-verify") {
      verify = false;
    } else if (a === "--verify") {
      verify = true;
    } else if (a.startsWith("-")) {
      fail(`Unknown option ${a}.\n${USAGE}`);
    } else if (key) {
      fail(`Only one scenario at a time.\n${USAGE}`);
    } else {
      key = a;
    }
  }
  if (!key || !findScenario(key)) {
    fail(`Unknown scenario "${key ?? ""}". Choose one of:\n${list()}`);
  }

  // Safety first: identify the target before anything touches a database.
  let target;
  try {
    target = assertScenarioTargetAllowed(process.env);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // Loaded only after the guard: these modules create the Prisma client.
  const { seedScenario } = await import("./run");
  const { prisma } = await import("@/lib/db");
  console.log(
    `Seeding "${key}" (anchor ${anchorIso}) into ${target.host}:${target.port}/${target.database} …`,
  );
  try {
    const r = await seedScenario(key, anchorIso, { verify });
    const lines = [
      ``,
      `Scenario     ${r.scenario}`,
      `Anchor date  ${r.anchorIso}${r.anchorIso === todayIso() ? " (today)" : " (the app still renders against the real today)"}`,
      `Database     ${target.host}:${target.port}/${target.database} (local)`,
      `Account      ${r.authAccounts === null ? "n/a" : `${r.authAccounts} existing auth account(s), unchanged — log in as usual`}`,
      `Active block ${r.activeMesocycle ? `${r.activeMesocycle.name}, week ${r.activeMesocycle.week}` : "none"}`,
      `Workouts     ${r.completedWorkouts} completed${r.historyRange ? ` (${r.historyRange.from} → ${r.historyRange.to})` : ""}`,
      `Gyms         ${r.gyms.map((g) => `${g.name}${g.archived ? " (archived)" : ""}`).join(", ")}`,
      `Goals        ${r.activeGoals.length ? r.activeGoals.map((g) => `${g.label} — ${g.percent === null ? "no performance yet" : `${g.percent}%`}`).join("; ") : "none"}`,
      `Features     Goals ✓, Cardio ✓ (all seven roadmap pitches are present)`,
    ];
    if (r.derived.length) {
      lines.push(`Derived by the app:`);
      for (const d of r.derived) lines.push(`  · ${d}`);
    }
    console.log(lines.join("\n"));
    if (r.failures.length) {
      console.error(
        `\nVERIFICATION FAILED — the data was written, but these intended states did not derive:\n` +
          r.failures.map((f) => `  ✗ ${f}`).join("\n"),
      );
      process.exitCode = 1;
    } else {
      console.log(verify ? `\nVerified ✓` : `\n(verification skipped)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
