/**
 * OVE-241 (chore spec §3–§4): this week's strip on native Today. Every state
 * and "can this move" is the server's; each change is confirmed, sent once,
 * and shown only after the server answers; a stale week offers Reload.
 */
import { Alert } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { DashboardTodayDto } from "@overload/shared/contracts/logging";
import type {
  ThisWeekDay,
  ThisWeekDto,
  ThisWeekWorkout,
} from "@overload/shared/contracts/schedule";
import type { TodayDto } from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { TodayView } from "../src/today/TodayView";
import {
  afterSwapLines,
  cellLabel,
  dayActions,
  dayLabel,
  swapOptions,
  weekHeading,
} from "../src/today/week-model";
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
jest.mock("../src/ui/haptics", () => ({
  haptic: {
    light: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
  },
}));

const TODAY = "2026-11-24";
const workout = (
  name: string,
  scheduledFor: string,
  over: Partial<ThisWeekWorkout> = {},
): ThisWeekWorkout => ({
  sessionId: `s-${name.toLowerCase().replace(/\s/g, "-")}`,
  scheduledFor,
  sessionName: name,
  state: "upcoming",
  loggedSessionId: null,
  movedFrom: null,
  adjustable: scheduledFor >= TODAY,
  exercises: [{ name: "Barbell Bench Press", scheme: "3 × 6–8" }],
  ...over,
});
const LABELS: [string, string, string][] = [
  ["2026-11-23", "Mon", "23"],
  ["2026-11-24", "Tue", "24"],
  ["2026-11-25", "Wed", "25"],
  ["2026-11-26", "Thu", "26"],
  ["2026-11-27", "Fri", "27"],
  ["2026-11-28", "Sat", "28"],
  ["2026-11-29", "Sun", "29"],
];
function weekOf(
  workouts: Record<string, ThisWeekWorkout | null>,
  over: Partial<ThisWeekDto> = {},
): ThisWeekDto {
  const days: ThisWeekDay[] = LABELS.map(([iso, wd, n]) => ({
    dateIso: iso,
    weekday: wd,
    dayOfMonth: n,
    dayLabel: `${wd}, Nov ${n}`,
    isToday: iso === TODAY,
    isPast: iso < TODAY,
    workout: workouts[iso] ?? null,
    skipped: [],
  }));
  return {
    mesocycleId: "m-1",
    weekNumber: 3,
    lengthWeeks: 5,
    rangeLabel: "Nov 23 – 29",
    scheduledDeloadWeek: false,
    today: TODAY,
    days,
    blockedReason: null,
    ...over,
  };
}

const UPPER_A = workout("Upper A", "2026-11-24");
const LOWER_A = workout("Lower A", "2026-11-25");
const UPPER_B = workout("Upper B", "2026-11-27");
const WEEK = weekOf({
  "2026-11-23": workout("Lower B", "2026-11-23", {
    state: "complete",
    loggedSessionId: "ls-done",
    adjustable: false,
  }),
  [TODAY]: UPPER_A,
  "2026-11-25": LOWER_A,
  "2026-11-27": UPPER_B,
});

const pending = (over: Partial<DashboardTodayDto> = {}): DashboardTodayDto => ({
  kind: "pending",
  sessionId: "s-upper-a",
  loggedSessionId: null,
  sessionName: "Upper A",
  scheduledFor: TODAY,
  week: 3,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [],
  setsLogged: 0,
  cardio: [],
  ...over,
});
const todayDto = (dashboard: TodayDto["dashboard"]): TodayDto => ({
  today: TODAY,
  greeting: "Good morning, Sam.",
  dashboard,
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
});

type Opts = { method?: string; body?: unknown };
function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (raw: string, opts: Opts = {}) => {
    const path = raw.replace(/\?fields=core$/, "");
    const key = `${opts.method ?? "GET"} ${path}`;
    const r = key in routes ? routes[key] : routes[path];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? (r as (o: Opts) => unknown)(opts) : r;
  });
}
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, o]) => o?.method && o.method !== "GET")
    .map(([p, o]) => ({ path: p as string, body: (o as Opts).body }));

