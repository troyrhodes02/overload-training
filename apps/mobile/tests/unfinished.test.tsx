/**
 * Pitch 21g correction OVE-228 on the iPhone: Today shows earlier days'
 * unfinished workouts (the server's list, the web's words); Resume opens the
 * ORIGINAL workout; starting another first asks — Resume, start anyway, or
 * cancel — and never forbids.
 */
import { ActionSheetIOS, Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type {
  DashboardDto,
  DashboardTodayDto,
} from "@overload/shared/contracts/logging";
import type {
  TodayDto,
  UnfinishedWorkoutDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { TodayView } from "../src/today/TodayView";
import { Providers } from "./harness";

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

const day = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
  kind: "pending",
  sessionId: "s-lower",
  loggedSessionId: null,
  sessionName: "Lower A",
  scheduledFor: "2026-11-20",
  week: 2,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [
    {
      name: "Barbell Squat",
      scheme: "3 × 5–7",
      done: false,
      exerciseId: "e1",
      isGymVariable: false,
    },
  ],
  setsLogged: 0,
  cardio: [],
  ...over,
});

const upperA: UnfinishedWorkoutDto = {
  loggedSessionId: "ls-upper",
  sessionName: "Upper A",
  scheduledFor: "2026-11-19",
  gymName: "Northside Strength",
  setsLogged: 5,
};
const pushB: UnfinishedWorkoutDto = {
  ...upperA,
  loggedSessionId: "ls-push",
  sessionName: "Push B",
  scheduledFor: "2026-11-17",
  setsLogged: 2,
};

const todayDto = (
  dashboard: DashboardDto,
  unfinishedWorkouts?: UnfinishedWorkoutDto[],
): TodayDto => ({
  today: "2026-11-20",
  greeting: "Good morning, Sam.",
  dashboard,
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
  ...(unfinishedWorkouts ? { unfinishedWorkouts } : {}),
});

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (raw: string) => {
    const path = raw.replace(/\?fields=core$/, "");
    if (!(path in routes)) throw new ApiError("not_found", "nope", 404);
    return routes[path];
  });
}

async function show(view: TodayDto) {
  serve({
    "/today": view,
    "/gyms": { gyms: [{ id: "g1", name: "Northside Strength" }] },
    "/workouts": { loggedSessionId: "ls-new" },
  });
  await render(
    <Providers>
      <TodayView />
    </Providers>,
  );
  await screen.findByText("Lower A");
}

/** Answer the next Alert by pressing the button with this text. */
function answerAlert(text: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === text)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest
    .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    .mockImplementation((_o, cb) => cb(0));
});

describe("the reminder", () => {
  it("one unfinished workout: name, original date, sets saved, gym, In progress, and Resume to the original", async () => {
    await show(todayDto(day(), [upperA]));
    expect(screen.getByText("Unfinished workout")).toBeTruthy();
    expect(
      screen.getByText("Upper A · Thu, Nov 19 · 5 sets saved"),
    ).toBeTruthy();
    expect(screen.getByText("Northside Strength · In progress")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume Upper A from Thu, Nov 19" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-upper");
  });

  it("several: one compact list, each resumable on its own", async () => {
    await show(todayDto(day(), [upperA, pushB]));
    expect(screen.getByText("2 unfinished workouts")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume Push B from Tue, Nov 17" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-push");
  });

  it("a long list shows five and points to History for the rest (review #5)", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...upperA,
      loggedSessionId: `ls-${i}`,
      sessionName: `Day ${i}`,
    }));
    await show(todayDto(day(), many));
    expect(screen.getByText("7 unfinished workouts")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /^Resume Day / }),
    ).toHaveLength(5);
    expect(screen.getByText("2 more are in History.")).toBeTruthy();
  });

  it("none, or an older server without the field: no reminder", async () => {
    await show(todayDto(day()));
    expect(screen.queryByTestId("unfinished-workouts")).toBeNull();
  });

  it("a rest day still shows it", async () => {
    serve({
      "/today": todayDto({ kind: "rest", week: 2, cardio: [] }, [upperA]),
    });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    expect(await screen.findByText("Unfinished workout")).toBeTruthy();
  });
});

describe("starting another workout while one is unfinished", () => {
  it("asks first; Resume opens the earlier workout and starts nothing", async () => {
    const alert = answerAlert("Resume Upper A");
    await show(todayDto(day(), [upperA]));
    await fireEvent.press(
      screen.getByRole("button", { name: "Start workout" }),
    );
    expect(alert).toHaveBeenCalledWith(
      "You have an unfinished workout",
      "Upper A from Thu, Nov 19 is still in progress. Resume it, or start today's workout and come back to it later.",
      expect.anything(),
      expect.anything(),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-upper");
    expect(mockApi.request.mock.calls.some(([p]) => p === "/workouts")).toBe(
      false,
    );
  });

  it("Start today's anyway starts today's workout (warn, never forbid)", async () => {
    answerAlert("Start today's anyway");
    await show(todayDto(day(), [upperA]));
    await fireEvent.press(
      screen.getByRole("button", { name: "Start workout" }),
    );
    await screen.findByText("Lower A");
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-new");
  });

  it("Cancel does nothing", async () => {
    answerAlert("Cancel");
    await show(todayDto(day(), [upperA]));
    await fireEvent.press(
      screen.getByRole("button", { name: "Start workout" }),
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("resuming today's own workout never asks", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await show(
      todayDto(day({ kind: "in_progress", loggedSessionId: "ls-today" }), [
        upperA,
      ]),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume workout" }),
    );
    expect(alert).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-today");
  });

  it("with nothing unfinished, Start never asks", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await show(todayDto(day(), []));
    await fireEvent.press(
      screen.getByRole("button", { name: "Start workout" }),
    );
    await screen.findByText("Lower A");
    expect(alert).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-new");
  });
});
