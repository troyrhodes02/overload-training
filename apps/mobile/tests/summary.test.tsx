/**
 * Pitch 21g design §6 (S1 Summary) and spec RD-10, RD-17, RD-18: the saved
 * facts are the record's, exactly as History lists them; the next-time calls
 * are the server's gated summary, read separately; a failed call read never
 * hides the saved sets; Free sees the quiet note with no link; and opening
 * the summary only reads.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { LoggedWorkoutDetailDto } from "@overload/shared/contracts/logging";
import type { SessionProgressionSummaryDto } from "@overload/shared/contracts/progression";
import type { SessionGoalRowDto } from "@overload/shared/contracts/goals";
import type { LoggedWorkoutDetailViewDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { resetProNotes } from "../src/insights/pro-note-store";
import { SummaryScreen } from "../src/workout/SummaryScreen";
import { goalProgressLabel, summaryRows } from "../src/workout/summary-model";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  dismissAll: jest.fn(),
};
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

type Ex = LoggedWorkoutDetailDto["exercises"][number];
const ex = (over: Partial<Ex>): Ex => ({
  loggedExerciseId: "le",
  exerciseId: "ex",
  historyHref: "",
  performedName: "Lift",
  plannedName: "Lift",
  swapped: false,
  archived: false,
  skipped: false,
  requiresExternalWeight: true,
  plannedSets: 3,
  sets: [],
  ...over,
});
const set = (
  n: number,
  weightLbs: number | null,
  reps: number,
  rir: number | null = null,
  extra = false,
) => ({
  loggedSetId: `s-${n}-${weightLbs}-${reps}`,
  setNumber: n,
  weightLbs,
  reps,
  rir,
  extra,
});

const detail: LoggedWorkoutDetailDto = {
  loggedSessionId: "ls-1",
  sessionName: "Upper A",
  dateIso: "2026-11-18",
  dateLabel: "Wed, Nov 18",
  gymName: "Northside Strength",
  exercises: [
    ex({
      loggedExerciseId: "le-bench",
      exerciseId: "ex-bench",
      performedName: "Barbell Bench Press",
      plannedName: "Barbell Bench Press",
      sets: [
        set(1, 185, 8, 2),
        set(2, 185, 8),
        set(3, 185, 8, 0),
        set(4, 185, 6, null, true),
      ],
    }),
    ex({
      loggedExerciseId: "le-row",
      exerciseId: "ex-row",
      performedName: "Seated Cable Row",
      plannedName: "Wide-Grip Lat Pulldown",
      swapped: true,
      sets: [set(1, 145, 12), set(2, 145, 11)],
    }),
    ex({
      loggedExerciseId: "le-ohp",
      exerciseId: "ex-ohp",
      performedName: "Standing Military Press",
      plannedName: "Standing Military Press",
      skipped: true,
      sets: [],
    }),
  ],
};

const progressRow = {
  performedExerciseId: "ex-bench",
  performedExerciseName: "Barbell Bench Press",
  tag: "progress" as const,
  rirEffect: null,
  suggestion: { lbs: 190, kind: "progress_increment" as const },
  historyHref: null,
  recommendation: {
    kind: "progress" as const,
    tone: "strong" as const,
    action: "Try 190 lb next time (+5 lb)",
    evidence: "8 reps on every set, 2 sessions running",
  },
  plannedSets: 3,
  loggedWorkingSets: 3,
};
const rowHold = {
  performedExerciseId: "ex-row",
  performedExerciseName: "Seated Cable Row",
  tag: null,
  rirEffect: null,
  suggestion: null,
  historyHref: null,
  recommendation: null,
  plannedSets: 3,
  loggedWorkingSets: 2,
};
const proSummary: SessionProgressionSummaryDto = {
  loggedSessionId: "ls-1",
  scheduledDeloadWeek: false,
  locked: null,
  exercises: [progressRow, rowHold],
};
const goal: SessionGoalRowDto = {
  goalId: "g1",
  exerciseName: "Barbell Bench Press",
  targetLabel: "225 × 5",
  kind: "progress",
  percentBefore: 82,
  percentAfter: 85,
};
const full = (
  summary: SessionProgressionSummaryDto | null,
  goals: SessionGoalRowDto[] = [],
): LoggedWorkoutDetailViewDto => ({ detail, summary, goals });

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string) => {
    if (!(path in routes)) throw new ApiError("not_found", "nope", 404);
    const r = routes[path];
    if (r instanceof Error) throw r;
    return r;
  });
}
const CORE = "/history/ls-1?fields=core";
const FULL = "/history/ls-1";

async function open() {
  await render(
    <Providers>
      <SummaryScreen loggedSessionId="ls-1" />
    </Providers>,
  );
  await screen.findByText("Upper A complete");
}

beforeEach(() => {
  jest.clearAllMocks();
  resetProNotes();
});

describe("the saved facts (all plans)", () => {
  it("lists every set as recorded: RIR only when recorded (0 included), extra sets, swaps, skips, short of plan", async () => {
    serve({ [CORE]: full(null), [FULL]: full(proSummary) });
    await open();
    expect(
      screen.getByText("Northside Strength", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText("1  185 lbs × 8 · 2 RIR")).toBeTruthy();
    expect(screen.getByText("2  185 lbs × 8")).toBeTruthy();
    expect(screen.getByText("3  185 lbs × 8 · 0 RIR")).toBeTruthy();
    expect(screen.getByText("4  185 lbs × 6 · extra")).toBeTruthy();
    expect(
      screen.getByText(
        "Seated Cable Row · swapped from Wide-Grip Lat Pulldown",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Standing Military Press")).toBeTruthy();
    expect(screen.getByText("Not done")).toBeTruthy();
    expect(
      screen.getByText(
        "2 of 3 planned sets — counts toward your strength trend, not your progress check.",
      ),
    ).toBeTruthy();
  });

  it("a failed call read keeps the saved sets and offers a retry", async () => {
    let fail = true;
    mockApi.request.mockImplementation(async (path: string) => {
      if (path === CORE) return full(null);
      if (path === FULL) {
        if (fail) throw new ApiError("network", "offline", 0);
        return full(proSummary);
      }
      throw new ApiError("not_found", "nope", 404);
    });
    await open();
    expect(
      await screen.findByText("Couldn't load next-time calls."),
    ).toBeTruthy();
    expect(screen.getByText("1  185 lbs × 8 · 2 RIR")).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByText("Retry"));
    expect(
      await screen.findByText("Try 190 lb next time (+5 lb)"),
    ).toBeTruthy();
  });

  it("goals the workout moved, as a percentage (no chart)", async () => {
    serve({ [CORE]: full(null), [FULL]: full(proSummary, [goal]) });
    await open();
    expect(await screen.findByText("82% → 85%")).toBeTruthy();
    expect(screen.getByText("· 225 × 5", { exact: false })).toBeTruthy();
  });

  it("opening the summary only reads", async () => {
    serve({ [CORE]: full(null), [FULL]: full(proSummary) });
    await open();
    await screen.findByText("Try 190 lb next time (+5 lb)");
    for (const [, opts] of mockApi.request.mock.calls) {
      expect((opts as { method?: string } | undefined)?.method ?? "GET").toBe(
        "GET",
      );
    }
  });
});

describe("the calls", () => {
  it("Pro: the server's chip, action, and evidence on the right lift only", async () => {
    serve({ [CORE]: full(null), [FULL]: full(proSummary) });
    await open();
    expect(
      await screen.findByText("Try 190 lb next time (+5 lb)"),
    ).toBeTruthy();
    expect(screen.getByText("Progress")).toBeTruthy();
    expect(
      screen.getByText("8 reps on every set, 2 sessions running"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Progress: Try 190 lb next time (+5 lb). 8 reps on every set, 2 sessions running",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("pro-note")).toBeNull();
  });

  it("Free: no call, the quiet note with no link, and the record intact", async () => {
    const locked: SessionProgressionSummaryDto = {
      ...proSummary,
      locked: "progression_insights",
      exercises: proSummary.exercises.map((e) => ({
        ...e,
        tag: null,
        suggestion: null,
        recommendation: null,
      })),
    };
    serve({ [CORE]: full(null), [FULL]: full(locked) });
    await open();
    expect(
      await screen.findByText(
        "What to do next time on each lift, and why, is part of Pro.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/next time \(/)).toBeNull();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(screen.queryByText(/Explore Pro|Upgrade|Subscribe/)).toBeNull();
    expect(screen.getByText("1  185 lbs × 8 · 2 RIR")).toBeTruthy();
  });

  it("a deload week: the recovery line instead of calls", async () => {
    serve({
      [CORE]: full(null),
      [FULL]: full({ ...proSummary, scheduledDeloadWeek: true }),
    });
    await open();
    expect(
      await screen.findByText("Deload week — recovery, not a verdict."),
    ).toBeTruthy();
    expect(screen.queryByText("Try 190 lb next time (+5 lb)")).toBeNull();
  });
});

describe("summaryRows", () => {
  it("never attaches a call to another lift", () => {
    const mismatched: SessionProgressionSummaryDto = {
      ...proSummary,
      exercises: [{ ...progressRow, performedExerciseId: "ex-other" }],
    };
    const rows = summaryRows(detail, mismatched);
    expect(rows.map((r) => r.call)).toEqual([null, null, null]);
  });
  it("keeps every recorded exercise, in order, and adds none", () => {
    const rows = summaryRows(detail, proSummary);
    expect(rows.map((r) => r.exercise.loggedExerciseId)).toEqual([
      "le-bench",
      "le-row",
      "le-ohp",
    ]);
    expect(rows[0].call?.action).toBe("Try 190 lb next time (+5 lb)");
    expect(rows[1].call).toBeNull();
    expect(rows[2].call).toBeNull();
  });
  it("goalProgressLabel", () => {
    expect(goalProgressLabel(goal)).toBe("82% → 85%");
    expect(goalProgressLabel({ ...goal, percentBefore: null })).toBe("85%");
    expect(goalProgressLabel({ ...goal, kind: "reached" })).toBe(
      "Goal reached",
    );
    expect(goalProgressLabel({ ...goal, percentAfter: null })).toBeNull();
  });
});
