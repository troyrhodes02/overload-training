/**
 * Pitch 21e design H1 / H2 (spec §11 "history"): History renders the
 * server's week, moves only where the server allows, reaches earlier blocks,
 * and shows a logged workout exactly as recorded.
 */
import { Appearance } from "react-native";
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react-native";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type { LoggedWorkoutDetailViewDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { Providers } from "./harness";
import { HistoryScreen, historyRows } from "../src/history/HistoryScreen";
import { LoggedWorkoutScreen } from "../src/history/LoggedWorkoutScreen";

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

const block = (id: string, name: string) => ({
  mesocycleId: id,
  name,
  status: "archived" as const,
});

const activeWeek = (): HistoryWeekDto => ({
  weekStart: "2026-11-09",
  weekEnd: "2026-11-15",
  rangeLabel: "Nov 9 – 15",
  thisWeekStart: "2026-11-09",
  isThisWeek: true,
  prevWeekStart: "2026-11-02",
  nextWeekStart: null,
  view: {
    kind: "active",
    blockName: "Block 3",
    weekNumber: 2,
    lengthWeeks: 5,
    days: [
      {
        dateIso: "2026-11-11",
        dayLabel: "Wed, Nov 11",
        sessionName: "Upper",
        state: "complete",
        loggedSessionId: "ls-upper",
      },
      {
        dateIso: "2026-11-14",
        dayLabel: "Sat, Nov 14",
        sessionName: "Push",
        state: "in_progress",
        loggedSessionId: "ls-push",
      },
      {
        dateIso: "2026-11-15",
        dayLabel: "Sun, Nov 15",
        sessionName: "Legs",
        state: "upcoming",
        loggedSessionId: null,
      },
    ],
    cardio: [],
  },
  earlierBlocks: [
    {
      ...block("m1", "Block 1"),
      weekStart: "2026-07-06",
      rangeLabel: "Jul 6 – Aug 9",
    },
  ],
  hasAnyHistory: true,
});

const block1Week = (): HistoryWeekDto => ({
  weekStart: "2026-07-06",
  weekEnd: "2026-07-12",
  rangeLabel: "Jul 6 – 12",
  thisWeekStart: "2026-11-09",
  isThisWeek: false,
  prevWeekStart: null,
  nextWeekStart: "2026-07-13",
  view: {
    kind: "logged",
    blocks: [block("m1", "Block 1")],
    days: [
      {
        dateIso: "2026-07-08",
        dayLabel: "Wed, Jul 8",
        workouts: [
          {
            ...block("m1", "Block 1"),
            loggedSessionId: "ls-old",
            sessionName: "Upper",
            state: "complete",
          },
        ],
        cardio: [
          {
            ...block("m1", "Block 1"),
            cardioLogId: "c1",
            type: "Run",
            durationMin: 30,
          },
        ],
      },
    ],
  },
  earlierBlocks: [],
  hasAnyHistory: true,
});

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string) => {
    const r = routes[path];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return r;
  });
}

beforeEach(() => jest.clearAllMocks());

describe.each(["light", "dark"] as const)("History in %s", (scheme) => {
  beforeAll(() => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
  });

  it("shows this week with the server's states, and › is disabled at the bound", async () => {
    serve({ "/history": activeWeek() });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    expect(await screen.findByText("Nov 9 – 15")).toBeTruthy();
    expect(screen.getByText("Block 3 · Week 2 of 5")).toBeTruthy();
    expect(screen.getByLabelText("Upper, Wed, Nov 11, Done")).toBeTruthy();
    expect(
      screen.getByLabelText("Push, Sat, Nov 14, In progress"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Legs, Sun, Nov 15, Upcoming")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next week" }).props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "This week" })).toBeNull();
  });
});

