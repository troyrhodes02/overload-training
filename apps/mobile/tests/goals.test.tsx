/**
 * Pitch 21i design G1–G3 (spec §12 "Mobile"): goals render the server's
 * numbers, a reached goal's card is acknowledged on the server and celebrated
 * once, and archiving asks first and has no undo.
 */
import { Alert } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  ActiveGoalDto,
  GoalDetailDto,
  GoalsOverviewDto,
} from "@overload/shared/contracts/goals";
import { ApiError } from "../src/api/errors";
import { GoalsScreen } from "../src/goals/GoalsScreen";
import { GoalScreen } from "../src/goals/GoalScreen";
import { GoalHistoryScreen } from "../src/goals/GoalHistoryScreen";
import {
  activeGoalLabel,
  archivedNote,
  firstSightOfReached,
  newGoalHref,
  newGoalTarget,
  progressText,
  reachedCopy,
  resetCelebrated,
  scopeFootnote,
} from "../src/goals/goal-model";
import { resetNotices, useNotice } from "../src/ui/notice-store";
import { haptic } from "../src/ui/haptics";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
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

type Call = { method?: string; body?: unknown };
function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string, opts: Call = {}) => {
    const key = `${opts.method ?? "GET"} ${path}`;
    const r = routes[key];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? (r as (o: Call) => unknown)(opts) : r;
  });
}
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, o]) => o?.method && o.method !== "GET")
    .map(([p, o]) => ({ path: p as string, ...(o as Call) }));

const context = {
  exerciseArchived: false,
  gymId: null,
  gymName: null,
  gymArchived: false,
  createdAtIso: "2026-10-12T15:00:00.000Z",
  createdLabel: "Oct 12, 2026",
};
const BENCH: ActiveGoalDto = {
  ...context,
  goalId: "goal-bench",
  exerciseId: "ex-bench",
  exerciseName: "Barbell Bench Press",
  targetWeightLbs: 225,
  targetReps: 5,
  targetLabel: "225 lb × 5",
  percent: 85,
  targetE1rm: 263,
  best: {
    e1rm: 224,
    weightLbs: 195,
    reps: 5,
    dateIso: "2026-11-18",
    dateLabel: "Nov 18",
  },
};
const LEG_PRESS: ActiveGoalDto = {
  ...context,
  goalId: "goal-leg",
  exerciseId: "ex-leg",
  exerciseName: "Leg Press",
  gymId: "gym-downtown",
  gymName: "Downtown Gym",
  targetWeightLbs: 400,
  targetReps: 10,
  targetLabel: "400 lb × 10",
  percent: null,
  targetE1rm: 533,
  best: null,
};
const OVERVIEW: GoalsOverviewDto = {
  reached: [
    {
      ...context,
      goalId: "goal-dead",
      exerciseId: "ex-dead",
      exerciseName: "Deadlift",
      targetWeightLbs: 405,
      targetReps: 1,
      targetLabel: "405 lb × 1",
      alreadyReached: false,
      newGoalHref: "/goals/new/ex-dead",
    },
  ],
  active: [BENCH, LEG_PRESS],
  historyCount: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  resetNotices();
  resetCelebrated();
});

describe("goal model", () => {
  it("prints the server's percent, or the web's words when unmeasured", () => {
    expect(progressText(BENCH)).toBe("85%");
    expect(progressText(LEG_PRESS)).toBe("No performance recorded yet");
    expect(activeGoalLabel(LEG_PRESS)).toBe(
      "Leg Press · Downtown Gym, 400 pounds times 10, no performance recorded yet",
    );
  });

  it("sets a new goal on the same lift, with its gym only while active", () => {
    expect(newGoalTarget(LEG_PRESS)).toEqual({
      kind: "exercise",
      exerciseId: "ex-leg",
      gymId: "gym-downtown",
    });
    expect(newGoalTarget({ ...LEG_PRESS, gymArchived: true })).toEqual({
      kind: "exercise",
      exerciseId: "ex-leg",
      gymId: null,
    });
    expect(newGoalTarget({ ...BENCH, exerciseArchived: true })).toEqual({
      kind: "pick",
    });
    expect(newGoalHref(newGoalTarget(LEG_PRESS))).toBe(
      "/goal-new?exerciseId=ex-leg&gymId=gym-downtown&from=goals",
    );
    expect(newGoalHref({ kind: "pick" })).toBe("/goals/new");
  });

  it("says the web's words for reached, scope, and archived notes", () => {
    expect(reachedCopy({ ...LEG_PRESS, alreadyReached: true })).toEqual({
      title: "Goal reached",
      line: "Leg Press · 400 lb × 10 at Downtown Gym",
      note: "Your history already meets this target.",
    });
    expect(scopeFootnote(BENCH)).toMatch(/^Best session across all gyms/);
    expect(scopeFootnote(LEG_PRESS)).toMatch(
      /^Only sessions at Downtown Gym count/,
    );
    expect(archivedNote(BENCH)).toBeNull();
    expect(archivedNote({ ...LEG_PRESS, gymArchived: true })).toMatch(
      /^Downtown Gym is archived/,
    );
  });

  it("celebrates a reached goal once per app session", () => {
    expect(firstSightOfReached("g1")).toBe(true);
    expect(firstSightOfReached("g1")).toBe(false);
    resetCelebrated();
    expect(firstSightOfReached("g1")).toBe(true);
  });
});

