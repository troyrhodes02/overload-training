/**
 * Pitch 21f (OVE-216): changing the workout's gym, swapping an exercise, and
 * marking one not done. Each is one request whose 200 is the only thing that
 * changes the screen; a refusal or a failed request leaves the card as it was
 * and says why. The rules themselves (gym locked after a set, swap before the
 * first set) are the server's; these tests pin what the phone shows and sends.
 */
import { ActionSheetIOS } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { SwapContextDto } from "@overload/shared/contracts/logging";
import { ApiError } from "../src/api/errors";
import {
  exerciseActions,
  SETS_LOGGED_MESSAGE,
} from "../src/workout/exercise-actions";
import {
  filterCandidates,
  muscleChips,
  SwapScreen,
} from "../src/workout/SwapScreen";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { Providers } from "./harness";
import { card, rows, view, workout } from "./fixtures/workout";

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

/** Requests that changed something (anything but a GET). */
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, opts]) => opts?.method && opts.method !== "GET")
    .map(([path, opts]) => [opts.method, path, opts.body]);

/** The next action sheet picks the row with this label (or Cancel). */
function sheetPicks(label: string) {
  return jest
    .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    .mockImplementation((options, callback) => {
      const index = options.options.indexOf(label);
      callback(index >= 0 ? index : (options.cancelButtonIndex ?? 0));
    });
}

const savedRow = (n: number) => ({
  setNumber: n,
  loggedSetId: `set-${n}`,
  weightLbs: 255,
  reps: 5,
  rir: null,
  saved: true,
  extra: false,
});

async function open() {
  await render(
    <Providers>
      <WorkoutScreen loggedSessionId="ls-1" />
    </Providers>,
  );
  await screen.findByRole("header");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("which actions a card offers", () => {
  const inProgress = { status: "in_progress" as const };

  it("no set saved: swap and not done", () => {
    expect(exerciseActions(card(), inProgress)).toEqual({
      actions: ["swap", "skip"],
      message: null,
    });
  });

  it("a set saved: neither, with the reason", () => {
    const partly = card({ sets: [savedRow(1), ...rows(3).slice(1)] });
    expect(exerciseActions(partly, inProgress)).toEqual({
      actions: [],
      message: SETS_LOGGED_MESSAGE,
    });
  });

  it("already not done: swap only (Undo is on the card)", () => {
    expect(
      exerciseActions(card({ skipped: true }), inProgress).actions,
    ).toEqual(["swap"]);
  });

  it("a finished workout offers nothing", () => {
    expect(exerciseActions(card(), { status: "complete" })).toEqual({
      actions: [],
      message: null,
    });
  });
});

describe("marking an exercise not done", () => {
  it("More ▸ Didn't do this exercise sends one request and shows the server's answer", async () => {
    const sheet = sheetPicks("Didn't do this exercise");
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/skipped": ({ body }: { body?: unknown }) => ({
        loggedExerciseId: "le-bench",
        skipped: (body as { skipped: boolean }).skipped,
      }),
    });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: "Barbell Bench Press",
      options: ["Swap exercise", "Didn't do this exercise", "Cancel"],
      cancelButtonIndex: 2,
    });
    expect(
      await screen.findByText(
        "Not done today. It won't count toward progression.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Set 1 reps")).toBeNull();
    expect(writes()).toEqual([
      ["PUT", "/logged-exercises/le-bench/skipped", { skipped: true }],
    ]);

    // Undo brings the logging rows back, again on the server's answer.
    await fireEvent.press(
      screen.getByRole("button", { name: "Undo — I'll log it" }),
    );
    expect(await screen.findByLabelText("Set 1 reps")).toBeTruthy();
    expect(writes()[1]).toEqual([
      "PUT",
      "/logged-exercises/le-bench/skipped",
      { skipped: false },
    ]);
  });

  it("Cancel on the sheet sends nothing", async () => {
    sheetPicks("Cancel");
    serve({ "/workouts/ls-1": view() });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    expect(writes()).toEqual([]);
    expect(screen.getByLabelText("Set 1 reps")).toBeTruthy();
  });

  it("a failed request leaves the card as it was and says why", async () => {
    sheetPicks("Didn't do this exercise");
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/skipped": new ApiError("network", "offline"),
    });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    expect(
      await screen.findByText(
        "Couldn't update this exercise — Overload needs a connection.",
      ),
    ).toBeTruthy();
    // Still loggable: nothing was marked.
    expect(screen.getByLabelText("Set 1 reps")).toBeTruthy();
    expect(screen.queryByText(/Not done today/)).toBeNull();
  });

  it("a refusal shows the server's words and re-reads the workout", async () => {
    sheetPicks("Didn't do this exercise");
    let reads = 0;
    serve({
      "/workouts/ls-1": () => {
        reads += 1;
        return view();
      },
      "/logged-exercises/le-bench/skipped": new ApiError(
        "invalid_state_transition",
        "Sets are logged for this exercise, so it can't be marked as not done.",
        400,
      ),
    });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    expect(
      await screen.findByText(
        "Sets are logged for this exercise, so it can't be marked as not done.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it("with a set saved the sheet explains the lock and offers only Cancel", async () => {
    const sheet = sheetPicks("Cancel");
    serve({
      "/workouts/ls-1": view(
        workout({
          gymLocked: true,
          exercises: [card({ sets: [savedRow(1), ...rows(3).slice(1)] })],
        }),
      ),
    });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      message: SETS_LOGGED_MESSAGE,
      options: ["Cancel"],
    });
  });
});

