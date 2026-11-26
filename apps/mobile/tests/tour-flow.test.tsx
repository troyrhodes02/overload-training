/**
 * Pitch 21k spec §13 "tour-flow": the native tour on the real Expo Router,
 * with the app's own RootNavigator and the real Today, Plan, History, Goals,
 * and More route files, so every anchor here is the one the app renders. Only
 * the native tab bar (UIKit) is a stack stand-in, as in navigation.test.tsx,
 * and measurement is injected (Jest has no layout). The API is a mock that
 * records every request, so the tour's writes, and the absence of any
 * training write, are checked call by call.
 */
import { useEffect } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
} from "expo-router/testing-library";
import type { DashboardDto } from "@overload/shared/contracts/logging";
import type { TodayDto } from "@overload/shared/contracts/views";
import {
  TOUR_CONTENT,
  TOUR_LOGGING_NO_START_BODY,
  TOUR_NATIVE_BODIES,
  TOUR_NATIVE_INTRO,
} from "@overload/shared/tour/content";
import { ApiError } from "../src/api/errors";
import { createQueryClient, QUERY_KEYS } from "../src/api/queries";
import { RootNavigator } from "../src/app-state/RootNavigator";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import TodayRoute from "../src/app/(tabs)/today/index";
import PlanRoute from "../src/app/(tabs)/plan/index";
import HistoryRoute from "../src/app/(tabs)/history/index";
import GoalsRoute from "../src/app/(tabs)/goals/index";
import MoreRoute from "../src/app/(tabs)/more/index";
import {
  resetTourAutoStartForTests,
  TourProvider,
  useTour,
  type TourTiming,
} from "../src/tour/TourProvider";
import type { TourMeasure } from "../src/tour/anchors";
import type { Rect } from "../src/tour/types";
import { appConfig, meDto } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
jest.mock("../src/auth/session", () => ({
  useSession: () => ({ signOut: jest.fn() }),
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "s", Warning: "w" },
  ImpactFeedbackStyle: { Light: "l" },
}));

// Fast, but the same shape as the app's (spec RD-12).
const FAST: TourTiming = {
  pollMs: 10,
  timeoutMs: 120,
  measureMs: 40,
  settleMs: 2,
  retryMs: 50,
  trackMs: 20,
  dismissMs: 30,
};

// ── Measurement: every anchor answers a rect, unless a test says otherwise.
const DEFAULT_RECT: Rect = { x: 16, y: 180, width: 361, height: 44 };
let rects: Record<string, Rect | null> = {};
const measured: string[] = [];
const measure: TourMeasure = async (_node, name) => {
  measured.push(name);
  return name in rects ? rects[name] : DEFAULT_RECT;
};

// ── The API: Today is a pending day (Start workout) unless a test says so.
const pending = (): DashboardDto => ({
  kind: "pending",
  sessionId: "s-push",
  loggedSessionId: null,
  sessionName: "Push",
  scheduledFor: "2026-11-25",
  week: 2,
  scheduledDeloadWeek: false,
  gymName: null,
  exercises: [
    {
      name: "Barbell Bench Press",
      scheme: "3 × 6–8",
      done: false,
      exerciseId: "e1",
      isGymVariable: false,
    },
  ],
  setsLogged: 0,
  cardio: [],
});
let dashboard: DashboardDto | null = pending();
const today = (): TodayDto => ({
  today: "2026-11-25",
  greeting: "Good evening, Sam.",
  dashboard: dashboard!,
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
});

let outcomeAnswer: () => unknown = () => ({ outcome: "completed" });
function serve() {
  mockApi.request.mockImplementation(
    async (raw: string, opts: { method?: string; body?: unknown } = {}) => {
      const path = raw.replace(/\?fields=core$/, "");
      const key = `${opts.method ?? "GET"} ${path}`;
      if (key === "GET /today" && dashboard) return today();
      if (key === "PUT /me/tour/outcome") return outcomeAnswer();
      if (key === "POST /me/tour/offered") return { spent: true };
      throw new ApiError("not_found", "nope", 404);
    },
  );
}
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, o]) => o?.method && o.method !== "GET")
    .map(([p, o]) => `${o.method} ${p} ${JSON.stringify(o.body ?? null)}`);

