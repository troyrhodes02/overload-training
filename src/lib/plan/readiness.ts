/**
 * Mesocycle readiness (spec D3, D18, D42, D43, D68). A pure function of the
 * plan rows and each exercise's archived state. It is computed on read for
 * the readiness panel and AGAIN inside the activation transaction; nothing
 * about readiness is ever stored.
 *
 * Pure module: no Prisma import.
 */
import { dayShort } from "./calendar";
import { LENGTH_WEEKS_MAX, PLANNED_SETS_MAX, REPS_MAX } from "./validation";

export type ReadinessSlot = {
  id: string;
  exerciseName: string;
  isArchived: boolean;
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

export type ReadinessSession = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  exercises: ReadinessSlot[]; // in position order
};

export type ReadinessInput = {
  name: string;
  startDate: string | null;
  lengthWeeks: number;
  deloadWeek: number;
  sessions: ReadinessSession[];
};

export type ReadinessIssue =
  | { code: "name_missing" }
  | { code: "start_date_missing" }
  | { code: "length_invalid" }
  | { code: "deload_out_of_range"; deloadWeek: number; lengthWeeks: number }
  | { code: "nothing_scheduled" }
  | {
      code: "session_empty";
      sessionId: string;
      sessionName: string;
      dayOfWeek: number;
    }
  | {
      code: "exercise_archived" | "exercise_plan_invalid";
      sessionId: string;
      sessionName: string;
      sessionExerciseId: string;
      exerciseName: string;
    };

export type Readiness = { ready: boolean; issues: ReadinessIssue[] };

function slotIsValid(s: ReadinessSlot): boolean {
  return (
    Number.isInteger(s.plannedSets) &&
    s.plannedSets >= 1 &&
    s.plannedSets <= PLANNED_SETS_MAX &&
    Number.isInteger(s.targetRepMin) &&
    Number.isInteger(s.targetRepMax) &&
    s.targetRepMin >= 1 &&
    s.targetRepMax <= REPS_MAX &&
    s.targetRepMin <= s.targetRepMax
  );
}

/** Scheduled sessions Monday → Sunday, then unscheduled in the given order. */
function inPlanOrder(sessions: ReadinessSession[]): ReadinessSession[] {
  const scheduled = sessions
    .filter((s) => s.dayOfWeek !== null)
    .sort((a, b) => (a.dayOfWeek as number) - (b.dayOfWeek as number));
  return [...scheduled, ...sessions.filter((s) => s.dayOfWeek === null)];
}

export function evaluateReadiness(plan: ReadinessInput): Readiness {
  const issues: ReadinessIssue[] = [];

  if (plan.name.trim().length === 0) issues.push({ code: "name_missing" });
  if (!plan.startDate) issues.push({ code: "start_date_missing" });

  const lengthOk =
    Number.isInteger(plan.lengthWeeks) &&
    plan.lengthWeeks >= 1 &&
    plan.lengthWeeks <= LENGTH_WEEKS_MAX;
  if (!lengthOk) issues.push({ code: "length_invalid" });
  else if (
    !Number.isInteger(plan.deloadWeek) ||
    plan.deloadWeek < 1 ||
    plan.deloadWeek > plan.lengthWeeks
  ) {
    issues.push({
      code: "deload_out_of_range",
      deloadWeek: plan.deloadWeek,
      lengthWeeks: plan.lengthWeeks,
    });
  }

  const ordered = inPlanOrder(plan.sessions);
  const scheduled = ordered.filter((s) => s.dayOfWeek !== null);
  if (scheduled.length === 0) issues.push({ code: "nothing_scheduled" });

  // An empty session blocks activation only when it is on the schedule.
  for (const s of scheduled) {
    if (s.exercises.length === 0) {
      issues.push({
        code: "session_empty",
        sessionId: s.id,
        sessionName: s.name,
        dayOfWeek: s.dayOfWeek as number,
      });
    }
  }

  // Archived references block activation wherever they are (spec D42).
  for (const s of ordered) {
    for (const slot of s.exercises) {
      if (slot.isArchived) {
        issues.push({
          code: "exercise_archived",
          sessionId: s.id,
          sessionName: s.name,
          sessionExerciseId: slot.id,
          exerciseName: slot.exerciseName,
        });
      }
    }
  }
  for (const s of ordered) {
    for (const slot of s.exercises) {
      if (!slotIsValid(slot)) {
        issues.push({
          code: "exercise_plan_invalid",
          sessionId: s.id,
          sessionName: s.name,
          sessionExerciseId: slot.id,
          exerciseName: slot.exerciseName,
        });
      }
    }
  }

  return { ready: issues.length === 0, issues };
}

/** The exact copy of each checklist row (design doc Screen 4). */
export function readinessIssueMessage(issue: ReadinessIssue): string {
  switch (issue.code) {
    case "name_missing":
      return "Add a name.";
    case "start_date_missing":
      return "Add a start date.";
    case "length_invalid":
      return "Set a length of at least 1 week.";
    case "deload_out_of_range":
      return `Deload week ${issue.deloadWeek} is past the end of a ${issue.lengthWeeks}-week block.`;
    case "nothing_scheduled":
      return "Put at least one session on the schedule.";
    case "session_empty":
      return `${issue.sessionName} (${dayShort(issue.dayOfWeek)}) has no exercises.`;
    case "exercise_archived":
      return `${issue.exerciseName} in ${issue.sessionName} is archived. Replace or remove it.`;
    case "exercise_plan_invalid":
      return `${issue.exerciseName} in ${issue.sessionName} needs sets and a rep range.`;
  }
}

/** Where each checklist row takes the lifter. */
export function readinessIssueHref(
  mesocycleId: string,
  issue: ReadinessIssue,
): string {
  switch (issue.code) {
    case "name_missing":
    case "start_date_missing":
    case "length_invalid":
    case "deload_out_of_range":
      return `/plan/${mesocycleId}/details`;
    case "nothing_scheduled":
      return `/plan/${mesocycleId}#week`;
    case "session_empty":
      return `/plan/${mesocycleId}/sessions/${issue.sessionId}`;
    case "exercise_archived":
    case "exercise_plan_invalid":
      return `/plan/${mesocycleId}/sessions/${issue.sessionId}#slot-${issue.sessionExerciseId}`;
  }
}
