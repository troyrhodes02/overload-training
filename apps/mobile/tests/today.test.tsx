/**
 * Pitch 21e design T1 / W0 (spec §11 "today", "start"): Today renders every
 * dashboard kind from the server, and Start asks for a gym only when there is
 * a choice. The API client is a fake keyed by path; nothing touches the
 * network.
 */
import { ActionSheetIOS, Alert, Appearance } from "react-native";
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

/** The app asks for the core fields (RD-28); routes here are keyed without it. */
const stripCore = (path: string) => path.replace(/\?fields=core$/, "");

type Routes = Record<string, unknown | ((body: unknown) => unknown)>;
function serve(routes: Routes) {
  mockApi.request.mockImplementation(
    async (raw: string, opts: { body?: unknown } = {}) => {
      const path = stripCore(raw);
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
      expect(screen.getByRole("header", { name: "Today" })).toBeTruthy();
      expect(screen.getByText("Push")).toBeTruthy();
      expect(screen.getByText("Week 3")).toBeTruthy();
      expect(screen.getByText("Ready")).toBeTruthy();
      expect(screen.getByText("2 exercises")).toBeTruthy();
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
      expect(await screen.findByText("1 of 2 exercises logged")).toBeTruthy();
      expect(screen.getByText("In progress")).toBeTruthy();
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
      expect(await screen.findByText("Push")).toBeTruthy();
      expect(screen.getByText("Done")).toBeTruthy();
      expect(screen.getByText("2 of 2 exercises logged")).toBeTruthy();
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
      expect(await screen.findByText("Rest day")).toBeTruthy();
      expect(screen.getByText("No lifting planned today.")).toBeTruthy();
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
        await screen.findByText("Legs was missed on Wednesday"),
      ).toBeTruthy();
      // The day below is shown dimmed and waiting, with no Start to press.
      expect(screen.getByText("Push")).toBeTruthy();
      expect(screen.getByText("Waiting")).toBeTruthy();
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

describe("Missed day: log it late, shift, skip (Checkpoint A, RD-23)", () => {
  const missed = {
    mesocycleId: "m-1",
    sessionId: "s-legs",
    sessionName: "Legs",
    missedOn: "2026-11-11",
    daysAgo: 3,
  };
  const missedToday = todayDto({
    kind: "missed_day",
    today: "2026-11-14",
    missed,
    below: day(),
    cardio: [],
  });
  const PUT_PATH = "/mesocycles/m-1/missed-days/2026-11-11";

  /** Today answers the missed day until a resolution lands, then the day. */
  function serveMissed(resolve: (body: unknown) => unknown) {
    let resolved = false;
    serve({
      "/today": () => (resolved ? todayDto(day()) : missedToday),
      [PUT_PATH]: (body: unknown) => {
        const r = resolve(body);
        resolved = true;
        return r;
      },
    });
  }

  /** Alert stand-in: presses the named button of the next alert. */
  function answerAlert(button: string, times = 1) {
    return jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        const b = buttons?.find((x) => x.text === button);
        for (let i = 0; i < times; i++) b?.onPress?.();
      });
  }

  async function renderToday() {
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await screen.findByText("Legs was missed on Wednesday");
  }

  it("offers the web's three choices with their wording", async () => {
    serveMissed(() => ({}));
    await renderToday();
    for (const name of ["Log it late", "Shift the week", "Skip it"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(
      screen.getByText("Record the sets you did on Wednesday"),
    ).toBeTruthy();
  });

  it("Shift asks first; confirming sends one PUT and Today moves on", async () => {
    const put = jest.fn(() => ({
      id: "r1",
      missedOn: "2026-11-11",
      outcome: "shifted",
    }));
    serveMissed(put);
    const alert = answerAlert("Shift the week");
    await renderToday();
    await fireEvent.press(
      screen.getByRole("button", { name: "Shift the week" }),
    );
    expect(alert).toHaveBeenCalledWith(
      "Shift the rest of this week?",
      expect.stringContaining("Next week is unchanged."),
      expect.any(Array),
    );
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith({ outcome: "shifted" });
    expect(
      await screen.findByText("This week shifted forward a day."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start workout" })).toBeTruthy();
  });

  it("cancelling the confirmation sends nothing", async () => {
    const put = jest.fn();
    serveMissed(put);
    answerAlert("Cancel");
    await renderToday();
    await fireEvent.press(
      screen.getByRole("button", { name: "Shift the week" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Skip it" }));
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByText("Legs was missed on Wednesday")).toBeTruthy();
  });

  it("Skip asks first, then sends skipped", async () => {
    const put = jest.fn(() => ({
      id: "r1",
      missedOn: "2026-11-11",
      outcome: "skipped",
    }));
    serveMissed(put);
    const alert = answerAlert("Skip it");
    await renderToday();
    await fireEvent.press(screen.getByRole("button", { name: "Skip it" }));
    expect(alert).toHaveBeenCalledWith(
      "Skip Legs?",
      expect.stringContaining("You can't undo this."),
      expect.any(Array),
    );
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({ outcome: "skipped" }),
    );
    expect(
      await screen.findByText("Skipped Legs. Past weeks stay as planned."),
    ).toBeTruthy();
  });

  it("a double confirm sends one request", async () => {
    const put = jest.fn(() => ({}));
    serveMissed(put);
    answerAlert("Skip it", 2);
    await renderToday();
    await fireEvent.press(screen.getByRole("button", { name: "Skip it" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("a failed save keeps the card and says what failed", async () => {
    serve({
      "/today": missedToday,
      [PUT_PATH]: new ApiError("network", "Overload needs a connection."),
    });
    answerAlert("Skip it");
    await renderToday();
    await fireEvent.press(screen.getByRole("button", { name: "Skip it" }));
    expect(
      await screen.findByText(
        "Couldn't save — Overload needs a connection. Nothing was changed.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Legs was missed on Wednesday")).toBeTruthy();
  });

  it("Log it late starts the missed date's workout and opens it", async () => {
    const start = jest.fn(() => ({ loggedSessionId: "ls-late" }));
    serve({
      "/today": missedToday,
      "/gyms": { gyms: [{ id: "g1", name: "Downtown Gym", address: null }] },
      "/workouts": start,
    });
    await renderToday();
    await fireEvent.press(screen.getByRole("button", { name: "Log it late" }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-late"),
    );
    expect(start).toHaveBeenCalledWith({
      sessionId: "s-legs",
      scheduledFor: "2026-11-11",
      gymId: "g1",
    });
    expect(
      mockApi.request.mock.calls.filter(([p]) => p === PUT_PATH),
    ).toHaveLength(0);
  });

  it("a missed day over a week ago is named by its date", async () => {
    serve({
      "/today": todayDto({
        kind: "missed_day",
        today: "2026-11-14",
        missed: { ...missed, missedOn: "2026-11-04", daysAgo: 10 },
        below: null,
        cardio: [],
      }),
    });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    expect(
      await screen.findByText("Legs was missed on Wednesday, November 4"),
    ).toBeTruthy();
  });
});
