/**
 * Pitch 21f (OVE-217): reps in reserve, extra sets, correcting a saved set,
 * and counting a short exercise as planned. The rules are the server's and the
 * shared package's; these tests pin what the phone shows and exactly what it
 * sends: an untouched RIR is never sent (so never stored as 0), a bodyweight
 * lift never sends a weight, a correction sends `rir` only when it changed,
 * and nothing shows as saved before the server's answer.
 */
import { ActionSheetIOS, Alert } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ExerciseCardDto } from "@overload/shared/contracts/logging";
import type {
  LoggedSetDto,
  LoggedWorkoutDetailViewDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { mergeCorrectedSet } from "../src/api/training";
import { LoggedWorkoutScreen } from "../src/history/LoggedWorkoutScreen";
import {
  cardActiveSet,
  nextExtraSetNumber,
  savedWorkingSets,
} from "../src/workout/card-model";
import {
  editSetBody,
  editSetChanged,
  findEditableSet,
} from "../src/workout/edit-set-model";
import { EditSetScreen } from "../src/workout/EditSetScreen";
import { fewerSetsConfirmation } from "../src/workout/exercise-actions";
import { SwapScreen } from "../src/workout/SwapScreen";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { Providers } from "./harness";
import { card, rows, view, workout } from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => {
  const { createElement, Fragment } =
    jest.requireActual<typeof import("react")>("react");
  return {
    // A modal's Cancel and Save live in its native header: render them.
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

/** Requests that changed something (anything but a GET). */
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, opts]) => opts?.method && opts.method !== "GET")
    .map(([path, opts]) => [opts.method, path, opts.body]);

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

const oneCard = (over: Partial<ExerciseCardDto> = {}) =>
  view(workout({ exercises: [card(over)] }));

async function openWorkout() {
  await render(
    <Providers>
      <WorkoutScreen loggedSessionId="ls-1" />
    </Providers>,
  );
  await screen.findByRole("header");
}

const chip = (set: number, name: string) =>
  screen.getByRole("button", { name: `Set ${set} RIR ${name}` });
const isSelected = (set: number, name: string) =>
  chip(set, name).props.accessibilityState.selected as boolean;
const logButton = (n: number) =>
  screen.getAllByRole("button", { name: `Log set ${n}` })[0]!;

/** The next action sheet picks this row; the next alert presses this button. */
function sheetPicks(label: string) {
  return jest
    .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    .mockImplementation((options, callback) => {
      const index = options.options.indexOf(label);
      callback(index >= 0 ? index : (options.cancelButtonIndex ?? 0));
    });
}
function alertPresses(text: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === text)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("the card model's set-count helpers", () => {
  it("the pending extra row is active only once every planned set is saved", () => {
    const partly = card({ sets: [saved(1), ...rows(3).slice(1)] });
    expect(cardActiveSet(partly, 4)).toBe(2);
    const done = card({ sets: [saved(1), saved(2), saved(3)] });
    expect(cardActiveSet(done)).toBeNull();
    expect(cardActiveSet(done, 4)).toBe(4);
  });

  it("an extra set takes the next number, only after the planned sets", () => {
    expect(nextExtraSetNumber(card())).toBeNull();
    expect(
      nextExtraSetNumber(card({ sets: [saved(1), ...rows(3).slice(1)] })),
    ).toBeNull();
    const done = [saved(1), saved(2), saved(3)];
    expect(nextExtraSetNumber(card({ sets: done }))).toBe(4);
    expect(
      nextExtraSetNumber(card({ sets: [...done, saved(4, { extra: true })] })),
    ).toBe(5);
  });

  it("working sets never count extras or unsaved rows", () => {
    expect(
      savedWorkingSets(
        card({
          sets: [saved(1), saved(2), rows(3)[2]!, saved(4, { extra: true })],
        }),
      ),
    ).toBe(2);
  });
});

