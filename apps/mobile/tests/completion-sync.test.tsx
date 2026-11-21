/**
 * Checkpoint A round 2 (owner finding 1): once the server confirms a finish,
 * every screen shows the workout as done, and Resume is never offered for it.
 *
 * Runs the real screens on the real Expo Router with the app's own query
 * client and each read's own options, against a fake server that answers
 * after a delay, so
 * screens mount, unmount, and refetch the way they do on the simulator. The
 * tabs layout is NativeTabs (UIKit) in the app; a stack has the same routes.
 */
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type { DashboardTodayDto } from "@overload/shared/contracts/logging";
import type {
  LoggedWorkoutDetailViewDto,
  TodayDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { createQueryClient } from "../src/api/queries";
import { markTodayComplete, markWeekComplete } from "../src/api/training";
import { RootNavigator } from "../src/app-state/RootNavigator";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import TodayRoute from "../src/app/(tabs)/today/index";
import HistoryRoute from "../src/app/(tabs)/history/index";
import LoggedWorkoutRoute from "../src/app/(tabs)/history/[loggedSessionId]";
import WorkoutRoute from "../src/app/workout/[loggedSessionId]/index";
import SummaryRoute from "../src/app/workout/[loggedSessionId]/summary";
import { card, rows, view, workout } from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "s", Warning: "w" },
  ImpactFeedbackStyle: { Light: "l" },
}));

const ID = "ls-1";
const savedRows = rows(3).map((r, i) => ({
  ...r,
  loggedSetId: `set-${i + 1}`,
  weightLbs: 255,
  reps: 5,
  saved: true,
}));

/** One workout on a fake server: in progress until POST …/complete. */
type Server = {
  status: "in_progress" | "complete";
  /** How long each answer takes (ms). */
  latency: number;
  /** Per-path latency (ms), e.g. a slow `GET /today` on a cold server. */
  slow: Record<string, number>;
  completeCalls: number;
  /** Make the next completion fail with this error, once. */
  failNextComplete: ApiError | null;
  requests: string[];
};
let server: Server;

const day = (): DashboardTodayDto => ({
  kind: server.status,
  sessionId: "s-push",
  loggedSessionId: ID,
  sessionName: "Push",
  scheduledFor: "2026-11-14",
  week: 3,
  scheduledDeloadWeek: false,
  gymName: "Downtown Gym",
  exercises: [
    {
      name: "Barbell Bench Press",
      scheme: "3 × 3–5",
      done: true,
      exerciseId: "ex-bench",
      isGymVariable: false,
    },
  ],
  setsLogged: 3,
  cardio: [],
});

const todayDto = (): TodayDto => ({
  today: "2026-11-14",
  greeting: "Good morning, Sam.",
  dashboard: day(),
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
});

const historyWeek = (): HistoryWeekDto => ({
  weekStart: "2026-11-09",
  weekEnd: "2026-11-15",
  rangeLabel: "Nov 9 – 15",
  thisWeekStart: "2026-11-09",
  isThisWeek: true,
  prevWeekStart: null,
  nextWeekStart: null,
  view: {
    kind: "active",
    blockName: "Block 2",
    weekNumber: 3,
    lengthWeeks: 5,
    days: [
      {
        dateIso: "2026-11-14",
        dayLabel: "Sat, Nov 14",
        sessionName: "Push",
        state: server.status,
        loggedSessionId: ID,
      },
    ],
    cardio: [],
  },
  earlierBlocks: [],
  hasAnyHistory: true,
});

const detail = (): LoggedWorkoutDetailViewDto => ({
  detail: {
    loggedSessionId: ID,
    sessionName: "Push",
    dateIso: "2026-11-14",
    dateLabel: "Sat, Nov 14",
    gymName: "Downtown Gym",
    exercises: [
      {
        loggedExerciseId: "le-bench",
        exerciseId: "ex-bench",
        historyHref: "",
        performedName: "Barbell Bench Press",
        plannedName: "Barbell Bench Press",
        swapped: false,
        archived: false,
        skipped: false,
        requiresExternalWeight: true,
        plannedSets: 3,
        sets: savedRows.map((r) => ({
          loggedSetId: r.loggedSetId!,
          setNumber: r.setNumber,
          weightLbs: 255,
          reps: 5,
          rir: null,
          extra: false,
        })),
      },
    ],
  },
  summary: null,
  goals: [],
});

