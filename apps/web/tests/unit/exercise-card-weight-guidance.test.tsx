import { renderToStaticMarkup } from "react-dom/server";
import type { ExerciseCardDto } from "@/lib/logging/queries";

// The card is a client island: stub the router and its server actions so it
// renders in Node without a Next.js runtime or database.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/app/(app)/log/actions", () => ({
  logSetAction: jest.fn(),
  setExerciseSkippedAction: jest.fn(),
}));
jest.mock("@/app/(app)/history/actions", () => ({
  editLoggedSetAction: jest.fn(),
}));

import { ExerciseCard } from "@/components/logging/exercise-card";
import {
  buildRecommendation,
  type RecommendationInput,
} from "@overload/shared/progression/recommendation";
import type { DecisionEvidence } from "@overload/shared/progression/types";

/** A recommendation built by the real builder, as the read layer would. */
const rec = (
  state: "progress" | "hold" | "stalled" | "deload",
  evidence: DecisionEvidence,
  over: Partial<Extract<RecommendationInput, { scheduledDeload: false }>> = {},
) =>
  buildRecommendation({
    scheduledDeload: false,
    state,
    rirEffect:
      evidence.kind === "held_at_limit"
        ? "held_at_limit"
        : evidence.kind === "released_stall"
          ? "released_stall"
          : null,
    evidence,
    externalLoad: true,
    workingWeightLbs: 185,
    progressLoadLbs: state === "progress" ? 190 : null,
    gymName: null,
    latestIsLastTime: true,
    referenceIso: "2026-10-20",
    when: "today",
    ...over,
  });
const LATEST = { loggedExerciseId: "le-prev", dateIso: "2026-10-13" };

/**
 * (Harness copied from exercise-card-set-states.test.tsx.)
 * Faster Logging UX set states (spec §7, §14.1; preview §01–§06; R4–R7, R12,
 * R18–R19). "A box is a draft; a plain number is history": only the active
 * set has inputs, a logged set is a button showing its stored values, an
 * offered weight sits in the box with its source caption, and reps are never
 * filled in.
 */

type Row = ExerciseCardDto["sets"][number];
const logged = (n: number, w: number | null, r: number): Row => ({
  setNumber: n,
  loggedSetId: `ls-${n}`,
  weightLbs: w,
  reps: r,
  rir: null,
  saved: true,
  extra: false,
});
const open = (n: number): Row => ({
  setNumber: n,
  loggedSetId: null,
  weightLbs: null,
  reps: null,
  rir: null,
  saved: false,
  extra: false,
});

function card(overrides: Partial<ExerciseCardDto> = {}): ExerciseCardDto {
  return {
    loggedExerciseId: "le-1",
    performedExerciseName: "Barbell Bench Press",
    plannedExerciseName: "Barbell Bench Press",
    performedExerciseId: "ex-1",
    plannedPrimaryMuscle: "chest",
    swapped: false,
    performedArchived: false,
    isGymVariable: false,
    requiresExternalWeight: true,
    gymName: null,
    plannedSets: 3,
    plannedRepRange: { min: 6, max: 8 },
    suggestedWeightLbs: 185,
    workingWeightFromBaseline: false,
    referencePerformance: null,
    weightContext: "trusted",
    previousPerformance: {
      dateIso: "2026-10-13",
      gymScoped: false,
      sessionName: null,
      repRange: { min: 6, max: 8 },
      sets: [
        { setNumber: 1, weightLbs: 185, reps: 8 },
        { setNumber: 2, weightLbs: 185, reps: 8 },
        { setNumber: 3, weightLbs: 185, reps: 7 },
      ],
    },
    skipped: false,
    sets: [open(1), open(2), open(3)],
    ...overrides,
  };
}

const valueOf = (html: string, label: string) =>
  new RegExp(`<input[^>]*aria-label="${label}"[^>]*value="([^"]*)"`).exec(
    html,
  )?.[1] ??
  new RegExp(`<input[^>]*value="([^"]*)"[^>]*aria-label="${label}"`).exec(
    html,
  )?.[1];

const withCall = (
  progression: Parameters<typeof ExerciseCard>[0]["progression"],
  dto: ExerciseCardDto = card(),
) =>
  renderToStaticMarkup(
    <ExerciseCard
      exercise={dto}
      gymLocked={false}
      workoutDateIso="2026-10-20"
      progression={progression}
    />,
  );

/**
 * Pitch 21g correction OVE-229 on the web: the box and the call, side by
 * side, by the rule the iPhone card uses (weightGuidance).
 */
describe("the weight box under a call (OVE-229)", () => {
  it("Progress: last time's 185 is captioned not adjusted, and Use 190 lb is offered", () => {
    const html = withCall({
      tag: "progress",
      recommendation: rec("progress", {
        kind: "progress",
        sessions: 2,
        repMax: 8,
      }),
      scheduledDeloadWeek: false,
      historyHref: null,
      suggestion: { lbs: 190, kind: "progress_increment" },
    });
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("185");
    expect(html).toContain("last time&#x27;s weight, not adjusted");
    expect(html).toContain(">Use 190 lb<");
  });

  it("a reactive Deload: not adjusted, and no number to apply", () => {
    const html = withCall({
      tag: "deload",
      recommendation: rec("deload", { kind: "deload", sessions: 2, repMin: 6 }),
      scheduledDeloadWeek: false,
      historyHref: null,
      suggestion: null,
    });
    expect(html).toContain("last time&#x27;s weight, not adjusted");
    expect(html).not.toContain(">Use ");
  });

  it("a hold, or Free (locked, nothing sent): the plain caption", () => {
    const hold = withCall({
      tag: null,
      recommendation: rec("hold", {
        kind: "hold_short",
        reps: [8, 8, 7],
        repMin: 6,
        repMax: 8,
        latest: LATEST,
      }),
      scheduledDeloadWeek: false,
      historyHref: null,
      suggestion: null,
    });
    expect(hold).toContain(">last time<");
    const free = withCall({
      tag: null,
      recommendation: null,
      scheduledDeloadWeek: false,
      historyHref: null,
      locked: true,
      suggestion: null,
    });
    expect(free).toContain(">last time<");
    expect(free).not.toContain("not adjusted");
    expect(free).not.toContain(">Use ");
  });

  it("deload week with an empty box (no trusted deload-week weight): Use the server's 160", () => {
    const html = withCall(
      {
        tag: null,
        recommendation: {
          kind: "scheduled_deload",
          tone: "quiet",
          action: "Deload week: 160 lb (90%)",
          evidence: "Planned recovery, not a verdict. Calls resume next week.",
        },
        scheduledDeloadWeek: true,
        historyHref: null,
        suggestion: { lbs: 160, kind: "scheduled_deload" },
      },
      card({ suggestedWeightLbs: null, weightContext: "reference_only" }),
    );
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("");
    expect(html).toContain(">Use 160 lb<");
  });

  it("not after a saved set (the lifter has chosen today's weight)", () => {
    const html = withCall(
      {
        tag: "progress",
        recommendation: rec("progress", {
          kind: "progress",
          sessions: 2,
          repMax: 8,
        }),
        scheduledDeloadWeek: false,
        historyHref: null,
        suggestion: { lbs: 190, kind: "progress_increment" },
      },
      card({ sets: [logged(1, 185, 8), open(2), open(3)] }),
    );
    expect(html).not.toContain(">Use 190 lb<");
    expect(html).toContain(">same as set 1<");
  });
});
