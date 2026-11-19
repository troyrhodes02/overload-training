/**
 * Pitch 21g design §6 (W1 banner, T1 additions) and RD-11: a scheduled
 * deload week is planned recovery for every plan. The banner comes only from
 * the SERVER's flag, and in that week no reactive chip shows: the card says
 * the server's quiet deload-week line instead.
 */
import { render, screen } from "@testing-library/react-native";
import type {
  DashboardDto,
  DashboardTodayDto,
} from "@overload/shared/contracts/logging";
import type { OccurrenceProgressionDto } from "@overload/shared/contracts/progression";
import type {
  TodayDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { DELOAD_WEEK_BANNER } from "../src/insights/DeloadWeekBanner";
import { TodayView } from "../src/today/TodayView";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { Providers } from "./harness";
import { card, view, workout } from "./fixtures/workout";

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

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string) => {
    if (!(path in routes)) throw new ApiError("not_found", "nope", 404);
    return routes[path];
  });
}

beforeEach(() => jest.clearAllMocks());

it("the banner's words are the web's, with the shared 90%", () => {
  expect(DELOAD_WEEK_BANNER).toBe("Deload week · 90% load across the split");
});

describe("the workout (W1)", () => {
  const deloadCall: OccurrenceProgressionDto = {
    loggedExerciseId: "le-bench",
    scheduledDeloadWeek: true,
    tag: null,
    rirEffect: null,
    suggestion: { lbs: 230, kind: "scheduled_deload" },
    historyHref: null,
    recommendation: {
      kind: "scheduled_deload",
      tone: "quiet",
      action: "Deload week: 230 lb (90%)",
      evidence: "Planned recovery, not a verdict. Calls resume next week.",
    },
    locked: null,
    insufficientNote: null,
  };
  const inDeload = workout({ scheduledDeloadWeek: true });
  const full = (w = inDeload, calls = [deloadCall]): WorkoutViewDto => ({
    workout: w,
    progression: calls.map((p) => ({
      loggedExerciseId: p.loggedExerciseId,
      progression: p,
    })),
  });

  it("in a deload week: the banner, the quiet deload-week line, and no reactive chip", async () => {
    serve({
      "/workouts/ls-1?fields=core": view(inDeload),
      "/workouts/ls-1": full(),
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    expect(await screen.findByText(DELOAD_WEEK_BANNER)).toBeTruthy();
    expect(
      await screen.findByLabelText("Deload week: Deload week: 230 lb (90%)."),
    ).toBeTruthy();
    expect(screen.queryByText("Deload")).toBeNull();
    expect(screen.queryByText("Progress")).toBeNull();
  });

  it("a Free account still sees the banner (planned recovery is not Pro)", async () => {
    serve({
      "/workouts/ls-1?fields=core": view(inDeload),
      "/workouts/ls-1": full(inDeload, [
        {
          ...deloadCall,
          suggestion: null,
          recommendation: null,
          locked: "progression_insights",
        },
      ]),
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    expect(await screen.findByText(DELOAD_WEEK_BANNER)).toBeTruthy();
  });

  it("an ordinary week has no banner", async () => {
    serve({
      "/workouts/ls-1?fields=core": view(workout({ exercises: [card()] })),
      "/workouts/ls-1": full(workout(), []),
    });
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    await screen.findByText("Barbell Bench Press");
    expect(screen.queryByText(DELOAD_WEEK_BANNER)).toBeNull();
  });
});

describe("Today (T1)", () => {
  const day = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
    kind: "pending",
    sessionId: "s-push",
    loggedSessionId: null,
    sessionName: "Push",
    scheduledFor: "2026-11-14",
    week: 5,
    scheduledDeloadWeek: true,
    gymName: null,
    exercises: [
      {
        name: "Barbell Bench Press",
        scheme: "3 × 3–5",
        done: false,
        exerciseId: "e1",
        isGymVariable: false,
      },
    ],
    setsLogged: 0,
    cardio: [],
    ...over,
  });
  const today = (dashboard: DashboardDto): TodayDto => ({
    today: "2026-11-14",
    greeting: "Good morning, Sam.",
    dashboard,
    plannedProgression: [],
    sessionSummary: null,
    sessionGoals: [],
    goals: null,
  });
  const show = async (d: DashboardDto) => {
    serve({ "/today?fields=core": today(d) });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await screen.findByText("Push");
  };

  it("a planned day in a deload week shows the banner", async () => {
    await show(day());
    expect(screen.getByText(DELOAD_WEEK_BANNER)).toBeTruthy();
    expect(screen.getByText("Week 5 · Deload week")).toBeTruthy();
  });

  it("an in-progress day too", async () => {
    await show(day({ kind: "in_progress", loggedSessionId: "ls-1" }));
    expect(screen.getByText(DELOAD_WEEK_BANNER)).toBeTruthy();
  });

  it("not once the day is done, and never in an ordinary week", async () => {
    await show(day({ kind: "complete", loggedSessionId: "ls-1" }));
    expect(screen.queryByText(DELOAD_WEEK_BANNER)).toBeNull();
  });

  it("an ordinary week has no banner", async () => {
    await show(day({ scheduledDeloadWeek: false, week: 3 }));
    expect(screen.queryByText(DELOAD_WEEK_BANNER)).toBeNull();
  });
});
