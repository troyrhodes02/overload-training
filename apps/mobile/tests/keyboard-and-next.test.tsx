/**
 * OVE-213 (Checkpoint B on the iPhone): the keypad bar was missing from most
 * set inputs, so Log set could sit under the keyboard, and the Next button
 * wrapped long exercise names.
 *
 * React Native's InputAccessoryView attaches its bar to the FIRST text input in
 * the window with its nativeID, once, when the bar mounts. These tests pin
 * the shape that makes that work: every input names its own bar, no two
 * inputs share an id, and each bar comes after its input in the same row.
 * Whether the keyboard really clears the row is a device check (runbook §3).
 */
import {
  ActionSheetIOS,
  Keyboard,
  StyleSheet,
  type ScrollViewInstance,
} from "react-native";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { LoggedSetDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { keypadBarId } from "../src/workout/ExerciseCard";
import {
  revealShift,
  useKeepAboveKeyboard,
} from "../src/workout/keep-above-keyboard";
import { Providers } from "./harness";
import { card, rows, view, workout } from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
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
      return typeof r === "function" ? (r as Handler)(opts) : r;
    },
  );
}

const LONG =
  "Wide-Grip Lat Pulldown to the Front with a Pause at the Bottom of Every Rep";

async function open(w = workout()) {
  await render(
    <Providers>
      <WorkoutScreen loggedSessionId="ls-1" />
    </Providers>,
  );
  await screen.findByText(w.exercises[0]!.performedExerciseName);
}

type Host = ReturnType<typeof screen.getByText>;

/** The rendered tree's root (always present once a test has rendered). */
const root = (): Host => {
  expect(screen.root).not.toBeNull();
  return screen.root as Host;
};

/** Host elements of one native type, in depth-first (mount) order. */
function hosts(type: string, from: Host = root()): Host[] {
  const found: Host[] = [];
  const walk = (n: Host) => {
    if (n.type === type) found.push(n);
    n.children.forEach((c) => typeof c !== "string" && walk(c as Host));
  };
  walk(from);
  return found;
}

const INPUT = "TextInput";
/** The in-row placeholder React Native leaves where the bar is rendered. */
const BAR = "RCTInputAccessoryView";
/** The bar's content, which iOS shows in the keyboard (tests/setup.ts). */
const KEYBOARD_BAR = "KeyboardAccessoryContent";

function bars() {
  return { inputs: hosts(INPUT), views: hosts(BAR) };
}

const barFor = (id: string): Host => {
  const matches = hosts(KEYBOARD_BAR).filter((v) => v.props.nativeID === id);
  expect(matches).toHaveLength(1);
  return matches[0]!;
};

/** The row the card hands the screen to keep above the keyboard. */
function activeRow(n: number): Host {
  const rows: Host[] = [];
  const walk = (h: Host) => {
    if (
      typeof h.props.onLayout === "function" &&
      within(h).queryByLabelText(`Set ${n} reps`) !== null &&
      within(h).queryByLabelText(`Set ${n + 1}, not logged yet`) === null &&
      within(h).queryByLabelText(new RegExp(`^Set ${n - 1}, .*logged$`)) ===
        null
    ) {
      rows.push(h);
    }
    h.children.forEach((c) => typeof c !== "string" && walk(c as Host));
  };
  walk(root());
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!;
}

/** The shape React Native needs: one bar per input, ids never shared. */
function expectOneBarPerInput() {
  const { inputs, views } = bars();
  const inputIds = inputs.map((i) => i.props.inputAccessoryViewID as string);
  expect(inputIds.every(Boolean)).toBe(true);
  expect(new Set(inputIds).size).toBe(inputIds.length);
  const viewIds = views.map((v) => v.props.nativeID as string);
  expect([...viewIds].sort()).toEqual([...inputIds].sort());
}

