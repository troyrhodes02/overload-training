/**
 * Pitch 21i design X2 (spec §12 "Mobile"): an exercise's history renders the
 * server's gated answer — sessions as logged, records, the trend's points,
 * the calls on Pro — and a Free account sees the plain history with one Pro
 * note. Links stay in the stack the lifter is in; over a workout, session
 * dates are not links.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  ExerciseHistoryDto,
  ExerciseHistoryViewDto,
  SessionRowDto,
} from "@overload/shared/contracts/exercise-history";
import type { ExerciseDetailDto } from "@overload/shared/contracts/exercises";
import { ApiError } from "../src/api/errors";
import { ExerciseHistoryScreen } from "../src/exercise-history/ExerciseHistoryScreen";
import {
  exerciseDetailHrefIn,
  exerciseHistoryHref,
  loggedWorkoutHrefIn,
  nextLines,
  sessionCall,
  sessionLines,
  trendFootnote,
  trendSentence,
  trendViewOf,
} from "../src/exercise-history/history-model";
import { resetProNotes } from "../src/insights/pro-note-store";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock("../src/ui/haptics", () => ({
  haptic: {
    light: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
  },
}));

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string) => {
    const r = routes[path];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return r;
  });
}

const EXERCISE: ExerciseDetailDto = {
  id: "ex-bench",
  name: "Barbell Bench Press",
  primaryMuscle: "chest",
  primaryMuscleLabel: "Chest",
  equipmentType: "barbell",
  equipmentLabel: "Barbell",
  secondaryMuscleLabels: [],
  imageUrl: null,
  isCustom: false,
  isFavorite: false,
  isArchived: false,
  canArchive: false,
} as unknown as ExerciseDetailDto;

const row = (over: Partial<SessionRowDto> = {}): SessionRowDto => ({
  loggedExerciseId: "le-1",
  loggedSessionId: "ls-1",
  dateIso: "2026-11-18",
  dateLabel: "Nov 18",
  gymName: "Downtown Gym",
  gymArchived: false,
  workingSets: [
    { weightLbs: 185, reps: 8, rir: 2 },
    { weightLbs: 185, reps: 8, rir: 1 },
    { weightLbs: 185, reps: 7, rir: null },
  ],
  extraSets: [],
  plannedSets: 3,
  swappedFromName: null,
  sessionName: "Push",
  call: "progress",
  ...over,
});

const PRO: ExerciseHistoryDto = {
  exerciseId: "ex-bench",
  gymVariable: false,
  externalLoad: true,
  hasHistory: true,
  scopes: [],
  selectedScope: { key: "global", label: "", archived: false },
  next: {
    kind: "call",
    tag: "progress",
    recommendation: {
      kind: "progress",
      tone: "strong",
      action: "Try 190 lb next time (+5 lb)",
      evidence: "Top of 6–8 two sessions running.",
    } as never,
    insufficientNote: null,
  },
  nextByWorkout: [],
  records: {
    kind: "loaded",
    bestSet: {
      weightLbs: 185,
      reps: 8,
      dateIso: "2026-11-18",
      dateLabel: "Nov 18",
    },
    bestE1rm: 234,
    heaviest: {
      weightLbs: 195,
      reps: 3,
      dateIso: "2026-10-30",
      dateLabel: "Oct 30",
    },
    repRecords: [
      { weightLbs: 195, reps: 3, dateIso: "2026-10-30", dateLabel: "Oct 30" },
      { weightLbs: 185, reps: 8, dateIso: "2026-11-18", dateLabel: "Nov 18" },
    ],
  },
  trend: {
    e1rm: {
      points: [
        {
          dateIso: "2026-11-11",
          dateLabel: "Nov 11",
          value: 228,
          scheduledDeload: false,
          setsLabel: "180 × 8 · 8 · 8",
          projected: null,
        },
        {
          dateIso: "2026-11-18",
          dateLabel: "Nov 18",
          value: 234,
          scheduledDeload: false,
          setsLabel: "185 × 8 · 8 · 7",
          projected: null,
        },
      ],
      latest: 234,
    },
    weight: null,
    reps: null,
  },
  sessions: {
    rows: [
      row(),
      row({
        loggedExerciseId: "le-2",
        loggedSessionId: "ls-2",
        dateLabel: "Nov 11",
        call: "hold",
        swappedFromName: "Incline Bench Press",
        workingSets: [{ weightLbs: 180, reps: 8, rir: null }],
      }),
    ],
    total: 14,
    showingAll: false,
  },
  locked: null,
};

/** The same lift on Free: the server withheld every Pro field. */
const FREE: ExerciseHistoryDto = {
  ...PRO,
  next: {
    kind: "call",
    tag: null,
    recommendation: null,
    insufficientNote: null,
  },
  records: {
    ...(PRO.records as Extract<
      ExerciseHistoryDto["records"],
      { kind: "loaded" }
    >),
    bestE1rm: null,
    repRecords: null,
  },
  trend: { e1rm: null, weight: null, reps: null },
  sessions: {
    ...PRO.sessions,
    rows: PRO.sessions.rows.map((r) => ({ ...r, call: "none" as const })),
  },
  locked: "progression_insights",
};

