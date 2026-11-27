/**
 * Pitch 25 (OVE-271): Wing-It workouts on the iPhone. Today offers Wing-It in
 * every state, beside (never instead of) the planned workout; Start uses the
 * planned start's gym rule; an active workout is resumed, never discarded;
 * the runner's open-ended cards, the action sheet, History, and the cache
 * merge follow the server. Last, the TestFlight 1.0.0 (2) card model — the
 * code on phones that predate Wing-It — is run against a Wing-It card.
 */
import { ActionSheetIOS, Alert, Appearance } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  DashboardDto,
  DashboardTodayDto,
  ExerciseCardDto,
} from "@overload/shared/contracts/logging";
import type {
  TodayDto,
  WingItTodayDto,
} from "@overload/shared/contracts/views";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import { LEGACY_OPEN_REP_RANGE } from "@overload/shared/logging/wing-it";
import { ApiError } from "../src/api/errors";
import { mergeConfirmedSet } from "../src/api/training";
import { Providers } from "./harness";
import { TodayView } from "../src/today/TodayView";
import { wingItSectionModel } from "../src/today/WingItSection";
import { blockedFrom } from "../src/today/useStartWingIt";
import {
  cardActiveSet,
  cardContext,
  initialExerciseIndex,
  nextExtraSetNumber,
  unfinishedExercises,
  visibleExercises,
} from "../src/workout/card-model";
import { exerciseActions } from "../src/workout/exercise-actions";
import { historyRows } from "../src/history/HistoryScreen";
import { shortOfPlan } from "../src/history/LoggedWorkoutScreen";
import * as legacy from "./fixtures/legacy-1.0.0-2/card-model";
import { exerciseActions as legacyActions } from "./fixtures/legacy-1.0.0-2/exercise-actions";
import { card, view, workout } from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

const day = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
  kind: "pending",
  sessionId: "s-upper",
  loggedSessionId: null,
  sessionName: "Upper Body",
  scheduledFor: "2026-11-27",
  week: 2,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [
    {
      name: "Barbell Bench Press",
      scheme: "3 × 6–8",
      done: false,
      exerciseId: "e1",
      isGymVariable: false,
    },
  ],
  setsLogged: 0,
  cardio: [],
  ...over,
});

const noWingIt: WingItTodayDto = {
  open: null,
  finishedToday: [],
  blockedBy: null,
};

const todayDto = (
  dashboard: DashboardDto,
  wingIt: WingItTodayDto | undefined = noWingIt,
): TodayDto => ({
  today: "2026-11-27",
  greeting: "Good evening, Sam.",
  dashboard,
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
  wingIt,
});

const stripCore = (path: string) => path.replace(/\?fields=core$/, "");
type Routes = Record<string, unknown | ((body: unknown) => unknown)>;
function serve(routes: Routes) {
  mockApi.request.mockImplementation(
    async (raw: string, opts: { body?: unknown } = {}) => {
      const path = stripCore(raw);
      if (!(path in routes)) throw new ApiError("not_found", "nope", 404);
      const r = routes[path];
      if (r instanceof Error) throw r;
      return typeof r === "function" ? r(opts.body) : r;
    },
  );
}
const gym = (id: string, name: string) => ({ id, name, address: null });