function answer(path: string, method: string): unknown {
  if (method === "POST" && path === `/workouts/${ID}/complete`) {
    server.completeCalls += 1;
    if (server.failNextComplete) {
      const e = server.failNextComplete;
      server.failNextComplete = null;
      throw e;
    }
    server.status = "complete";
    return { loggedSessionId: ID, status: "complete" };
  }
  if (path === "/today") return todayDto();
  if (path === `/workouts/${ID}`) {
    return view(
      workout({
        loggedSessionId: ID,
        status: server.status,
        complete: server.status === "complete",
        exercises: [card({ sets: savedRows })],
      }),
    );
  }
  if (path === "/history") return historyWeek();
  if (path === `/history/${ID}`) return detail();
  throw new ApiError("not_found", "nope", 404);
}

function serve() {
  mockApi.request.mockImplementation(
    (raw: string, opts: { method?: string; signal?: AbortSignal } = {}) => {
      const method = opts.method ?? "GET";
      server.requests.push(`${method} ${raw}`);
      // Answered the same with or without the core-fields query (RD-28).
      const path = raw.replace(/\?fields=core$/, "");
      return new Promise((resolve, reject) => {
        // The answer reflects the server at the moment it is read, after the
        // round trip, like a real request.
        setTimeout(
          () => {
            try {
              resolve(answer(path, method));
            } catch (e) {
              reject(e);
            }
          },
          server.slow[`${method} ${path}`] ?? server.latency,
        );
      });
    },
  );
}

const routes = {
  _layout: () => <RootNavigator signedIn background="#fff" />,
  "(tabs)/_layout": () => <Stack screenOptions={{ headerShown: false }} />,
  "(tabs)/today/_layout": () => <Stack />,
  "(tabs)/today/index": TodayRoute,
  "(tabs)/history/_layout": () => <Stack />,
  "(tabs)/history/index": HistoryRoute,
  "(tabs)/history/[loggedSessionId]": LoggedWorkoutRoute,
  "workout/[loggedSessionId]/index": WorkoutRoute,
  "workout/[loggedSessionId]/summary": SummaryRoute,
};

function makeWrapper() {
  // The app's own client and defaults (staleTime 0); only garbage collection
  // is off, so Jest exits when the tests finish.
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, gcTime: Infinity, retry: false },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 59, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ThemeProvider>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }
  return { client, Wrapper };
}

/**
 * Today (in progress) → Resume → the workout, as on the simulator: Today and
 * History have both been opened, so both are mounted under the workout.
 */
async function openWorkoutFromToday({ visitHistory = true } = {}) {
  const { client, Wrapper } = makeWrapper();
  await renderRouter(routes, { initialUrl: "/today", wrapper: Wrapper });
  await screen.findByText("Resume workout");
  if (visitHistory) {
    await act(async () => {
      router.push("/history");
    });
    await screen.findByText("In progress");
    await act(async () => {
      router.push("/today");
    });
    await screen.findByText("Resume workout");
  }
  await fireEvent.press(screen.getByText("Resume workout"));
  await screen.findByText("Finish workout");
  return { client };
}

async function finish() {
  await fireEvent.press(screen.getByText("Finish workout"));
  await screen.findByText("Push complete");
}

/**
 * renderRouter runs on Jest's fake timers: let `ms` of fake time pass in
 * small steps, so each answer's promise chain settles before the next step.
 */
async function settle(ms: number) {
  for (let t = 0; t < ms; t += 10) {
    await act(async () => {
      jest.advanceTimersByTime(10);
    });
  }
}

const noResume = () => expect(screen.queryByText("Resume workout")).toBeNull();

beforeEach(() => {
  jest.clearAllMocks();
  server = {
    status: "in_progress",
    latency: 30,
    slow: {},
    completeCalls: 0,
    failNextComplete: null,
    requests: [],
  };
  serve();
});

