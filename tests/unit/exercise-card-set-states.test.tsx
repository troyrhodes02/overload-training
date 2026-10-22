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
} from "@/lib/progression/recommendation";
import type { DecisionEvidence } from "@/lib/progression/types";

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
  it("a +5 recommendation does not become the offered weight", () => {
    const html = renderToStaticMarkup(
      <ExerciseCard
        exercise={card()}
        gymLocked={false}
        workoutDateIso="2026-10-20"
        progression={{
          tag: "progress",
          recommendation: rec("progress", {
            kind: "progress",
            sessions: 2,
            repMax: 8,
          }),
          scheduledDeloadWeek: false,
          hasTrend: true,
        }}
      />,
    );
    expect(html).toContain("Try 190 lb today (+5 lb)");
    expect(valueOf(html, "Set 1 weight in pounds")).toBe("185");
  });
});

describe("the recommendation lines (Smarter & Explainable Progression, Screen 1)", () => {
  const render = (p: Parameters<typeof ExerciseCard>[0]["progression"]) =>
    renderToStaticMarkup(
      <ExerciseCard
        exercise={card()}
        gymLocked={false}
        workoutDateIso="2026-10-20"
        progression={p}
      />,
    );

  it("Progress: the tag, the action in the foreground, the evidence muted", () => {
    const html = render({
      tag: "progress",
      recommendation: rec("progress", {
        kind: "progress",
        sessions: 2,
        repMax: 8,
      }),
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).toContain(">Progress<");
    expect(html).toContain(
      'class="text-sm tabular-nums font-medium text-foreground">Try 190 lb today (+5 lb)<',
    );
    expect(html).toContain(
      'class="text-xs tabular-nums text-muted-foreground">8 reps on every set, 2 sessions running<',
    );
  });

  it("a Progress held at the limit: no tag, the case A evidence, muted", () => {
    const html = render({
      tag: null,
      recommendation: rec("hold", {
        kind: "held_at_limit",
        rirAtLimit: 0,
        latest: LATEST,
      }),
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).toContain(
      "Top of the range, but at your limit last time (0 RIR)",
    );
    expect(html).toContain(
      'class="text-sm tabular-nums text-muted-foreground">Stay at 185 lb today<',
    );
    expect(html).not.toContain(">Progress<");
    expect(html).not.toContain("Hold — trend flat");
  });

  it("a released stall: Progress, the weight to try, the case B evidence", () => {
    const html = render({
      tag: "progress",
      recommendation: rec("progress", {
        kind: "released_stall",
        rirToSpare: 2,
        latest: LATEST,
      }),
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).toContain(">Progress<");
    expect(html).toContain("Try 190 lb today (+5 lb)");
    expect(html).toContain(
      "e1RM flat, but every set last time had 2+ in reserve",
    );
  });

  it("an ordinary hold: no tag and no colour, what to stay at and why", () => {
    const html = render({
      tag: null,
      recommendation: rec("hold", {
        kind: "hold_short",
        reps: [8, 7, 6],
        repMin: 6,
        repMax: 8,
        latest: LATEST,
      }),
      scheduledDeloadWeek: false,
      hasTrend: true,
    });
    expect(html).toContain("Stay at 185 lb today");
    expect(html).toContain("Last time: 8, 7, 6 of 6–8");
    expect(html).not.toMatch(/text-progress|text-deload/);
    // (The RIR chips' own label says "reps in reserve"; the lines never do here.)
    expect(html).not.toMatch(/in reserve<|\(0 RIR\)/);
  });

  it("a scheduled-deload week speaks only for the plan", () => {
    const html = render({
      tag: null,
      recommendation: buildRecommendation({
        scheduledDeload: true,
        externalLoad: true,
        deloadLoadLbs: 165,
      }),
      scheduledDeloadWeek: true,
      hasTrend: true,
    });
    expect(html).toContain("Deload week: 165 lb (90%)");
    expect(html).toContain(
      "Planned recovery, not a verdict. Calls resume next week.",
    );
    expect(html).not.toContain(">Deload<");
    expect(html).not.toContain("at your limit");
  });

  it("not enough history: neither line, the card as before", () => {
    const html = render({
      tag: null,
      recommendation: null,
      scheduledDeloadWeek: false,
      hasTrend: false,
    });
    expect(html).not.toContain("space-y-0.5");
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