describe("the fewer-sets confirmation", () => {
  const ask = (plannedSets: number, savedWorkingSets: number) =>
    fewerSetsConfirmation({
      name: "Barbell Bench Press",
      plannedSets,
      savedWorkingSets,
    });

  it("offers exactly the count already logged, and says it can't be raised", () => {
    expect(ask(3, 2)).toEqual({
      title: "Count 2 sets as the plan for this workout?",
      message:
        "Barbell Bench Press was planned for 3 sets. This changes this workout only — your plan stays the same, and no logged set is removed. You can't raise it again.",
      confirm: "Count 2 sets",
      plannedSets: 2,
    });
    expect(ask(3, 1)?.confirm).toBe("Count 1 set");
  });

  it("doesn't apply with nothing logged, or nothing short", () => {
    expect(ask(3, 0)).toBeNull();
    expect(ask(3, 3)).toBeNull();
    expect(ask(3, 4)).toBeNull();
  });
});

describe("the edit-set model", () => {
  const original = {
    requiresExternalWeight: true,
    weightLbs: 255,
    reps: 5,
    rir: 2 as number | null,
  };

  it("finds a saved set in the workout, and never an unsaved row", () => {
    const w = workout({
      exercises: [card({ sets: [saved(1, { rir: 2 }), ...rows(3).slice(1)] })],
    });
    expect(findEditableSet(w, "set-1")).toEqual({
      loggedSetId: "set-1",
      setNumber: 1,
      exerciseName: "Barbell Bench Press",
      requiresExternalWeight: true,
      weightLbs: 255,
      reps: 5,
      rir: 2,
      dateIso: null,
    });
    expect(findEditableSet(w, "set-2")).toBeNull();
  });

  it("sends rir only when it changed, and null when it was cleared", () => {
    expect(editSetBody(original, { weightLbs: 260, reps: 5, rir: 2 })).toEqual({
      weightLbs: 260,
      reps: 5,
    });
    expect(editSetBody(original, { weightLbs: 255, reps: 5, rir: 3 })).toEqual({
      weightLbs: 255,
      reps: 5,
      rir: 3,
    });
    expect(
      editSetBody(original, { weightLbs: 255, reps: 5, rir: null }),
    ).toEqual({ weightLbs: 255, reps: 5, rir: null });
    // 0 is a real value, different from "not recorded".
    expect(
      editSetBody(
        { ...original, rir: null },
        { weightLbs: 255, reps: 5, rir: 0 },
      ),
    ).toEqual({ weightLbs: 255, reps: 5, rir: 0 });
  });

  it("a bodyweight set never sends a weight", () => {
    const body = editSetBody(
      { requiresExternalWeight: false, rir: null },
      { weightLbs: null, reps: 9, rir: null },
    );
    expect(body).toEqual({ reps: 9 });
    expect("weightLbs" in body).toBe(false);
  });

  it("knows when nothing changed", () => {
    expect(editSetChanged(original, { weightLbs: 255, reps: 5, rir: 2 })).toBe(
      false,
    );
    expect(editSetChanged(original, { weightLbs: 255, reps: 6, rir: 2 })).toBe(
      true,
    );
    expect(
      editSetChanged(original, { weightLbs: 255, reps: 5, rir: null }),
    ).toBe(true);
    // A bodyweight lift has no weight to change.
    expect(
      editSetChanged(
        { requiresExternalWeight: false, weightLbs: null, reps: 9, rir: null },
        { weightLbs: Number.NaN, reps: 9, rir: null },
      ),
    ).toBe(false);
  });
});

