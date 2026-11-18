/**
 * Pitch 21f review audit (PR #264): regressions for the accepted findings.
 * Each is about timing a unit test of one screen doesn't otherwise reach: a
 * save that finishes after its modal was left, a read that lands after a
 * write, and an action taken while another request is still out.
 */
import { ActionSheetIOS } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ExerciseCardDto } from "@overload/shared/contracts/logging";
import type {
  LoggedSetDto,
  TodayDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { TRAINING_KEYS, useEditSet } from "../src/api/training";
import { CardioScreen } from "../src/cardio/CardioScreen";
import { TodayView } from "../src/today/TodayView";
import { cardMode } from "../src/workout/card-model";
import { EditSetScreen } from "../src/workout/EditSetScreen";
import { changeFailureMessage } from "../src/workout/messages";
import { SwapScreen } from "../src/workout/SwapScreen";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { Providers } from "./harness";
import { card, rows, view, workout } from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => {
  const { createElement, Fragment } =
    jest.requireActual<typeof import("react")>("react");
  return {
    Stack: {
      Screen: ({
        options,
      }: {
        options?: {
          headerLeft?: () => import("react").ReactNode;
          headerRight?: () => import("react").ReactNode;
        };
      }) =>
        createElement(
          Fragment,
          null,
          options?.headerLeft?.(),
          options?.headerRight?.(),
        ),
    },
    get router() {
      return mockRouter;
    },
    useLocalSearchParams: () => ({}),
    useFocusEffect: () => {},
  };
});
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "s", Warning: "w" },
  ImpactFeedbackStyle: { Light: "l" },
}));

type Handler = (opts: { method?: string; body?: unknown }) => unknown;
function serve(routes: Record<string, unknown | Handler>) {
  mockApi.request.mockImplementation(
    async (raw: string, opts: { method?: string; body?: unknown } = {}) => {
      const r = routes[raw.replace(/\?fields=core$/, "")];
      if (r === undefined) throw new ApiError("not_found", "nope", 404);
      if (r instanceof Error) throw r;
      return typeof r === "function" ? (r as Handler)(opts) : r;
    },
  );
}
const requests = () => mockApi.request.mock.calls.map(([p]) => String(p));

