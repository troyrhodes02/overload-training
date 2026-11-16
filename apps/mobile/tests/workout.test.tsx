/**
 * Pitch 21e design W1 / F1 / S1 (spec §11 "logging card", "finish"): a row is
 * logged only after the server's 200, failures keep the typed numbers, and
 * the weight box holds only the server's trusted weight or a saved set's.
 */
import { Alert, Appearance } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { LoggedSetDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { Providers } from "./harness";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { SummaryScreen } from "../src/workout/SummaryScreen";
import {
  card,
  referenceOnlyCard,
  rows,
  view,
  workout,
} from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
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
      // The app asks for the core fields (RD-28); routes are keyed without it.
      const path = raw.replace(/\?fields=core$/, "");
      const r = routes[path];
      if (r === undefined) throw new ApiError("not_found", "nope", 404);
      if (r instanceof Error) throw r;
      return typeof r === "function" ? (r as Handler)(opts) : r;
    },
  );
}

const SET_1 = "/logged-exercises/le-bench/sets/1";

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

/** The workout as a real server would answer after storing `set`. */
const withSaved = (set: LoggedSetDto) =>
  view(
    workout({
      exercises: [
        card({
          sets: rows(3).map((r) =>
            r.setNumber === set.setNumber
              ? {
                  ...r,
                  loggedSetId: set.id,
                  weightLbs: set.weightLbs,
                  reps: set.reps,
                  saved: true,
                }
              : r,
          ),
        }),
      ],
    }),
  );

const logButton = (n: number) =>
  screen.getAllByRole("button", { name: `Log set ${n}` })[0];

async function open() {
  await render(
    <Providers>
      <WorkoutScreen loggedSessionId="ls-1" />
    </Providers>,
  );
  await screen.findByText("Barbell Bench Press");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each(["light", "dark"] as const)(
  "the logging card in %s",
  (scheme) => {
    beforeAll(() => {
      jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
    });

    it("shows where the lifter is: exercise n of N, the date, and the gym", async () => {
      serve({ "/workouts/ls-1": view() });
      await open();
      expect(
        screen.getByText(
          /^Exercise 1 of \d+ · Saturday, November 14 · Downtown Gym$/,
        ),
      ).toBeTruthy();
    });

    it("trusted: the box offers the server's 255, captioned 'last time'", async () => {
      serve({ "/workouts/ls-1": view() });
      await open();
      expect(
        screen.getByText("Last time in Push · Nov 7 · 255 × 5, 5, 4"),
      ).toBeTruthy();
      expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
        "255",
      );
      expect(screen.getByText("last time")).toBeTruthy();
    });

    it("reference only: the box is empty and Push shows only as reference", async () => {
      serve({
        "/workouts/ls-1": view(
          workout({ sessionName: "Upper", exercises: [referenceOnlyCard()] }),
        ),
      });
      await open();
      expect(
        screen.getByText("Nothing logged in Upper at 6–8 reps yet."),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "For reference: Push · 3–5 reps · Nov 7 · 255 × 5, 5, 4",
        ),
      ).toBeTruthy();
      expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
        "",
      );
      expect(screen.queryByText("last time")).toBeNull();
    });
  },
);

