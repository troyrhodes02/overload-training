import { WING_IT_NAME } from "@overload/shared/logging/wing-it";

/*
 * Pure helpers for a logged workout's plan context (Pitch 25). No data access,
 * so every read module (logging, progression, history) can use them without
 * importing one another.
 */

/**
 * A logged exercise's copied plan, or null for an open-ended exercise of a
 * Wing-It workout (Pitch 25), which has none. The three columns are all set
 * or all NULL (CHECK logged_exercises_plan_snapshot_check, migration 9t).
 */
export function planSnapshot(le: {
  plannedSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
}): { plannedSets: number; repMin: number; repMax: number } | null {
  if (
    le.plannedSets === null ||
    le.targetRepMin === null ||
    le.targetRepMax === null
  )
    return null;
  return {
    plannedSets: le.plannedSets,
    repMin: le.targetRepMin,
    repMax: le.targetRepMax,
  };
}

/** The name a logged workout is shown by: its session's, or Wing-It's. */
export function loggedWorkoutName(ls: {
  kind: "planned" | "wing_it";
  session: { name: string } | null;
}): string {
  return ls.kind === "wing_it" ? WING_IT_NAME : (ls.session?.name ?? "Workout");
}