async function renderToday(routes: Routes) {
  serve(routes);
  await render(
    <Providers>
      <TodayView />
    </Providers>,
  );
  await screen.findByText("Good evening, Sam.");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe.each(["light", "dark"] as const)(
  "Today in %s appearance",
  (scheme) => {
    beforeAll(() => {
      jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
    });

    it("a scheduled workout and the Wing-It option are both offered, distinctly", async () => {
      await renderToday({ "/today": todayDto(day()) });
      expect(
        screen.getByRole("button", { name: "Start workout" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Start Wing-It workout" }),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "Train something that isn't in your plan. Today's planned workout stays as it is.",
        ),
      ).toBeTruthy();
    });

    it("no plan: Wing-It is the day's training action", async () => {
      await renderToday({ "/today": todayDto({ kind: "no_plan" }) });
      expect(
        screen.getByRole("button", { name: "Start Wing-It workout" }),
      ).toBeTruthy();
    });
  },
);

describe("Today: every dashboard state offers Wing-It (RD-3)", () => {
  const states: [string, DashboardDto][] = [
    ["rest", { kind: "rest", week: 2, cardio: [] }],
    ["complete", day({ kind: "complete", loggedSessionId: "ls-done" })],
    ["in progress", day({ kind: "in_progress", loggedSessionId: "ls-up" })],
    [
      "missed",
      {
        kind: "missed_day",
        today: "2026-11-27",
        missed: {
          mesocycleId: "m",
          sessionId: "s-lower",
          sessionName: "Lower Body",
          missedOn: "2026-11-25",
          daysAgo: 2,
        },
        below: day(),
        cardio: [],
      },
    ],
  ];
  it.each(states)("%s", async (_label, dashboard) => {
    await renderToday({ "/today": todayDto(dashboard) });
    const start = screen.getByRole("button", { name: "Start Wing-It workout" });
    // Never inside the dimmed, inert missed-day block.
    expect(start.props.accessibilityState?.disabled).not.toBe(true);
  });

  it("an older server without the field still shows the section", async () => {
    await renderToday({ "/today": todayDto(day(), undefined) });
    expect(
      screen.getByRole("button", { name: "Start Wing-It workout" }),
    ).toBeTruthy();
  });
});

describe("Start Wing-It", () => {
  it("one active gym: starts with it and opens the workout", async () => {
    const start = jest.fn(() => ({ loggedSessionId: "ls-w", resumed: false }));
    await renderToday({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "Harbor Barbell")] },
      "/wing-it-workouts": start,
    });
    const sheet = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions");
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Wing-It workout" }),
    );
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-w"),
    );
    expect(start).toHaveBeenCalledWith({ gymId: "g1" });
    expect(sheet).not.toHaveBeenCalled();
    // The planned workout was never started.
    expect(mockApi.request).not.toHaveBeenCalledWith(
      "/workouts",
      expect.anything(),
    );
  });

  it("two gyms: asks where, then starts there", async () => {
    const start = jest.fn(() => ({ loggedSessionId: "ls-w", resumed: false }));
    await renderToday({
      "/today": todayDto({ kind: "no_plan" }),
      "/gyms": { gyms: [gym("g1", "Campus Rec"), gym("g2", "Harbor Barbell")] },
      "/wing-it-workouts": start,
    });
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((_o, cb) => cb(1));
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Wing-It workout" }),
    );
    await waitFor(() => expect(start).toHaveBeenCalledWith({ gymId: "g2" }));
  });

  it("open: Resume opens it and sends nothing", async () => {
    await renderToday({
      "/today": todayDto(day(), {
        ...noWingIt,
        open: {
          loggedSessionId: "ls-open",
          gymName: "Harbor Barbell",
          exerciseCount: 2,
          setsLogged: 4,
          startedOn: "2026-11-27",
        },
      }),
    });
    expect(screen.getByText("Harbor Barbell · 4 sets saved")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume Wing-It workout" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-open");
    expect(mockApi.request).not.toHaveBeenCalledWith(
      "/wing-it-workouts",
      expect.anything(),
    );
  });

  it("blocked by a workout with saved sets: names it, Resume opens it, nothing starts", async () => {
    await renderToday({
      "/today": todayDto(
        day({ kind: "in_progress", loggedSessionId: "ls-up" }),
        {
          ...noWingIt,
          blockedBy: { loggedSessionId: "ls-up", sessionName: "Upper Body" },
        },
      ),
    });
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.text === "Resume Upper Body")?.onPress?.();
      });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Wing-It workout" }),
    );
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-up"),
    );
    expect(alert.mock.calls[0]?.[1]).toBe(
      "Finish Upper Body first. It's still in progress with sets saved.",
    );
    expect(mockApi.request).not.toHaveBeenCalledWith(
      "/wing-it-workouts",
      expect.anything(),
    );
  });

  it("a stale Today: the server's 409 names the workout and Cancel changes nothing", async () => {
    const refusal = new ApiError("conflict", "Finish Upper Body first.", 409, {
      loggedSessionId: "ls-up",
      sessionName: "Upper Body",
    });
    await renderToday({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "Harbor Barbell")] },
      "/wing-it-workouts": refusal,
    });
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.text === "Cancel")?.onPress?.();
      });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Wing-It workout" }),
    );
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("a network failure says nothing was changed", async () => {
    await renderToday({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "Harbor Barbell")] },
      "/wing-it-workouts": new ApiError(
        "network",
        "Couldn't reach Overload.",
        0,
      ),
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Wing-It workout" }),
    );
    expect(await screen.findByText("Couldn't reach Overload.")).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe("the section model", () => {
  it("finished rows and helper words", () => {
    const m = wingItSectionModel(
      {
        open: null,
        blockedBy: null,
        finishedToday: [
          {
            loggedSessionId: "ls-1",
            gymName: "Harbor Barbell",
            exerciseCount: 3,
            setsLogged: 9,
            startedOn: "2026-11-27",
          },
        ],
      },
      "rest",
    );
    expect(m.finished[0]?.line).toBe(
      "✓ Wing-It workout · Harbor Barbell · 3 exercises · 9 sets",
    );
    expect(m.helper).toBe("Not on today's plan? Log it as a Wing-It workout.");
    expect(m.primary).toBe(false);
    expect(wingItSectionModel(undefined, "no_plan").primary).toBe(true);
  });

  it("reads the conflict's details only", () => {
    expect(
      blockedFrom(
        new ApiError("conflict", "x", 409, {
          loggedSessionId: "ls",
          sessionName: "Upper",
        }),
      ),
    ).toEqual({ loggedSessionId: "ls", sessionName: "Upper" });
    expect(blockedFrom(new ApiError("validation_error", "x", 400))).toBeNull();
  });
});

