/**
 * The one rule for the reps of a logged set (Pitch 21b, mobile audit D-13),
 * shared by the set write path (`logSet`, `editLoggedSet`), the logging card,
 * and, later, the iPhone app's pre-check. Goal targets use the same upper
 * bound (`GOAL_REPS_MAX`).
 *
 * A logged set's reps are a whole number from 1 to 1,000. The bound is input
 * sanity, not training advice. The values and the message are the ones the
 * server applied before this rule was named; nothing about what is accepted
 * changed.
 *
 * Pure: no database, framework, or server dependency.
 */

/** Most reps one logged set may record. */
export const LOGGED_REPS_MAX = 1000;

export const REPS_MESSAGES = {
  required: "Enter reps above 0.",
} as const;

/**
 * Check the reps of a logged set. Returns the number on success, or the
 * message to show for the field.
 */
export function checkLoggedReps(
  value: unknown,
): { ok: true; value: number } | { ok: false; message: string } {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > LOGGED_REPS_MAX
  ) {
    return { ok: false, message: REPS_MESSAGES.required };
  }
  return { ok: true, value };
}