describe("moving through all-time history", () => {
  it("‹ asks for the previous week; Earlier blocks opens Block 1's first week", async () => {
    serve({
      "/history": activeWeek(),
      "/history?week=2026-11-02": {
        ...activeWeek(),
        rangeLabel: "Nov 2 – 8",
        isThisWeek: false,
      },
      "/history?week=2026-07-06": block1Week(),
    });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    await screen.findByText("Nov 9 – 15");
    await fireEvent.press(
      screen.getByRole("button", { name: "Previous week" }),
    );
    expect(await screen.findByText("Nov 2 – 8")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "This week" }));
    expect(await screen.findByText("Nov 9 – 15")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Block 1, Jul 6 – Aug 9"));
    expect(await screen.findByText("Jul 6 – 12")).toBeTruthy();
    // The old block's workout and cardio, as logged; ‹ stops at the first week.
    expect(screen.getByLabelText("Upper, Wed, Jul 8, Done")).toBeTruthy();
    expect(
      screen.getByLabelText("Run · 30 min, Wed, Jul 8, Done"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Previous week" }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it("opens a logged workout; an in-progress one is marked for Resume", async () => {
    serve({ "/history": activeWeek() });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByLabelText("Upper, Wed, Nov 11, Done"),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/history/ls-upper");
    await fireEvent.press(
      screen.getByLabelText("Push, Sat, Nov 14, In progress"),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/history/ls-push?inProgress=1",
    );
  });

  it("a week that fails to load offers a retry and the way back (review #3)", async () => {
    serve({
      "/history": activeWeek(),
      "/history?week=2026-11-02": new ApiError("network", "offline"),
    });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    await screen.findByText("Nov 9 – 15");
    await fireEvent.press(
      screen.getByRole("button", { name: "Previous week" }),
    );
    expect(await screen.findByText("Can't reach Overload")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Back to this week" }),
    );
    expect(await screen.findByText("Nov 9 – 15")).toBeTruthy();
  });

  it("a server without the History route says so, never 'There's nothing here.' (OVE-203)", async () => {
    serve({
      "/history": new ApiError("not_found", "There's nothing here.", 404),
    });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    expect(
      await screen.findByText("History isn't available from this server"),
    ).toBeTruthy();
    expect(screen.queryByText("There's nothing here.")).toBeNull();
    expect(screen.queryByText("No workouts yet.")).toBeNull();
  });

  it("an account with nothing logged sees the empty state", async () => {
    serve({ "/history": { ...activeWeek(), hasAnyHistory: false } });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    expect(await screen.findByText("No workouts yet.")).toBeTruthy();
  });

  it("rows keep lifting before cardio on the same date", () => {
    const rows = historyRows(block1Week());
    expect(rows.map((r) => r.kind)).toEqual(["workout", "cardio"]);
  });
});

const detail = (): LoggedWorkoutDetailViewDto => ({
  detail: {
    loggedSessionId: "ls-old",
    sessionName: "Upper",
    dateIso: "2026-07-08",
    dateLabel: "Wed, Jul 8",
    gymName: "Old Gym",
    exercises: [
      {
        loggedExerciseId: "a",
        exerciseId: "e1",
        historyHref: "",
        performedName: "Barbell Bench Press",
        plannedName: "Barbell Bench Press",
        swapped: false,
        archived: true,
        skipped: false,
        requiresExternalWeight: true,
        plannedSets: 2,
        sets: [
          {
            loggedSetId: "s1",
            setNumber: 1,
            weightLbs: 205,
            reps: 8,
            rir: 2,
            extra: false,
          },
          {
            loggedSetId: "s2",
            setNumber: 2,
            weightLbs: 205,
            reps: 7,
            rir: null,
            extra: false,
          },
          {
            loggedSetId: "s3",
            setNumber: 3,
            weightLbs: 185,
            reps: 10,
            rir: null,
            extra: true,
          },
        ],
      },
      {
        loggedExerciseId: "b",
        exerciseId: "e2",
        historyHref: "",
        performedName: "Chin-Up",
        plannedName: "Pull-Up",
        swapped: true,
        archived: false,
        skipped: true,
        requiresExternalWeight: false,
        plannedSets: 3,
        sets: [],
      },
    ],
  },
  summary: null,
  goals: [],
});

describe("a logged workout (H2)", () => {
  it("a workout finished since the row was opened offers no Resume (review #2)", async () => {
    serve({
      "/history/ls-old": detail(),
      "/workouts/ls-old": { workout: { status: "complete" }, progression: [] },
    });
    await render(
      <Providers>
        <LoggedWorkoutScreen loggedSessionId="ls-old" inProgress />
      </Providers>,
    );
    await screen.findByText("Wednesday, July 8 · Old Gym");
    await waitFor(() =>
      expect(
        mockApi.request.mock.calls.some(([p]) => p === "/workouts/ls-old"),
      ).toBe(true),
    );
    expect(screen.queryByRole("button", { name: "Resume workout" })).toBeNull();
    expect(screen.queryByText("In progress")).toBeNull();
  });

  it("shows every set as recorded, archived and swapped exercises included", async () => {
    serve({ "/history/ls-old": detail() });
    await render(
      <Providers>
        <LoggedWorkoutScreen loggedSessionId="ls-old" inProgress={false} />
      </Providers>,
    );
    expect(await screen.findByText("Wednesday, July 8 · Old Gym")).toBeTruthy();
    expect(screen.getByText("Barbell Bench Press · archived")).toBeTruthy();
    expect(screen.getByLabelText("Set 1, 205 lbs × 8 · 2 RIR")).toBeTruthy();
    expect(screen.getByLabelText("Set 3, 185 lbs × 10 · extra")).toBeTruthy();
    expect(screen.getByText("Chin-Up · swapped from Pull-Up")).toBeTruthy();
    expect(screen.getByLabelText("Not done")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume workout" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Edit on the web" }),
    ).toBeTruthy();
  });

  it("an in-progress workout offers Resume — only when the server says so", async () => {
    serve({
      "/history/ls-old": detail(),
      "/workouts/ls-old": {
        workout: { status: "in_progress" },
        progression: [],
      },
    });
    await render(
      <Providers>
        <LoggedWorkoutScreen loggedSessionId="ls-old" inProgress />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Resume workout" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-old");
  });

  it("another account's or a missing workout reads as unavailable", async () => {
    serve({});
    await render(
      <Providers>
        <LoggedWorkoutScreen loggedSessionId="nope" inProgress={false} />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByText("This workout isn't available.")).toBeTruthy(),
    );
  });
});
