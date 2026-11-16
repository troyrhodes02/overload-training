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
import { Keyboard, StyleSheet, type ScrollViewInstance } from "react-native";
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
const BAR = "RCTInputAccessoryView";

function bars() {
  return { inputs: hosts(INPUT), views: hosts(BAR) };
}

const barFor = (id: string): Host => {
  const matches = hosts(BAR).filter((v) => v.props.nativeID === id);
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
