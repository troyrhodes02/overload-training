/**
 * THE ONE SOURCE OF PROGRESSION RECOMMENDATION COPY (Smarter & Explainable
 * Progression spec §11.2; Resolved Decisions R3–R8, R13–R22, R26).
 *
 * Pure and client-safe. It never evaluates history: it turns the engine's
 * decision — the call plus the evidence the deciding branch read — and the
 * existing load context into two lines, an action and the evidence for it.
 * Every figure comes from the engine's constants, the evidence, or the load
 * context passed in; the words for a call can therefore never disagree with
 * the call, and no number appears that the engine doesn't have:
 *
 *   - a load only for Progress (working weight + the existing increment) and
 *     the scheduled deload week (the existing reduced load);
 *   - a reactive Deload names what to change, never an amount (R7);
 *   - bodyweight points at the plan's own top of range, never a weight (R8);
 *   - RIR appears only when the RIR qualifier changed the call (R16).
 *
 * Exercise History & PR Intelligence reuses this module for "the current
 * recommendation and why" (method note "Recommendation and evidence").
 */
import { formatMonthDay } from "@/lib/plan/calendar";
import { PROGRESS_INCREMENT_LBS, SCHEDULED_DELOAD_FACTOR } from "./config";
import type { DecisionEvidence, RecommendationDto, RirEffect } from "./types";

export type { RecommendationDto } from "./types";

/** The engine's final call (mirrors engine.ts ReactiveState; kept local so this stays engine-free). */
export type RecommendationState =
  "insufficient" | "hold" | "progress" | "deload" | "stalled";

export type RecommendationInput =
  | {
      scheduledDeload: true;
      externalLoad: boolean;
      /** The existing scheduled-deload load; null without working-weight context. */
      deloadLoadLbs: number | null;
    }
  | {
      scheduledDeload: false;
      state: RecommendationState;
      rirEffect: RirEffect;
      evidence: DecisionEvidence;
      /** False for a pure bodyweight (reps-only) exercise. */
      externalLoad: boolean;
      /** The single working-weight source (Pitch 4); null when there is none. */
      workingWeightLbs: number | null;
      /** The existing Progress suggestion's load; null when the call isn't Progress or there is no weight. */
      progressLoadLbs: number | null;
      /** Set only for a gym-variable (machine/cable) scope. */
      gymName: string | null;
      /** The latest counted session is also the latest finished one in scope (R17). */
      latestIsLastTime: boolean;
      /** Same-year reference for naming a date ("Oct 13"). */
      referenceIso: string;
      /** Which session the advice is for (R18). */
      when: "today" | "next";
    };

const SCHEDULED_EVIDENCE =
  "Planned recovery, not a verdict. Calls resume next week.";

function lbs(n: number): string {
  // Loads are whole or half pounds; never print float noise.
  return String(Math.round(n * 100) / 100);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Context = Extract<RecommendationInput, { scheduledDeload: false }>;

/** "last time", or "on Oct 13" when the latest counted session isn't the last one (R17). */
function lastPhrase(ctx: Context, latest: { dateIso: string }): string {
  return ctx.latestIsLastTime
    ? "last time"
    : `on ${formatMonthDay(latest.dateIso, ctx.referenceIso)}`;
}

function evidenceLine(ctx: Context): string {
  const e = ctx.evidence;
  const gym = ctx.gymName ? ` at ${ctx.gymName}` : "";
  switch (e.kind) {
    case "progress":
      return e.repMax === null
        ? `Top of the range on every set, ${e.sessions} sessions running${gym}`
        : `${e.repMax} reps on every set, ${e.sessions} sessions running${gym}`;
    case "released_stall":
      return `e1RM flat, but every set ${lastPhrase(ctx, e.latest)} had ${e.rirToSpare}+ in reserve${gym}`;
    case "held_at_limit":
      return `Top of the range, but at your limit ${lastPhrase(ctx, e.latest)} (${e.rirAtLimit} RIR)${gym}`;
    case "stalled":
      return `Top of the range ${e.sessions} sessions running, but e1RM hasn't risen over ${e.window} sessions${gym}`;
    case "hold_top_once":
      return `${e.repMax} on every set ${lastPhrase(ctx, e.latest)}; progress needs ${e.sessions} sessions running${gym}`;
    case "hold_short":
      return `${capitalise(lastPhrase(ctx, e.latest))}: ${e.reps.join(", ")} of ${e.repMin}–${e.repMax}${gym}`;
    case "deload":
      return e.repMin === null
        ? `A set below the range, ${e.sessions} sessions running${gym}`
        : `A set below ${e.repMin} reps, ${e.sessions} sessions running${gym}`;
    case "insufficient":
      return "";
  }
}

/** The calls each evidence kind may accompany (spec §6). */
const EVIDENCE_FOR: Record<
  Exclude<RecommendationState, "insufficient">,
  DecisionEvidence["kind"][]
> = {
  progress: ["progress", "released_stall"],
  hold: ["hold_top_once", "hold_short", "held_at_limit"],
  stalled: ["stalled"],
  deload: ["deload"],
};

/**
 * A call and its evidence disagree only through a programming error (spec
 * §11.2, R26): loud in development and tests, silent in production — a wrong
 * sentence is worse than none.
 */
function mismatch(state: string, kind: string): null {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `Recommendation evidence "${kind}" cannot accompany a "${state}" call`,
    );
  }
  return null;
}

