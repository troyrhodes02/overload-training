/**
 * Goal input validation (Goals spec §12; R2, R62). A goal is an exercise, an
 * optional gym, a target weight, and target reps — nothing else is read, so no
 * date, note, e1RM, or percent can ever be submitted. Limits mirror LoggedSet
 * (weight > 0 and ≤ 9999.99 lb; reps a whole number 1–1000).
 */
import { LOGGED_REPS_MAX } from "../logging/reps";
import { checkWeightLbs, WEIGHT_LBS_MAX } from "../logging/weight";

/** Same storable limit as a logged set (one shared rule, OVE-135). */
export const GOAL_WEIGHT_MAX_LBS = WEIGHT_LBS_MAX;
/** The same upper bound as a logged set's reps (one rule, Pitch 21b). */
export const GOAL_REPS_MAX = LOGGED_REPS_MAX;

export type GoalInput = {
  exerciseId: string;
  gymId: string | null;
  targetWeightLbs: number;
  targetReps: number;
};

export type RawGoalInput = {
  exerciseId?: unknown;
  gymId?: unknown;
  targetWeightLbs?: unknown;
  targetReps?: unknown;
};

export const GOAL_FIELD_ERRORS = {
  exerciseId: "Pick an active exercise.",
  targetWeightLbs: "Enter a weight above 0.",
  targetReps: "Enter whole reps, 1 or more.",
} as const;

/** A number from a number or a non-empty numeric string; NaN otherwise. */
function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return Number.NaN;
  const t = v.trim();
  if (t === "" || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return Number.NaN;
  return Number(t);
}

export function parseGoalInput(
  raw: RawGoalInput,
):
  | { ok: true; value: GoalInput }
  | { ok: false; details: Record<string, string> } {
  const details: Record<string, string> = {};

  const exerciseId =
    typeof raw.exerciseId === "string" ? raw.exerciseId.trim() : "";
  if (!exerciseId) details.exerciseId = GOAL_FIELD_ERRORS.exerciseId;

  const gymRaw = typeof raw.gymId === "string" ? raw.gymId.trim() : "";
  const gymId = gymRaw.length > 0 ? gymRaw : null;

  const weight = toNumber(raw.targetWeightLbs);
  // The shared weight rule (OVE-135 / audit F-D3): above 0, at most 9,999.99,
  // at most two decimal places, each with its own message.
  const checkedWeight = checkWeightLbs(weight);
  if (!checkedWeight.ok) details.targetWeightLbs = checkedWeight.message;

  const reps = toNumber(raw.targetReps);
  if (!Number.isInteger(reps) || reps < 1 || reps > GOAL_REPS_MAX)
    details.targetReps = GOAL_FIELD_ERRORS.targetReps;

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    value: { exerciseId, gymId, targetWeightLbs: weight, targetReps: reps },
  };
}