// ── Routes: the real screens under the real root navigator.
// The tour's own start, as the More row calls it, for the refusal test.
const probe: { start: ((mode?: "manual" | "auto") => boolean) | null } = {
  start: null,
};
function Probe() {
  const { start } = useTour();
  useEffect(() => {
    probe.start = start;
  }, [start]);
  return null;
}
function TabsLayout() {
  return (
    <TourProvider measure={measure} timing={FAST}>
      <Probe />
      <Stack screenOptions={{ headerShown: false }} />
    </TourProvider>
  );
}
function label(text: string) {
  function Screen() {
    const { Text } = jest.requireActual("react-native");
    return <Text>{text}</Text>;
  }
  return Screen;
}
const routes = {
  _layout: () => <RootNavigator signedIn background="#fff" />,
  "(tabs)/_layout": TabsLayout,
  "(tabs)/today/_layout": () => <Stack />,
  "(tabs)/today/index": TodayRoute,
  "(tabs)/plan/_layout": () => <Stack />,
  "(tabs)/plan/index": PlanRoute,
  "(tabs)/history/_layout": () => <Stack />,
  "(tabs)/history/index": HistoryRoute,
  "(tabs)/goals/_layout": () => <Stack />,
  "(tabs)/goals/index": GoalsRoute,
  "(tabs)/goals/new": label("New goal form"),
  "(tabs)/more/_layout": () => <Stack />,
  "(tabs)/more/index": MoreRoute,
  "workout/[loggedSessionId]/index": label("The workout"),
};

let client: QueryClient;
let config = appConfig();
let me = meDto();
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

let appStateListener: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  rects = {};
  measured.length = 0;
  dashboard = pending();
  outcomeAnswer = () => ({ outcome: "completed" });
  config = appConfig();
  me = meDto();
  resetTourAutoStartForTests();
  client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: {
      ...defaults.queries,
      gcTime: Infinity,
      retry: false,
      staleTime: Infinity,
    },
  });
  serve();
  appStateListener = null;
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      appStateListener = listener as (s: AppStateStatus) => void;
      return { remove: () => {} } as ReturnType<
        typeof AppState.addEventListener
      >;
    });
});
afterEach(() => jest.restoreAllMocks());

async function open(initialUrl = "/more") {
  client.setQueryData(QUERY_KEYS.appConfig, config);
  client.setQueryData(QUERY_KEYS.me, me);
  const r = await renderRouter(routes, { initialUrl, wrapper: Wrapper });
  await settle(30);
  return r;
}

/** renderRouter runs on fake timers: let `ms` pass in small steps. */
async function settle(ms: number) {
  for (let t = 0; t < ms; t += 5) {
    await act(async () => {
      jest.advanceTimersByTime(5);
    });
  }
}

const cardTitle = () => screen.getByRole("header", { name: /, step \d of 9$/ });
const press = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
  await settle(40);
};
const overlay = () =>
  screen.queryByTestId("tour-overlay", { includeHiddenElements: true });
const spotlit = () =>
  screen.queryByTestId("tour-spotlight", { includeHiddenElements: true });

async function startTour() {
  await press("Take a tour, A one-minute walkthrough of the app");
  expect(screen.getByText(TOUR_NATIVE_INTRO.title)).toBeTruthy();
  await press("Start tour");
}

const steps = TOUR_CONTENT.filter(
  (s) => s.id !== "plan-import" && s.id !== "plan-billing",
);

describe("a full run", () => {
  it("goes through all nine steps on their own tabs, highlights real anchors, and Done records completed once", async () => {
    const r = await open();
    await startTour();

    const seen: { title: string; path: string; lit: boolean }[] = [];
    for (let i = 0; i < steps.length; i++) {
      seen.push({
        title: cardTitle().props.children,
        path: r.getPathname(),
        lit: spotlit() !== null,
      });
      await press(i === steps.length - 1 ? "Done" : "Next");
    }
    expect(seen).toEqual([
      { title: "Today", path: "/today", lit: true },
      { title: "Logging a workout", path: "/today", lit: true },
      { title: "Getting around", path: "/today", lit: false },
      { title: "Plan", path: "/plan", lit: true },
      { title: "History", path: "/history", lit: true },
      { title: "Goals", path: "/goals", lit: true },
      { title: "Exercises", path: "/more", lit: true },
      { title: "Gyms", path: "/more", lit: true },
      { title: "Settings", path: "/more", lit: true },
    ]);
    // Each anchored step measured its real anchor.
    for (const a of [
      "today-header",
      "today-start",
      "plan-header",
      "history-header",
      "goals-header",
      "more-exercises",
      "more-gyms",
      "more-tour",
    ]) {
      expect(measured).toContain(a);
    }
    expect(overlay()).toBeNull();
    expect(r.getPathname()).toBe("/more");
    expect(writes()).toEqual(['PUT /me/tour/outcome {"outcome":"completed"}']);
  });

  it("shows the shared words and the native adaptations", async () => {
    await open();
    await startTour();
    expect(screen.getByText(steps[0].body)).toBeTruthy();
    await press("Next");
    expect(screen.getByText(steps[1].body)).toBeTruthy();
    await press("Next");
    expect(screen.getByText(TOUR_NATIVE_BODIES.navigation!)).toBeTruthy();
    await press("Next");
    expect(screen.getByText(TOUR_NATIVE_BODIES.plan!)).toBeTruthy();
  });

  it("the app is interactive afterwards: no overlay is left to catch touches", async () => {
    const r = await open();
    await startTour();
    await press("Skip tour");
    expect(overlay()).toBeNull();
    await act(async () => router.navigate("/history"));
    await settle(20);
    expect(r.getPathname()).toBe("/history");
  });
});

