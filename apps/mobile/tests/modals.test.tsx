/**
 * Pitch 21f (RD-13): the three modals on the real Expo Router, with the
 * app's own RootNavigator and route files. A modal opens over the screen that
 * asked for it, which stays mounted underneath (so a typed draft survives),
 * and going back returns to that screen. This also pins the route names the
 * navigator registers against the files that exist.
 */
import { ActionSheetIOS } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
} from "expo-router/testing-library";
import type {
  LoggedWorkoutDetailViewDto,
  TodayDto,
} from "@overload/shared/contracts/views";
import { ApiError } from "../src/api/errors";
import { createQueryClient } from "../src/api/queries";
import { RootNavigator } from "../src/app-state/RootNavigator";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import CardioRoute from "../src/app/cardio";
import TodayRoute from "../src/app/(tabs)/today/index";
import LoggedWorkoutRoute from "../src/app/(tabs)/history/[loggedSessionId]";
import WorkoutRoute from "../src/app/workout/[loggedSessionId]/index";
import EditSetRoute from "../src/app/workout/[loggedSessionId]/edit-set";
import SwapRoute from "../src/app/workout/[loggedSessionId]/swap";
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
const partly = () =>
  view(
    workout({
      loggedSessionId: ID,
      gymLocked: true,
      exercises: [
        card({
          sets: rows(3).map((r) =>
            r.setNumber === 1
              ? {
                  ...r,
                  loggedSetId: "set-1",
                  weightLbs: 255,
                  reps: 5,
                  rir: 2,
                  saved: true,
                }
              : r,
          ),
        }),
        card({
          loggedExerciseId: "le-row",
          performedExerciseName: "Seated Cable Rows",
          plannedExerciseName: "Seated Cable Rows",
        }),
      ],
    }),
  );

const record = (): LoggedWorkoutDetailViewDto => ({
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
        sets: [
          {
            loggedSetId: "set-1",
            setNumber: 1,
            weightLbs: 255,
            reps: 5,
            rir: 2,
            extra: false,
          },
        ],
      },
    ],
  },
  summary: null,
  goals: [],
});

const today = (): TodayDto => ({
  today: "2026-11-14",
  greeting: "Good morning, Sam.",
  dashboard: {
    kind: "rest",
    week: 3,
    cardio: [
      {
        mesocycleId: "m-1",
        scheduledFor: "2026-11-14",
        dateIso: "2026-11-14",
        dateLabel: "Sat, Nov 14",
        planned: { type: "Incline Walk", durationMin: 20 },
        state: "pending",
        log: null,
        differsFromPlan: false,
      },
    ],
  },
  plannedProgression: [],
  sessionSummary: null,
  sessionGoals: [],
  goals: null,
});

function serve() {
  mockApi.request.mockImplementation(async (raw: string) => {
    const path = raw.replace(/\?fields=core$/, "");
    if (path === `/workouts/${ID}`) return partly();
    if (path === `/history/${ID}`) return record();
    if (path === "/today") return today();
    if (path === "/logged-exercises/le-row/swap-candidates") {
      return {
        loggedExerciseId: "le-row",
        plannedExerciseName: "Seated Cable Rows",
        plannedMuscle: "back",
        primaryMuscleLabel: "Back",
        selectedMuscle: "back",
        selectedMuscleLabel: "Back",
        swapLocked: false,
        candidates: [{ id: "x", name: "Bent Over Row", isFavorite: false }],
      };
    }
    throw new ApiError("not_found", "nope", 404);
  });
}

const routes = {
  _layout: () => <RootNavigator signedIn background="#fff" />,
  "(tabs)/_layout": () => <Stack screenOptions={{ headerShown: false }} />,
  "(tabs)/today/_layout": () => <Stack />,
  "(tabs)/today/index": TodayRoute,
  "(tabs)/history/_layout": () => <Stack />,
  "(tabs)/history/[loggedSessionId]": LoggedWorkoutRoute,
  "workout/[loggedSessionId]/index": WorkoutRoute,
  "workout/[loggedSessionId]/swap": SwapRoute,
  "workout/[loggedSessionId]/edit-set": EditSetRoute,
  cardio: CardioRoute,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, gcTime: Infinity, retry: false },
  });
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

const open = (initialUrl: string) =>
  renderRouter(routes, { initialUrl, wrapper: Wrapper });
const back = () =>
  act(async () => {
    router.back();
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  serve();
});

describe("modals over the workout", () => {
  it("Edit set opens over the workout and back returns to it with the draft intact", async () => {
    await open(`/workout/${ID}`);
    await fireEvent.changeText(await screen.findByLabelText("Set 2 reps"), "6");
    await fireEvent.press(
      screen.getByLabelText(
        "Set 1, 255 pounds, 5 reps, 2 reps in reserve, logged",
      ),
    );
    // The stored values, read from the workout the screen already holds.
    expect((await screen.findByLabelText("Weight (lbs)")).props.value).toBe(
      "255",
    );
    expect(screen.getByLabelText("Reps").props.value).toBe("5");
    await back();
    // The workout was never unmounted: what was typed is still there.
    expect(screen.getByLabelText("Set 2 reps").props.value).toBe("6");
    expect(screen.queryByLabelText("Weight (lbs)")).toBeNull();
  });

  it("Swap opens for the exercise that asked, and back changes nothing", async () => {
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((options, callback) =>
        callback(options.options.indexOf("Swap exercise")),
      );
    await open(`/workout/${ID}`);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Next: Seated Cable Rows" }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "More for Seated Cable Rows" }),
    );
    expect(
      await screen.findByText("Instead of Seated Cable Rows"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bent Over Row" })).toBeTruthy();
    await back();
    expect(screen.queryByText("Instead of Seated Cable Rows")).toBeNull();
    expect(
      screen.getByRole("header", { name: "Seated Cable Rows" }),
    ).toBeTruthy();
    // Only reads were made.
    expect(mockApi.request.mock.calls.every(([, o]) => !o?.method)).toBe(true);
  });
});

describe("modals over History and Today", () => {
  it("a set in the logged workout opens Edit set on the record's values", async () => {
    await open(`/history/${ID}`);
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Set 1, 255 lbs × 5 · 2 RIR",
      }),
    );
    expect((await screen.findByLabelText("Reps")).props.value).toBe("5");
    expect(screen.getByText("Saturday, November 14")).toBeTruthy();
    await back();
    expect(
      screen.getByRole("button", { name: "Set 1, 255 lbs × 5 · 2 RIR" }),
    ).toBeTruthy();
  });

  it("Log cardio opens the form on the plan, and back returns to Today", async () => {
    await open("/today");
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Log cardio: Incline Walk, Sat, Nov 14",
      }),
    );
    expect((await screen.findByLabelText("Minutes")).props.value).toBe("20");
    expect(screen.getByLabelText("Activity").props.value).toBe("Incline Walk");
    expect(
      screen.getByText("Sat, Nov 14 · Planned Incline Walk · 20 min"),
    ).toBeTruthy();
    await back();
    expect(screen.queryByLabelText("Minutes")).toBeNull();
    expect(screen.getByRole("header", { name: "Cardio" })).toBeTruthy();
  });

  it("the cardio route without a whole target says so", async () => {
    await open("/cardio?cardioLogId=c-1");
    expect(
      await screen.findByText("This cardio isn't available."),
    ).toBeTruthy();
  });
});
