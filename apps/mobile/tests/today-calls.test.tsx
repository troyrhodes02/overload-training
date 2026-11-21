/**
 * Pitch 21g parity correction OVE-230: iPhone Today's planned list shows the
 * calls the web's Today shows, from a separate gated read (Today opens on the
 * core read). A call attaches only to the same day and lift; Free sees the
 * quiet note; a failed calls read shows the plain list.
 */
import { render, screen } from "@testing-library/react-native";
import type { DashboardTodayDto } from "@overload/shared/contracts/logging";
import type { PlannedProgressionDto } from "@overload/shared/contracts/progression";
import type { TodayDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { resetProNotes } from "../src/insights/pro-note-store";
import { plannedCalls } from "../src/today/today-calls";
import { TodayView } from "../src/today/TodayView";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

const day = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
  kind: "pending",
  sessionId: "s-upper",
  loggedSessionId: null,
  sessionName: "Upper A",
  scheduledFor: "2026-11-21",
  week: 4,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [
    {
      name: "Bench",
      scheme: "3 × 6–8",
      done: false,
      exerciseId: "e-bench",
      isGymVariable: false,
    },
    {
      name: "Incline",
      scheme: "3 × 8–12",
      done: false,
      exerciseId: "e-incline",
      isGymVariable: false,
    },
    {
      name: "Pulldown",
      scheme: "3 × 10–12",
      done: false,
      exerciseId: "e-pull",
      isGymVariable: true,
    },
  ],
  setsLogged: 0,
  cardio: [],
  ...over,
});

const none: PlannedProgressionDto = {
  tag: null,
  rirEffect: null,
  gymVariable: false,
  suggestion: null,
  hasTrend: true,
  recommendation: null,
  locked: null,
};
const pro: PlannedProgressionDto[] = [
  {
    ...none,
    tag: "progress",
    suggestion: { lbs: 185, kind: "progress_increment" },
    recommendation: {
      kind: "progress",
      tone: "strong",
      action: "Try 185 lb today (+5 lb)",
      evidence: "8 reps on every set, 2 sessions running",
    },
  },
  {
    ...none,
    recommendation: {
      kind: "hold",
      tone: "quiet",
      action: "Stay at 60 lb today",
      evidence: "Last time: 12, 11, 10 of 8–12",
    },
  },
  { ...none, gymVariable: true },
];
const today = (
  d: DashboardTodayDto,
  calls: PlannedProgressionDto[] = [],
): TodayDto => ({
  today: "2026-11-21",
  greeting: "Good morning, Sam.",
  dashboard: d,
  plannedProgression: calls.map((progression, i) => ({
    exerciseId: d.exercises[i].exerciseId,
    progression,
  })),
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
  unfinishedWorkouts: [],
});

function serve(core: TodayDto, full: TodayDto | Error) {
  mockApi.request.mockImplementation(async (path: string) => {
    if (path === "/today?fields=core") return core;
    if (path === "/today") {
      if (full instanceof Error) throw full;
      return full;
    }
    throw new ApiError("not_found", "nope", 404);
  });
}

async function show(core: TodayDto, full: TodayDto | Error) {
  serve(core, full);
  await render(
    <Providers>
      <TodayView />
    </Providers>,
  );
  await screen.findByText("Upper A");
}

beforeEach(() => {
  jest.clearAllMocks();
  resetProNotes();
});

describe("Today's calls on the iPhone", () => {
  it("Pro: the web's planned-list facts — load, chip, a tagged lift's evidence, and a machine waiting for the gym", async () => {
    await show(today(day()), today(day(), pro));
    expect(await screen.findByText("Try 185 lb (+5)")).toBeTruthy();
    expect(screen.getByText("Progress")).toBeTruthy();
    expect(
      screen.getByText("8 reps on every set, 2 sessions running"),
    ).toBeTruthy();
    // A hold: the scheme, no chip, no evidence line (as on the web).
    expect(screen.getByText("3 × 8–12")).toBeTruthy();
    expect(screen.queryByText("Last time: 12, 11, 10 of 8–12")).toBeNull();
    expect(screen.getByText("once gym is set")).toBeTruthy();
  });

  it("Free: the plain list and the quiet note with no link", async () => {
    const locked = pro.map(() => ({
      ...none,
      hasTrend: false,
      locked: "progression_insights" as const,
    }));
    await show(today(day()), today(day(), locked));
    expect(
      await screen.findByText(
        "Progress, hold, and deload calls, with the weight to try, are part of Pro.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(screen.getByText("3 × 6–8")).toBeTruthy();
  });

  it("a failed calls read leaves the plain list (Today itself is fine)", async () => {
    await show(today(day()), new ApiError("network", "offline", 0));
    expect(screen.getByText("3 × 6–8")).toBeTruthy();
    expect(screen.queryByText("Progress")).toBeNull();
  });
});

describe("plannedCalls attaches calls only to the same day and lifts", () => {
  const ok = { isFetching: false, isError: false, hasData: true };
  it("same day → the calls; another session or order → none", () => {
    expect(plannedCalls(day(), ok, today(day(), pro))).toHaveLength(3);
    expect(
      plannedCalls(day(), ok, today(day({ sessionId: "s-other" }), pro)),
    ).toBeNull();
    const reordered = day({ exercises: [...day().exercises].reverse() });
    expect(plannedCalls(day(), ok, today(reordered, pro))).toBeNull();
  });
  it("a finished day, a failed or paused read, or an invalidated one in flight → none", () => {
    const done = day({ kind: "complete", loggedSessionId: "ls" });
    expect(plannedCalls(done, ok, today(done, pro))).toBeNull();
    expect(
      plannedCalls(day(), { ...ok, isError: true }, today(day(), pro)),
    ).toBeNull();
    expect(
      plannedCalls(day(), { ...ok, isPaused: true }, today(day(), pro)),
    ).toBeNull();
    expect(
      plannedCalls(
        day(),
        { ...ok, isFetching: true, isInvalidated: true },
        today(day(), pro),
      ),
    ).toBeNull();
    // Invalidated by a write, not yet refetching: none (review #3).
    expect(
      plannedCalls(day(), { ...ok, isInvalidated: true }, today(day(), pro)),
    ).toBeNull();
    // An ordinary re-check keeps them.
    expect(
      plannedCalls(day(), { ...ok, isFetching: true }, today(day(), pro)),
    ).toHaveLength(3);
  });
});