/**
 * On iOS a recycled placeholder comes back unhidden over the inputs; only
 * pointerEvents "none" keeps it from taking their taps. Every placeholder,
 * on every card the lifter reaches, must carry it.
 */
function expectNoPlaceholderTakesTouches() {
  const placeholders = hosts(BAR);
  expect(placeholders.length).toBeGreaterThan(0);
  for (const p of placeholders) {
    expect(StyleSheet.flatten(p.props.style).pointerEvents).toBe("none");
  }
  expectOneBarPerInput();
}

beforeEach(() => jest.clearAllMocks());

describe("keypad bar on every set input", () => {
  it("weight and reps each have their own bar: Next on weight, Log set on reps", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    expectOneBarPerInput();
    const weight = screen.getByLabelText("Set 1 weight in pounds");
    const reps = screen.getByLabelText("Set 1 reps");
    expect(weight.props.inputAccessoryViewID).toBe(
      keypadBarId("le-bench", 1, "weight"),
    );
    expect(reps.props.inputAccessoryViewID).toBe(
      keypadBarId("le-bench", 1, "reps"),
    );
    expect(
      within(barFor(keypadBarId("le-bench", 1, "weight"))).getByRole("button", {
        name: "Next",
      }),
    ).toBeTruthy();
    expect(
      within(barFor(keypadBarId("le-bench", 1, "reps"))).getByRole("button", {
        name: "Log set 1",
      }),
    ).toBeTruthy();
  });

  it("the reps bar saves the set, and set 2's new inputs get bars of their own", async () => {
    const stored: LoggedSetDto = {
      id: "set-1",
      loggedExerciseId: "le-bench",
      setNumber: 1,
      weightLbs: 255,
      reps: 5,
      rir: null,
      createdAt: "2026-11-14T15:00:00.000Z",
      updatedAt: "2026-11-14T15:00:00.000Z",
    };
    let current = view();
    const put = jest.fn(() => {
      current = view(
        workout({
          exercises: [
            card({
              sets: rows(3).map((r) =>
                r.setNumber === 1
                  ? {
                      ...r,
                      loggedSetId: "set-1",
                      weightLbs: 255,
                      reps: 5,
                      saved: true,
                    }
                  : r,
              ),
            }),
          ],
        }),
      );
      return stored;
    });
    serve({
      "/workouts/ls-1": () => current,
      "/logged-exercises/le-bench/sets/1": put,
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(
      within(barFor(keypadBarId("le-bench", 1, "reps"))).getByRole("button", {
        name: "Log set 1",
      }),
    );
    expect(
      await screen.findByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    ).toBeTruthy();
    expect(put).toHaveBeenCalledTimes(1);
    // The old shared bar attached to set 1 only; set 2 now has its own.
    expectOneBarPerInput();
    expect(screen.getByLabelText("Set 2 reps").props.inputAccessoryViewID).toBe(
      keypadBarId("le-bench", 2, "reps"),
    );
    expect(
      within(barFor(keypadBarId("le-bench", 2, "reps"))).getByRole("button", {
        name: "Log set 2",
      }),
    ).toBeTruthy();
  });

  it("each bar follows its own input in the same row (so it finds it on mount)", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    // Depth-first order: input, its bar, the next input, its bar.
    const order: string[] = [];
    const walk = (n: Host) => {
      if (n.type === INPUT) order.push(`input:${n.props.inputAccessoryViewID}`);
      if (n.type === BAR) order.push(`bar:${n.props.nativeID}`);
      n.children.forEach((c) => typeof c !== "string" && walk(c as Host));
    };
    walk(root());
    const w = keypadBarId("le-bench", 1, "weight");
    const r = keypadBarId("le-bench", 1, "reps");
    expect(order).toEqual([`input:${w}`, `bar:${w}`, `input:${r}`, `bar:${r}`]);
  });

  it("bodyweight: the one reps input has its bar with Log set", async () => {
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
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    await screen.findByText("Pull-Up");
    expectOneBarPerInput();
    expect(
      within(barFor(keypadBarId("le-bench", 1, "reps"))).getByRole("button", {
        name: "Log set 1",
      }),
    ).toBeTruthy();
  });

  it("a failed save shows its message in the active row, keeps the numbers, and the bar retries", async () => {
    serve({
      "/workouts/ls-1": view(),
      "/logged-exercises/le-bench/sets/1": () => {
        throw new ApiError("network", "offline");
      },
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "4");
    const logFromBar = () =>
      within(barFor(keypadBarId("le-bench", 1, "reps"))).getByRole("button", {
        name: "Log set 1",
      });
    await fireEvent.press(logFromBar());
    const message = await screen.findByText(
      "Couldn't save — Overload needs a connection. Your numbers are still here.",
    );
    // Inside the row the screen keeps above the keyboard.
    expect(within(activeRow(1)).getByText(message.props.children)).toBe(
      message,
    );
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("4");
    await waitFor(() => expect(logFromBar()).toBeTruthy());
  });
});

describe("Next button", () => {
  const twoExercises = workout({
    exercises: [
      card(),
      card({
        loggedExerciseId: "le-pull",
        performedExerciseName: LONG,
        plannedExerciseName: LONG,
      }),
    ],
  });

  it("keeps a long name on one line, truncated, and VoiceOver reads it whole", async () => {
    serve({ "/workouts/ls-1": view(twoExercises) });
    await open(twoExercises);
    const next = screen.getByRole("button", { name: `Next: ${LONG}` });
    const label = within(next).getByText(`Next: ${LONG}`);
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.ellipsizeMode).toBe("tail");
    expect(label.props.children).toBe(`Next: ${LONG}`);
    // Shrinks inside the button rather than pushing past it.
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
    // The touch target stays at least 44 points.
    expect(
      StyleSheet.flatten(next.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
  });

  it("still moves to the next exercise", async () => {
    serve({ "/workouts/ls-1": view(twoExercises) });
    await open(twoExercises);
    await fireEvent.press(
      screen.getByRole("button", { name: `Next: ${LONG}` }),
    );
    expect(await screen.findByRole("header", { name: LONG })).toBeTruthy();
  });
});

describe("keeping the active row above the keyboard", () => {
  describe("revealShift", () => {
    const base = { visibleTop: 100, margin: 12, keyboardTop: 500 };
    it("is 0 when the row already clears the keyboard", () => {
      expect(revealShift({ ...base, rowTop: 300, rowBottom: 480 })).toBe(0);
      expect(revealShift({ ...base, rowTop: 300, rowBottom: 488 })).toBe(0);
    });
    it("scrolls just enough to put the row's bottom margin above the keyboard", () => {
      expect(revealShift({ ...base, rowTop: 400, rowBottom: 560 })).toBe(72);
    });
    it("never pushes the row's top above the visible top", () => {
      // Taller than the space left (large text, small phone): top stays visible.
      expect(revealShift({ ...base, rowTop: 300, rowBottom: 900 })).toBe(188);
      expect(revealShift({ ...base, rowTop: 105, rowBottom: 900 })).toBe(0);
    });
  });

  describe("useKeepAboveKeyboard", () => {
    type Listener = (e: { endCoordinates: { screenY: number } }) => void;
    let listeners: Record<string, Listener>;
    beforeEach(() => {
      listeners = {};
      jest.spyOn(Keyboard, "addListener").mockImplementation(((
        event: string,
        fn: Listener,
      ) => {
        listeners[event] = fn;
        return { remove: jest.fn() };
      }) as unknown as typeof Keyboard.addListener);
    });
    afterEach(() => jest.restoreAllMocks());

    async function setup(row: { y: number; h: number }) {
      const scrollTo = jest.fn();
      const scroll = {
        current: {
          scrollTo,
          measureInWindow: (cb: (x: number, y: number) => void) => cb(0, 100),
        } as unknown as ScrollViewInstance,
      };
      const hook = await renderHook(() => useKeepAboveKeyboard(scroll, 12));
      hook.result.current.content.current = {
        // Scrolled 30 down: content y 0 is 30 above the visible top (100).
        measureInWindow: (cb: (x: number, y: number) => void) => cb(0, 70),
      } as never;
      hook.result.current.row.current = {
        measureInWindow: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => cb(0, row.y, 300, row.h),
      } as never;
      return { hook, scrollTo };
    }

    it("on keyboard show, scrolls the hidden row up from the measured offset", async () => {
      const { scrollTo } = await setup({ y: 420, h: 140 });
      await act(async () =>
        listeners.keyboardDidShow!({ endCoordinates: { screenY: 500 } }),
      );
      expect(scrollTo).toHaveBeenCalledWith({ y: 30 + 72, animated: true });
    });

    it("does nothing when the row is clear, or when no keyboard is up", async () => {
      const { hook, scrollTo } = await setup({ y: 300, h: 100 });
      await act(async () =>
        listeners.keyboardDidShow!({ endCoordinates: { screenY: 500 } }),
      );
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () =>
        listeners.keyboardWillHide!({ endCoordinates: { screenY: 900 } }),
      );
      hook.result.current.row.current = {
        measureInWindow: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => cb(0, 800, 300, 200),
      } as never;
      await act(async () => hook.result.current.reveal());
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("re-checks when the row moves while the keyboard stays up (a set saved)", async () => {
      const { hook, scrollTo } = await setup({ y: 300, h: 100 });
      await act(async () =>
        listeners.keyboardDidShow!({ endCoordinates: { screenY: 500 } }),
      );
      hook.result.current.row.current = {
        measureInWindow: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => cb(0, 420, 300, 140),
      } as never;
      await act(async () => hook.result.current.reveal());
      expect(scrollTo).toHaveBeenCalledWith({ y: 30 + 72, animated: true });
    });
  });

  it("the card reports its active row: the screen gets a ref and every layout", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    const row = activeRow(1);
    expect(within(row).getByLabelText("Set 1 weight in pounds")).toBeTruthy();
    expect(row).toBeTruthy();
  });
});

describe("inputs keep taking taps across exercises (OVE-214)", () => {
  const three = workout({
    exercises: [
      card(),
      card({
        loggedExerciseId: "le-pull",
        performedExerciseName: "Wide-Grip Lat Pulldown",
        plannedExerciseName: "Wide-Grip Lat Pulldown",
        plannedSets: 4,
        sets: rows(4),
      }),
      card({
        loggedExerciseId: "le-curl",
        performedExerciseName: "Pull-Up",
        plannedExerciseName: "Pull-Up",
        requiresExternalWeight: false,
        suggestedWeightLbs: null,
        plannedSets: 2,
        sets: rows(2),
      }),
    ],
  });

  const go = async (name: string) =>
    fireEvent.press(screen.getByRole("button", { name }));

  it("Next, Previous, Next, and on: every card's inputs have their bars and nothing over them", async () => {
    serve({ "/workouts/ls-1": view(three) });
    await open(three);
    expectNoPlaceholderTakesTouches();
    await go("Next: Wide-Grip Lat Pulldown");
    await screen.findByRole("header", { name: "Wide-Grip Lat Pulldown" });
    expectNoPlaceholderTakesTouches();
    expect(screen.getByLabelText("Set 1 reps").props.inputAccessoryViewID).toBe(
      keypadBarId("le-pull", 1, "reps"),
    );
    await go("Previous");
    await screen.findByRole("header", { name: "Barbell Bench Press" });
    expectNoPlaceholderTakesTouches();
    await go("Next: Wide-Grip Lat Pulldown");
    await go("Next: Pull-Up");
    await screen.findByRole("header", { name: "Pull-Up" });
    expectNoPlaceholderTakesTouches();
    // Typing still reaches the field after all that navigation.
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "9");
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("9");
  });

  it("after a saved set, the next set's bar names that set and nothing covers it", async () => {
    let current = view();
    serve({
      "/workouts/ls-1": () => current,
      "/logged-exercises/le-bench/sets/1": () => {
        current = view(
          workout({
            exercises: [
              card({
                sets: rows(3).map((r) =>
                  r.setNumber === 1
                    ? {
                        ...r,
                        loggedSetId: "set-1",
                        weightLbs: 255,
                        reps: 5,
                        saved: true,
                      }
                    : r,
                ),
              }),
            ],
          }),
        );
        return {
          id: "set-1",
          loggedExerciseId: "le-bench",
          setNumber: 1,
          weightLbs: 255,
          reps: 5,
          rir: null,
          createdAt: "2026-11-14T15:00:00.000Z",
          updatedAt: "2026-11-14T15:00:00.000Z",
        };
      },
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(
      within(barFor(keypadBarId("le-bench", 1, "reps"))).getByRole("button", {
        name: "Log set 1",
      }),
    );
    await screen.findByLabelText("Set 1, 255 pounds, 5 reps, logged");
    expectNoPlaceholderTakesTouches();
    const bar = within(barFor(keypadBarId("le-bench", 2, "reps")));
    expect(bar.getByRole("button", { name: "Log set 2" })).toBeTruthy();
    expect(bar.queryByRole("button", { name: "Log set 1" })).toBeNull();
  });
});

describe("Done on the keypad bar (OVE-214)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("each bar has Done first, then its primary action", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    for (const [field, primary] of [
      ["weight", "Next"],
      ["reps", "Log set 1"],
    ] as const) {
      const names = within(barFor(keypadBarId("le-bench", 1, field)))
        .getAllByRole("button")
        .map((b) => b.props.accessibilityLabel as string);
      expect(names).toEqual(["Done", primary]);
    }
  });

  it.each(["weight", "reps"] as const)(
    "Done on %s hides the keyboard, sends nothing, and keeps the numbers",
    async (field) => {
      const dismiss = jest
        .spyOn(Keyboard, "dismiss")
        .mockImplementation(() => {});
      serve({ "/workouts/ls-1": view() });
      await open();
      await fireEvent.changeText(
        screen.getByLabelText("Set 1 weight in pounds"),
        "262.5",
      );
      await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "6");
      const requests = mockApi.request.mock.calls.length;
      const done = within(barFor(keypadBarId("le-bench", 1, field))).getByRole(
        "button",
        { name: "Done" },
      );
      expect(done.props.accessibilityHint).toBe(
        "Hides the keyboard. Your numbers stay.",
      );
      await fireEvent.press(done);
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(mockApi.request.mock.calls.length).toBe(requests);
      expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
        "262.5",
      );
      expect(screen.getByLabelText("Set 1 reps").props.value).toBe("6");
      expect(screen.queryByText(/logged$/)).toBeNull();
      // The same field takes input again straight away.
      await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "7");
      expect(screen.getByLabelText("Set 1 reps").props.value).toBe("7");
    },
  );
});

