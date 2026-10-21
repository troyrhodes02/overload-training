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
    previousPerformance: {
      dateIso: "2026-10-13",
      gymScoped: false,
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

const render = (dto: ExerciseCardDto) =>
  renderToStaticMarkup(
    <ExerciseCard
      exercise={dto}
      gymLocked={false}
      workoutDateIso="2026-10-20"
    />,
  );
const inputs = (html: string) => html.match(/<input[^>]*>/g) ?? [];
const valueOf = (html: string, label: string) =>
  new RegExp(`<input[^>]*aria-label="${label}"[^>]*value="([^"]*)"`).exec(
    html,
  )?.[1] ??
  new RegExp(`<input[^>]*value="([^"]*)"[^>]*aria-label="${label}"`).exec(
    html,
  )?.[1];

describe("first set, history exists", () => {
  const html = render(card());

  it("shows last time as one text line and offers the working weight", () => {
    expect(html).toContain("Last time · Oct 13 · 185 × 8, 8, 7");
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("185");
    expect(html).toContain(">last time<");
  });

  it("never prefills reps", () => {
    expect(valueOf(html, "Set 1 reps")).toBe("");
  });

  it("has exactly one row with inputs; later sets are dashes", () => {
    expect(inputs(html)).toHaveLength(2);
    expect(html).not.toContain('aria-label="Set 2 weight in pounds"');
    expect(html).toMatch(/Set 2<\/span><span aria-hidden="true">—/);
    expect(html).toContain("not logged yet");
  });

  it("uses phone keypads, Enter hints, and a submit button inside a noValidate form", () => {
    expect(html).toMatch(/<form[^>]*novalidate/i);
    expect(html).toMatch(
      /inputMode="decimal"[^>]*enterKeyHint="next"|enterKeyHint="next"[^>]*inputMode="decimal"/,
    );
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('pattern="[0-9]*"');
    expect(html).toContain('enterKeyHint="done"');
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*aria-label="Log set 1"/,
    );
    expect(html).toContain("h-12"); // 48px set fields
  });
});

describe("mid-exercise reuse", () => {
  it("offers the weight just logged, not the original offer", () => {
    const html = render(card({ sets: [logged(1, 190, 8), open(2), open(3)] }));
    expect(valueOf(html, "Set 2 weight in pounds")).toBe("190");
    expect(html).toContain(">same as set 1<");
    expect(valueOf(html, "Set 2 reps")).toBe("");
  });

  it("renders a logged set as a button with its stored values and no input", () => {
    const html = render(card({ sets: [logged(1, 185, 8), open(2), open(3)] }));
    expect(html).toContain(
      'aria-label="Set 1, 185 pounds, 8 reps, logged. Correct this set"',
    );
    expect(html).not.toContain('aria-label="Set 1 reps"');
    expect(inputs(html)).toHaveLength(2);
  });

  it("AC-2: fewer controls than the Pitch 4 card (6 inputs + 2 Save) with set 1 logged", () => {
    const html = render(card({ sets: [logged(1, 185, 8), open(2), open(3)] }));
    // RIR Logging & Autoregulation adds exactly ONE control to the active row:
    // the optional RIR group (five chips, one tab stop; design §12, 8 → 9).
    // It is counted as one control here, never hidden from the count.
    const chips = html.match(/<button[^>]*role="radio"/g) ?? [];
    const groups = html.match(/role="radiogroup"/g) ?? [];
    const buttons = (html.match(/<button/g) ?? []).length - chips.length;
    // 2 inputs + Log set + the logged row (Swap/trend/Previous/Next are slots or runner).
    expect(inputs(html)).toHaveLength(2);
    expect(buttons).toBe(2);
    expect(chips).toHaveLength(5);
    expect(groups).toHaveLength(1);
  });
});

describe("all planned sets logged", () => {
  it("has no inputs, says so, and offers Add set", () => {
    const html = render(
      card({ sets: [logged(1, 185, 8), logged(2, 185, 8), logged(3, 185, 7)] }),
    );
    expect(inputs(html)).toHaveLength(0);
    expect(html).toContain("All 3 sets logged.");
    expect(html).toContain("Add set");
  });
});

describe("no history and gym scope", () => {
  it("first time: nothing invented", () => {
    const html = render(
      card({ previousPerformance: null, suggestedWeightLbs: null }),
    );
    expect(html).toContain("First time logging this.");
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("");
    expect(html).not.toContain(">last time<");
  });

  it("machine/cable with nothing at this gym names the gym, no number", () => {
    const html = render(
      card({
        performedExerciseName: "Triceps Pushdown",
        isGymVariable: true,
        gymName: "Campus Rec Center",
        previousPerformance: null,
        suggestedWeightLbs: null,
      }),
    );
    expect(html).toContain("First time on this at Campus Rec Center.");
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("");
  });

  it("a gym baseline offer is captioned 'working weight' (R27)", () => {
    const html = render(
      card({
        isGymVariable: true,
        gymName: "Downtown Gym",
        suggestedWeightLbs: 200,
        workingWeightFromBaseline: true,
      }),
    );
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("200");
    expect(html).toContain(">working weight<");
    expect(html).not.toContain(">last time<");
  });

  it("machine/cable at its gym says 'here'", () => {
    const html = render(
      card({
        isGymVariable: true,
        gymName: "Downtown Gym",
        previousPerformance: {
          dateIso: "2026-10-13",
          gymScoped: true,
          sets: [
            { setNumber: 1, weightLbs: 50, reps: 12 },
            { setNumber: 2, weightLbs: 50, reps: 12 },
            { setNumber: 3, weightLbs: 50, reps: 11 },
          ],
        },
        suggestedWeightLbs: 50,
      }),
    );
    expect(html).toContain("Last time here · Oct 13 · 50 × 12, 12, 11");
  });
});