const GOALS = {
  active: null,
  past: [],
  newGoalEligible: true,
  bodyweight: false,
};

const view = (history: ExerciseHistoryDto): ExerciseHistoryViewDto => ({
  history,
  goals: GOALS,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetProNotes();
});

describe("history model", () => {
  it("keeps every link in its stack; over a workout dates aren't links", () => {
    expect(exerciseHistoryHref("plan", "e1")).toBe("/plan/exercise-history/e1");
    expect(exerciseHistoryHref("root", "e1", "g1")).toBe(
      "/exercise-history/e1?scope=g1",
    );
    expect(loggedWorkoutHrefIn("goals", "ls")).toBe("/goals/logged/ls");
    expect(loggedWorkoutHrefIn("root", "ls")).toBeNull();
    expect(exerciseDetailHrefIn("more", "e1")).toBe("/more/exercises/e1");
  });

  it("prints a session exactly as logged, RIR only when recorded", () => {
    expect(sessionLines(row(), true)).toMatchObject({
      head: "Nov 18 · Push · Downtown Gym",
      sets: "185 × 8 · 8 · 7",
      rir: "RIR 2 · 1 · –",
      swap: null,
    });
    const plain = sessionLines(
      row({ workingSets: [{ weightLbs: 185, reps: 8, rir: null }] }),
      true,
    );
    expect(plain.rir).toBeNull();
    expect(
      sessionLines(row({ call: "not_counted", plannedSets: 4 }), true)
        .notCounted,
    ).toBe("3 of 4 planned sets");
  });

  it("shows the engine's chips and the web's muted words, nothing on Free", () => {
    expect(sessionCall("progress")).toEqual({
      kind: "chip",
      chip: { label: "Progress", tone: "progress" },
    });
    expect(sessionCall("hold")).toEqual({ kind: "word", word: "Hold" });
    expect(sessionCall("none")).toBeNull();
  });

  it("picks one series: e1RM on Pro, locked on Free, reps for bodyweight", () => {
    expect(trendViewOf(PRO)).toMatchObject({ kind: "series", series: "e1rm" });
    expect(trendViewOf(FREE)).toEqual({ kind: "locked" });
    const bw: ExerciseHistoryDto = {
      ...FREE,
      externalLoad: false,
      trend: {
        e1rm: null,
        weight: null,
        reps: { points: [], latest: null },
      },
    };
    expect(trendViewOf(bw)).toMatchObject({ series: "reps", unit: "reps" });
    expect(trendViewOf({ ...PRO, hasHistory: false })).toBeNull();
  });

  it("fewer than two points is a sentence, never a chart", () => {
    const one = trendViewOf({
      ...PRO,
      trend: {
        ...PRO.trend,
        e1rm: { points: [PRO.trend.e1rm!.points[0]], latest: 228 },
      },
    });
    expect(trendSentence(one as never)).toBe(
      "One session so far: e1RM 228 lb. The trend starts at two.",
    );
    const two = trendViewOf(PRO);
    expect(trendSentence(two as never)).toBeNull();
    expect(trendFootnote(two as never, "Downtown Gym", false)).toBe(
      "2 sessions at Downtown Gym · Epley estimate",
    );
  });

  it("Next time: one call, or one labeled line per recurring workout", () => {
    expect(nextLines(PRO)).toHaveLength(1);
    expect(nextLines(FREE)).toEqual([]);
    const two: ExerciseHistoryDto = {
      ...PRO,
      next: null,
      nextByWorkout: [
        { sessionName: "Push", repRange: { min: 6, max: 8 }, next: PRO.next! },
        {
          sessionName: "Upper",
          repRange: { min: 5, max: 5 },
          next: {
            kind: "call",
            tag: null,
            recommendation: null,
            insufficientNote: "Not enough history yet.",
          },
        },
      ],
    };
    expect(nextLines(two).map((l) => l.label)).toEqual([
      "Push · 6–8 reps",
      "Upper · 5 reps",
    ]);
  });
});

