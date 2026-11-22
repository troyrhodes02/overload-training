/**
 * How a planned rep target prints (Workout Logging Refinements, spec §12).
 * A single target is stored as a range with equal ends and prints as one
 * number ("10"); a range keeps its en dash ("6–10"). Pure and client-safe,
 * so every surface prints a target the same way.
 */
export function formatRepTarget(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

/**
 * A planned exercise's prescription as every plan surface prints it (web plan
 * rows, the iPhone session screen; Pitch 21h RD-23): "3 sets · 6–8 reps", and
 * a fixed target "4 sets · 5 reps".
 */
export function formatPrescription(e: {
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
}): string {
  const reps = formatRepTarget(e.targetRepMin, e.targetRepMax);
  return `${e.plannedSets} ${e.plannedSets === 1 ? "set" : "sets"} · ${reps} reps`;
}

/** How the plan dialog asks for reps: a range, or one fixed target. */
export type RepMode = "range" | "fixed";

/** A saved prescription opens in Fixed when its two ends are equal. */
export function repModeFor(min: number, max: number): RepMode {
  return min === max ? "fixed" : "range";
}

type RepFields = { targetRepMin: string; targetRepMax: string };

/**
 * Switching modes never loses what was typed: Range → Fixed keeps the
 * minimum (or the maximum, if only that was typed) as the target; Fixed →
 * Range puts the target in both boxes. In Fixed mode the target lives in
 * `targetRepMin`.
 */
export function switchRepMode<T extends RepFields>(values: T, to: RepMode): T {
  if (to === "fixed") {
    const target = values.targetRepMin.trim() || values.targetRepMax.trim();
    return { ...values, targetRepMin: target, targetRepMax: target };
  }
  return { ...values, targetRepMax: values.targetRepMin };
}

/** What the dialog submits: in Fixed mode the target is both ends. */
export function submittedReps<T extends RepFields>(
  values: T,
  mode: RepMode,
): T {
  return mode === "fixed"
    ? { ...values, targetRepMax: values.targetRepMin }
    : values;
}