describe("G1 Goals", () => {
  it("shows the reached card, the active goals, and the history row", async () => {
    serve({ "GET /goals": OVERVIEW });
    await render(
      <Providers>
        <GoalsScreen />
      </Providers>,
    );
    expect(await screen.findByText("Goal reached")).toBeTruthy();
    expect(screen.getByText("Deadlift · 405 lb × 1")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("No performance recorded yet")).toBeTruthy();
    expect(screen.getByText("Leg Press · Downtown Gym")).toBeTruthy();
    expect(haptic.success).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole("button", { name: activeGoalLabel(BENCH) }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/goals/goal-bench");
    await fireEvent.press(screen.getByRole("button", { name: "New goal" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/goals/new");
  });

  it("Done acknowledges the card on the server", async () => {
    serve({
      "GET /goals": OVERVIEW,
      "PUT /goals/goal-dead/acknowledged": {
        id: "goal-dead",
        acknowledged: true,
      },
    });
    await render(
      <Providers>
        <GoalsScreen />
      </Providers>,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          path: "/goals/goal-dead/acknowledged",
          method: "PUT",
          body: { acknowledged: true },
        },
      ]),
    );
  });

  it("Set a new goal acknowledges and opens the form for the same lift", async () => {
    serve({
      "GET /goals": OVERVIEW,
      "PUT /goals/goal-dead/acknowledged": {
        id: "goal-dead",
        acknowledged: true,
      },
    });
    await render(
      <Providers>
        <GoalsScreen />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Set a new goal" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/goal-new?exerciseId=ex-dead&from=goals",
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
  });

  it("an account with no goals sees the empty state and New goal", async () => {
    serve({ "GET /goals": { reached: [], active: [], historyCount: 0 } });
    await render(
      <Providers>
        <GoalsScreen />
      </Providers>,
    );
    expect(await screen.findByText("No goals yet.")).toBeTruthy();
    expect(screen.queryByText("Goal history")).toBeNull();
    expect(screen.getByRole("button", { name: "New goal" })).toBeTruthy();
  });

  it("a failed load is an error state, never an empty list", async () => {
    serve({ "GET /goals": new ApiError("network", "offline", 0) });
    await render(
      <Providers>
        <GoalsScreen />
      </Providers>,
    );
    expect(
      await screen.findByRole("button", { name: /try again/i }),
    ).toBeTruthy();
    expect(screen.queryByText("No goals yet.")).toBeNull();
  });
});

describe("G3 Goal", () => {
  const ACTIVE: GoalDetailDto = { kind: "active", ...BENCH };

  it("shows the server's best and target, and archives only after confirming", async () => {
    serve({
      "GET /goals/goal-bench": ACTIVE,
      "PUT /goals/goal-bench/archived": {
        id: "goal-bench",
        archived: true,
        outcome: "manual",
      },
    });
    const alert = jest.spyOn(Alert, "alert");
    function NoticeProbe() {
      const n = useNotice("goals");
      return n ? <>{n.message}</> : null;
    }
    await render(
      <Providers>
        <GoalScreen goalId="goal-bench" />
        <NoticeProbe />
      </Providers>,
    );
    expect(await screen.findByText("224 lb e1RM")).toBeTruthy();
    expect(screen.getByText("from 195 × 5 · Nov 18")).toBeTruthy();
    expect(screen.getByText("263 lb e1RM")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Exercise history" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/goals/exercise-history/ex-bench",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Archive goal" }));
    expect(alert).toHaveBeenCalledWith(
      "Archive this goal?",
      "Barbell Bench Press 225 lb × 5 moves to your goal history. This can't be undone.",
      expect.any(Array),
    );
    expect(writes()).toEqual([]);
    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find((b) => b.text === "Archive")!.onPress!();
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(writes()).toEqual([
      {
        path: "/goals/goal-bench/archived",
        method: "PUT",
        body: { archived: true },
      },
    ]);
  });

  it("a machine goal's history opens at its gym", async () => {
    serve({ "GET /goals/goal-leg": { kind: "active", ...LEG_PRESS } });
    await render(
      <Providers>
        <GoalScreen goalId="goal-leg" />
      </Providers>,
    );
    expect(
      await screen.findByText("No performance recorded yet at Downtown Gym."),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Exercise history" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/goals/exercise-history/ex-leg?scope=gym-downtown",
    );
  });

  it("an archived goal shows its outcome and offers a new goal when allowed", async () => {
    serve({
      "GET /goals/goal-old": {
        kind: "archived",
        ...BENCH,
        goalId: "goal-old",
        outcome: "manual",
        archivedAtIso: "2026-11-03T15:00:00.000Z",
        archivedLabel: "Nov 3, 2026",
        unacknowledged: false,
        alreadyReached: false,
        newGoalHref: "/goals/new/ex-bench",
      },
    });
    await render(
      <Providers>
        <GoalScreen goalId="goal-old" />
      </Providers>,
    );
    expect(await screen.findAllByText("Archived Nov 3, 2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive goal" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Set a new goal" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/goal-new?exerciseId=ex-bench&from=goals",
    );
  });

  it("another account's or a missing goal reads as unavailable", async () => {
    serve({});
    await render(
      <Providers>
        <GoalScreen goalId="nope" />
      </Providers>,
    );
    expect(await screen.findByText("This goal isn't available")).toBeTruthy();
  });
});

describe("G2 Goal history", () => {
  it("lists reached and archived goals with their outcomes", async () => {
    serve({
      "GET /goals/history": {
        goals: [
          {
            ...LEG_PRESS,
            outcome: "completed",
            archivedAtIso: "2026-11-20T15:00:00.000Z",
            archivedLabel: "Nov 20, 2026",
            gymArchived: true,
          },
        ],
      },
    });
    await render(
      <Providers>
        <GoalHistoryScreen />
      </Providers>,
    );
    expect(
      await screen.findByText("Leg Press · Downtown Gym (archived)"),
    ).toBeTruthy();
    expect(screen.getByText("400 lb × 10 · Reached Nov 20, 2026")).toBeTruthy();
  });
});
