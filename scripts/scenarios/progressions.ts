import { seededRandom } from "./determinism";
import type { SetSpec } from "./spec";

/**
 * Believable lifting numbers for scenario histories (dev tooling only).
 *
 * `doubleProgression` models how a lifter actually runs a rep range: add reps
 * week to week until every working set reaches the top of the range, then add
 * load and start again near the bottom. A seeded PRNG adds the ordinary
 * unevenness of real training (a last set one rep short, a week with no rep
 * gain), so the history isn't a synthetic staircase — yet the same seed always
 * yields the same numbers.
 *
 * These are FACTS (weight × reps). Whatever the application concludes from
 * them is computed by the application; the optional `finish: "progress"` only
 * shapes the last two working performances the way a lifter who earned a load
 * increase would have lifted them (every set at the top of the range, twice),
 * and the scenario's verification then proves the real engine agrees.
 */

export type OccurrenceKind =
  /** An ordinary training performance. */
  | "normal"
  /** A scheduled-deload week: ~90% load, no progression attempt. */
  | "deload"
  /** Another gym's machine: different nominal load, same effort. */
  | "away";

export type ProgressionOptions = {
  seed: string;
  start: number;
  increment: number;
  repMin: number;
  repMax: number;
  sets: number;
  /** Starting reps (defaults to repMin + 1). */
  startReps?: number;
  /** Nominal-load factor for "away" occurrences (other gym's machine). */
  awayFactor?: number;
  finish?: "progress" | "hold";
};

const step = (lbs: number) => Math.max(5, Math.round(lbs / 5) * 5);
const floorStep = (lbs: number) => Math.max(5, Math.floor(lbs / 5) * 5);

export function doubleProgression(
  kinds: OccurrenceKind[],
  o: ProgressionOptions,
): SetSpec[][] {
  const rng = seededRandom(o.seed);
  let weight = o.start;
  let reps = Math.min(o.startReps ?? o.repMin + 1, o.repMax);

  const normalIdx = kinds.flatMap((k, i) => (k === "normal" ? [i] : []));
  const forced = new Set(o.finish === "progress" ? normalIdx.slice(-2) : []);
  const same = (w: number, r: number) =>
    Array.from({ length: o.sets }, () => ({ weightLbs: w, reps: r }));

  return kinds.map((kind, i) => {
    if (kind === "deload") return same(floorStep(weight * 0.9), reps);
    if (kind === "away")
      return same(step(weight * (o.awayFactor ?? 0.75)), reps);
    if (forced.has(i)) return same(weight, o.repMax);

    const sets = Array.from({ length: o.sets }, (_, k) => {
      const short = k > 0 && reps > o.repMin && rng() < 0.4;
      return { weightLbs: weight, reps: short ? reps - 1 : reps };
    });
    if (sets.every((s) => s.reps >= o.repMax)) {
      weight += o.increment;
      reps = o.repMin;
    } else if (rng() >= 0.2) {
      reps = Math.min(o.repMax, reps + 1);
    }
    return sets;
  });
}

/** Explicit sets: weight × reps for each set, e.g. sets(185, 8, 8, 7). */
export function sets(weightLbs: number, ...reps: number[]): SetSpec[] {
  return reps.map((r) => ({ weightLbs, reps: r }));
}
