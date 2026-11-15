import {
  activeSetNumber,
  formatCardContext,
  offerFor,
  type Offer,
} from "@overload/shared/logging/set-entry";
import type {
  ExerciseCardDto,
  LoggedWorkoutDetailDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";

/**
 * The logging card's model (Pitch 21e spec §7, RD-8). No I/O and no training
 * rule: it only wires the SERVER's card fields into the shared functions the
 * web card uses (offerFor, activeSetNumber, formatCardContext), so both
 * clients offer the same weight and say the same words.
 *
 * Which history is comparable, and so which weight is trusted, is decided by
 * the server (Prescription-Aware Intelligence). The phone never picks a
 * weight from history; it only reads `weightContext`.
 */

/**
 * The trusted working weight, or null. Anything but "trusted" — including a
 * value a later server adds that this build doesn't know — offers nothing, so
 * an unrecognized context can never become a prefill (RD-8).
 */
export function trustedWorkingWeight(card: ExerciseCardDto): number | null {
  return card.weightContext === "trusted" ? card.suggestedWeightLbs : null;
}

/**
 * The active row's weight offer: the highest SAVED set's weight in this card
 * ("same as set N"), else the trusted working weight ("last time"), else
 * nothing. Bodyweight is never offered a weight. Drafts and failed saves are
 * not in `card.sets`, so they can never set the offer.
 */
export function cardOffer(card: ExerciseCardDto): Offer | null {
  return offerFor({
    requiresExternalWeight: card.requiresExternalWeight,
    sets: card.sets,
    workingWeightLbs: trustedWorkingWeight(card),
    // The gym baseline is no longer a weight source (PAI RD-9).
    workingWeightFromBaseline: false,
  });
}

/** The planned set that has inputs now (no extra-set entry in 21e, RD-12). */
export function cardActiveSet(card: ExerciseCardDto): number | null {
  return activeSetNumber(card.sets, card.plannedSets, null);
}

/** The context line and, when the server sent one, the reference line. */
export function cardContext(
  card: ExerciseCardDto,
  workout: Pick<
    WorkoutDto,
    "sessionName" | "scheduledDeloadWeek" | "scheduledFor"
  >,
): { line: string; reference: string | null } {
  return formatCardContext({
    previous: card.previousPerformance,
    reference: card.referencePerformance,
    workoutName: workout.sessionName,
    plannedRepRange: card.plannedRepRange,
    scheduledDeloadWeek: workout.scheduledDeloadWeek,
    isGymVariable: card.isGymVariable,
    gymName: card.gymName,
    referenceIso: workout.scheduledFor,
  });
}

/**
 * Typed weight text → a number for the shared weight rule (RD-11). iOS's
 * decimal pad shows the locale's separator, so "182,5" is 182.5. Empty or
 * anything that isn't a plain number is NaN, which the rule refuses.
 */
export function parseWeightText(text: string): number {
  const t = text.trim().replace(",", ".");
  if (t === "" || !/^\d*\.?\d*$/.test(t) || t === ".") return Number.NaN;
  return Number(t);
}

/** Typed reps text → a number for the shared reps rule (empty is 0). */
export function parseRepsText(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

export type CardMode = "log" | "not_done" | "unavailable";

/**
 * How a card renders (RD-21): marked not done on the web, an archived planned
 * exercise with no substitute (swap is 21f), or loggable.
 */
export function cardMode(card: ExerciseCardDto): CardMode {
  if (card.skipped) return "not_done";
  if (card.performedArchived) return "unavailable";
  return "log";
}

/**
 * Where the workout opens (RD-7): the first loggable card that still has an
 * unlogged planned set, else the last card (everything is logged).
 */
export function initialExerciseIndex(workout: WorkoutDto): number {
  const i = workout.exercises.findIndex(
    (e) => cardMode(e) === "log" && cardActiveSet(e) !== null,
  );
  if (i >= 0) return i;
  return Math.max(0, workout.exercises.length - 1);
}

/** True once any set is saved: the server's rule for finishing. */
export function canFinish(workout: WorkoutDto): boolean {
  return workout.exercises.some((e) => e.sets.some((s) => s.saved));
}

/**
 * The finish confirmation's list, computed exactly as the web runner does:
 * exercises not marked not done with fewer saved planned sets than planned.
 */
export function unfinishedExercises(
  workout: WorkoutDto,
): { name: string; done: number; planned: number }[] {
  return workout.exercises
    .filter((e) => !e.skipped)
    .map((e) => ({
      name: e.performedExerciseName,
      done: e.sets.filter((s) => s.saved && !s.extra).length,
      planned: e.plannedSets,
    }))
    .filter((e) => e.done < e.planned);
}

/** The basic summary's counts (RD-14): exercises with a set, and sets. */
export function summaryCounts(detail: LoggedWorkoutDetailDto): {
  exercises: number;
  sets: number;
} {
  return {
    exercises: detail.exercises.filter((e) => e.sets.length > 0).length,
    sets: detail.exercises.reduce((n, e) => n + e.sets.length, 0),
  };
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "4 exercises · 11 sets". */
export function summaryCountsLabel(c: { exercises: number; sets: number }) {
  return `${plural(c.exercises, "exercise", "exercises")} · ${plural(c.sets, "set", "sets")}`;
}