describe("opening the swap picker", () => {
  it("More ▸ Swap exercise opens the modal for this occurrence", async () => {
    sheetPicks("Swap exercise");
    serve({ "/workouts/ls-1": view() });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(
        "/workout/ls-1/swap?loggedExerciseId=le-bench",
      ),
    );
    expect(writes()).toEqual([]);
  });

  it("an archived exercise offers Swap and Didn't do on the card itself", async () => {
    serve({
      "/workouts/ls-1": view(
        workout({ exercises: [card({ performedArchived: true })] }),
      ),
      "/logged-exercises/le-bench/skipped": {
        loggedExerciseId: "le-bench",
        skipped: true,
      },
    });
    await open();
    expect(screen.getByText("Unavailable — choose a substitute")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Swap exercise" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/workout/ls-1/swap?loggedExerciseId=le-bench",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Didn't do this exercise" }),
    );
    expect(await screen.findByText(/Not done today/)).toBeTruthy();
  });
});

describe("changing the gym", () => {
  const GYMS = {
    gyms: [
      { id: "g-down", name: "Downtown Gym", address: null },
      { id: "g-river", name: "Riverside Fitness", address: null },
    ],
  };

  it("is offered only while the server says the gym isn't locked", async () => {
    serve({ "/workouts/ls-1": view(workout({ gymLocked: true })) });
    await open();
    expect(screen.queryByRole("button", { name: "Change gym" })).toBeNull();
  });

  it("picks from the account's gyms, sends it, and re-reads the workout", async () => {
    const sheet = sheetPicks("Riverside Fitness");
    let gym = "Downtown Gym";
    serve({
      "/workouts/ls-1": () =>
        view(
          workout({
            gymName: gym,
            exercises: [card({ isGymVariable: true, gymName: gym })],
          }),
        ),
      "/gyms": GYMS,
      "/workouts/ls-1/gym": ({ body }: { body?: unknown }) => {
        gym = "Riverside Fitness";
        return { loggedSessionId: "ls-1", ...(body as { gymId: string }) };
      },
    });
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Change gym" }));
    await waitFor(() =>
      expect(writes()).toEqual([
        ["PUT", "/workouts/ls-1/gym", { gymId: "g-river" }],
      ]),
    );
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: "Where are you training?",
      options: ["Downtown Gym (current)", "Riverside Fitness", "Cancel"],
    });
    // The server's answer, not a guess: the line and the machine card follow.
    expect(
      await screen.findByText(
        "Exercise 1 of 1 · Saturday, November 14 · Riverside Fitness",
      ),
    ).toBeTruthy();
    expect(screen.getByText("3 × 3–5 · Riverside Fitness")).toBeTruthy();
  });

  it("Cancel on the sheet sends nothing", async () => {
    sheetPicks("Cancel");
    serve({ "/workouts/ls-1": view(), "/gyms": GYMS });
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Change gym" }));
    await waitFor(() =>
      expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalled(),
    );
    expect(writes()).toEqual([]);
  });

  it("with one gym there is nothing to choose, and it says so", async () => {
    const sheet = sheetPicks("Cancel");
    serve({
      "/workouts/ls-1": view(),
      "/gyms": { gyms: GYMS.gyms.slice(0, 1) },
    });
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Change gym" }));
    expect(
      await screen.findByText("This is your only gym. Add another on the web."),
    ).toBeTruthy();
    expect(sheet).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it("a refusal shows the server's reason and changes nothing", async () => {
    sheetPicks("Riverside Fitness");
    serve({
      "/workouts/ls-1": view(),
      "/gyms": GYMS,
      "/workouts/ls-1/gym": new ApiError(
        "invalid_state_transition",
        "The gym is locked once sets are logged.",
        400,
      ),
    });
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Change gym" }));
    expect(
      await screen.findByText("The gym is locked once sets are logged."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Exercise 1 of 1 · Saturday, November 14 · Downtown Gym",
      ),
    ).toBeTruthy();
  });
});

