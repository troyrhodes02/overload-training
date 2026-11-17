import { formatWeight } from "@overload/shared/logging/set-entry";
import { rirSuffix } from "@overload/shared/logging/rir";

type SetValue = {
  weightLbs: number | null;
  reps: number;
  rir: number | null;
  extra: boolean;
};

/**
 * A logged set's visible value, one wording for the card and History:
 * "255 lbs × 5 · 2 RIR · extra", or "12 reps" for bodyweight.
 */
export function setValueLabel(s: SetValue): string {
  const value =
    s.weightLbs === null
      ? `${s.reps} reps`
      : `${formatWeight(s.weightLbs)} lbs × ${s.reps}`;
  const rir = rirSuffix(s.rir);
  return `${value}${rir ? ` ${rir}` : ""}${s.extra ? " · extra" : ""}`;
}

/** The same set, spoken: "255 pounds, 5 reps". */
export function setValueSpoken(
  s: Pick<SetValue, "weightLbs" | "reps">,
): string {
  return s.weightLbs === null
    ? `${s.reps} reps`
    : `${formatWeight(s.weightLbs)} pounds, ${s.reps} reps`;
}