describe("progression suggestions stay display-only (R8)", () => {
  it("a +5 Progress suggestion does not become the offered weight", () => {
    const html = renderToStaticMarkup(
      <ExerciseCard
        exercise={card()}
        gymLocked={false}
        workoutDateIso="2026-10-20"
        progression={{
          tag: "progress",
          rirEffect: null,
          suggestion: { lbs: 190, kind: "progress_increment" },
          scheduledDeloadWeek: false,
          hasTrend: true,
        }}
      />,
    );
    expect(html).toContain("Try 190 lb (+5)");
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("185");
  });
});

describe("RIR reason lines (RIR Logging & Autoregulation R20–R21)", () => {
  const render = (p: Parameters<typeof ExerciseCard>[0]["progression"]) =>
    renderToStaticMarkup(
      <ExerciseCard
        exercise={card()}
        gymLocked={false}
        workoutDateIso="2026-10-20"
        progression={p}
      />,
    );

  it("a Progress held at the limit shows the case A line and no tag", () => {
    const html = render({
      tag: null,
      rirEffect: "held_at_limit",
      suggestion: null,
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).toContain(
      "Top of the range, but at your limit last time (0 RIR) — holding.",
    );
    expect(html).not.toContain(">Progress<");
    expect(html).not.toContain("Hold — trend flat");
  });

  it("a released stall shows Progress, its suggestion, and the case B line", () => {
    const html = render({
      tag: "progress",
      rirEffect: "released_stall",
      suggestion: { lbs: 190, kind: "progress_increment" },
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).toContain(">Progress<");
    expect(html).toContain(
      "e1RM is flat, but every set last time had 2+ in reserve — ready to go up.",
    );
  });

  it("an ordinary call shows no RIR line", () => {
    const html = render({
      tag: null,
      rirEffect: null,
      suggestion: null,
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).not.toContain("at your limit last time");
    expect(html).not.toContain("in reserve — ready to go up");
  });

  it("a scheduled-deload week shows only the deload line", () => {
    const html = render({
      tag: null,
      rirEffect: null,
      suggestion: { lbs: 165, kind: "scheduled_deload" },
      scheduledDeloadWeek: true,
      hasTrend: true,
    });
    expect(html).toContain("Deload week — recovery, not a verdict.");
    expect(html).not.toContain("at your limit");
  });
});

describe("RIR on the card (RIR Logging & Autoregulation preview §01–§03)", () => {
  const renderCard = (overrides: Partial<ExerciseCardDto> = {}) =>
    renderToStaticMarkup(
      <ExerciseCard
        exercise={card(overrides)}
        gymLocked={false}
        workoutDateIso="2026-10-20"
      />,
    );
  const groups = (html: string) =>
    html.match(
      /role="radiogroup" aria-label="Set \d+ RIR \(reps in reserve, optional\)"/g,
    )?.length ?? 0;

  it("the active row offers RIR with nothing chosen; no other row has it", () => {
    const html = renderCard({
      sets: [logged(1, 185, 8), open(2), open(3)],
    });
    expect(groups(html)).toBe(1);
    expect(html).toContain(
      'aria-label="Set 2 RIR (reps in reserve, optional)"',
    );
    expect(html).not.toMatch(/aria-checked="true"/);
  });

  it("a logged set shows its RIR only when one was recorded — 0 included", () => {
    const html = renderCard({
      sets: [
        { ...logged(1, 185, 8), rir: 2 },
        { ...logged(2, 185, 8), rir: null },
        { ...logged(3, 185, 8), rir: 0 },
      ],
    });
    expect(html).toContain("· 2 RIR");
    expect(html).toContain("· 0 RIR");
    expect(html.match(/· \d\+? RIR/g)).toHaveLength(2);
    expect(html).toContain(
      'aria-label="Set 1, 185 pounds, 8 reps, 2 reps in reserve, logged. Correct this set"',
    );
    expect(html).toContain(
      'aria-label="Set 2, 185 pounds, 8 reps, logged. Correct this set"',
    );
    // Every planned set is logged: no active row, so no RIR choice.
    expect(groups(html)).toBe(0);
  });

  it("4 reads 4+ on a logged row", () => {
    const html = renderCard({
      sets: [{ ...logged(1, 185, 8), rir: 4 }, open(2), open(3)],
    });
    expect(html).toContain("· 4+ RIR");
  });

  it("bodyweight keeps reps only, with the same optional RIR", () => {
    const html = renderCard({
      requiresExternalWeight: false,
      suggestedWeightLbs: null,
      sets: [{ ...logged(1, null, 15), rir: 1 }, open(2)],
    });
    expect(html).not.toContain("weight in pounds");
    expect(html).toContain("15");
    expect(html).toContain("· 1 RIR");
    expect(groups(html)).toBe(1);
  });
});