describe("after the server confirms a finish", () => {
  it("Summary → View in History opens the finished workout, read-only, with no Resume", async () => {
    await openWorkoutFromToday();
    await finish();
    await fireEvent.press(screen.getByText("View in History"));
    await screen.findAllByText("Set 1");
    noResume();
    // Still none once every in-flight read has landed.
    await settle(200);
    noResume();
    expect(server.completeCalls).toBe(1);
  });

  it("Summary → Done → Today shows Done and View workout, which opens read-only details", async () => {
    await openWorkoutFromToday();
    // Today's refetch is still on its way: it must not decide the button.
    server.slow["GET /today"] = 3000;
    await finish();
    await fireEvent.press(screen.getByText("Done"));
    expect(screen.getByText("View workout")).toBeTruthy();
    noResume();
    await fireEvent.press(screen.getByText("View workout"));
    await screen.findAllByText("Set 1");
    noResume();
    await settle(200);
    noResume();
  });

  it("the History tab shows the workout as Done right after finishing", async () => {
    await openWorkoutFromToday();
    // History's refetch is still on its way when the tab opens.
    server.slow["GET /history"] = 3000;
    await finish();
    await fireEvent.press(screen.getByText("Done"));
    await act(async () => {
      router.push("/history");
    });
    expect(screen.queryByText("In progress")).toBeNull();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("the History tab, never opened before, shows Done", async () => {
    await openWorkoutFromToday({ visitHistory: false });
    await finish();
    await fireEvent.press(screen.getByText("Done"));
    await act(async () => {
      router.push("/history");
    });
    await screen.findByText("Done");
    expect(screen.queryByText("In progress")).toBeNull();
  });

  it("opening the finished workout again shows it finished, not the logging card", async () => {
    await openWorkoutFromToday();
    server.slow[`GET /workouts/${ID}`] = 3000;
    await finish();
    await fireEvent.press(screen.getByText("Done"));
    await act(async () => {
      router.push(`/workout/${ID}`);
    });
    // Right away, before the workout's refetch can answer: never the card.
    expect(screen.queryByText("Finish workout")).toBeNull();
    await screen.findByText("This workout is finished.");
  });

  it("coming back from the background keeps the finished state", async () => {
    await openWorkoutFromToday();
    await finish();
    await fireEvent.press(screen.getByText("Done"));
    await screen.findByText("View workout");

    // What connectQueryManagers does on AppState background → active.
    await act(async () => focusManager.setFocused(false));

    await act(async () => focusManager.setFocused(true));

    noResume();
    await settle(200);
    expect(screen.getByText("View workout")).toBeTruthy();
    noResume();
    focusManager.setFocused(undefined);
  });

  it("a failed finish changes nothing, and a retry finishes once", async () => {
    await openWorkoutFromToday();
    server.failNextComplete = new ApiError("network", "offline");
    await fireEvent.press(screen.getByText("Finish workout"));
    await screen.findByText(
      "Couldn't finish — Overload needs a connection. Your sets are saved.",
    );
    expect(screen.queryByText("Push complete")).toBeNull();
    expect(server.status).toBe("in_progress");
    await finish();
    expect(server.completeCalls).toBe(2);
    expect(server.status).toBe("complete");
  });

  it("a double tap on Finish sends one completion", async () => {
    await openWorkoutFromToday();
    const button = screen.getByText("Finish workout");
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await screen.findByText("Push complete");
    expect(server.completeCalls).toBe(1);
  });
});

describe("what the app asks for", () => {
  it("Finish asks the server once for Today; Done reuses that answer", async () => {
    await openWorkoutFromToday();
    const n0 = server.requests.length;
    await finish();
    await fireEvent.press(screen.getByText("Done"));
    await settle(300);
    const after = server.requests.slice(n0);
    expect(
      after.filter((r) => r === "POST /workouts/ls-1/complete"),
    ).toHaveLength(1);
    // Today's own read once; its planned-list calls (Pitch 21g OVE-230) are
    // one separate read when Today is shown again, never more.
    expect(after.filter((r) => r === "GET /today?fields=core")).toHaveLength(1);
    expect(after.filter((r) => r === "GET /today").length).toBeLessThanOrEqual(
      1,
    );
    expect(screen.getByText("View workout")).toBeTruthy();
  });

  it("logging and History read the core fields; the calls are one separate read (RD-28, 21g RD-1/RD-2)", async () => {
    await openWorkoutFromToday();
    const opened = server.requests.filter((r) => r.startsWith("GET "));
    // The runner: the core read for logging, and ONE separate gated read
    // for the cards' calls.
    expect(opened).toContain(`GET /workouts/${ID}?fields=core`);
    expect(opened.filter((r) => r === `GET /workouts/${ID}`)).toHaveLength(1);
    const n0 = server.requests.length;
    await finish();
    // Finishing never asks for the finished runner's "today" calls again.
    expect(
      server.requests.slice(n0).filter((r) => r === `GET /workouts/${ID}`),
    ).toHaveLength(0);
    await fireEvent.press(screen.getByText("View in History"));
    await screen.findAllByText("Set 1");
    const gets = server.requests.filter((r) => r.startsWith("GET "));
    // Today and the History record still open on the core fields; Today's
    // planned-list calls (Pitch 21g OVE-230) are their own, separate read.
    expect(gets).toContain("GET /today?fields=core");
    expect(gets).toContain(`GET /history/${ID}?fields=core`);
    // The week list has no calls to leave out.
    expect(gets).toContain("GET /history");
  });
});

describe("before the server confirms", () => {
  it("nothing is shown as done while the finish is in flight", async () => {
    await openWorkoutFromToday();
    server.latency = 300;
    fireEvent.press(screen.getByText("Finish workout"));
    await settle(100);
    expect(screen.queryByText("Push complete")).toBeNull();
    expect(server.status).toBe("in_progress");
    await waitFor(() => screen.getByText("Push complete"), { timeout: 2000 });
  });
});

describe("recording a confirmed finish in cached reads", () => {
  it("Today: the shown day, or the day below a missed one, and nothing else", () => {
    server = { ...server, status: "in_progress" };
    const t = todayDto();
    expect(markTodayComplete(t, ID).dashboard).toMatchObject({
      kind: "complete",
    });
    expect(markTodayComplete(t, "other").dashboard).toMatchObject({
      kind: "in_progress",
    });
    const missed: TodayDto = {
      ...t,
      dashboard: {
        kind: "missed_day",
        today: "2026-11-14",
        missed: {
          mesocycleId: "m",
          sessionId: "s",
          sessionName: "Upper",
          missedOn: "2026-11-13",
          daysAgo: 1,
        },
        below: day(),
        cardio: [],
      },
    };
    const done = markTodayComplete(missed, ID).dashboard;
    expect(done.kind === "missed_day" && done.below?.kind).toBe("complete");
  });

  it("History: only that workout's row, in this block's weeks and past blocks'", () => {
    server = { ...server, status: "in_progress" };
    const week = markWeekComplete(historyWeek(), ID);
    expect(week.view.kind === "active" && week.view.days[0].state).toBe(
      "complete",
    );
    const other = markWeekComplete(historyWeek(), "other").view;
    expect(other.kind === "active" && other.days[0].state).toBe("in_progress");
    const logged: HistoryWeekDto = {
      ...historyWeek(),
      view: {
        kind: "logged",
        blocks: [],
        days: [
          {
            dateIso: "2026-07-08",
            dayLabel: "Wed, Jul 8",
            workouts: [
              {
                mesocycleId: "m1",
                name: "Block 1",
                status: "archived",
                loggedSessionId: ID,
                sessionName: "Push",
                state: "in_progress",
              },
              {
                mesocycleId: "m1",
                name: "Block 1",
                status: "archived",
                loggedSessionId: "ls-2",
                sessionName: "Pull",
                state: "in_progress",
              },
            ],
            cardio: [],
          },
        ],
      },
    };
    const v = markWeekComplete(logged, ID).view;
    expect(
      v.kind === "logged" && v.days[0].workouts.map((w) => w.state),
    ).toEqual(["complete", "in_progress"]);
  });
});
