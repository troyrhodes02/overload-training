import { addDays } from "@/lib/plan/calendar";
import { isScheduledDeloadWeek } from "@/lib/progression/deload";
import type { ExerciseProgressionDto } from "@/lib/progression/queries";
import type { ActiveGoalDto, GoalHistoryDto } from "@/lib/goals/queries";
import type { WrittenIds } from "./write";
import type { ExerciseKey, MesocycleSpec, ScenarioFacts } from "./spec";

/**
 * The scenario contract (dev tooling only). Adding a scenario = one module
 * that builds facts from an anchor date and verifies — through the
 * application's own read layer — that the intended states actually derive,
 * plus one line in ./registry.ts.
 */

export type VerifyContext = {
  anchorIso: string;
  facts: ScenarioFacts;
  ids: WrittenIds;
  /** Record a failed expectation (the run fails if any are recorded). */
  check: (ok: boolean, message: string) => void;
  /** Record a derived result worth showing in the report. */
  note: (line: string) => void;
  /** The real per-exercise progression read (src/lib/progression/queries.ts). */
  progression: (
    ex: ExerciseKey,
    gymKey?: string,
  ) => Promise<ExerciseProgressionDto>;
  /** The stored per-gym baseline (lbs) — written by the real baseline rule. */
  baseline: (ex: ExerciseKey, gymKey: string) => Promise<number | null>;
  /** The real goal reads (src/lib/goals/queries.ts). */
  activeGoals: () => Promise<ActiveGoalDto[]>;
  goalHistory: () => Promise<GoalHistoryDto[]>;
};

export type Scenario = {
  key: string;
  /** One line for --list. */
  description: string;
  /** The states the scenario exists to show (documentation + report). */
  shows: string[];
  build: (anchorIso: string) => ScenarioFacts;
  verify: (ctx: VerifyContext) => Promise<void>;
};

/** One planned lifting occurrence of a mesocycle. */
export type Occurrence = {
  meso: string;
  session: string;
  week: number;
  date: string;
  /** The week is a scheduled-deload week (the real cadence rule). */
  deload: boolean;
};

/** Every planned lifting occurrence of a mesocycle, chronologically. */
export function occurrences(m: MesocycleSpec): Occurrence[] {
  const out: Occurrence[] = [];
  for (let week = 1; week <= m.lengthWeeks; week++) {
    for (const s of m.sessions) {
      out.push({
        meso: m.key,
        session: s.key,
        week,
        date: addDays(m.startIso, (week - 1) * 7 + s.dayOffset),
        deload: isScheduledDeloadWeek(week, m.deloadEveryWeeks),
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** "insufficient" | "hold" | … with the tag the UI shows. */
export function describe(p: ExerciseProgressionDto): string {
  const scope = p.selectedGymName ? ` @ ${p.selectedGymName}` : "";
  const tag = p.tag ? ` (tag: ${p.tag})` : " (no tag)";
  return `${p.exerciseName}${scope}: ${p.state}${tag}, ${p.points.length} e1RM point${p.points.length === 1 ? "" : "s"}`;
}
