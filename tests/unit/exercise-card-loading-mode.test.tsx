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

/**
 * Bodyweight logging UI: a pure bodyweight exercise renders reps entry only —
 * no weight input, no "lbs", no 0 to type — inside the same one-card/all-sets
 * layout; an external-load exercise keeps weight + reps. Since Faster Logging
 * UX a logged set is text (never an input) and only the next set has fields.
 */
function card(overrides: Partial<ExerciseCardDto>): ExerciseCardDto {
  return {
    loggedExerciseId: "le-1",
    performedExerciseName: "Wide-Grip Pull-Ups",
    plannedExerciseName: "Wide-Grip Pull-Ups",
    performedExerciseId: "ex-1",
    plannedPrimaryMuscle: "back",
    swapped: false,
    performedArchived: false,
    isGymVariable: false,
    requiresExternalWeight: false,
    gymName: null,
    plannedSets: 2,
    plannedRepRange: { min: 6, max: 12 },
    suggestedWeightLbs: null,
    previousPerformance: null,
    skipped: false,
    sets: [
      {
        setNumber: 1,
        loggedSetId: "ls-1",
        weightLbs: null,
        reps: 15,
        saved: true,
        extra: false,
      },
      {
        setNumber: 2,
        loggedSetId: null,
        weightLbs: null,
        reps: null,
        saved: false,
        extra: false,
      },
    ],
    ...overrides,
  };
}

const render = (dto: ExerciseCardDto) =>
  renderToStaticMarkup(<ExerciseCard exercise={dto} gymLocked={false} />);

describe("ExerciseCard loading mode", () => {
  it("a bodyweight exercise renders no weight input — reps only, for every set", () => {
    const html = render(card({}));
    expect(html).not.toMatch(/weight in pounds/);
    expect(html).not.toMatch(/>lbs</);
    // Set 1 is logged: shown as "15 reps" text, not an input.
    expect(html).not.toContain('aria-label="Set 1 reps"');
    expect(html).toContain(
      'aria-label="Set 1, 15 reps, logged. Correct this set"',
    );
    expect(html).not.toContain('value="15"');
    // Set 2 is next: a reps box and nothing else.
    expect(html).toContain('aria-label="Set 2 reps"');
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).toMatch(/bodyweight, reps only/);
  });

  it("a weighted exercise still renders weight + reps inputs", () => {
    const html = render(
      card({
        performedExerciseName: "Barbell Bench Press",
        requiresExternalWeight: true,
        suggestedWeightLbs: 185,
        plannedRepRange: { min: 6, max: 8 },
        sets: [
          {
            setNumber: 1,
            loggedSetId: "ls-1",
            weightLbs: 185,
            reps: 8,
            saved: true,
            extra: false,
          },
          {
            setNumber: 2,
            loggedSetId: null,
            weightLbs: null,
            reps: null,
            saved: false,
            extra: false,
          },
        ],
      }),
    );
    expect(html).not.toContain('aria-label="Set 1 weight in pounds"');
    expect(html).toContain('aria-label="Set 2 weight in pounds"');
    expect(html).toContain('aria-label="Set 2 reps"');
    expect(html).toMatch(/>lbs</);
    expect(html).toContain(
      'aria-label="Set 1, 185 pounds, 8 reps, logged. Correct this set"',
    );
    expect(html).not.toMatch(/bodyweight, reps only/);
  });
});
