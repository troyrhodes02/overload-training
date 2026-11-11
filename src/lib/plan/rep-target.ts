/**
 * How a planned rep target prints (Workout Logging Refinements, spec §12).
 * A single target is stored as a range with equal ends and prints as one
 * number ("10"); a range keeps its en dash ("6–10"). Pure and client-safe,
 * so every surface prints a target the same way.
 */
export function formatRepTarget(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}
