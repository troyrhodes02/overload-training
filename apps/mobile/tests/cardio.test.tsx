/**
 * Pitch 21f (OVE-218): logging and correcting cardio. Cardio is two facts, an
 * activity and whole minutes. It is recorded once per planned day at the
 * server (a repeat never overwrites), shown only after the server's answer,
 * and never changes the day's lifting state.
 */
import { Alert } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type {
  DashboardDto,
  DashboardTodayDto,
} from "@overload/shared/contracts/logging";
import type { TodayDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import {
  cardioContextLine,
  cardioHref,
  cardioTarget,
  parseCardioParams,
  plannedComparison,
  type CardioTarget,
} from "../src/cardio/cardio-model";
import { CardioScreen } from "../src/cardio/CardioScreen";
import { HistoryScreen, historyRows } from "../src/history/HistoryScreen";
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
jest.mock("expo-router", () => {
  const { createElement, Fragment } =
    jest.requireActual<typeof import("react")>("react");
  return {
    // The modal's Cancel and Save live in its native header: render them.
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
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, opts]) => opts?.method && opts.method !== "GET")
    .map(([path, opts]) => [opts.method, path, opts.body]);

const entry = (
  over: Partial<CardioOccurrenceDto> = {},
): CardioOccurrenceDto => ({
  mesocycleId: "m-1",
  scheduledFor: "2026-11-14",
  dateIso: "2026-11-14",
  dateLabel: "Sat, Nov 14",
  planned: { type: "Incline Walk", durationMin: 20 },
  state: "pending",
  log: null,
  differsFromPlan: false,
  ...over,
});
const logged = (type = "Incline Walk", durationMin = 25) =>
  entry({
    state: "complete",
    log: { id: "c-1", type, durationMin },
    differsFromPlan: type !== "Incline Walk" || durationMin !== 20,
  });

const LOG_TARGET: CardioTarget = {
  mode: "log",
  mesocycleId: "m-1",
  scheduledFor: "2026-11-14",
  dateLabel: "Sat, Nov 14",
  planned: { type: "Incline Walk", durationMin: 20 },
};
const LOG_HREF =
  "/cardio?mesocycleId=m-1&scheduledFor=2026-11-14&dateLabel=Sat%2C%20Nov%2014&plannedType=Incline%20Walk&plannedMin=20";
const EDIT_HREF =
  "/cardio?cardioLogId=c-1&type=Incline%20Walk&durationMin=25&dateLabel=Sat%2C%20Nov%2014&plannedType=Incline%20Walk&plannedMin=20";

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("what a cardio line can do", () => {
  it("a due day can be logged: today, or a missed day", () => {
    expect(cardioTarget(entry())).toEqual(LOG_TARGET);
    expect(cardioTarget(entry({ state: "missed" }))?.mode).toBe("log");
  });

  it("a record opens for correction, with its plan", () => {
    expect(cardioTarget(logged())).toEqual({
      mode: "edit",
      cardioLogId: "c-1",
      dateLabel: "Sat, Nov 14",
      logged: { type: "Incline Walk", durationMin: 25 },
      planned: { type: "Incline Walk", durationMin: 20 },
    });
  });

  it("a day that hasn't come can't be opened", () => {
    expect(cardioTarget(entry({ state: "upcoming" }))).toBeNull();
  });

  it("names the plan only when the record differs from it", () => {
    expect(plannedComparison(entry())).toBeNull();
    expect(plannedComparison(logged("Incline Walk", 20))).toBeNull();
    expect(plannedComparison(logged("Incline Walk", 25))).toBe(
      "Planned 20 min",
    );
    expect(plannedComparison(logged("Bike", 20))).toBe(
      "Planned Incline Walk · 20 min",
    );
  });
});

describe("the cardio route's parameters", () => {
  const parse = (href: string) =>
    parseCardioParams(
      Object.fromEntries(new URLSearchParams(href.split("?")[1])),
    );

  it("carry a target there and back, whatever the activity is called", () => {
    const targets: CardioTarget[] = [
      LOG_TARGET,
      {
        mode: "edit",
        cardioLogId: "c-9",
        dateLabel: "Wed, Jul 8",
        logged: { type: "Rowing & stairs / 50%", durationMin: 45 },
        planned: null,
      },
      {
        mode: "edit",
        cardioLogId: "c-1",
        dateLabel: "Sat, Nov 14",
        logged: { type: "Incline Walk", durationMin: 25 },
        planned: { type: "Incline Walk", durationMin: 20 },
      },
    ];
    for (const target of targets) {
      expect(parse(cardioHref(target))).toEqual(target);
    }
    expect(cardioHref(LOG_TARGET)).toBe(LOG_HREF);
  });

  it("refuse anything that isn't a whole target", () => {
    expect(parseCardioParams({})).toBeNull();
    expect(
      parseCardioParams({ mesocycleId: "m-1", scheduledFor: "2026-11-14" }),
    ).toBeNull();
    expect(
      parseCardioParams({ cardioLogId: "c-1", type: "Bike", durationMin: "x" }),
    ).toBeNull();
  });

  it("the context line names the day, and the plan when it is known", () => {
    expect(cardioContextLine(LOG_TARGET)).toBe(
      "Sat, Nov 14 · Planned Incline Walk · 20 min",
    );
    expect(
      cardioContextLine({
        mode: "edit",
        cardioLogId: "c",
        dateLabel: "Wed, Jul 8",
        logged: { type: "Run", durationMin: 30 },
        planned: null,
      }),
    ).toBe("Wed, Jul 8");
  });
});

const day = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
  kind: "pending",
  sessionId: "s-push",
  loggedSessionId: null,
  sessionName: "Push",
  scheduledFor: "2026-11-14",
  week: 3,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [],
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

async function openToday(dashboard: DashboardDto) {
  serve({ "/today": todayDto(dashboard) });
  await render(
    <Providers>
      <TodayView />
    </Providers>,
  );
  await screen.findByText("Good morning, Sam.");
}

describe("cardio on Today", () => {
  it("beside lifting: the plan with Log, and lifting keeps the primary action", async () => {
    await openToday(day({ cardio: [entry()] }));
    expect(screen.getByText("Also today")).toBeTruthy();
    expect(screen.getByText("Incline Walk · 20 min")).toBeTruthy();
    expect(screen.getByText("Planned cardio")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start workout" })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Log cardio: Incline Walk, Sat, Nov 14",
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(LOG_HREF);
    expect(writes()).toEqual([]);
  });

  it("logged: the record, the plan when it differs, and a tap to correct", async () => {
    await openToday(day({ cardio: [logged()] }));
    expect(screen.getByText("Incline Walk · 25 min")).toBeTruthy();
    expect(screen.getByText("Planned 20 min")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Log cardio/ })).toBeNull();
    const row = screen.getByRole("button", {
      name: "Cardio logged: Incline Walk, 25 minutes, Sat, Nov 14",
    });
    expect(row.props.accessibilityHint).toBe("Opens this cardio to correct it");
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith(EDIT_HREF);
  });

  it("logged as planned says only that it is logged", async () => {
    await openToday(day({ cardio: [logged("Incline Walk", 20)] }));
    expect(screen.getByText("Cardio · logged")).toBeTruthy();
    expect(screen.queryByText(/^Planned /)).toBeNull();
  });

  it("a cardio-only day: the cardio is the day, with the primary action", async () => {
    await openToday({ kind: "rest", week: 4, cardio: [entry()] });
    expect(screen.getByRole("header", { name: "Cardio" })).toBeTruthy();
    expect(screen.getByText("Week 4")).toBeTruthy();
    expect(screen.getByText("No lifting planned today.")).toBeTruthy();
    expect(screen.queryByText("Rest day")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^Log cardio/ }));
    expect(mockRouter.push).toHaveBeenCalledWith(LOG_HREF);
  });

  it("two cardio entries each get their own button, named", async () => {
    await openToday({
      kind: "rest",
      week: 4,
      cardio: [
        entry(),
        entry({
          scheduledFor: "2026-11-13",
          planned: { type: "Bike", durationMin: 30 },
        }),
      ],
    });
    expect(screen.getByText("Log Incline Walk")).toBeTruthy();
    expect(screen.getByText("Log Bike")).toBeTruthy();
  });

  it("a cardio-only day already logged reads as complete, still correctable", async () => {
    await openToday({ kind: "rest", week: 4, cardio: [logged()] });
    expect(
      screen.getByRole("header", { name: "Cardio complete" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Log cardio/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Cardio logged: Incline Walk/ }),
    ).toBeTruthy();
  });

  it("a rest day with no cardio is still a rest day", async () => {
    await openToday({ kind: "rest", week: 4, cardio: [] });
    expect(screen.getByText("Rest day")).toBeTruthy();
  });

  it("a missed lifting day never blocks cardio", async () => {
    await openToday({
      kind: "missed_day",
      today: "2026-11-14",
      missed: {
        mesocycleId: "m-1",
        sessionId: "s-legs",
        sessionName: "Legs",
        missedOn: "2026-11-13",
        daysAgo: 1,
      },
      below: day(),
      cardio: [entry()],
    });
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Log cardio: Incline Walk, Sat, Nov 14",
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(LOG_HREF);
  });
});