describe("sheets never leave the keypad in a bad state (Pitch 21f)", () => {
  afterEach(() => jest.restoreAllMocks());

  const two = workout({
    exercises: [
      card(),
      card({
        loggedExerciseId: "le-pull",
        performedExerciseName: "Wide-Grip Lat Pulldown",
        plannedExerciseName: "Wide-Grip Lat Pulldown",
        plannedSets: 4,
        sets: rows(4),
      }),
    ],
  });

  /** The sheet answers Cancel, after recording what happened before it opened. */
  function cancelSheets(order: string[]) {
    jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {
      order.push("dismiss");
    });
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((options, callback) => {
        order.push("sheet");
        callback(options.cancelButtonIndex ?? 0);
      });
  }

  it("More hides the keyboard first, keeps the draft, and the inputs keep their bars", async () => {
    const order: string[] = [];
    cancelSheets(order);
    serve({ "/workouts/ls-1": view(two) });
    await open(two);
    await fireEvent.changeText(
      screen.getByLabelText("Set 1 weight in pounds"),
      "262.5",
    );
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "6");
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Barbell Bench Press" }),
    );
    await waitFor(() => expect(order).toEqual(["dismiss", "sheet"]));
    // Nothing was sent, and what was typed is still there.
    expect(mockApi.request.mock.calls.every(([, o]) => !o?.method)).toBe(true);
    expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
      "262.5",
    );
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("6");
    expectNoPlaceholderTakesTouches();
    // The fields still take input, here and on the next exercise and back.
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "7");
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("7");
    await fireEvent.press(
      screen.getByRole("button", { name: "Next: Wide-Grip Lat Pulldown" }),
    );
    await screen.findByRole("header", { name: "Wide-Grip Lat Pulldown" });
    expectNoPlaceholderTakesTouches();
    await fireEvent.press(
      screen.getByRole("button", { name: "More for Wide-Grip Lat Pulldown" }),
    );
    await waitFor(() => expect(order).toHaveLength(4));
    expectNoPlaceholderTakesTouches();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "11");
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("11");
    await fireEvent.press(screen.getByRole("button", { name: "Previous" }));
    await screen.findByRole("header", { name: "Barbell Bench Press" });
    expectNoPlaceholderTakesTouches();
  });

  it("the More button is not an input and carries no keypad bar", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    const before = bars();
    expect(before.inputs).toHaveLength(2);
    expect(before.views).toHaveLength(2);
  });

  it("Change gym hides the keyboard before it asks", async () => {
    const order: string[] = [];
    cancelSheets(order);
    serve({
      "/workouts/ls-1": view(),
      "/gyms": {
        gyms: [
          { id: "g1", name: "Downtown Gym", address: null },
          { id: "g2", name: "Riverside Fitness", address: null },
        ],
      },
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "6");
    await fireEvent.press(screen.getByRole("button", { name: "Change gym" }));
    await waitFor(() => expect(order).toEqual(["dismiss", "sheet"]));
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("6");
    expectNoPlaceholderTakesTouches();
  });
});

