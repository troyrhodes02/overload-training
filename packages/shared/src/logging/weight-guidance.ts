/**
 * The weight box and the progression call, side by side (Pitch 21g
 * correction OVE-229). Pure and shared, so the web card and the iPhone card
 * say exactly the same thing. It never decides a call or a number: the call
 * and its suggested load are the SERVER's (gated); the box's offer is the
 * existing offer rule (offerFor). It only says how the two relate:
 *
 *  - Under a call that asks for a change (Progress, a reactive Deload,
 *    Reassess, the deload week), a box still holding last time's weight
 *    untouched is captioned "last time's weight, not adjusted", so it can't
 *    be read as already changed. A hold needs nothing: the box is the
 *    weight to stay at.
 *  - Where the server supplies a number (Progress's +5, the deload week's
 *    90%), the lifter may put it in the ACTIVE, UNSAVED box with one tap:
 *    "Use 185 lb", or "Replace 175 with 185 lb" over a weight they typed.
 *    It is offered only before the card's first saved set, and never when the
 *    box already holds that number. Nothing is saved by it.
 */
import { formatWeightLbs } from "./weight";
import { offerCaption, type Offer } from "./set-entry";

/** The call kinds that ask the lifter to change the weight. */
const CHANGE_CALLS = new Set([
  "progress",
  "deload",
  "reassess",
  "scheduled_deload",
]);

export const NOT_ADJUSTED_CAPTION = "last time's weight, not adjusted";

export type WeightGuidanceInput = {
  /** The box's offer (offerFor), or null. */
  offer: Offer | null;
  /** What the lifter typed into the active box, or null while untouched. */
  typed: string | null;
  /** The server's call kind for this card (gated: null on Free). */
  callKind: string | null;
  /** The server's suggested load in lb (gated: null on Free), or null. */
  suggestedLbs: number | null;
  /** The exercise takes an external weight (not bodyweight). */
  externalLoad: boolean;
  /** A set is saved on this card already. */
  anySaved: boolean;
};

export type WeightGuidance = {
  /** The caption under an untouched box, or null (typed, or nothing offered). */
  caption: string | null;
  /** The one-tap action, or null when there is no number to apply. */
  use: { lbs: number; label: string } | null;
};

/** A typed weight as a number ("182,5" → 182.5); null when it isn't one. */
function typedLbs(typed: string): number | null {
  const t = typed.trim().replace(",", ".");
  if (t === "" || !/^\d*\.?\d*$/.test(t) || t === ".") return null;
  return Number(t);
}

export function weightGuidance(input: WeightGuidanceInput): WeightGuidance {
  const untouched = input.typed === null;
  const change = input.callKind !== null && CHANGE_CALLS.has(input.callKind);

  let caption: string | null = null;
  if (untouched && input.offer) {
    const lastTime = input.offer.source.kind === "working_weight";
    const alreadyThere =
      input.suggestedLbs !== null &&
      input.offer.weightLbs === input.suggestedLbs;
    caption =
      change && lastTime && !alreadyThere
        ? NOT_ADJUSTED_CAPTION
        : offerCaption(input.offer);
  }

  let use: WeightGuidance["use"] = null;
  const lbs = input.suggestedLbs;
  if (
    input.externalLoad &&
    !input.anySaved &&
    lbs !== null &&
    lbs > 0 &&
    (input.callKind === "progress" || input.callKind === "scheduled_deload")
  ) {
    const inBox = untouched
      ? (input.offer?.weightLbs ?? null)
      : typedLbs(input.typed as string);
    if (inBox !== lbs) {
      const n = formatWeightLbs(lbs);
      use = {
        lbs,
        label:
          !untouched && inBox !== null
            ? `Replace ${formatWeightLbs(inBox)} with ${n} lb`
            : `Use ${n} lb`,
      };
    }
  }
  return { caption, use };
}
