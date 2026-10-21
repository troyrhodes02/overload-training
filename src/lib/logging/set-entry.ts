import { formatMonthDay } from "@/lib/plan/calendar";

/**
 * Set-entry rules for the exercise logging card (Faster Logging UX spec §5,
 * §11.4; Resolved Decisions R4–R7, R11–R12). Everything here is derived from
 * the server's records plus nothing else, so the card can never show a set as
 * logged that isn't, and an offered weight is never more than a starting value
 * in a box: only a Log set press writes, through logSetAction.
 *
 * Pure module (no Prisma, no server-only import) so the client card can use it.
 */

export type CardSet = {
  setNumber: number;
  weightLbs: number | null;
  reps: number | null;
  saved: boolean;
  extra: boolean;
};

/**
 * The one set with inputs (R4): the lowest planned set with no logged row,
 * in set order; once every planned set is logged, the pending extra row (after
 * Add set), else none.
 */
export function activeSetNumber(
  sets: readonly CardSet[],
  plannedSets: number,
  pendingExtra: number | null,
): number | null {
  const logged = new Set(sets.filter((s) => s.saved).map((s) => s.setNumber));
  for (let n = 1; n <= plannedSets; n++) if (!logged.has(n)) return n;
  return pendingExtra !== null && !logged.has(pendingExtra)
    ? pendingExtra
    : null;
}

export type Offer = {
  weightLbs: number;
  source:
    | { kind: "previous_set"; setNumber: number }
    | { kind: "working_weight"; fromBaseline: boolean };
};

/**
 * The weight offered to the active row (R6). Bodyweight: never. Otherwise the
 * weight of the highest-numbered logged set in this card ("same as set N"),
 * else the working weight ("last time"), else nothing — no number is invented.
 * Reps are never offered (R7).
 */
export function offerFor(args: {
  requiresExternalWeight: boolean;
  sets: readonly CardSet[];
  workingWeightLbs: number | null;
  /** The working weight is this gym's baseline (a machine or cable). */
  workingWeightFromBaseline?: boolean;
}): Offer | null {
  if (!args.requiresExternalWeight) return null;
  const latest = args.sets
    .filter((s) => s.saved && s.weightLbs !== null)
    .reduce<CardSet | null>(
      (best, s) => (best === null || s.setNumber > best.setNumber ? s : best),
      null,
    );
  if (latest && latest.weightLbs !== null) {
    return {
      weightLbs: latest.weightLbs,
      source: { kind: "previous_set", setNumber: latest.setNumber },
    };
  }
  if (args.workingWeightLbs !== null && args.workingWeightLbs > 0) {
    return {
      weightLbs: args.workingWeightLbs,
      source: {
        kind: "working_weight",
        fromBaseline: args.workingWeightFromBaseline ?? false,
      },
    };
  }
  return null;
}

/**
 * The caption under an offered weight: "same as set 2", "last time", or —
 * when the offer is a machine/cable's gym baseline, which only moves on a
 * large deviation and so can differ from the last session — "working weight"
 * (R27).
 */
export function offerCaption(offer: Offer): string {
  if (offer.source.kind === "previous_set") {
    return `same as set ${offer.source.setNumber}`;
  }
  return offer.source.fromBaseline ? "working weight" : "last time";
}

/** A weight as the lifter writes it: 185, 182.5 (no trailing zeros). */
export function formatWeight(weightLbs: number): string {
  return String(weightLbs);
}

/**
 * "185 × 8, 8, 7" when every set used one weight; "185 × 8, 190 × 6, 190 × 5"
 * when it changed; "18, 15 reps" for bodyweight (no weight at all).
 */
export function formatSetSummary(
  sets: readonly { weightLbs: number | null; reps: number }[],
): string {
  if (sets.length === 0) return "";
  if (sets.every((s) => s.weightLbs === null)) {
    return `${sets.map((s) => s.reps).join(", ")} reps`;
  }
  const first = sets[0].weightLbs;
  if (first !== null && sets.every((s) => s.weightLbs === first)) {
    return `${formatWeight(first)} × ${sets.map((s) => s.reps).join(", ")}`;
  }
  return sets
    .map((s) =>
      s.weightLbs === null
        ? `${s.reps} reps`
        : `${formatWeight(s.weightLbs)} × ${s.reps}`,
    )
    .join(", ");
}

/**
 * The card's context line (R12): "Last time · Oct 13 · 185 × 8, 8, 7";
 * "Last time here · …" for a machine or cable; with nothing in scope, "First
 * time on this at Downtown Gym." (gym-variable) or "First time logging this.".
 */
export function formatPreviousPerformance(args: {
  previous: {
    dateIso: string;
    gymScoped: boolean;
    sets: readonly { weightLbs: number | null; reps: number }[];
  } | null;
  isGymVariable: boolean;
  gymName: string | null;
  referenceIso: string;
}): string {
  const { previous } = args;
  if (!previous) {
    return args.isGymVariable && args.gymName
      ? `First time on this at ${args.gymName}.`
      : "First time logging this.";
  }
  const label = previous.gymScoped ? "Last time here" : "Last time";
  const date = formatMonthDay(previous.dateIso, args.referenceIso);
  return `${label} · ${date} · ${formatSetSummary(previous.sets)}`;
}

/** A logged row's visible value: "185 lbs × 8" parts, or "18 reps". */
export function loggedRowLabel(set: {
  setNumber: number;
  weightLbs: number | null;
  reps: number;
}): string {
  const value =
    set.weightLbs === null
      ? `${set.reps} reps`
      : `${formatWeight(set.weightLbs)} pounds, ${set.reps} reps`;
  return `Set ${set.setNumber}, ${value}, logged. Correct this set`;
}