function pressAlertButton(text: string) {
  const alert = Alert.alert as jest.Mock;
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as {
    text: string;
    onPress?: () => void;
  }[];
  buttons.find((b) => b.text === text)!.onPress!();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("week model", () => {
  it("labels days in the web strip's words", () => {
    const [mon, tue, wed, thu] = WEEK.days;
    expect([cellLabel(mon), cellLabel(tue), cellLabel(thu)]).toEqual([
      "Lower B",
      "Upper A",
      "Rest",
    ]);
    expect(dayLabel(tue)).toBe("Tue, Nov 24, today, Upper A, planned");
    expect(dayLabel(mon)).toBe("Mon, Nov 23, Lower B, done");
    expect(weekHeading({ ...WEEK, scheduledDeloadWeek: true })).toBe(
      "This week · Week 3 of 5 · Deload week",
    );
    expect(dayActions(WEEK, wed)).toMatchObject({
      trainToday: false,
      swap: true,
      skip: true,
      takenNote:
        "Today already has Upper A. To train Lower A today, swap the two days.",
    });
  });

  it("offers Train today only when today is free; nothing while a missed day waits", () => {
    const free = weekOf({ "2026-11-25": LOWER_A });
    expect(dayActions(free, free.days[2])).toMatchObject({
      trainToday: true,
      takenNote: null,
    });
    const blocked = {
      ...WEEK,
      blockedReason:
        "Answer the missed workout first, then you can change this week.",
    };
    expect(dayActions(blocked, blocked.days[2])).toEqual({
      trainToday: false,
      swap: false,
      skip: false,
      takenNote: null,
    });
  });

  it("lists swap days from today on, finished or started ones disabled", () => {
    const started = weekOf({
      [TODAY]: workout("Upper A", TODAY, {
        state: "in_progress",
        adjustable: false,
        loggedSessionId: "ls-1",
      }),
      "2026-11-25": LOWER_A,
    });
    const opts = swapOptions(started, started.days[2]);
    expect(opts.map((o) => [o.label, o.holds, o.blocked])).toEqual([
      ["Today", "Upper A", "started"],
      ["Thu, Nov 26", "Rest", null],
      ["Fri, Nov 27", "Rest", null],
      ["Sat, Nov 28", "Rest", null],
      ["Sun, Nov 29", "Rest", null],
    ]);
    expect(afterSwapLines(WEEK.days[2], LOWER_A, WEEK.days[3])).toEqual([
      "Wed, Nov 25: Rest",
      "Thu, Nov 26: Lower A",
    ]);
  });
});

describe("Today's week strip", () => {
  async function renderToday(routes: Record<string, unknown>) {
    serve(routes);
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    await screen.findByText("This week · Week 3 of 5");
  }

  it("shows seven days with today selected and Today's block under it", async () => {
    await renderToday({
      "/today": todayDto(pending()),
      "/this-week": { week: WEEK },
    });
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(
      screen.getByRole("tab", { name: "Tue, Nov 24, today, Upper A, planned" })
        .props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByRole("button", { name: "Swap day" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip workout" })).toBeTruthy();
  });

  it("selecting another day previews it and writes nothing", async () => {
    await renderToday({
      "/today": todayDto(pending()),
      "/this-week": { week: WEEK },
    });
    await fireEvent.press(
      screen.getByRole("tab", { name: "Wed, Nov 25, Lower A, planned" }),
    );
    expect(screen.getByTestId("week-day-preview")).toBeTruthy();
    expect(screen.getAllByText("Lower A")).toHaveLength(2); // the cell and the preview
    expect(screen.queryByRole("button", { name: "Train today" })).toBeNull();
    expect(
      screen.getByText(
        "Today already has Upper A. To train Lower A today, swap the two days.",
      ),
    ).toBeTruthy();
    expect(writes()).toEqual([]);
    await fireEvent.press(
      screen.getByRole("button", { name: "Back to today" }),
    );
    expect(screen.queryByTestId("week-day-preview")).toBeNull();
  });

  it("Skip asks first, then sends once and says so", async () => {
    await renderToday({
      "/today": todayDto(pending()),
      "/this-week": { week: WEEK },
      "POST /mesocycles/m-1/schedule/skip": {
        missedOn: "2026-11-25",
        outcome: "skipped",
      },
    });
    await fireEvent.press(
      screen.getByRole("tab", { name: "Wed, Nov 25, Lower A, planned" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Skip workout" }));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Skip Lower A this week?",
      "Lower A on Wed, Nov 25 is marked skipped. It won't come back as a missed workout, and next week is unchanged. A skip can't be undone.",
      expect.any(Array),
    );
    expect(writes()).toEqual([]);
    pressAlertButton("Skip workout");
    expect(await screen.findByText("Lower A skipped this week.")).toBeTruthy();
    expect(writes()).toEqual([
      {
        path: "/mesocycles/m-1/schedule/skip",
        body: { sessionId: "s-lower-a", scheduledFor: "2026-11-25" },
      },
    ]);
  });

  it("Train today moves the workout, then runs the usual start for it", async () => {
    const free = weekOf({ "2026-11-25": LOWER_A });
    await renderToday({
      "/today": todayDto({ kind: "rest", week: 3, cardio: [] } as never),
      "/this-week": { week: free },
      "POST /mesocycles/m-1/schedule/move": { status: "moved" },
      "/gyms": { gyms: [{ id: "g-1", name: "Downtown Gym", address: null }] },
      "POST /workouts": { loggedSessionId: "ls-new" },
    });
    await fireEvent.press(
      screen.getByRole("tab", { name: "Wed, Nov 25, Lower A, planned" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Train today" }));
    pressAlertButton("Move to today");
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/workout/ls-new"),
    );
    expect(writes()).toEqual([
      {
        path: "/mesocycles/m-1/schedule/move",
        body: {
          sessionId: "s-lower-a",
          scheduledFor: "2026-11-25",
          from: "2026-11-25",
          to: TODAY,
          occupant: null,
        },
      },
      {
        path: "/workouts",
        body: {
          sessionId: "s-lower-a",
          scheduledFor: "2026-11-25",
          gymId: "g-1",
        },
      },
    ]);
  });

  it("Swap day: choose a day, see the week after, confirm once", async () => {
    await renderToday({
      "/today": todayDto(pending()),
      "/this-week": { week: WEEK },
      "POST /mesocycles/m-1/schedule/move": { status: "moved" },
    });
    await fireEvent.press(screen.getByRole("button", { name: "Swap day" }));
    expect(await screen.findByText("Swap Upper A with…")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("radio", { name: "Wed, Nov 25, Lower A" }),
    );
    expect(screen.getByText("Today: Lower A")).toBeTruthy();
    expect(screen.getByText("Wed, Nov 25: Upper A")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Swap days" }));
    expect(
      await screen.findByText("Week updated. Next week is unchanged."),
    ).toBeTruthy();
    expect(writes()).toEqual([
      {
        path: "/mesocycles/m-1/schedule/move",
        body: {
          sessionId: "s-upper-a",
          scheduledFor: TODAY,
          from: TODAY,
          to: "2026-11-25",
          occupant: { sessionId: "s-lower-a", scheduledFor: "2026-11-25" },
        },
      },
    ]);
  });

  it("a stale week is refused in the server's words, with Reload", async () => {
    await renderToday({
      "/today": todayDto(pending()),
      "/this-week": { week: WEEK },
      "POST /mesocycles/m-1/schedule/skip": new ApiError(
        "conflict",
        "Your week changed. Reload to see it, then try again.",
        409,
      ),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Skip workout" }));
    pressAlertButton("Skip workout");
    expect(
      await screen.findByText(
        "Your week changed. Reload to see it, then try again.",
      ),
    ).toBeTruthy();
    const before = mockApi.request.mock.calls.length;
    await fireEvent.press(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(mockApi.request.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("no active block week: Today is exactly as before, with no strip", async () => {
    serve({ "/today": todayDto(pending()), "/this-week": { week: null } });
    await render(
      <Providers>
        <TodayView />
      </Providers>,
    );
    expect(await screen.findByText("Good morning, Sam.")).toBeTruthy();
    expect(screen.queryByText(/^This week/)).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