describe("reps in reserve on the card", () => {
  it("offers 0 to 4+, with nothing selected", async () => {
    serve({ "/workouts/ls-1": view() });
    await openWorkout();
    for (const name of ["0", "1", "2", "3", "4 or more"]) {
      expect(isSelected(1, name)).toBe(false);
    }
    expect(chip(1, "4 or more").props.accessibilityHint).toBe(
      "Reps in reserve, optional.",
    );
    expect(screen.getByText("4+")).toBeTruthy();
  });

  it("untouched, a set is sent with no rir at all", async () => {
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": storedSet(),
    });
    await openWorkout();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(logButton(1));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const [, , body] = writes()[0]!;
    expect(body).toEqual({ weightLbs: 255, reps: 5 });
    expect("rir" in (body as object)).toBe(false);
  });

  it("a chosen value is sent with the set, and tapping it again clears it", async () => {
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": storedSet({ rir: 2 }),
    });
    await openWorkout();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(chip(1, "3"));
    expect(isSelected(1, "3")).toBe(true);
    // Tapping the selected chip clears it; another tap picks a new one.
    await fireEvent.press(chip(1, "3"));
    expect(isSelected(1, "3")).toBe(false);
    await fireEvent.press(chip(1, "2"));
    expect([isSelected(1, "2"), isSelected(1, "3")]).toEqual([true, false]);
    expect(chip(1, "2").props.accessibilityHint).toBe(
      "Reps in reserve. Tap to clear.",
    );
    // The numbers typed before are still there.
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("5");
    await fireEvent.press(logButton(1));
    await waitFor(() =>
      expect(writes()).toEqual([
        [
          "PUT",
          "/logged-exercises/le-bench/sets/1",
          { weightLbs: 255, reps: 5, rir: 2 },
        ],
      ]),
    );
  });

  it("0 is sent as 0", async () => {
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": storedSet({ rir: 0 }),
    });
    await openWorkout();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(chip(1, "0"));
    await fireEvent.press(logButton(1));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![2]).toEqual({ weightLbs: 255, reps: 5, rir: 0 });
  });

  it("the saved row shows its RIR, and the next set starts with none chosen", async () => {
    let current = view();
    serve({
      "/workouts/ls-1": () => current,
      "/logged-exercises/le-bench/sets/1": () => {
        current = oneCard({
          sets: [saved(1, { rir: 2 }), ...rows(3).slice(1)],
        });
        return storedSet({ rir: 2 });
      },
    });
    await openWorkout();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(chip(1, "2"));
    await fireEvent.press(logButton(1));
    const row = await screen.findByLabelText(
      "Set 1, 255 pounds, 5 reps, 2 reps in reserve, logged",
    );
    expect(row.props.accessibilityHint).toBe("Opens this set to correct it");
    expect(screen.getByText("255 lbs × 5 · 2 RIR")).toBeTruthy();
    // Never carried from the set before.
    for (const name of ["0", "1", "2", "3", "4 or more"]) {
      expect(isSelected(2, name)).toBe(false);
    }
  });

  it("a failed save keeps the RIR choice with the numbers", async () => {
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": new ApiError("network", "offline"),
    });
    await openWorkout();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(chip(1, "1"));
    await fireEvent.press(logButton(1));
    expect(
      await screen.findByText(
        "Couldn't save — Overload needs a connection. Your numbers are still here.",
      ),
    ).toBeTruthy();
    expect(isSelected(1, "1")).toBe(true);
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("5");
    expect(screen.queryByText(/logged$/)).toBeNull();
  });

  it("a server refusal of the RIR shows on the card, not on the reps field", async () => {
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": new ApiError(
        "validation_error",
        "Check the highlighted fields.",
        400,
        { rir: "Choose an RIR from 0 to 4+." },
      ),
    });
    await openWorkout();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(logButton(1));
    expect(await screen.findByText("Choose an RIR from 0 to 4+.")).toBeTruthy();
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("5");
  });
});

describe("bodyweight and fixed-target lifts", () => {
  const pullups = () =>
    oneCard({
      loggedExerciseId: "le-pull",
      performedExerciseName: "Pullups",
      plannedExerciseName: "Pullups",
      requiresExternalWeight: false,
      suggestedWeightLbs: null,
      plannedRepRange: { min: 8, max: 10 },
      previousPerformance: null,
      weightContext: "none",
    });

  it("a bodyweight lift has no weight box and sends reps (and RIR) only", async () => {
    serve({
      "/workouts/ls-1": pullups(),
      "/logged-exercises/le-pull/sets/1": storedSet({
        loggedExerciseId: "le-pull",
        weightLbs: null,
        reps: 9,
        rir: 1,
      }),
    });
    await openWorkout();
    expect(screen.getByText("3 × 8–10 · bodyweight, reps only")).toBeTruthy();
    expect(screen.queryByLabelText("Set 1 weight in pounds")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "9");
    await fireEvent.press(chip(1, "1"));
    await fireEvent.press(logButton(1));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const body = writes()[0]![2] as object;
    expect(body).toEqual({ reps: 9, rir: 1 });
    expect("weightLbs" in body).toBe(false);
  });

  it("a single target prints as one number, never a range", async () => {
    serve({
      "/workouts/ls-1": oneCard({ plannedRepRange: { min: 10, max: 10 } }),
    });
    await openWorkout();
    expect(screen.getByText("3 × 10")).toBeTruthy();
    expect(screen.queryByText(/10–10/)).toBeNull();
  });

  it("a bodyweight fixed target reads 3 × 15 · bodyweight, reps only", async () => {
    const abs = pullups();
    abs.workout.exercises[0]!.plannedRepRange = { min: 15, max: 15 };
    serve({ "/workouts/ls-1": abs });
    await openWorkout();
    expect(screen.getByText("3 × 15 · bodyweight, reps only")).toBeTruthy();
  });
});

