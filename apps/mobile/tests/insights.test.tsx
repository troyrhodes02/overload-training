/**
 * Pitch 21g design §6 (the card's insight block) and spec §7, §12: the call
 * is a SEPARATE read of the gated workout; it never fills the weight box,
 * never moves focus or the keyboard, never blocks a save, and a failed or
 * in-flight read never shows an older call. A Free account's card shows the
 * quiet Pro note with no link.
 */
import { Keyboard } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { QueryClient } from "@tanstack/react-query";
import type { OccurrenceProgressionDto } from "@overload/shared/contracts/progression";
import type {
  LoggedSetDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { invalidateInsights } from "../src/api/training";
import {
  dismissProNote,
  resetProNotes,
  useProNoteDismissed,
} from "../src/insights/pro-note-store";
import { clearAccountQueries } from "../src/api/queries";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { Providers } from "./harness";
import { card, view, workout } from "./fixtures/workout";

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

const ID = "ls-1";
const CORE = `/workouts/${ID}?fields=core`;
const FULL = `/workouts/${ID}`;

const twoCards = () =>
  workout({
    exercises: [
      card(),
      card({
        loggedExerciseId: "le-row",
        performedExerciseId: "ex-row",
        performedExerciseName: "Seated Cable Row",
        plannedExerciseName: "Seated Cable Row",
      }),
    ],
  });

const progress = (
  over: Partial<OccurrenceProgressionDto> = {},
): OccurrenceProgressionDto => ({
  loggedExerciseId: "le-bench",
  scheduledDeloadWeek: false,
  tag: "progress",
  rirEffect: null,
  suggestion: { lbs: 260, kind: "progress_increment" },
  historyHref: null,
  recommendation: {
    kind: "progress",
    tone: "strong",
    action: "Try 260 lb today (+5 lb)",
    evidence: "5 reps on every set, 2 sessions running",
  },
  locked: null,
  insufficientNote: null,
  ...over,
});

const locked = (loggedExerciseId: string): OccurrenceProgressionDto => ({
  loggedExerciseId,
  scheduledDeloadWeek: false,
  tag: null,
  rirEffect: null,
  suggestion: null,
  historyHref: null,
  recommendation: null,
  locked: "progression_insights",
  insufficientNote: null,
});

const withCalls = (
  calls: OccurrenceProgressionDto[],
  w = twoCards(),
): WorkoutViewDto => ({
  workout: w,
  progression: calls.map((p) => ({
    loggedExerciseId: p.loggedExerciseId,
    progression: p,
  })),
});

type Route = unknown | (() => unknown);
function serve(routes: Record<string, Route>) {
  mockApi.request.mockImplementation(async (path: string) => {
    const r = routes[path];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    const value = typeof r === "function" ? (r as () => unknown)() : r;
    if (value instanceof Error) throw value;
    return value;
  });
}

const requested = (path: string) =>
  mockApi.request.mock.calls.filter(([p]) => p === path).length;

let client: QueryClient;
async function open() {
  await render(
    <Providers seed={(c) => (client = c)}>
      <WorkoutScreen loggedSessionId={ID} />
    </Providers>,
  );
  await screen.findByText("Barbell Bench Press");
}

beforeEach(() => {
  jest.clearAllMocks();
  resetProNotes();
});

describe("a Pro account's card", () => {
  it("shows the server's chip and action; the evidence is one tap away", async () => {
    serve({ [CORE]: view(twoCards()), [FULL]: withCalls([progress()]) });
    await open();
    expect(await screen.findByText("Try 260 lb today (+5 lb)")).toBeTruthy();
    expect(screen.getByText("Progress")).toBeTruthy();
    expect(
      screen.queryByText("5 reps on every set, 2 sessions running"),
    ).toBeNull();
    const block = screen.getByLabelText("Progress: Try 260 lb today (+5 lb).");
    expect(block.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(block);
    expect(
      screen.getByText("5 reps on every set, 2 sessions running"),
    ).toBeTruthy();
    // Collapses again.
    await fireEvent.press(
      screen.getByLabelText(
        "Progress: Try 260 lb today (+5 lb). 5 reps on every set, 2 sessions running",
      ),
    );
    expect(
      screen.queryByText("5 reps on every set, 2 sessions running"),
    ).toBeNull();
  });

  it("the suggestion never fills the weight box (RD-8): it keeps the trusted 255", async () => {
    serve({ [CORE]: view(twoCards()), [FULL]: withCalls([progress()]) });
    await open();
    await screen.findByText("Try 260 lb today (+5 lb)");
    expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
      "255",
    );
  });

  it("a hold has no chip, and VoiceOver still hears 'Hold'", async () => {
    serve({
      [CORE]: view(twoCards()),
      [FULL]: withCalls([
        progress({
          tag: null,
          suggestion: null,
          recommendation: {
            kind: "hold",
            tone: "quiet",
            action: "Stay at 255 lb today",
            evidence: "Last time: 5, 5, 4 of 3–5",
          },
        }),
      ]),
    });
    await open();
    expect(
      await screen.findByLabelText("Hold: Stay at 255 lb today."),
    ).toBeTruthy();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(screen.queryByText("Deload")).toBeNull();
  });

  it("not enough history is the server's own sentence", async () => {
    const note = "Not enough history yet: 1 of 2 complete sessions.";
    serve({
      [CORE]: view(twoCards()),
      [FULL]: withCalls([
        progress({
          tag: null,
          suggestion: null,
          recommendation: null,
          insufficientNote: note,
        }),
      ]),
    });
    await open();
    expect(await screen.findByText(note)).toBeTruthy();
  });

  it("the evidence choice is remembered per exercise across Next and Previous", async () => {
    serve({
      [CORE]: view(twoCards()),
      [FULL]: withCalls([progress(), progress({ loggedExerciseId: "le-row" })]),
    });
    await open();
    await fireEvent.press(
      await screen.findByLabelText("Progress: Try 260 lb today (+5 lb)."),
    );
    await fireEvent.press(screen.getByText("Next: Seated Cable Row"));
    await screen.findByText("Seated Cable Row");
    expect(
      screen.queryByText("5 reps on every set, 2 sessions running"),
    ).toBeNull();
    await fireEvent.press(screen.getByText("Previous"));
    expect(
      await screen.findByText("5 reps on every set, 2 sessions running"),
    ).toBeTruthy();
  });
});

describe("the call never gets in the way of logging", () => {
  it("loading and tapping the call never dismiss the keyboard", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    serve({ [CORE]: view(twoCards()), [FULL]: withCalls([progress()]) });
    await open();
    const block = await screen.findByLabelText(
      "Progress: Try 260 lb today (+5 lb).",
    );
    await fireEvent.press(block);
    expect(dismiss).not.toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it("a call that arrives late leaves typed numbers alone", async () => {
    let answer!: (v: WorkoutViewDto) => void;
    serve({
      [CORE]: view(twoCards()),
      [FULL]: () => new Promise<WorkoutViewDto>((r) => (answer = r)),
    });
    await open();
    expect(screen.getByTestId("insight-loading")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Set 1 weight in pounds"),
      "250",
    );
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await act(async () => answer(withCalls([progress()])));
    await screen.findByText("Try 260 lb today (+5 lb)");
    expect(screen.getByLabelText("Set 1 weight in pounds").props.value).toBe(
      "250",
    );
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("5");
  });

  it("a failed call shows a retry line, and set 1 still saves", async () => {
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
    let fail = true;
    serve({
      [CORE]: view(twoCards()),
      [FULL]: () =>
        fail ? new ApiError("network", "offline", 0) : withCalls([progress()]),
      "/logged-exercises/le-bench/sets/1": stored,
    });
    await open();
    expect(
      await screen.findByText("Couldn't load the call for this lift."),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Log set 1" })[0],
    );
    expect(
      await screen.findByLabelText("Set 1, 255 pounds, 5 reps, logged"),
    ).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByText("Retry"));
    expect(await screen.findByText("Try 260 lb today (+5 lb)")).toBeTruthy();
  });

  it("logging a set does not ask for the calls again (RD-5)", async () => {
    serve({
      [CORE]: view(twoCards()),
      [FULL]: withCalls([progress()]),
      "/logged-exercises/le-bench/sets/1": {
        id: "set-1",
        loggedExerciseId: "le-bench",
        setNumber: 1,
        weightLbs: 255,
        reps: 5,
        rir: null,
        createdAt: "2026-11-14T15:00:00.000Z",
        updatedAt: "2026-11-14T15:00:00.000Z",
      },
    });
    await open();
    await screen.findByText("Try 260 lb today (+5 lb)");
    const before = requested(FULL);
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "5");
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Log set 1" })[0],
    );
    await screen.findByLabelText("Set 1, 255 pounds, 5 reps, logged");
    expect(requested(FULL)).toBe(before);
  });

  it("after a change that can move the call, the old call is replaced by loading, then the new one", async () => {
    let calls = withCalls([progress()]);
    serve({ [CORE]: view(twoCards()), [FULL]: () => calls });
    await open();
    await screen.findByText("Try 260 lb today (+5 lb)");
    calls = withCalls([
      progress({
        tag: null,
        suggestion: null,
        recommendation: {
          kind: "hold",
          tone: "quiet",
          action: "Stay at 255 lb today",
          evidence: "Last time: 5, 5, 4 of 3–5",
        },
      }),
    ]);
    await act(async () => {
      await invalidateInsights(client);
    });
    expect(await screen.findByText("Stay at 255 lb today")).toBeTruthy();
    expect(screen.queryByText("Try 260 lb today (+5 lb)")).toBeNull();
  });

  it("a card marked Not done shows no call", async () => {
    serve({
      [CORE]: view(workout({ exercises: [card({ skipped: true })] })),
      [FULL]: withCalls([progress()]),
    });
    await open();
    await screen.findByText(
      "Not done today. It won't count toward progression.",
    );
    await waitFor(() => expect(requested(FULL)).toBe(1));
    expect(screen.queryByText("Try 260 lb today (+5 lb)")).toBeNull();
  });
});

