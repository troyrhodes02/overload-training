/**
 * The command's engine check (Pitch 21g spec §11): READ-ONLY. It asks the
 * same gated reader the web's Today page and the phone's Today use
 * (getTodayView, full fields) what it says about today's lifts, prints it,
 * and compares it with the profile's promise. It starts no workout and
 * writes no set. Imported lazily by the CLI, after its target guards.
 */
import type { Account } from "@/lib/data/account";
import { can, resolveRequestEntitlement } from "@/lib/entitlements/resolve";
import { getTodayView } from "@/lib/views/today";
import { DEMO_LIBRARY, VARIANT_LIBRARY } from "../demo/fixture";
import { compareCall, describeCall } from "./engine-check";
import type { CallExpectation } from "./profiles";

const LIBRARY: Record<string, string> = { ...DEMO_LIBRARY, ...VARIANT_LIBRARY };

export async function planLabel(account: Account): Promise<string> {
  const { resolved } = await resolveRequestEntitlement(account);
  return can(resolved, "progression_insights")
    ? "Pro (progression insights on)"
    : "Free (progression insights locked)";
}

export type EngineReport = { lines: string[]; problems: string[] };

export async function engineReport(
  account: Account,
  want: { expect: readonly CallExpectation[]; deloadWeek: boolean | null },
): Promise<EngineReport> {
  const view = await getTodayView(account);
  const d = view.dashboard;
  const day = d.kind === "missed_day" ? d.below : d;
  const lines: string[] = [];
  const problems: string[] = [];
  if (!day || !("exercises" in day)) {
    lines.push(`  Today: ${d.kind} (no lifting day to check)`);
    if (want.expect.length > 0) problems.push("no lifting day today");
    return { lines, problems };
  }
  lines.push(
    `  Today: ${day.sessionName}, week ${day.week}${day.scheduledDeloadWeek ? " (scheduled deload week)" : ""}, ${day.kind}`,
  );
  if (want.deloadWeek !== null && day.scheduledDeloadWeek !== want.deloadWeek) {
    problems.push(
      `expected ${want.deloadWeek ? "a" : "no"} scheduled deload week, engine says ${day.scheduledDeloadWeek ? "deload week" : "ordinary week"}`,
    );
  }
  // One planned call per exercise, in the day's order.
  view.plannedProgression.forEach((p, i) => {
    const name = day.exercises[i]?.name ?? p.exerciseId;
    const said = p.progression.gymVariable
      ? "machine/cable: its call is made per gym, on the workout card"
      : describeCall(p.progression);
    lines.push(`    ${name} — ${said}`);
  });
  if (want.expect.length > 0) {
    const ids = await account.db.exercise.findMany({
      where: {
        sourceId: { in: want.expect.map((e) => LIBRARY[e.ex]) },
        isCustom: false,
      },
      select: { id: true, sourceId: true },
    });
    for (const e of want.expect) {
      const id = ids.find((x) => x.sourceId === LIBRARY[e.ex])?.id;
      const planned = view.plannedProgression.find((p) => p.exerciseId === id);
      if (!planned) {
        problems.push(`${e.ex}: not on today's workout`);
        continue;
      }
      // In a deload week the planned list carries the reduced load, not the
      // card's sentence: the state is compared, the sentence isn't.
      const diff = compareCall(e, planned.progression, {
        checkAction: e.call !== "deload_week",
      });
      if (diff) problems.push(`${e.ex}: ${diff}`);
    }
  }
  return { lines, problems };
}