/** A promise settled by the test, for a request that is still out. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Row = ExerciseCardDto["sets"][number];
const saved = (n: number, over: Partial<Row> = {}): Row => ({
  setNumber: n,
  loggedSetId: `set-${n}`,
  weightLbs: 255,
  reps: 5,
  rir: null,
  saved: true,
  extra: false,
  ...over,
});
const storedSet = (over: Partial<LoggedSetDto> = {}): LoggedSetDto => ({
  id: "set-1",
  loggedExerciseId: "le-bench",
  setNumber: 1,
  weightLbs: 255,
  reps: 5,
  rir: null,
  createdAt: "2026-11-14T15:00:00.000Z",
  updatedAt: "2026-11-14T15:00:00.000Z",
  ...over,
});
const withSet1 = (over: Partial<Row> = {}): WorkoutViewDto =>
  view(
    workout({
      gymLocked: true,
      exercises: [card({ sets: [saved(1, over), ...rows(3).slice(1)] })],
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("a save that finishes after its modal was left (finding 1)", () => {
  it("Edit set: Cancel while saving, then the answer, goes back once", async () => {
    const patch = deferred<LoggedSetDto>();
    serve({ "/workouts/ls-1": withSet1(), "/sets/set-1": () => patch.promise });
    await render(
      <Providers>
        <EditSetScreen
          loggedSessionId="ls-1"
          loggedSetId="set-1"
          from="workout"
        />
      </Providers>,
    );
    await fireEvent.changeText(await screen.findByLabelText("Reps"), "6");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await act(async () => {
      patch.resolve(storedSet({ reps: 6 }));
    });
    // The late answer must not pop the screen underneath.
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("Edit set: swiped away (unmounted) while saving, the answer goes back zero times", async () => {
    const patch = deferred<LoggedSetDto>();
    serve({ "/workouts/ls-1": withSet1(), "/sets/set-1": () => patch.promise });
    const rendered = await render(
      <Providers>
        <EditSetScreen
          loggedSessionId="ls-1"
          loggedSetId="set-1"
          from="workout"
        />
      </Providers>,
    );
    await fireEvent.changeText(await screen.findByLabelText("Reps"), "6");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await rendered.unmount();
    await act(async () => {
      patch.resolve(storedSet({ reps: 6 }));
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("Swap: Cancel while the swap is out, then the answer, goes back once", async () => {
    const put = deferred<unknown>();
    serve({
      "/logged-exercises/le-bench/swap-candidates": {
        loggedExerciseId: "le-bench",
        plannedExerciseName: "Barbell Bench Press",
        plannedMuscle: "chest",
        primaryMuscleLabel: "Chest",
        selectedMuscle: "chest",
        selectedMuscleLabel: "Chest",
        swapLocked: false,
        candidates: [{ id: "x", name: "Dumbbell Fly", isFavorite: false }],
      },
      "/logged-exercises/le-bench/exercise": () => put.promise,
      "/workouts/ls-1": view(),
    });
    await render(
      <Providers>
        <SwapScreen loggedSessionId="ls-1" loggedExerciseId="le-bench" />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Dumbbell Fly" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await act(async () => {
      put.resolve({ loggedExerciseId: "le-bench", exerciseId: "x" });
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    // The observed list was marked stale, not removed: no second list read.
    expect(
      requests().filter((p) => p.includes("swap-candidates")),
    ).toHaveLength(1);
  });

  it("Cardio: Cancel while saving, then the answer, goes back once", async () => {
    const put = deferred<unknown>();
    serve({ "/mesocycles/m-1/cardio-logs/2026-11-14": () => put.promise });
    await render(
      <Providers>
        <CardioScreen
          target={{
            mode: "log",
            mesocycleId: "m-1",
            scheduledFor: "2026-11-14",
            dateLabel: "Sat, Nov 14",
            planned: { type: "Incline Walk", durationMin: 20 },
          }}
        />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      put.resolve({ cardioLogId: "c-1", alreadyLogged: false });
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("no swap while a set is on its way (finding 2)", () => {
  it("More is disabled, and opens nothing, until the save answers", async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation(() => {});
    const put = deferred<LoggedSetDto>();
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": () => put.promise,
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    await fireEvent.changeText(await screen.findByLabelText("Set 1 reps"), "5");
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Log set 1" })[0]!,
    );
    const more = () =>
      screen.getByRole("button", { name: "More for Barbell Bench Press" });
    await waitFor(() =>
      expect(more().props.accessibilityState.disabled).toBe(true),
    );
    await fireEvent.press(more());
    expect(sheet).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => {
      put.resolve(storedSet());
    });
    await waitFor(() =>
      expect(more().props.accessibilityState.disabled).toBe(false),
    );
  });
});

describe("an older read never overwrites a correction (finding 3)", () => {
  it("a workout read still on its way when the correction lands is dropped", async () => {
    let client!: QueryClient;
    const key = TRAINING_KEYS.workout("ls-1");
    serve({ "/sets/set-1": storedSet({ weightLbs: 260 }) });
    const { result } = await renderHook(() => useEditSet(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Providers
          seed={(c) => {
            client = c;
            c.setQueryData(key, withSet1());
          }}
        >
          {children}
        </Providers>
      ),
    });
    // A refetch that started BEFORE the correction and answers after it.
    const stale = deferred<WorkoutViewDto>();
    void client
      .fetchQuery({ queryKey: key, queryFn: () => stale.promise, staleTime: 0 })
      .catch(() => {});
    await act(async () => {
      await result.current.mutateAsync({
        loggedSessionId: "ls-1",
        loggedSetId: "set-1",
        body: { weightLbs: 260, reps: 5 },
      });
    });
    await act(async () => {
      stale.resolve(withSet1());
    });
    const row =
      client.getQueryData<WorkoutViewDto>(key)!.workout.exercises[0]!.sets[0]!;
    expect([row.weightLbs, row.loggedSetId]).toEqual([260, "set-1"]);
  });

  it("Edit set opens on the cached values without reading the workout again", async () => {
    serve({ "/workouts/ls-1": withSet1() });
    await render(
      <Providers
        seed={(c) =>
          c.setQueryData(TRAINING_KEYS.workout("ls-1"), withSet1({ rir: 2 }))
        }
      >
        <EditSetScreen
          loggedSessionId="ls-1"
          loggedSetId="set-1"
          from="workout"
        />
      </Providers>,
    );
    expect((await screen.findByLabelText("Reps")).props.value).toBe("5");
    await act(async () => {});
    expect(requests()).toEqual([]);
  });

  it("with nothing cached it still reads what it needs", async () => {
    serve({ "/workouts/ls-1": withSet1() });
    await render(
      <Providers>
        <EditSetScreen
          loggedSessionId="ls-1"
          loggedSetId="set-1"
          from="workout"
        />
      </Providers>,
    );
    expect((await screen.findByLabelText("Reps")).props.value).toBe("5");
    expect(requests()).toEqual(["/workouts/ls-1?fields=core"]);
  });
});

describe("a cardio correction is on screen before its form closes (finding 4)", () => {
  const today = (type: string, durationMin: number): TodayDto => ({
    today: "2026-11-14",
    greeting: "Good morning, Sam.",
    dashboard: {
      kind: "rest",
      week: 3,
      cardio: [
        {
          mesocycleId: "m-1",
          scheduledFor: "2026-11-14",
          dateIso: "2026-11-14",
          dateLabel: "Sat, Nov 14",
          planned: { type: "Bike", durationMin: 20 },
          state: "complete",
          log: { id: "c-1", type, durationMin },
          differsFromPlan: type !== "Bike",
        },
      ],
    },
    plannedProgression: [],
    sessionSummary: null,
    sessionGoals: [],
    goals: null,
  });

  it("the form closes only after Today shows the saved record", async () => {
    let stored = today("Bike", 20);
    const refetch = deferred<void>();
    let todayReads = 0;
    serve({
      "/today": async () => {
        todayReads += 1;
        // The first read is Today opening; later ones follow the save.
        if (todayReads > 1) await refetch.promise;
        return stored;
      },
      "/cardio-logs/c-1": () => {
        stored = today("Rowing", 20);
        return { cardioLogId: "c-1" };
      },
    });
    await render(
      <Providers>
        <TodayView />
        <CardioScreen
          target={{
            mode: "edit",
            cardioLogId: "c-1",
            dateLabel: "Sat, Nov 14",
            logged: { type: "Bike", durationMin: 20 },
            planned: { type: "Bike", durationMin: 20 },
          }}
        />
      </Providers>,
    );
    await screen.findByText("Bike · 20 min");
    await fireEvent.changeText(screen.getByLabelText("Activity"), "Rowing");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(todayReads).toBe(2));
    // Saved at the server, but Today hasn't answered: the form is still open.
    expect(mockRouter.back).not.toHaveBeenCalled();
    await act(async () => {
      refetch.resolve();
    });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    // Reopening from the row now starts from what was just saved.
    expect(await screen.findByText("Rowing · 20 min")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: /^Cardio logged: Rowing, 20 minutes/,
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.stringContaining("type=Rowing&durationMin=20"),
    );
  });
});

describe("an exercise archived after a set was logged (finding 5)", () => {
  it("stays loggable: its sets are shown, not hidden behind 'choose a substitute'", async () => {
    const archivedMidway = card({
      performedArchived: true,
      sets: [saved(1), ...rows(3).slice(1)],
    });
    expect(cardMode(archivedMidway)).toBe("log");
    expect(cardMode(card({ performedArchived: true }))).toBe("unavailable");
    serve({
      "/workouts/ls-1": view(
        workout({ gymLocked: true, exercises: [archivedMidway] }),
      ),
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    expect(
      await screen.findByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Set 2 reps")).toBeTruthy();
    expect(screen.queryByText(/choose a substitute/)).toBeNull();
    // The actions the server would refuse are not offered on the card.
    expect(screen.queryByRole("button", { name: "Swap exercise" })).toBeNull();
  });
});

describe("one wording for a failed change (finding 7)", () => {
  it("says what the phone knows, and what was kept", () => {
    const offline = new ApiError("network", "offline");
    const down = new ApiError("unavailable", "bad gateway", 502);
    const refused = new ApiError(
      "invalid_state_transition",
      "Server words.",
      400,
    );
    expect(
      changeFailureMessage(offline, "save", "Your numbers are still here."),
    ).toBe(
      "Couldn't save — Overload needs a connection. Your numbers are still here.",
    );
    expect(
      changeFailureMessage(down, "save", "Your entries are still here."),
    ).toBe(
      "Couldn't save — Overload isn't responding. Your entries are still here.",
    );
    expect(changeFailureMessage(offline, "change the gym")).toBe(
      "Couldn't change the gym — Overload needs a connection.",
    );
    // A refusal is the server's own sentence, unchanged.
    expect(changeFailureMessage(refused, "save", "Kept.")).toBe(
      "Server words.",
    );
    expect(changeFailureMessage(new Error("x"), "save", "Kept.")).toBe(
      "Couldn't save. Kept.",
    );
  });
});