describe("X2 Exercise history", () => {
  it("Pro: Next time, records with rep records, the trend, sessions, and goals", async () => {
    serve({
      "/exercises/ex-bench": EXERCISE,
      "/exercises/ex-bench/history": view(PRO),
      "/exercises/ex-bench/history?sessions=all": view({
        ...PRO,
        sessions: { ...PRO.sessions, showingAll: true },
      }),
    });
    await render(
      <Providers>
        <ExerciseHistoryScreen
          exerciseId="ex-bench"
          initialScope={null}
          stack="more"
        />
      </Providers>,
    );
    expect(
      await screen.findByText("Try 190 lb next time (+5 lb)"),
    ).toBeTruthy();
    expect(screen.getAllByText("234 lb")).toHaveLength(2); // best e1RM, current trend
    expect(screen.getByText("195 lb × 3\n185 lb × 8")).toBeTruthy();
    expect(screen.getByText("Trend · e1RM")).toBeTruthy();
    expect(screen.getByText("RIR 2 · 1 · –")).toBeTruthy();
    expect(screen.getByText("In place of Incline Bench Press")).toBeTruthy();
    expect(screen.queryByTestId("pro-note")).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: /^Nov 18 · Push · Downtown Gym/ }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/more/logged/ls-1");
    await fireEvent.press(
      screen.getByRole("button", { name: "View all 14 sessions" }),
    );
    await waitFor(() =>
      expect(mockApi.request).toHaveBeenCalledWith(
        "/exercises/ex-bench/history?sessions=all",
        expect.anything(),
      ),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Set a goal" }));
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/goal-new?exerciseId=ex-bench&from=history",
    );
  });

  it("Free: the plain history and one Pro note; nothing withheld is shown", async () => {
    serve({
      "/exercises/ex-bench": EXERCISE,
      "/exercises/ex-bench/history": view(FREE),
    });
    await render(
      <Providers>
        <ExerciseHistoryScreen
          exerciseId="ex-bench"
          initialScope={null}
          stack="plan"
        />
      </Providers>,
    );
    expect(await screen.findByTestId("pro-note")).toBeTruthy();
    expect(screen.getByText("— Part of Pro")).toBeTruthy();
    expect(screen.getByText("The e1RM trend is part of Pro.")).toBeTruthy();
    expect(screen.queryByText("Next time")).toBeNull();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(screen.queryByText("Hold")).toBeNull();
    expect(screen.queryByText("Rep records")).toBeNull();
    expect(screen.getByText("185 × 8 · 8 · 7")).toBeTruthy();
  });

  it("over a workout, goal rows aren't links and Set a goal links nowhere else (review 5b)", async () => {
    serve({
      "/exercises/ex-bench": EXERCISE,
      "/exercises/ex-bench/history": {
        history: PRO,
        goals: {
          active: {
            goalId: "g-1",
            exerciseId: "ex-bench",
            exerciseName: "Barbell Bench Press",
            exerciseArchived: false,
            gymId: null,
            gymName: null,
            gymArchived: false,
            targetWeightLbs: 225,
            targetReps: 5,
            targetLabel: "225 lb × 5",
            createdAtIso: "2026-10-12T00:00:00.000Z",
            createdLabel: "Oct 12, 2026",
            percent: 85,
            targetE1rm: 263,
            best: null,
          },
          past: [],
          newGoalEligible: false,
          bodyweight: false,
        },
      },
    });
    await render(
      <Providers>
        <ExerciseHistoryScreen
          exerciseId="ex-bench"
          initialScope={null}
          stack="root"
        />
      </Providers>,
    );
    expect(await screen.findByText("225 lb × 5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /225 lb × 5/ })).toBeNull();
  });

  it("over a workout, session dates are plain text", async () => {
    serve({
      "/exercises/ex-bench": EXERCISE,
      "/exercises/ex-bench/history": view(PRO),
    });
    await render(
      <Providers>
        <ExerciseHistoryScreen
          exerciseId="ex-bench"
          initialScope={null}
          stack="root"
        />
      </Providers>,
    );
    await screen.findByText("Trend · e1RM");
    expect(
      screen.queryByRole("button", { name: /^Nov 18 · Push · Downtown Gym/ }),
    ).toBeNull();
  });

  it("a machine switches gyms through the server's scopes", async () => {
    const machine: ExerciseHistoryDto = {
      ...PRO,
      gymVariable: true,
      scopes: [
        { key: "g-harbor", label: "Harbor Barbell", archived: false },
        { key: "g-down", label: "Downtown Gym (archived)", archived: true },
      ],
      selectedScope: {
        key: "g-harbor",
        label: "Harbor Barbell",
        archived: false,
      },
    };
    serve({
      "/exercises/ex-bench": EXERCISE,
      "/exercises/ex-bench/history": view(machine),
      "/exercises/ex-bench/history?scope=g-down": view({
        ...machine,
        selectedScope: machine.scopes[1],
      }),
    });
    await render(
      <Providers>
        <ExerciseHistoryScreen
          exerciseId="ex-bench"
          initialScope={null}
          stack="goals"
        />
      </Providers>,
    );
    expect(await screen.findByText("Records · Harbor Barbell")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: /Downtown Gym \(archived\)/ }),
    );
    expect(
      await screen.findByText("Records · Downtown Gym (archived)"),
    ).toBeTruthy();
    // An archived gym is never preselected for a new goal.
    await fireEvent.press(screen.getByRole("button", { name: "Set a goal" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      "/goal-new?exerciseId=ex-bench&from=history",
    );
  });

  it("no logged sets: one sentence, and the goals still show", async () => {
    serve({
      "/exercises/ex-bench": EXERCISE,
      "/exercises/ex-bench/history": view({
        ...FREE,
        hasHistory: false,
        records: null,
        selectedScope: null,
        sessions: { rows: [], total: 0, showingAll: true },
        locked: null,
      }),
    });
    await render(
      <Providers>
        <ExerciseHistoryScreen
          exerciseId="ex-bench"
          initialScope={null}
          stack="more"
        />
      </Providers>,
    );
    expect(await screen.findByText("No sets logged yet.")).toBeTruthy();
    expect(screen.queryByText(/^Trend/)).toBeNull();
    expect(screen.getByText("Set a goal")).toBeTruthy();
  });
});
