/**
 * Goal input validation (Goals spec §12; R2, R62). A goal is an exercise, an
 * optional gym, a target weight, and target reps — nothing else is read, so no
 * date, note, e1RM, or percent can ever be submitted. Limits mirror LoggedSet
 * (weight > 0 and ≤ 9999.99 lb; reps a whole number 1–1000).
 */
export const GOAL_WEIGHT_MAX_LBS = 9999.99;
export const GOAL_REPS_MAX = 1000;

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
  if (!Number.isFinite(weight) || weight <= 0 || weight > GOAL_WEIGHT_MAX_LBS)
    details.targetWeightLbs = GOAL_FIELD_ERRORS.targetWeightLbs;

  const reps = toNumber(raw.targetReps);
  if (!Number.isInteger(reps) || reps < 1 || reps > GOAL_REPS_MAX)
    details.targetReps = GOAL_FIELD_ERRORS.targetReps;

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    value: { exerciseId, gymId, targetWeightLbs: weight, targetReps: reps },
  };
}

/** Reads the goal form. Only these four fields are ever read. */
export function goalInputFromFormData(formData: FormData): RawGoalInput {
  return {
    exerciseId: formData.get("exerciseId") ?? "",
    gymId: formData.get("gymId") ?? "",
    targetWeightLbs: formData.get("targetWeightLbs") ?? "",
    targetReps: formData.get("targetReps") ?? "",
  };
}