/** A Wing-It card as the server sends it: 2 saved sets and the open row 3. */
const wingItCard = (over: Partial<ExerciseCardDto> = {}): ExerciseCardDto =>
  card({
    loggedExerciseId: "le-press",
    performedExerciseName: "Leg Press",
    plannedExerciseName: "Leg Press",
    isGymVariable: true,
    openEnded: true,
    plannedSets: 3,
    plannedRepRange: { ...LEGACY_OPEN_REP_RANGE },
    suggestedWeightLbs: null,
    previousPerformance: null,
    referencePerformance: {
      dateIso: "2026-11-20",
      gymScoped: true,
      sets: [
        { setNumber: 1, weightLbs: 270, reps: 12 },
        { setNumber: 2, weightLbs: 270, reps: 10 },
      ],
      sessionName: "Wing-It workout",
      repRange: { ...LEGACY_OPEN_REP_RANGE },
      openEnded: true,
    },
    weightContext: "reference_only",
    sets: [
      {
        setNumber: 1,
        loggedSetId: "s1",
        weightLbs: 270,
        reps: 12,
        rir: null,
        saved: true,
        extra: false,
      },
      {
        setNumber: 2,
        loggedSetId: "s2",
        weightLbs: 290,
        reps: 10,
        rir: null,
        saved: true,
        extra: false,
      },
      {
        setNumber: 3,
        loggedSetId: null,
        weightLbs: null,
        reps: null,
        rir: null,
        saved: false,
        extra: false,
      },
    ],
    ...over,
  });
const wingItWorkout = (exercises = [wingItCard()]) =>
  workout({
    kind: "wing_it",
    sessionName: "Wing-It workout",
    gymName: "Harbor Barbell",
    exercises,
  });