describe("the swap picker's pure parts", () => {
  it("puts the planned group first, then the library's order, with no repeat", () => {
    const chips = muscleChips("back");
    expect(chips.slice(0, 3)).toEqual(["back", "chest", "lower_back"]);
    expect(new Set(chips).size).toBe(chips.length);
    expect(chips).toHaveLength(16);
  });

  it("filters by name, ignoring case and outer spaces", () => {
    const list = [
      { id: "1", name: "Incline Dumbbell Press", isFavorite: true },
      { id: "2", name: "Dumbbell Fly", isFavorite: false },
      { id: "3", name: "Leverage Chest Press", isFavorite: false },
    ];
    expect(filterCandidates(list, "  PRESS ").map((c) => c.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterCandidates(list, "")).toHaveLength(3);
    expect(filterCandidates(list, "row")).toEqual([]);
  });
});

describe("X1 Swap exercise", () => {
  const context = (over: Partial<SwapContextDto> = {}): SwapContextDto => ({
    loggedExerciseId: "le-bench",
    plannedExerciseName: "Barbell Bench Press",
    plannedMuscle: "chest",
    primaryMuscleLabel: "Chest",
    selectedMuscle: "chest",
    selectedMuscleLabel: "Chest",
    swapLocked: false,
    candidates: [
      { id: "ex-incline", name: "Incline Dumbbell Press", isFavorite: true },
      { id: "ex-fly", name: "Dumbbell Fly", isFavorite: false },
    ],
    ...over,
  });
  const CANDIDATES = "/logged-exercises/le-bench/swap-candidates";

  async function openSwap() {
    await render(
      <Providers>
        <SwapScreen loggedSessionId="ls-1" loggedExerciseId="le-bench" />
      </Providers>,
    );
  }

  it("opens on the planned group and says the plan stays the same", async () => {
    serve({ [CANDIDATES]: context() });
    await openSwap();
    expect(
      await screen.findByText("Instead of Barbell Bench Press"),
    ).toBeTruthy();
    expect(
      screen.getByText("Planned: Chest · today only, your plan stays the same"),
    ).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]!.props.accessibilityLabel).toBe("Chest");
    expect(tabs[0]!.props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(tabs).toHaveLength(16);
    expect(
      screen.getByRole("button", { name: "Incline Dumbbell Press, favorite" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dumbbell Fly" })).toBeTruthy();
  });

  it("another muscle group asks the server for that group", async () => {
    serve({
      [CANDIDATES]: context(),
      [`${CANDIDATES}?muscle=back`]: context({
        selectedMuscle: "back",
        selectedMuscleLabel: "Back",
        candidates: [
          { id: "ex-row", name: "Seated Cable Rows", isFavorite: false },
        ],
      }),
    });
    await openSwap();
    await screen.findByText("Instead of Barbell Bench Press");
    await fireEvent.press(screen.getByRole("tab", { name: "Back" }));
    expect(
      await screen.findByRole("button", { name: "Seated Cable Rows" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Back" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByRole("tab", { name: "Chest" }).props.accessibilityState,
    ).toMatchObject({ selected: false });
    // Back to the planned group reads the default list again (no parameter).
    await fireEvent.press(screen.getByRole("tab", { name: "Chest" }));
    expect(
      await screen.findByRole("button", { name: "Dumbbell Fly" }),
    ).toBeTruthy();
  });

  it("search narrows the list, and a miss can be cleared", async () => {
    serve({ [CANDIDATES]: context() });
    await openSwap();
    const search = await screen.findByLabelText("Search exercises");
    await fireEvent.changeText(search, "fly");
    expect(screen.queryByRole("button", { name: /Incline/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Dumbbell Fly" })).toBeTruthy();
    await fireEvent.changeText(search, "zzz");
    expect(screen.getByText("No exercises match “zzz”.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: "Dumbbell Fly" })).toBeTruthy();
  });

  it("an empty group explains itself", async () => {
    serve({
      [CANDIDATES]: context({
        selectedMuscle: "calves",
        selectedMuscleLabel: "Calves",
        candidates: [],
      }),
    });
    await openSwap();
    expect(
      await screen.findByText("No active exercises for Calves."),
    ).toBeTruthy();
    expect(screen.getByText("Pick another muscle group.")).toBeTruthy();
    expect(screen.queryByLabelText("Search exercises")).toBeNull();
  });

  it("choosing a row swaps this occurrence and closes on the server's answer", async () => {
    serve({
      [CANDIDATES]: context(),
      "/logged-exercises/le-bench/exercise": ({
        body,
      }: {
        body?: unknown;
      }) => ({
        loggedExerciseId: "le-bench",
        exerciseId: (body as { newExerciseId: string }).newExerciseId,
      }),
      "/workouts/ls-1": view(),
    });
    await openSwap();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Dumbbell Fly" }),
    );
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      [
        "PUT",
        "/logged-exercises/le-bench/exercise",
        { newExerciseId: "ex-fly" },
      ],
    ]);
  });

  it("a failed swap keeps the list and the search, and stays open", async () => {
    serve({
      [CANDIDATES]: context(),
      "/logged-exercises/le-bench/exercise": new ApiError("network", "offline"),
    });
    await openSwap();
    await fireEvent.changeText(
      await screen.findByLabelText("Search exercises"),
      "fly",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Dumbbell Fly" }));
    expect(
      await screen.findByText(
        "Couldn't swap the exercise — Overload needs a connection.",
      ),
    ).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Search exercises").props.value).toBe("fly");
    expect(screen.getByRole("button", { name: "Dumbbell Fly" })).toBeTruthy();
  });

  it("a locked exercise shows why and lists nothing", async () => {
    serve({ [CANDIDATES]: context({ swapLocked: true }) });
    await openSwap();
    expect(
      await screen.findByText("Sets are logged — this exercise is locked."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dumbbell Fly" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("a failed load is an error with a retry, never an empty list", async () => {
    serve({ [CANDIDATES]: new ApiError("network", "offline") });
    await openSwap();
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
    expect(screen.queryByText(/No active exercises/)).toBeNull();
  });
});
