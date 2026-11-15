/**
 * Pitch 21e design T1 / W0 (spec §11 "today", "start"): Today renders every
 * dashboard kind from the server, and Start asks for a gym only when there is
 * a choice. The API client is a fake keyed by path; nothing touches the
 * network.
 */
import { ActionSheetIOS, Appearance } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  DashboardDto,
  DashboardTodayDto,
} from "@overload/shared/contracts/logging";
import type { TodayDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { Providers } from "./harness";
import { TodayView } from "../src/today/TodayView";

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
  // A getter: the factory runs before this file's consts are initialized.
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

const day = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
  kind: "pending",
  sessionId: "s-push",
  loggedSessionId: null,
  sessionName: "Push",
  scheduledFor: "2026-11-14",
  week: 3,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [
    {
      name: "Barbell Bench Press",
      scheme: "3 × 3–5",
      done: false,
      exerciseId: "e1",
      isGymVariable: false,
    },
    {
      name: "Lateral Raise",
      scheme: "3 × 12–15",
      done: false,
      exerciseId: "e2",
      isGymVariable: false,
    },
  ],
  setsLogged: 0,
  cardio: [],
  ...over,
});

const todayDto = (dashboard: DashboardDto): TodayDto => ({
  today: "2026-11-14",
  greeting: "Good morning, Sam.",
  dashboard,
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
});

type Routes = Record<string, unknown | ((body: unknown) => unknown)>;
function serve(routes: Routes) {
  mockApi.request.mockImplementation(
    async (path: string, opts: { body?: unknown } = {}) => {
      if (!(path in routes)) throw new ApiError("not_found", "nope", 404);
      const r = routes[path];
      if (r instanceof Error) throw r;
      return typeof r === "function" ? r(opts.body) : r;
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each(["light", "dark"] as const)(
  "Today in %s appearance",
  (scheme) => {
    beforeAll(() => {
      jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
    });

    it("pending: the greeting, the account's date, the planned list, and Start", async () => {
      serve({ "/today": todayDto(day()) });
      await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(await screen.findByText("Good morning, Sam.")).toBeTruthy();
      expect(screen.getByText("Saturday, November 14")).toBeTruthy();
      expect(screen.getByText("Push")).toBeTruthy();
      expect(screen.getByText("Week 3 · 2 exercises")).toBeTruthy();
      expect(screen.getByText("3 × 3–5")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Start workout" }),
      ).toBeTruthy();
    });

    it("in progress: Resume opens the existing workout without starting another", async () => {
      serve({
        "/today": todayDto(
          day({
            kind: "in_progress",
            loggedSessionId: "ls-1",
            exercises: [
              { ...day().exercises[0], done: true },
              day().exercises[1],
            ],
          }),
        ),
      });
      await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(
        await screen.findByText(
          "In progress · Week 3 · 1 of 2 exercises logged",
        ),
      ).toBeTruthy();
      await fireEvent.press(
        screen.getByRole("button", { name: "Resume workout" }),
      );
      expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-1");
      expect(
        mockApi.request.mock.calls.filter(([p]) => p === "/workouts"),
      ).toHaveLength(0);
    });

    it("done: no Start, and View workout opens the logged workout", async () => {
      serve({
        "/today": todayDto(
          day({
            kind: "complete",
            loggedSessionId: "ls-1",
            exercises: day().exercises.map((e) => ({ ...e, done: true })),
          }),
        ),
      });
      await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(await screen.findByText("Push · Done")).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Start workout" }),
      ).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", { name: "View workout" }),
      );
      expect(mockRouter.push).toHaveBeenCalledWith("/history/ls-1");
    });

    it("rest, no plan, and a missed day each get their own state", async () => {
      serve({ "/today": todayDto({ kind: "rest", week: 2, cardio: [] }) });
      const { unmount } = await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(await screen.findByText("No lifting planned today.")).toBeTruthy();
      await unmount();

      serve({ "/today": todayDto({ kind: "no_plan" }) });
      const second = await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(await screen.findByText("No active plan.")).toBeTruthy();
      await second.unmount();

      serve({
        "/today": todayDto({
          kind: "missed_day",
          today: "2026-11-14",
          missed: {
            mesocycleId: "m",
            sessionId: "s-legs",
            sessionName: "Legs",
            missedOn: "2026-11-11",
            daysAgo: 3,
          },
          below: day(),
          cardio: [],
        }),
      });
      await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(
        await screen.findByText("You missed Legs on Wednesday."),
      ).toBeTruthy();
      // The day below is shown dimmed, and there is no Start to press.
      expect(screen.getByText("Push")).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Start workout" }),
      ).toBeNull();
    });

    it("an error with nothing loaded offers Try again", async () => {
      serve({
        "/today": new ApiError("network", "Overload needs a connection."),
      });
      await render(
        <Providers>
          <TodayView />
        </Providers>,
      );
      expect(await screen.findByText("Can't reach Overload")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });
  },
);

describe("Start (W0, RD-4)", () => {
  const gym = (id: string, name: string) => ({ id, name, address: null });

  it("one active gym: starts with it and opens the workout", async () => {
    const start = jest.fn(() => ({ loggedSessionId: "ls-new" }));
    serve({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "Downtown Gym")] },
      "/workouts": start,
    });
    const sheet = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions");
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Start workout" }),
    );
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-new"),
    );
    expect(start).toHaveBeenCalledWith({
      sessionId: "s-push",
      scheduledFor: "2026-11-14",
      gymId: "g1",
    });
    expect(sheet).not.toHaveBeenCalled();
  });

  it("two gyms: asks with an action sheet and starts with the choice", async () => {
    const start = jest.fn(() => ({ loggedSessionId: "ls-new" }));
    serve({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "Campus Rec"), gym("g2", "Downtown Gym")] },
      "/workouts": start,
    });
    const sheet = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((options, callback) => {
        expect(options.options).toEqual([
          "Campus Rec",
          "Downtown Gym",
          "Cancel",
        ]);
        callback(1);
      });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Start workout" }),
    );
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ gymId: "g2" }),
    );
    expect(sheet).toHaveBeenCalledTimes(1);
  });

  it("cancelling the sheet starts nothing", async () => {
    const start = jest.fn();
    serve({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "A"), gym("g2", "B")] },
      "/workouts": start,
    });
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((_o, callback) => callback(2));
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Start workout" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start workout" }),
      ).toBeTruthy(),
    );
    expect(start).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("no gym: says where to add one and sends no start", async () => {
    const start = jest.fn();
    serve({
      "/today": todayDto(day()),
      "/gyms": { gyms: [] },
      "/workouts": start,
    });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Start workout" }),
    );
    expect(
      await screen.findByText("Add the gym you train at on the web first."),
    ).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it("a refused start shows the server's message and opens nothing", async () => {
    serve({
      "/today": todayDto(day()),
      "/gyms": { gyms: [gym("g1", "Downtown Gym")] },
      "/workouts": new ApiError(
        "validation_error",
        "That workout's day hasn't come yet.",
        400,
      ),
    });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Start workout" }),
    );
    expect(
      await screen.findByText("That workout's day hasn't come yet."),
    ).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
