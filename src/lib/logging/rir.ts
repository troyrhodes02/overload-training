/**
 * Reps in reserve — the one RIR scale (RIR Logging & Autoregulation spec
 * §11.1; Resolved Decisions R3, R4). Pure and client-safe: the logging card,
 * the correction dialog, History, and the write module all read it here.
 *
 * A set's RIR is the lifter's estimate of how many more reps were left. It is
 * optional: `null` means "not recorded" and is never treated as 0. `4` means
 * "4 or more" and is shown `4+`. RIR is never added to reps.
 */

export const RIR_VALUES = [0, 1, 2, 3, 4] as const;

/** The top of the scale; it stands for "this many or more". */
export const RIR_MAX = 4;

export type Rir = (typeof RIR_VALUES)[number];

/** An integer on the scale (0..RIR_MAX). Rejects strings, fractions, NaN. */
export function isRir(value: unknown): value is Rir {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= RIR_MAX
  );
}

/** `4` → `4+`; every other value as itself. */
export function formatRir(rir: number): string {
  return rir >= RIR_MAX ? `${RIR_MAX}+` : String(rir);
}

/** The logged-row suffix, or nothing when no RIR was recorded. */
export function rirSuffix(rir: number | null): string {
  return rir === null ? "" : `· ${formatRir(rir)} RIR`;
}

/** Screen-reader name of one value: `4` → `4 or more`. */
export function rirAccessibleName(rir: number): string {
  return rir >= RIR_MAX ? `${RIR_MAX} or more` : String(rir);
}
