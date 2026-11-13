/**
 * Goals and their progress (through the one e1RM formula, on the server).
 * Built by apps/web/src/lib/goals/queries.ts (moved here in Pitch 21b, so the
 * compiler holds the server's output to the contract). Wire conventions:
 * ./wire.ts.
 */
export type GoalContextDto = {
  goalId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseArchived: boolean;
  gymId: string | null;
  gymName: string | null;
  gymArchived: boolean;
  targetWeightLbs: number;
  targetReps: number;
  /** "315 lb × 1" */
  targetLabel: string;
  createdAtIso: string;
  /** "Sep 2, 2026" */
  createdLabel: string;
};

export type GoalBestDto = {
  e1rm: number;
  weightLbs: number;
  reps: number;
  dateIso: string;
  dateLabel: string;
};

export type ActiveGoalDto = GoalContextDto & {
  /** Floored whole percent ≤ 100; null → "No performance recorded yet". */
  percent: number | null;
  /** Rounded for display. */
  targetE1rm: number;
  best: GoalBestDto | null;
};

export type GoalHistoryDto = GoalContextDto & {
  outcome: "completed" | "manual";
  archivedAtIso: string;
  /** "Oct 12, 2026" */
  archivedLabel: string;
};

export type GoalReachedDto = GoalContextDto & {
  alreadyReached: boolean;
  newGoalHref: string;
};

export type GoalDetailDto =
  | ({ kind: "active" } & ActiveGoalDto)
  | ({
      kind: "archived";
      unacknowledged: boolean;
      alreadyReached: boolean;
      /** Null when the exercise is archived or already has another active goal. */
      newGoalHref: string | null;
    } & GoalHistoryDto);

export type SessionGoalRowDto = {
  goalId: string;
  exerciseName: string;
  /** "315 × 1" */
  targetLabel: string;
  kind: "progress" | "reached";
  /** Null when this was the first measured session (or for "reached"). */
  percentBefore: number | null;
  percentAfter: number | null;
};

export type GoalFormContextDto =
  | {
      kind: "ok";
      exercise: {
        id: string;
        name: string;
        meta: string;
        imageUrl: string | null;
      };
      gymVariable: boolean;
      gyms: { id: string; name: string }[];
      defaultGymId: string | null;
    }
  | { kind: "duplicate"; exerciseName: string; existing: ActiveGoalDto }
  | { kind: "no_gyms"; exerciseName: string; exerciseMeta: string }
  | { kind: "archived_exercise"; exerciseName: string }
  /** A goal is a weight × reps target measured by e1RM; reps-only lifts have neither. */
  | { kind: "bodyweight_unsupported"; exerciseName: string }
  | { kind: "not_found" };

export type ExerciseGoalsDto = {
  /** The exercise's active goal (the Goals page's own numbers), if any. */
  active: ActiveGoalDto | null;
  /** Reached and manually archived goals, most recently archived first. */
  past: GoalHistoryDto[];
  /** Active, loaded, and without an active goal: "Set a goal" may be offered. */
  newGoalEligible: boolean;
  /** Reps-only lifts can't have a weight × reps goal. */
  bodyweight: boolean;
};