describe("extra sets", () => {
  const allSaved = () =>
    oneCard({ sets: [saved(1), saved(2), saved(3, { weightLbs: 260 })] });

  it("Add set is offered only once every planned set is saved", async () => {
    serve({
      "/workouts/ls-1": oneCard({ sets: [saved(1), ...rows(3).slice(1)] }),
    });
    await openWorkout();
    expect(screen.queryByRole("button", { name: "Add set" })).toBeNull();
  });

  it("adds one extra row, offers the last weight, and sends that set number", async () => {
    let current = allSaved();
    serve({
      "/workouts/ls-1": () => current,
      "/logged-exercises/le-bench/sets/4": ({ body }: { body?: unknown }) => {
        current = oneCard({
          sets: [
            saved(1),
            saved(2),
            saved(3, { weightLbs: 260 }),
            saved(4, { weightLbs: 260, reps: 4, extra: true }),
          ],
        });
        return storedSet({ id: "set-4", setNumber: 4, ...(body as object) });
      },
    });
    await openWorkout();
    expect(screen.getByText("All 3 sets logged.")).toBeTruthy();
    expect(screen.queryByLabelText("Set 4 reps")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add set" }));
    // The offer is the set just logged, never a new number.
    expect(screen.getByLabelText("Set 4 weight in pounds").props.value).toBe(
      "260",
    );
    expect(screen.getByText("same as set 3")).toBeTruthy();
    expect(screen.getByText("extra")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add set" })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Set 4 reps"), "4");
    await fireEvent.press(logButton(4));
    await waitFor(() =>
      expect(writes()).toEqual([
        [
          "PUT",
          "/logged-exercises/le-bench/sets/4",
          { weightLbs: 260, reps: 4 },
        ],
      ]),
    );
    expect(
      await screen.findByLabelText("Set 4, extra, 260 pounds, 4 reps, logged"),
    ).toBeTruthy();
    expect(screen.getByText("260 lbs × 4 · extra")).toBeTruthy();
    // The plan's count keeps its meaning, and another extra can follow.
    expect(screen.getByText("All 3 sets logged.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add set" })).toBeTruthy();
  });

  it("the server's limit shows as the card's notice and keeps the numbers", async () => {
    serve({
      "/workouts/ls-1": allSaved(),
      "/logged-exercises/le-bench/sets/4": new ApiError(
        "validation_error",
        "That set isn't part of this exercise.",
        400,
        { setNumber: "Out of range." },
      ),
    });
    await openWorkout();
    await fireEvent.press(screen.getByRole("button", { name: "Add set" }));
    await fireEvent.changeText(screen.getByLabelText("Set 4 reps"), "4");
    await fireEvent.press(logButton(4));
    expect(
      await screen.findByText("That set isn't part of this exercise."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Set 4 reps").props.value).toBe("4");
  });
});

describe("opening a saved set", () => {
  it("a saved row opens Edit set for that set, from the workout", async () => {
    serve({
      "/workouts/ls-1": oneCard({ sets: [saved(1), ...rows(3).slice(1)] }),
    });
    await openWorkout();
    await fireEvent.press(
      screen.getByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/workout/ls-1/edit-set?loggedSetId=set-1&from=workout",
    );
    expect(writes()).toEqual([]);
  });
});

describe("E1 Edit set", () => {
  const stored = () =>
    oneCard({ sets: [saved(1, { rir: 2 }), ...rows(3).slice(1)] });

  async function openEdit(
    from: "workout" | "history" = "workout",
    loggedSetId = "set-1",
  ) {
    await render(
      <Providers>
        <EditSetScreen
          loggedSessionId="ls-1"
          loggedSetId={loggedSetId}
          from={from}
        />
      </Providers>,
    );
  }
  const save = () => screen.getByRole("button", { name: "Save" });

  it("opens on the stored values, and Save waits for a change", async () => {
    serve({ "/workouts/ls-1": stored() });
    await openEdit();
    expect((await screen.findByLabelText("Weight (lbs)")).props.value).toBe(
      "255",
    );
    expect(screen.getByLabelText("Reps").props.value).toBe("5");
    expect(isSelected(1, "2")).toBe(true);
    expect(screen.getByText("Tap the selected value to clear.")).toBeTruthy();
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByText(
        "This corrects the record. It doesn't move the set to another exercise, gym, or day.",
      ),
    ).toBeTruthy();
  });

  it("corrects the numbers without touching the stored RIR, and closes on the answer", async () => {
    serve({
      "/workouts/ls-1": stored(),
      "/sets/set-1": ({ body }: { body?: unknown }) =>
        storedSet({ rir: 2, ...(body as object) }),
    });
    await openEdit();
    await fireEvent.changeText(
      await screen.findByLabelText("Weight (lbs)"),
      "257,5",
    );
    await fireEvent.changeText(screen.getByLabelText("Reps"), "6");
    await fireEvent.press(save());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      ["PATCH", "/sets/set-1", { weightLbs: 257.5, reps: 6 }],
    ]);
  });

  it("changing only the RIR sends it; clearing it sends null", async () => {
    const patch = jest.fn(({ body }: { body?: unknown }) =>
      storedSet({ ...(body as object) }),
    );
    serve({ "/workouts/ls-1": stored(), "/sets/set-1": patch });
    await openEdit();
    await screen.findByLabelText("Reps");
    await fireEvent.press(chip(1, "2"));
    expect(screen.getByText("Not recorded.")).toBeTruthy();
    await fireEvent.press(save());
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(writes()[0]).toEqual([
      "PATCH",
      "/sets/set-1",
      { weightLbs: 255, reps: 5, rir: null },
    ]);
  });

  it("a bodyweight set is reps only", async () => {
    serve({
      "/workouts/ls-1": oneCard({
        requiresExternalWeight: false,
        sets: [saved(1, { weightLbs: null, reps: 9 }), ...rows(3).slice(1)],
      }),
      "/sets/set-1": storedSet({ weightLbs: null, reps: 10 }),
    });
    await openEdit();
    expect(await screen.findByText("Bodyweight — reps only.")).toBeTruthy();
    expect(screen.queryByLabelText("Weight (lbs)")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Reps"), "10");
    await fireEvent.press(save());
    await waitFor(() => expect(writes()).toHaveLength(1));
    const body = writes()[0]![2] as object;
    expect(body).toEqual({ reps: 10 });
    expect("weightLbs" in body).toBe(false);
  });

  it("an invalid number shows under its field and sends nothing", async () => {
    serve({ "/workouts/ls-1": stored() });
    await openEdit();
    await fireEvent.changeText(
      await screen.findByLabelText("Weight (lbs)"),
      "255.125",
    );
    await fireEvent.press(save());
    expect(
      await screen.findByText("Use at most two decimal places."),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Weight (lbs)"), "255");
    await fireEvent.changeText(screen.getByLabelText("Reps"), "0");
    await fireEvent.press(save());
    expect(await screen.findByText("Enter reps above 0.")).toBeTruthy();
    expect(writes()).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("a failed save keeps the correction and the sheet; the retry sends the same once", async () => {
    let online = false;
    serve({
      "/workouts/ls-1": stored(),
      "/sets/set-1": ({ body }: { body?: unknown }) => {
        if (!online) throw new ApiError("network", "offline");
        return storedSet({ rir: 2, ...(body as object) });
      },
    });
    await openEdit();
    await fireEvent.changeText(await screen.findByLabelText("Reps"), "7");
    await fireEvent.press(save());
    expect(
      await screen.findByText(
        "Couldn't save — Overload needs a connection. Your correction is still here.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Reps").props.value).toBe("7");
    expect(mockRouter.back).not.toHaveBeenCalled();
    online = true;
    await fireEvent.press(save());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      ["PATCH", "/sets/set-1", { weightLbs: 255, reps: 7 }],
      ["PATCH", "/sets/set-1", { weightLbs: 255, reps: 7 }],
    ]);
  });

  it("the server's field error lands on that field", async () => {
    serve({
      "/workouts/ls-1": stored(),
      "/sets/set-1": new ApiError(
        "validation_error",
        "Check the highlighted fields.",
        400,
        { reps: "Enter reps above 0." },
      ),
    });
    await openEdit();
    await fireEvent.changeText(await screen.findByLabelText("Reps"), "7");
    await fireEvent.press(save());
    expect(await screen.findByText("Enter reps above 0.")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("Cancel closes and sends nothing", async () => {
    serve({ "/workouts/ls-1": stored() });
    await openEdit();
    await fireEvent.changeText(await screen.findByLabelText("Reps"), "9");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([]);
  });

  it("a set the read doesn't hold says so, with a way out", async () => {
    serve({ "/workouts/ls-1": stored() });
    await openEdit("workout", "set-gone");
    expect(await screen.findByText("This set isn't available.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("a failed load is an error with a retry, never an empty form", async () => {
    serve({ "/workouts/ls-1": new ApiError("network", "offline") });
    await openEdit();
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Reps")).toBeNull();
  });
});

const record = (
  over: Partial<LoggedWorkoutDetailViewDto["detail"]["exercises"][number]> = {},
): LoggedWorkoutDetailViewDto => ({
  detail: {
    loggedSessionId: "ls-1",
    sessionName: "Upper A",
    dateIso: "2026-11-10",
    dateLabel: "Tue, Nov 10",
    gymName: "Northside Strength",
    exercises: [
      {
        loggedExerciseId: "le-bench",
        exerciseId: "ex-bench",
        historyHref: "",
        performedName: "Barbell Bench Press",
        plannedName: "Barbell Bench Press",
        swapped: false,
        archived: false,
        skipped: false,
        requiresExternalWeight: true,
        plannedSets: 3,
        sets: [
          {
            loggedSetId: "set-1",
            setNumber: 1,
            weightLbs: 175,
            reps: 8,
            rir: 2,
            extra: false,
          },
          {
            loggedSetId: "set-2",
            setNumber: 2,
            weightLbs: 175,
            reps: 8,
            rir: null,
            extra: false,
          },
        ],
        ...over,
      },
    ],
  },
  summary: null,
  goals: [],
});

describe("correcting from the logged workout (H2)", () => {
  async function openRecord() {
    await render(
      <Providers>
        <LoggedWorkoutScreen loggedSessionId="ls-1" inProgress={false} />
      </Providers>,
    );
    await screen.findByText("Tuesday, November 10 · Northside Strength");
  }

  it("a set row opens Edit set from history, in a finished workout too", async () => {
    serve({ "/history/ls-1": record() });
    await openRecord();
    const row = screen.getByRole("button", {
      name: "Set 1, 175 lbs × 8 · 2 RIR",
    });
    expect(row.props.accessibilityHint).toBe("Opens this set to correct it");
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/workout/ls-1/edit-set?loggedSetId=set-1&from=history",
    );
  });

  it("Edit set from history opens on the record's values, with its date", async () => {
    serve({
      "/history/ls-1": record(),
      "/sets/set-1": ({ body }: { body?: unknown }) =>
        storedSet({ weightLbs: 175, reps: 8, rir: 2, ...(body as object) }),
    });
    await render(
      <Providers>
        <EditSetScreen
          loggedSessionId="ls-1"
          loggedSetId="set-1"
          from="history"
        />
      </Providers>,
    );
    expect((await screen.findByLabelText("Weight (lbs)")).props.value).toBe(
      "175",
    );
    expect(screen.getByText("Tuesday, November 10")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Weight (lbs)"), "177.5");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      ["PATCH", "/sets/set-1", { weightLbs: 177.5, reps: 8 }],
    ]);
    // The workout read was never needed.
    expect(
      mockApi.request.mock.calls.some(([p]) =>
        String(p).startsWith("/workouts"),
      ),
    ).toBe(false);
  });

  it("the record shows the server's corrected values, and only that set changes", () => {
    const merged = mergeCorrectedSet(
      record(),
      storedSet({ weightLbs: 180, reps: 7, rir: 1 }),
    );
    expect(
      merged?.detail.exercises[0]!.sets.map((s) => [
        s.loggedSetId,
        s.weightLbs,
        s.reps,
        s.rir,
        s.setNumber,
      ]),
    ).toEqual([
      ["set-1", 180, 7, 1, 1],
      ["set-2", 175, 8, null, 2],
    ]);
  });

  it("a short exercise can be counted as planned, after asking once", async () => {
    const alert = alertPresses("Count 2 sets");
    let current = record();
    serve({
      "/history/ls-1": () => current,
      "/logged-exercises/le-bench/planned-sets": ({
        body,
      }: {
        body?: unknown;
      }) => {
        current = record({ plannedSets: 2 });
        return { loggedExerciseId: "le-bench", ...(body as object) };
      },
    });
    await openRecord();
    expect(
      screen.getByText(
        "2 of 3 planned sets — counts toward your strength trend, not your progress check.",
      ),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "I meant to do fewer sets of Barbell Bench Press",
      }),
    );
    expect(alert.mock.calls[0]![0]).toBe(
      "Count 2 sets as the plan for this workout?",
    );
    await waitFor(() =>
      expect(writes()).toEqual([
        [
          "PATCH",
          "/logged-exercises/le-bench/planned-sets",
          { plannedSets: 2 },
        ],
      ]),
    );
    // On the server's answer the note is gone; both sets are still there.
    await waitFor(() =>
      expect(screen.queryByText(/of 3 planned sets/)).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /^Set 1, / })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Set 2, / })).toBeTruthy();
  });

  it("Cancel in the alert sends nothing", async () => {
    alertPresses("Cancel");
    serve({ "/history/ls-1": record() });
    await openRecord();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "I meant to do fewer sets of Barbell Bench Press",
      }),
    );
    expect(writes()).toEqual([]);
  });

  it("an exercise that met its plan, or wasn't done, offers nothing", async () => {
    serve({ "/history/ls-1": record({ plannedSets: 2 }) });
    await openRecord();
    expect(screen.queryByText(/planned sets —/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^I meant to do fewer/ }),
    ).toBeNull();
  });

  it("a refusal says why and leaves the record as it was", async () => {
    alertPresses("Count 2 sets");
    serve({
      "/history/ls-1": record(),
      "/logged-exercises/le-bench/planned-sets": new ApiError(
        "network",
        "offline",
      ),
    });
    await openRecord();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "I meant to do fewer sets of Barbell Bench Press",
      }),
    );
    expect(
      await screen.findByText(
        "Couldn't change the planned sets — Overload needs a connection.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/2 of 3 planned sets/)).toBeTruthy();
  });
});