/**
 * The recommendation for one evaluated call, or null when there is nothing to
 * say (not enough history).
 */
export function buildRecommendation(
  input: RecommendationInput,
): RecommendationDto | null {
  if (input.scheduledDeload) {
    const pct = Math.round(SCHEDULED_DELOAD_FACTOR * 100);
    return {
      kind: "scheduled_deload",
      tone: "quiet",
      action:
        input.externalLoad && input.deloadLoadLbs !== null
          ? `Deload week: ${lbs(input.deloadLoadLbs)} lb (${pct}%)`
          : "Deload week",
      evidence: SCHEDULED_EVIDENCE,
    };
  }

  const ctx = input;
  if (ctx.state === "insufficient") {
    return ctx.evidence.kind === "insufficient"
      ? null
      : mismatch(ctx.state, ctx.evidence.kind);
  }
  if (!EVIDENCE_FOR[ctx.state].includes(ctx.evidence.kind)) {
    return mismatch(ctx.state, ctx.evidence.kind);
  }
  const rirKinds = ["released_stall", "held_at_limit"];
  if (rirKinds.includes(ctx.evidence.kind) !== (ctx.rirEffect !== null)) {
    return mismatch(`${ctx.state}/${ctx.rirEffect}`, ctx.evidence.kind);
  }

  const when = ctx.when === "today" ? "today" : "next time";
  const When = capitalise(when);
  const evidence = evidenceLine(ctx);

  if (ctx.state === "progress") {
    let action: string;
    if (!ctx.externalLoad) {
      const top =
        ctx.evidence.kind === "progress" && ctx.evidence.repMax !== null
          ? `${ctx.evidence.repMax} reps`
          : "the top of the range";
      action = `${When}, go past ${top} or make it harder`;
    } else if (ctx.progressLoadLbs !== null) {
      action = `Try ${lbs(ctx.progressLoadLbs)} lb ${when} (+${PROGRESS_INCREMENT_LBS} lb)`;
    } else {
      action = `Ready to add weight ${when}`;
    }
    return { kind: "progress", tone: "strong", action, evidence };
  }

  if (ctx.state === "deload") {
    return {
      kind: "deload",
      tone: "strong",
      action: ctx.externalLoad
        ? `Lower the weight ${when}`
        : `Back off ${when}`,
      evidence,
    };
  }

  // hold, held at the limit, or held by the stall gate.
  return {
    kind: "hold",
    tone: "quiet",
    action:
      ctx.externalLoad && ctx.workingWeightLbs !== null
        ? `Stay at ${lbs(ctx.workingWeightLbs)} lb ${when}`
        : `Hold steady ${when}`,
    evidence,
  };
}

/** The exercise page's line for a lift without enough history (R20). */
export function insufficientNote(
  e: DecisionEvidence,
  gymName: string | null,
): string | null {
  if (e.kind !== "insufficient") return null;
  const gym = gymName ? ` at ${gymName}` : "";
  return `Not enough history yet${gym}: ${e.qualifying} of ${e.required} complete sessions.`;
}