describe("saving a set", () => {
  it("shows Saving…, then the server's set as logged, and offers it to set 2", async () => {
    let resolve!: (s: LoggedSetDto) => void;
    let current = view();
    const put = jest.fn(
      (_body: unknown) =>
        new Promise<LoggedSetDto>((r) => {
          resolve = (set) => {
            current = withSaved(set);
            r(set);
          };
        }),
    );
    serve({
      "/workouts/ls-1": () => current,
      [SET_1]: (o: { body?: unknown }) => put(o.body),
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(logButton(1));
    expect(await screen.findAllByText("Saving…")).toBeTruthy();
    expect(put).toHaveBeenCalledWith({ weightLbs: 255, reps: 5 });
    // Not logged before the server answers.
    expect(
      screen.queryByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    ).toBeNull();
    await act(async () => resolve(storedSet()));
    expect(
      await screen.findByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Set 2 weight in pounds").props.value).toBe(
      "255",
    );
    expect(screen.getByText("same as set 1")).toBeTruthy();
  });

  it("a failed save keeps the numbers, says why, and marks nothing logged", async () => {
    serve({
      "/workouts/ls-1": view(),
      [SET_1]: new ApiError("network", "offline"),
    });
    await open();
    await fireEvent.changeText(
      screen.getByLabelText("Set 1 weight in pounds"),
      "260",
    );
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "4");
    await fireEvent.press(logButton(1));
    expect(
      await screen.findByText(
        "Couldn't save — Overload needs a connection. Your numbers are still here.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
      "260",
    );
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("4");
    expect(screen.queryByText(/logged$/)).toBeNull();
    // Log set again re-sends the same set.
    const stored = storedSet({ weightLbs: 260, reps: 4 });
    let current = view();
    serve({
      "/workouts/ls-1": () => current,
      [SET_1]: () => {
        current = withSaved(stored);
        return stored;
      },
    });
    await fireEvent.press(logButton(1));
    expect(
      await screen.findByLabelText("Set 1, 260 pounds, 4 reps, logged"),
    ).toBeTruthy();
  });

  it("a set already logged elsewhere says so and refreshes", async () => {
    const reads = jest.fn(() => view());
    serve({
      "/workouts/ls-1": reads,
      [SET_1]: new ApiError("conflict", "Set 1 is already logged.", 409),
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(logButton(1));
    expect(await screen.findByText("Set 1 was already logged.")).toBeTruthy();
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(1));
  });

  it("an invalid weight is refused before any request, with the shared message", async () => {
    serve({
      "/workouts/ls-1": view(
        workout({ sessionName: "Upper", exercises: [referenceOnlyCard()] }),
      ),
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "8");
    await fireEvent.press(logButton(1));
    expect(await screen.findByText("Enter a weight above 0.")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Set 1 weight in pounds"),
      "185.125",
    );
    await fireEvent.press(logButton(1));
    expect(
      await screen.findByText("Use at most two decimal places."),
    ).toBeTruthy();
    expect(
      mockApi.request.mock.calls.filter(([p]) => p === SET_1),
    ).toHaveLength(0);
  });

  it("bodyweight logs reps only", async () => {
    const put = jest.fn((_body: unknown) =>
      storedSet({ weightLbs: null, reps: 12 }),
    );
    serve({
      "/workouts/ls-1": view(
        workout({
          exercises: [
            card({
              performedExerciseName: "Pull-Up",
              requiresExternalWeight: false,
              suggestedWeightLbs: null,
            }),
          ],
        }),
      ),
      [SET_1]: (o: { body?: unknown }) => put(o.body),
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    await screen.findByText("Pull-Up");
    expect(screen.queryByLabelText("Set 1 weight in pounds")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "12");
    await fireEvent.press(logButton(1));
    await waitFor(() => expect(put).toHaveBeenCalledWith({ reps: 12 }));
  });
});

describe("honest edges (RD-21)", () => {
  it("not done and unavailable exercises have no inputs", async () => {
    serve({
      "/workouts/ls-1": view(
        workout({
          exercises: [
            card({ loggedExerciseId: "a", skipped: true }),
            card({ loggedExerciseId: "b", performedArchived: true }),
          ],
        }),
      ),
    });
    await open();
    // Everything is passed over, so it opens on the last card.
    expect(
      screen.getByText("Unavailable — this exercise was archived."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Not done today.")).toBeTruthy();
    expect(screen.queryByLabelText("Set 1 reps")).toBeNull();
  });
});

describe("finishing (F1, RD-13)", () => {
  const partlyLogged = () =>
    workout({
      exercises: [
        card({
          sets: [
            {
              setNumber: 1,
              loggedSetId: "s1",
              weightLbs: 255,
              reps: 5,
              rir: null,
              saved: true,
              extra: false,
            },
            ...rows(3).slice(1),
          ],
        }),
      ],
    });

  it("lists the unfinished work, finishes once, and opens the summary", async () => {
    const complete = jest.fn(() => ({
      loggedSessionId: "ls-1",
      status: "complete",
    }));
    serve({
      "/workouts/ls-1": view(partlyLogged()),
      "/workouts/ls-1/complete": complete,
    });
    const alert = jest.spyOn(Alert, "alert");
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Finish workout" }),
    );
    expect(alert).toHaveBeenCalledWith(
      "Finish with unfinished exercises?",
      expect.stringContaining("Barbell Bench Press — 1 of 3 sets"),
      expect.any(Array),
    );
    expect(complete).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    await act(async () =>
      buttons.find((b) => b.text === "Finish workout")?.onPress?.(),
    );
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith("/workout/ls-1/summary"),
    );
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("a failed finish keeps the workout open and says the sets are saved", async () => {
    serve({
      "/workouts/ls-1": view(
        workout({
          exercises: [
            card({
              sets: rows(3).map((r, i) => ({
                ...r,
                loggedSetId: `s${i}`,
                weightLbs: 255,
                reps: 5,
                saved: true,
              })),
            }),
          ],
        }),
      ),
      "/workouts/ls-1/complete": new ApiError("network", "offline"),
    });
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Finish workout" }),
    );
    expect(
      await screen.findByText(
        "Couldn't finish — Overload needs a connection. Your sets are saved.",
      ),
    ).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("finish is unavailable before any set is saved", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    expect(
      screen.getByRole("button", { name: "Finish workout" }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });
});

describe("the summary (S1, RD-14)", () => {
  it("shows the name, counts, and each exercise, with no call", async () => {
    serve({
      "/history/ls-1": {
        detail: {
          loggedSessionId: "ls-1",
          sessionName: "Push",
          dateIso: "2026-11-14",
          dateLabel: "Sat, Nov 14",
          gymName: "Downtown Gym",
          exercises: [
            {
              loggedExerciseId: "a",
              exerciseId: "e",
              historyHref: "",
              performedName: "Barbell Bench Press",
              plannedName: "Barbell Bench Press",
              swapped: false,
              archived: false,
              skipped: false,
              requiresExternalWeight: true,
              plannedSets: 3,
              sets: [5, 5, 4].map((reps, i) => ({
                loggedSetId: `s${i}`,
                setNumber: i + 1,
                weightLbs: 255,
                reps,
                rir: null,
                extra: false,
              })),
            },
            {
              loggedExerciseId: "b",
              exerciseId: "f",
              historyHref: "",
              performedName: "Lateral Raise",
              plannedName: "Lateral Raise",
              swapped: false,
              archived: false,
              skipped: true,
              requiresExternalWeight: true,
              plannedSets: 3,
              sets: [],
            },
          ],
        },
        summary: null,
        goals: [],
      },
    });
    await render(
      <Providers>
        <SummaryScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    expect(await screen.findByText("Push complete")).toBeTruthy();
    expect(
      screen.getByText("Saturday, November 14 · Downtown Gym"),
    ).toBeTruthy();
    expect(screen.getByText("1 exercise · 3 sets")).toBeTruthy();
    expect(
      screen.getByLabelText("Barbell Bench Press, 255 × 5, 5, 4"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Lateral Raise, Not done")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith("/today");
  });
});