describe("fewer sets from the card", () => {
  const short = () => oneCard({ sets: [saved(1), saved(2), rows(3)[2]!] });

  it("More offers it once sets are logged short of the plan, and asks first", async () => {
    const sheet = sheetPicks("I meant to do fewer sets");
    const alert = alertPresses("Count 2 sets");
    let current = short();
    serve({
      "/workouts/ls-1": () => current,
      "/logged-exercises/le-bench/planned-sets": ({
        body,
      }: {
        body?: unknown;
      }) => {
        current = oneCard({ plannedSets: 2, sets: [saved(1), saved(2)] });
        return { loggedExerciseId: "le-bench", ...(body as object) };
      },
    });
    await openWorkout();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      options: ["About this exercise", "I meant to do fewer sets", "Cancel"],
    });
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0]![1]).toContain("no logged set is removed");
    await waitFor(() =>
      expect(writes()).toEqual([
        [
          "PATCH",
          "/logged-exercises/le-bench/planned-sets",
          { plannedSets: 2 },
        ],
      ]),
    );
    // The server's answer: the plan for today is met, and both sets remain.
    expect(await screen.findByText("All 2 sets logged.")).toBeTruthy();
    expect(screen.getAllByLabelText(/pounds, 5 reps, logged$/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add set" })).toBeTruthy();
  });

  it("Cancel in the alert sends nothing and the set stays loggable", async () => {
    sheetPicks("I meant to do fewer sets");
    alertPresses("Cancel");
    serve({ "/workouts/ls-1": short() });
    await openWorkout();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(writes()).toEqual([]);
    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
  });
});

describe("Cancel on the swap modal", () => {
  it("closes and sends nothing", async () => {
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
    });
    await render(
      <Providers>
        <SwapScreen loggedSessionId="ls-1" loggedExerciseId="le-bench" />
      </Providers>,
    );
    await screen.findByRole("button", { name: "Dumbbell Fly" });
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([]);
  });
});