describe("a Free account's card", () => {
  it("shows the quiet Pro note with no link, and Log set works", async () => {
    serve({
      [CORE]: view(twoCards()),
      [FULL]: withCalls([locked("le-bench"), locked("le-row")]),
    });
    await open();
    const note = await screen.findByText(
      "Progress, hold, and deload calls for this lift are part of Pro.",
    );
    expect(note).toBeTruthy();
    expect(screen.queryByText(/Explore Pro|Upgrade|Subscribe|\$/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Log set 1" }).length,
    ).toBeGreaterThan(0);
  });

  it("dismissing the note hides it on every card for this run of the app", async () => {
    serve({
      [CORE]: view(twoCards()),
      [FULL]: withCalls([locked("le-bench"), locked("le-row")]),
    });
    await open();
    await fireEvent.press(
      await screen.findByLabelText(
        "Dismiss: Progress, hold, and deload calls for this lift are part of Pro.",
      ),
    );
    expect(screen.queryByTestId("pro-note")).toBeNull();
    await fireEvent.press(screen.getByText("Next: Seated Cable Row"));
    await screen.findByText("Seated Cable Row");
    expect(screen.queryByTestId("pro-note")).toBeNull();
  });

  it("Pro → Free: the next read's locked answer replaces the call", async () => {
    let calls = withCalls([progress()]);
    serve({ [CORE]: view(twoCards()), [FULL]: () => calls });
    await open();
    await screen.findByText("Try 260 lb today (+5 lb)");
    calls = withCalls([locked("le-bench")]);
    await act(async () => {
      await invalidateInsights(client);
    });
    expect(
      await screen.findByText(
        "Progress, hold, and deload calls for this lift are part of Pro.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Try 260 lb today (+5 lb)")).toBeNull();
  });
});

describe("review fixes (Pitch 21g audit)", () => {
  it("a re-check (back to the screen, back from the background) keeps the call on screen until the answer lands", async () => {
    let answer: ((v: WorkoutViewDto) => void) | null = null;
    let first = true;
    serve({
      [CORE]: view(twoCards()),
      [FULL]: () => {
        if (first) {
          first = false;
          return withCalls([progress()]);
        }
        return new Promise<WorkoutViewDto>((r) => (answer = r));
      },
    });
    await open();
    await screen.findByText("Try 260 lb today (+5 lb)");
    // A refetch that isn't an invalidation (what focus and foreground do).
    void client.refetchQueries({ queryKey: ["workout-insights", ID] });
    await waitFor(() => expect(answer).not.toBeNull());
    expect(screen.getByText("Try 260 lb today (+5 lb)")).toBeTruthy();
    expect(screen.queryByTestId("insight-loading")).toBeNull();
    await act(async () => answer!(withCalls([locked("le-bench")])));
    expect(
      await screen.findByText(
        "Progress, hold, and deload calls for this lift are part of Pro.",
      ),
    ).toBeTruthy();
  });

  it("signing out forgets a dismissed Pro note, so the next account sees it", async () => {
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useProNoteDismissed("exercise-card"));
      return null;
    }
    await render(<Probe />);
    await act(async () => dismissProNote("exercise-card"));
    expect(seen.at(-1)).toBe(true);
    await act(async () => clearAccountQueries(new QueryClient()));
    expect(seen.at(-1)).toBe(false);
  });
});