describe("reps in reserve and corrections keep the keypad working (Pitch 21f)", () => {
  afterEach(() => jest.restoreAllMocks());

  const withSavedFirst = (id: string, name: string) =>
    card({
      loggedExerciseId: id,
      performedExerciseName: name,
      plannedExerciseName: name,
      sets: rows(3).map((r) =>
        r.setNumber === 1
          ? {
              ...r,
              loggedSetId: `${id}-set-1`,
              weightLbs: 255,
              reps: 5,
              saved: true,
            }
          : r,
      ),
    });
  const two = workout({
    gymLocked: true,
    exercises: [
      withSavedFirst("le-bench", "Barbell Bench Press"),
      withSavedFirst("le-pull", "Wide-Grip Lat Pulldown"),
    ],
  });

  it("the RIR row is inside the row the screen keeps above the keyboard", async () => {
    serve({ "/workouts/ls-1": view() });
    await open();
    const row = activeRow(1);
    expect(
      within(row).getByRole("button", { name: "Set 1 RIR 2" }),
    ).toBeTruthy();
    // Chips are not inputs: the two fields are still the only ones with bars.
    expect(bars().inputs).toHaveLength(2);
    expectNoPlaceholderTakesTouches();
  });

  it("choosing an RIR never hides the keyboard or touches the typed numbers", async () => {
    const dismiss = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation(() => {});
    serve({ "/workouts/ls-1": view() });
    await open();
    await fireEvent.changeText(
      screen.getByLabelText("Set 1 weight in pounds"),
      "262.5",
    );
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "6");
    await fireEvent.press(screen.getByRole("button", { name: "Set 1 RIR 2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 1 RIR 3" }));
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
      "262.5",
    );
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("6");
    // The reps bar still logs this set.
    expect(
      within(barFor(keypadBarId("le-bench", 1, "reps"))).getByRole("button", {
        name: "Log set 1",
      }),
    ).toBeTruthy();
    expectNoPlaceholderTakesTouches();
  });

  it("a saved row hides the keyboard before Edit set opens, and the draft below it stays", async () => {
    const dismiss = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation(() => {});
    serve({ "/workouts/ls-1": view(two) });
    await open(two);
    await fireEvent.changeText(screen.getByLabelText("Set 2 reps"), "6");
    await fireEvent.press(
      screen.getByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    );
    expect(dismiss).toHaveBeenCalledTimes(1);
    // The workout screen stays mounted under the modal: nothing typed is lost,
    // and every input keeps its own bar.
    expect(screen.getByLabelText("Set 2 reps").props.value).toBe("6");
    expectNoPlaceholderTakesTouches();
    await fireEvent.changeText(screen.getByLabelText("Set 2 reps"), "7");
    expect(screen.getByLabelText("Set 2 reps").props.value).toBe("7");
  });

  it("Next, Previous, Next after that: each card's fields and RIR row are fresh and usable", async () => {
    jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    serve({ "/workouts/ls-1": view(two) });
    await open(two);
    await fireEvent.press(screen.getByRole("button", { name: "Set 2 RIR 1" }));
    await fireEvent.press(
      screen.getByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Next: Wide-Grip Lat Pulldown" }),
    );
    await screen.findByRole("header", { name: "Wide-Grip Lat Pulldown" });
    expectNoPlaceholderTakesTouches();
    expect(screen.getByLabelText("Set 2 reps").props.inputAccessoryViewID).toBe(
      keypadBarId("le-pull", 2, "reps"),
    );
    // A choice made on the other exercise never follows the lifter here.
    expect(
      screen.getByRole("button", { name: "Set 2 RIR 1" }).props
        .accessibilityState.selected,
    ).toBe(false);
    await fireEvent.changeText(screen.getByLabelText("Set 2 reps"), "11");
    expect(screen.getByLabelText("Set 2 reps").props.value).toBe("11");
    await fireEvent.press(screen.getByRole("button", { name: "Previous" }));
    await screen.findByRole("header", { name: "Barbell Bench Press" });
    expectNoPlaceholderTakesTouches();
    await fireEvent.press(
      screen.getByRole("button", { name: "Next: Wide-Grip Lat Pulldown" }),
    );
    await screen.findByRole("header", { name: "Wide-Grip Lat Pulldown" });
    expectNoPlaceholderTakesTouches();
    await fireEvent.changeText(
      screen.getByLabelText("Set 2 weight in pounds"),
      "130",
    );
    expect(screen.getByLabelText("Set 2 weight in pounds").props.value).toBe(
      "130",
    );
  });

  it("an extra row gets keypad bars of its own, named for that set", async () => {
    const done = workout({
      gymLocked: true,
      exercises: [
        card({
          sets: rows(3).map((r) => ({
            ...r,
            loggedSetId: `set-${r.setNumber}`,
            weightLbs: 255,
            reps: 5,
            saved: true,
          })),
        }),
      ],
    });
    serve({ "/workouts/ls-1": view(done) });
    await open(done);
    expect(bars().inputs).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: "Add set" }));
    expectNoPlaceholderTakesTouches();
    expect(
      within(barFor(keypadBarId("le-bench", 4, "reps"))).getByRole("button", {
        name: "Log set 4",
      }),
    ).toBeTruthy();
    expect(
      within(barFor(keypadBarId("le-bench", 4, "weight"))).getByRole("button", {
        name: "Next",
      }),
    ).toBeTruthy();
  });
});