describe("open-ended cards (Pitch 25)", () => {
  it("one open row, no extra set, last time as reference with no rep range", () => {
    const c = wingItCard();
    expect(cardActiveSet(c)).toBe(3);
    expect(nextExtraSetNumber(c)).toBeNull();
    expect(cardContext(c, wingItWorkout()).line).toBe(
      "Last time in Wing-It workout · Nov 20 · 270 × 12, 10",
    );
    expect(cardContext(c, wingItWorkout()).reference).toBeNull();
  });

  it("a removed card leaves; the workout opens on the card added last", () => {
    const removed = wingItCard({
      loggedExerciseId: "le-fly",
      skipped: true,
      sets: [],
    });
    const w = wingItWorkout([
      wingItCard(),
      removed,
      wingItCard({ loggedExerciseId: "le-row" }),
    ]);
    expect(visibleExercises(w).map((e) => e.loggedExerciseId)).toEqual([
      "le-press",
      "le-row",
    ]);
    expect(initialExerciseIndex({ ...w, exercises: visibleExercises(w) })).toBe(
      1,
    );
  });

  it("finishing lists only an exercise with nothing logged", () => {
    const empty = wingItCard({
      loggedExerciseId: "le-empty",
      performedExerciseName: "Cable Fly",
      sets: [
        {
          setNumber: 1,
          loggedSetId: null,
          weightLbs: null,
          reps: null,
          rir: null,
          saved: false,
          extra: false,
        },
      ],
      plannedSets: 1,
    });
    expect(unfinishedExercises(wingItWorkout([wingItCard(), empty]))).toEqual([
      { name: "Cable Fly", done: 0, planned: 1 },
    ]);
  });

  it("the action sheet: Remove only while nothing is saved; never Swap or fewer sets", () => {
    const empty = wingItCard({
      sets: [
        {
          setNumber: 1,
          loggedSetId: null,
          weightLbs: null,
          reps: null,
          rir: null,
          saved: false,
          extra: false,
        },
      ],
    });
    expect(exerciseActions(empty, { status: "in_progress" }).actions).toEqual([
      "details",
      "remove",
    ]);
    expect(
      exerciseActions(wingItCard(), { status: "in_progress" }).actions,
    ).toEqual(["details"]);
  });

  it("a confirmed set gets the next open row straight away", () => {
    const one = wingItCard({
      sets: [
        {
          setNumber: 1,
          loggedSetId: null,
          weightLbs: null,
          reps: null,
          rir: null,
          saved: false,
          extra: false,
        },
      ],
      plannedSets: 1,
    });
    const merged = mergeConfirmedSet(view(wingItWorkout([one])), {
      id: "s1",
      loggedExerciseId: "le-press",
      setNumber: 1,
      weightLbs: 200,
      reps: 10,
      rir: null,
      createdAt: "2026-11-27T18:00:00.000Z",
      updatedAt: "2026-11-27T18:00:00.000Z",
    });
    const sets = merged!.workout.exercises[0]!.sets;
    expect(sets.map((s) => [s.setNumber, s.saved, s.extra])).toEqual([
      [1, true, false],
      [2, false, false],
    ]);
  });

  it("the logged detail never says 'x of y planned sets'", () => {
    expect(
      shortOfPlan({
        loggedExerciseId: "le",
        exerciseId: "e",
        historyHref: "/exercises/e",
        performedName: "Leg Press",
        plannedName: "Leg Press",
        swapped: false,
        archived: false,
        skipped: false,
        requiresExternalWeight: true,
        plannedSets: 2,
        openEnded: true,
        sets: [
          {
            loggedSetId: "a",
            setNumber: 1,
            weightLbs: 200,
            reps: 10,
            rir: null,
            extra: false,
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("History lists Wing-It workouts in an active block week", () => {
  it("each on its day, after that day's planned workout", () => {
    const week: HistoryWeekDto = {
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
      rangeLabel: "Mon, Nov 23 – Sun, Nov 29",
      thisWeekStart: "2026-11-23",
      isThisWeek: true,
      prevWeekStart: null,
      nextWeekStart: null,
      earlierBlocks: [],
      hasAnyHistory: true,
      view: {
        kind: "active",
        blockName: "Block",
        weekNumber: 2,
        lengthWeeks: 4,
        cardio: [],
        days: [
          {
            dateIso: "2026-11-27",
            dayLabel: "Fri, Nov 27",
            sessionName: "Upper Body",
            state: "upcoming",
            loggedSessionId: null,
          },
        ],
        wingItWorkouts: [
          {
            loggedSessionId: "ls-w",
            dateIso: "2026-11-27",
            dayLabel: "Fri, Nov 27",
            sessionName: "Wing-It workout",
            state: "complete",
          },
        ],
      },
    };
    expect(
      historyRows(week).map((r) =>
        r.kind === "workout" ? r.sessionName : r.label,
      ),
    ).toEqual(["Upper Body", "Wing-It workout"]);
  });
});

describe("TestFlight 1.0.0 (2) compatibility (spec §8, RD-28)", () => {
  // The card model and action sheet on phones that predate Wing-It, run
  // against what the server now sends for a Wing-It workout.
  it("the old card logs the next set and never offers an extra set", () => {
    const c = wingItCard();
    expect(legacy.cardActiveSet(c)).toBe(3);
    expect(legacy.nextExtraSetNumber(c)).toBeNull();
    // Only this card's own saved set is offered ("same as set 2"), never a
    // weight from another workout.
    expect(legacy.cardOffer(c)).toEqual({
      source: { kind: "previous_set", setNumber: 2 },
      weightLbs: 290,
    });
    expect(() => legacy.cardContext(c, wingItWorkout())).not.toThrow();
  });

  it("the old runner opens it, can finish it, and its sheet offers only refusable rows", () => {
    const w = wingItWorkout();
    expect(legacy.initialExerciseIndex(w)).toBe(0);
    expect(legacy.canFinish(w)).toBe(true);
    expect(() => legacy.unfinishedExercises(w)).not.toThrow();
    // Swap / skip / fewer sets: the server refuses each with a message.
    expect(() =>
      legacyActions(wingItCard(), { status: "in_progress" }),
    ).not.toThrow();
  });
});
