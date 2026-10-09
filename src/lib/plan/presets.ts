/**
 * Split structures (Split & Mesocycle Builder, spec D8–D13, D40).
 *
 * A preset is STRUCTURE ONLY: a list of session names on fixed weekdays. It
 * never names an exercise, a set count, a rep range, a weight, a progression
 * method, or a gym — that would be program generation, a permanent non-goal.
 * Every session a preset creates starts empty and fully editable.
 *
 * Pure module: safe for client islands (the New mesocycle structure cards).
 */
export const SPLIT_TYPES = ["ppl", "arnold", "bro", "custom"] as const;

export type SplitTypeValue = (typeof SPLIT_TYPES)[number];

export const SPLIT_TYPE_LABELS: Record<SplitTypeValue, string> = {
  ppl: "Push / Pull / Legs",
  arnold: "Arnold Split",
  bro: "Bro Split",
  custom: "Custom",
};

/** One preset slot: a named, empty session on an ISO weekday (1 = Monday). */
export type PresetSession = { dayOfWeek: number; name: string };

/** The exact approved skeletons. Days not listed are rest days. */
export const PRESET_STRUCTURES: Record<
  SplitTypeValue,
  readonly PresetSession[]
> = {
  ppl: [
    { dayOfWeek: 1, name: "Push Day 1" },
    { dayOfWeek: 2, name: "Pull Day 1" },
    { dayOfWeek: 3, name: "Leg Day 1" },
    { dayOfWeek: 4, name: "Push Day 2" },
    { dayOfWeek: 5, name: "Pull Day 2" },
    { dayOfWeek: 6, name: "Leg Day 2" },
  ],
  arnold: [
    { dayOfWeek: 1, name: "Chest & Back 1" },
    { dayOfWeek: 2, name: "Shoulders & Arms 1" },
    { dayOfWeek: 3, name: "Legs 1" },
    { dayOfWeek: 4, name: "Chest & Back 2" },
    { dayOfWeek: 5, name: "Shoulders & Arms 2" },
    { dayOfWeek: 6, name: "Legs 2" },
  ],
  bro: [
    { dayOfWeek: 1, name: "Chest" },
    { dayOfWeek: 2, name: "Back" },
    { dayOfWeek: 3, name: "Shoulders" },
    { dayOfWeek: 4, name: "Legs" },
    { dayOfWeek: 5, name: "Arms" },
  ],
  custom: [],
};

export function isSplitType(value: unknown): value is SplitTypeValue {
  return (
    typeof value === "string" &&
    (SPLIT_TYPES as readonly string[]).includes(value)
  );
}