describe("C1 Cardio", () => {
  async function openForm(target: CardioTarget | null = LOG_TARGET) {
    await render(
      <Providers>
        <CardioScreen target={target} />
      </Providers>,
    );
  }
  const save = () => screen.getByRole("button", { name: "Save" });
  const PUT = "/mesocycles/m-1/cardio-logs/2026-11-14";

  it("opens on the plan and records what was done, once", async () => {
    serve({ [PUT]: { cardioLogId: "c-1", alreadyLogged: false } });
    await openForm();
    expect(
      screen.getByText("Sat, Nov 14 · Planned Incline Walk · 20 min"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Activity").props.value).toBe("Incline Walk");
    expect(screen.getByLabelText("Minutes").props.value).toBe("20");
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "25");
    await fireEvent.press(save());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      ["PUT", PUT, { type: "Incline Walk", durationMin: 25 }],
    ]);
  });

  it("a suggestion fills the activity; any activity can be typed", async () => {
    serve({ [PUT]: { cardioLogId: "c-1", alreadyLogged: false } });
    await openForm();
    await fireEvent.press(
      screen.getByRole("button", { name: "Use Stair Climber" }),
    );
    expect(screen.getByLabelText("Activity").props.value).toBe("Stair Climber");
    await fireEvent.changeText(
      screen.getByLabelText("Activity"),
      "  Sled push ",
    );
    await fireEvent.press(save());
    await waitFor(() => expect(writes()).toHaveLength(1));
    // Trimmed by the shared rule, exactly as the server stores it.
    expect(writes()[0]![2]).toEqual({ type: "Sled push", durationMin: 20 });
  });

  it("shows the shared messages under their fields and sends nothing", async () => {
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Activity"), "   ");
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "0");
    await fireEvent.press(save());
    expect(await screen.findByText("Enter the activity.")).toBeTruthy();
    expect(screen.getByText("Enter whole minutes, 1 or more.")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Activity"),
      "x".repeat(41),
    );
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "601");
    await fireEvent.press(save());
    expect(
      await screen.findByText("Keep it to 40 characters or fewer."),
    ).toBeTruthy();
    expect(screen.getByText("Keep it to 600 minutes or fewer.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "1.5");
    await fireEvent.press(save());
    expect(
      await screen.findByText("Enter whole minutes, 1 or more."),
    ).toBeTruthy();
    expect(writes()).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("already logged: says so, overwrites nothing, and closes on OK", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => buttons?.[0]?.onPress?.());
    serve({ [PUT]: { cardioLogId: "c-1", alreadyLogged: true } });
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "45");
    await fireEvent.press(save());
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0]!.slice(0, 2)).toEqual([
      "Already logged",
      "This cardio was recorded earlier. Tap it to correct it.",
    ]);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    // One request only: nothing tried to overwrite the stored record.
    expect(writes()).toHaveLength(1);
  });

  it("a failed save keeps the form; the retry records it once", async () => {
    let online = false;
    serve({
      [PUT]: () => {
        if (!online) throw new ApiError("network", "offline");
        return { cardioLogId: "c-1", alreadyLogged: false };
      },
    });
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Activity"), "Bike");
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "30");
    await fireEvent.press(save());
    expect(
      await screen.findByText(
        "Couldn't save — Overload needs a connection. Your entries are still here.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Activity").props.value).toBe("Bike");
    expect(screen.getByLabelText("Minutes").props.value).toBe("30");
    expect(mockRouter.back).not.toHaveBeenCalled();
    online = true;
    await fireEvent.press(save());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(2);
    expect(writes()[1]![2]).toEqual({ type: "Bike", durationMin: 30 });
  });

  it("the server's refusal is shown in its own words", async () => {
    serve({
      [PUT]: new ApiError(
        "invalid_state_transition",
        "That cardio isn't due yet.",
        400,
      ),
    });
    await openForm();
    await fireEvent.press(save());
    expect(await screen.findByText("That cardio isn't due yet.")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("the server's field errors land under their fields", async () => {
    serve({
      [PUT]: new ApiError(
        "validation_error",
        "Check the highlighted fields.",
        400,
        {
          durationMin: "Keep it to 600 minutes or fewer.",
        },
      ),
    });
    await openForm();
    await fireEvent.press(save());
    expect(
      await screen.findByText("Keep it to 600 minutes or fewer."),
    ).toBeTruthy();
  });

  it("correcting opens on the record and changes only it", async () => {
    serve({ "/cardio-logs/c-1": { cardioLogId: "c-1" } });
    await openForm({
      mode: "edit",
      cardioLogId: "c-1",
      dateLabel: "Sat, Nov 14",
      logged: { type: "Incline Walk", durationMin: 25 },
      planned: { type: "Incline Walk", durationMin: 20 },
    });
    expect(screen.getByLabelText("Activity").props.value).toBe("Incline Walk");
    expect(screen.getByLabelText("Minutes").props.value).toBe("25");
    await fireEvent.changeText(screen.getByLabelText("Activity"), "Treadmill");
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "32");
    await fireEvent.press(save());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      ["PATCH", "/cardio-logs/c-1", { type: "Treadmill", durationMin: 32 }],
    ]);
  });

  it("Cancel closes and sends nothing", async () => {
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Minutes"), "99");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([]);
  });

  it("without a whole target it says so and offers a way out", async () => {
    await openForm(null);
    expect(screen.getByText("This cardio isn't available.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("cardio in History", () => {
  const week = (cardio: CardioOccurrenceDto[]): HistoryWeekDto => ({
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    rangeLabel: "Nov 9 – 15",
    thisWeekStart: "2026-11-09",
    isThisWeek: true,
    prevWeekStart: null,
    nextWeekStart: null,
    view: {
      kind: "active",
      blockName: "Block 3",
      weekNumber: 2,
      lengthWeeks: 5,
      days: [],
      cardio,
    },
    earlierBlocks: [],
    hasAnyHistory: true,
  });
  const cardioRows = (w: HistoryWeekDto) =>
    historyRows(w).flatMap((r) => (r.kind === "cardio" ? [r] : []));

  it("each line carries what it can do: correct, log, or nothing yet", () => {
    const rows = cardioRows(
      week([
        logged(),
        entry({
          scheduledFor: "2026-11-12",
          dateIso: "2026-11-12",
          state: "missed",
        }),
        entry({
          scheduledFor: "2026-11-15",
          dateIso: "2026-11-15",
          state: "upcoming",
        }),
      ]),
    );
    expect(rows.map((r) => [r.state, r.target?.mode ?? null])).toEqual([
      ["Missed", "log"],
      ["Done", "edit"],
      ["Upcoming", null],
    ]);
  });

  it("an earlier block's record can be corrected, by its id", () => {
    const rows = cardioRows({
      ...week([]),
      view: {
        kind: "logged",
        blocks: [],
        days: [
          {
            dateIso: "2026-07-08",
            dayLabel: "Wed, Jul 8",
            workouts: [],
            cardio: [
              {
                mesocycleId: "m-0",
                name: "Block 1",
                status: "archived",
                cardioLogId: "c-old",
                type: "Run",
                durationMin: 30,
              },
            ],
          },
        ],
      },
    });
    expect(rows[0]!.target).toEqual({
      mode: "edit",
      cardioLogId: "c-old",
      dateLabel: "Wed, Jul 8",
      logged: { type: "Run", durationMin: 30 },
      planned: null,
    });
  });

  it("rows open the cardio form; an upcoming day isn't pressable", async () => {
    serve({
      "/history": week([
        logged(),
        entry({
          scheduledFor: "2026-11-12",
          dateIso: "2026-11-12",
          dateLabel: "Thu, Nov 12",
          state: "missed",
        }),
        entry({
          scheduledFor: "2026-11-15",
          dateIso: "2026-11-15",
          dateLabel: "Sun, Nov 15",
          state: "upcoming",
        }),
      ]),
    });
    await render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    const done = await screen.findByRole("button", {
      name: "Incline Walk · 25 min, Sat, Nov 14, Done",
    });
    expect(done.props.accessibilityHint).toBe(
      "Opens this cardio to correct it",
    );
    await fireEvent.press(done);
    expect(mockRouter.push).toHaveBeenLastCalledWith(EDIT_HREF);
    const missed = screen.getByRole("button", {
      name: "Incline Walk · 20 min, Thu, Nov 12, Missed",
    });
    expect(missed.props.accessibilityHint).toBe("Opens this cardio to log it");
    await fireEvent.press(missed);
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      "/cardio?mesocycleId=m-1&scheduledFor=2026-11-12&dateLabel=Thu%2C%20Nov%2012&plannedType=Incline%20Walk&plannedMin=20",
    );
    expect(
      screen.queryByRole("button", { name: /Sun, Nov 15, Upcoming$/ }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Incline Walk · 20 min, Sun, Nov 15, Upcoming"),
    ).toBeTruthy();
  });
});