describe("skip, Not now, and replay", () => {
  it("Skip mid-way records skipped once and returns to More", async () => {
    const r = await open();
    await startTour();
    await press("Next");
    await press("Next");
    await press("Next"); // on Plan
    expect(r.getPathname()).toBe("/plan");
    await press("Skip tour");
    expect(overlay()).toBeNull();
    expect(r.getPathname()).toBe("/more");
    expect(writes()).toEqual(['PUT /me/tour/outcome {"outcome":"skipped"}']);
  });

  it("Not now on the intro records nothing", async () => {
    await open();
    await press("Take a tour, A one-minute walkthrough of the app");
    await press(TOUR_NATIVE_INTRO.dismiss);
    expect(overlay()).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("replays after completion and after a skip, each recording its own outcome", async () => {
    await open();
    await startTour();
    for (let i = 0; i < steps.length; i++) {
      await press(i === steps.length - 1 ? "Done" : "Next");
    }
    await startTour();
    await press("Skip tour");
    await startTour();
    await press("Skip tour");
    expect(writes()).toEqual([
      'PUT /me/tour/outcome {"outcome":"completed"}',
      'PUT /me/tour/outcome {"outcome":"skipped"}',
      'PUT /me/tour/outcome {"outcome":"skipped"}',
    ]);
  });

  it("repeated Next and Skip taps make one move and one write", async () => {
    await open();
    await startTour();
    const next = screen.getByRole("button", { name: "Next" });
    await fireEvent.press(next);
    await fireEvent.press(next);
    await settle(40);
    expect(cardTitle().props.children).toBe("Logging a workout");
    const skip = screen.getByRole("button", { name: "Skip tour" });
    await fireEvent.press(skip);
    await fireEvent.press(skip);
    await settle(40);
    expect(writes()).toEqual(['PUT /me/tour/outcome {"outcome":"skipped"}']);
  });

  it("a failed write never shows an error, and is retried once only when offline", async () => {
    outcomeAnswer = () => {
      throw new ApiError("network", "offline");
    };
    await open();
    await startTour();
    await press("Skip tour");
    await settle(120);
    expect(writes()).toEqual([
      'PUT /me/tour/outcome {"outcome":"skipped"}',
      'PUT /me/tour/outcome {"outcome":"skipped"}',
    ]);
    expect(screen.queryByText(/offline|Couldn't/)).toBeNull();
  });
});

describe("targets that aren't there", () => {
  it("no Start button (a rest day): the logging step points at the day's block with the shared no-Start body", async () => {
    dashboard = {
      kind: "rest",
      week: 2,
      cardio: [],
    } as unknown as DashboardDto;
    await open();
    await startTour();
    await press("Next");
    expect(cardTitle().props.accessibilityHint).toBe(
      "Highlighting today's plan",
    );
    expect(screen.getByText(TOUR_LOGGING_NO_START_BODY)).toBeTruthy();
  });

  it("Today failed to load (no plan block at all): the logging step explains in words, never a highlight", async () => {
    dashboard = null;
    await open();
    await startTour();
    await press("Next");
    await settle(200);
    expect(cardTitle().props.children).toBe("Logging a workout");
    expect(spotlit()).toBeNull();
    expect(screen.getByText(TOUR_LOGGING_NO_START_BODY)).toBeTruthy();
    expect(screen.getByText("Find this in the Today tab.")).toBeTruthy();
    // Still advanceable.
    await press("Next");
    expect(cardTitle().props.children).toBe("Getting around");
  });

  it("an anchor that never measures falls back after the bounded wait", async () => {
    rects = { "goals-header": null };
    const r = await open();
    await startTour();
    for (let i = 0; i < 5; i++) await press("Next");
    await settle(200);
    expect(r.getPathname()).toBe("/goals");
    expect(cardTitle().props.children).toBe("Goals");
    expect(spotlit()).toBeNull();
    expect(screen.getByText("Find this in the Goals tab.")).toBeTruthy();
  });

  it("an anchor that mounts late is found once it is there", async () => {
    rects = { "history-header": null };
    await open();
    await startTour();
    for (let i = 0; i < 4; i++) await press("Next");
    // Locating History: not measurable yet.
    expect(screen.queryByRole("header", { name: /^History, step/ })).toBeNull();
    delete rects["history-header"];
    await settle(60);
    expect(cardTitle().props.children).toBe("History");
    expect(spotlit()).not.toBeNull();
  });

  it("a target off the window is never highlighted", async () => {
    rects = { "plan-header": { x: 16, y: 2000, width: 300, height: 40 } };
    await open();
    await startTour();
    for (let i = 0; i < 3; i++) await press("Next");
    await settle(200);
    expect(cardTitle().props.children).toBe("Plan");
    expect(spotlit()).toBeNull();
  });

  it("a tab the lifter left open is not popped: the step is shown in words", async () => {
    const r = await open("/goals");
    await act(async () => router.push("/goals/new"));
    await settle(20);
    expect(screen.getByText("New goal form")).toBeTruthy();
    await act(async () => router.navigate("/more"));
    await settle(20);
    await startTour();
    for (let i = 0; i < 5; i++) await press("Next");
    expect(cardTitle().props.children).toBe("Goals");
    expect(screen.getByText("Find this in the Goals tab.")).toBeTruthy();
    expect(r.getPathname()).not.toBe("/goals");
    await press("Skip tour");
    // The form is still there.
    await act(async () => router.navigate("/goals/new"));
    await settle(20);
    expect(screen.getByText("New goal form")).toBeTruthy();
  });
});

describe("following the target (review fixes)", () => {
  it("the ring follows a target that moves while its step is shown", async () => {
    await open();
    await startTour();
    const before = spotlit()!.props.style.top;
    rects = { "today-header": { ...DEFAULT_RECT, y: DEFAULT_RECT.y + 60 } };
    await settle(120);
    expect(spotlit()!.props.style.top).toBe(before + 60);
  });

  it("a target that disappears while shown gives way to words, never a stale ring", async () => {
    await open();
    await startTour();
    expect(spotlit()).not.toBeNull();
    rects = { "today-header": null };
    await settle(200);
    expect(spotlit()).toBeNull();
    expect(screen.getByText("Find this in the Today tab.")).toBeTruthy();
    expect(cardTitle().props.children).toBe("Today");
  });

  it("names Start or Resume for VoiceOver on the logging step", async () => {
    await open();
    await startTour();
    await press("Next");
    expect(cardTitle().props.accessibilityHint).toBe(
      "Highlighting the Start or Resume workout button",
    );
  });

  it("the overlay is told to dismiss, then unmounted", async () => {
    await open();
    await startTour();
    await fireEvent.press(screen.getByRole("button", { name: "Skip tour" }));
    await settle(5);
    const modal = screen.queryByTestId("tour-modal", {
      includeHiddenElements: true,
    });
    if (modal) expect(modal.props.visible).toBe(false);
    expect(overlay()).toBeNull();
    await settle(60);
    expect(
      screen.queryByTestId("tour-modal", { includeHiddenElements: true }),
    ).toBeNull();
  });
});

describe("interruptions", () => {
  it("backgrounding ends the run with nothing recorded", async () => {
    await open();
    await startTour();
    await press("Next");
    await act(async () => appStateListener?.("background"));
    await settle(20);
    expect(overlay()).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("an inactive moment (Control Center) does not end it", async () => {
    await open();
    await startTour();
    await act(async () => appStateListener?.("inactive"));
    await settle(20);
    expect(overlay()).not.toBeNull();
  });

  it("a navigation the tour didn't make ends it as skipped", async () => {
    await open();
    await startTour();
    await act(async () => router.navigate("/history"));
    await settle(40);
    expect(overlay()).toBeNull();
    expect(writes()).toEqual(['PUT /me/tour/outcome {"outcome":"skipped"}']);
  });

  it("refuses to start while something is over the tabs, and says why", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await open();
    await act(async () => router.push("/workout/ls-1"));
    await settle(20);
    expect(screen.getByText("The workout")).toBeTruthy();
    let started = true;
    await act(async () => {
      started = probe.start!("manual");
    });
    await settle(20);
    expect(started).toBe(false);
    expect(alert).toHaveBeenCalledWith(
      "Finish what you're doing first",
      "Then open Take a tour from More.",
    );
    expect(overlay()).toBeNull();
    // Back on More, with nothing over the tabs, it starts.
    await act(async () => router.back());
    await settle(20);
    await press("Take a tour, A one-minute walkthrough of the app");
    expect(screen.getByText(TOUR_NATIVE_INTRO.title)).toBeTruthy();
    expect(writes()).toEqual([]);
  });
});

describe("zero training data mutations", () => {
  it("a full run and a skip send nothing but the tour's own write", async () => {
    await open();
    await startTour();
    for (let i = 0; i < steps.length; i++) {
      await press(i === steps.length - 1 ? "Done" : "Next");
    }
    await startTour();
    await press("Next");
    await press("Skip tour");
    for (const [path, opts] of mockApi.request.mock.calls) {
      const method = (opts as { method?: string } | undefined)?.method ?? "GET";
      if (method !== "GET") expect(path).toBe("/me/tour/outcome");
    }
    // The highlighted Start button can't be pressed through the overlay:
    // no workout was started.
    expect(
      mockApi.request.mock.calls.some(([p]) =>
        String(p).startsWith("/workouts"),
      ),
    ).toBe(false);
  });
});

describe("the automatic first-login tour (gated, RD-15)", () => {
  it("never starts while app-config.tourAutoStart is false or missing", async () => {
    me = meDto({ tour: { autoStart: true } });
    config = appConfig({ tourAutoStart: false });
    await open("/today");
    expect(overlay()).toBeNull();
    const { tourAutoStart: _gone, ...old } = appConfig();
    void _gone;
    config = old as ReturnType<typeof appConfig>;
    await open("/today");
    expect(overlay()).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("with the gate on, a due account gets one run on Today that spends its offer", async () => {
    me = meDto({ tour: { autoStart: true } });
    config = appConfig({ tourAutoStart: true });
    await open("/today");
    expect(screen.getByText(TOUR_NATIVE_INTRO.title)).toBeTruthy();
    expect(writes()).toEqual(["POST /me/tour/offered null"]);
    await press(TOUR_NATIVE_INTRO.dismiss);
    expect(writes()).toEqual([
      "POST /me/tour/offered null",
      'PUT /me/tour/outcome {"outcome":"skipped"}',
    ]);
  });

  it("not for an account that isn't due", async () => {
    config = appConfig({ tourAutoStart: true });
    await open("/today");
    expect(overlay()).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("only on Today, and once per launch", async () => {
    config = appConfig({ tourAutoStart: true });
    me = meDto({ tour: { autoStart: true } });
    await open("/more");
    expect(screen.queryByText(TOUR_NATIVE_INTRO.title)).toBeNull();
    await act(async () => router.navigate("/today"));
    await settle(40);
    expect(screen.getByText(TOUR_NATIVE_INTRO.title)).toBeTruthy();
    await press(TOUR_NATIVE_INTRO.dismiss);
    await act(async () => router.navigate("/more"));
    await settle(20);
    await act(async () => router.navigate("/today"));
    await settle(40);
    expect(screen.queryByText(TOUR_NATIVE_INTRO.title)).toBeNull();
    expect(writes()).toEqual([
      "POST /me/tour/offered null",
      'PUT /me/tour/outcome {"outcome":"skipped"}',
    ]);
  });
});

// Last: unmounting by hand leaves Expo Router's global router unusable for
// any later render in this file.
describe("unmount", () => {
  // One test: a manual unmount leaves Expo Router's global router unusable
  // for any later render in this file.
  it("sign-out mid-locate leaves no timer behind, writes nothing, and never retries a write that was in flight", async () => {
    let release: (() => void) | null = null;
    outcomeAnswer = () =>
      new Promise((_resolve, reject) => {
        release = () => reject(new ApiError("network", "offline"));
      });
    rects = { "today-header": null };
    const r = await open();
    // A skip whose write is still in flight (offline)...
    await startTour();
    await press("Skip tour");
    // ...then a replay that is still looking for its first target...
    await startTour();
    expect(overlay()).not.toBeNull();
    // ...when the lifter signs out (the tabs unmount).
    r.unmount();
    await act(async () => release?.());
    await settle(400);
    expect(writes()).toEqual(['PUT /me/tour/outcome {"outcome":"skipped"}']);
  });
});
