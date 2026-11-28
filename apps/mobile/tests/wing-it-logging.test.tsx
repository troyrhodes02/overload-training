/**
 * Pitch 25 defect (owner acceptance): on the iPhone a Wing-It exercise logged
 * Set 1 and then offered no Set 2. The native loop, end to end, against a fake
 * server that answers exactly as the real one builds a Wing-It workout (saved
 * sets plus one open row; `plannedSets` = rows sent; `openEnded`). The app
 * does NOT re-read the workout after a confirmed set (it only marks it stale),
 * so the next set must come from the server's confirmation itself — which is
 * what these tests pin: Set N+1 is editable right after Set N's 200.
 */
import { AccessibilityInfo, Appearance } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  ExerciseCardDto,
  LoggedWorkoutDetailDto,
} from "@overload/shared/contracts/logging";
import type {
  LoggedSetDto,
  LoggedWorkoutDetailViewDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { LEGACY_OPEN_REP_RANGE } from "@overload/shared/logging/wing-it";
import { ApiError } from "../src/api/errors";
import { Providers } from "./harness";
import { WorkoutScreen } from "../src/workout/WorkoutScreen";
import { LoggedWorkoutScreen } from "../src/history/LoggedWorkoutScreen";
import { requestCardFocus } from "../src/workout/focus-request";
import { card, rows, view, workout } from "./fixtures/workout";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismissAll: jest.fn(),
};
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "s", Warning: "w" },
  ImpactFeedbackStyle: { Light: "l" },
}));

type StoredSet = {
  id: string;
  setNumber: number;
  weightLbs: number;
  reps: number;
  rir: number | null;
};
type Lift = { id: string; exerciseId: string; name: string; sets: StoredSet[] };

/** A fake server holding one Wing-It workout, answering like the real one. */
function wingItServer() {
  const lifts: Lift[] = [];
  let status: "in_progress" | "complete" = "in_progress";
  const puts: { loggedExerciseId: string; setNumber: number; body: unknown }[] =
    [];
  let failNext: ApiError | null = null;

  const cardOf = (l: Lift): ExerciseCardDto => {
    const saved = l.sets.map((s) => ({
      setNumber: s.setNumber,
      loggedSetId: s.id,
      weightLbs: s.weightLbs,
      reps: s.reps,
      rir: s.rir,
      saved: true,
      extra: false,
    }));
    const open =
      status === "in_progress"
        ? [{ ...rows(1)[0]!, setNumber: l.sets.length + 1 }]
        : [];
    const sets = [...saved, ...open];
    return card({
      loggedExerciseId: l.id,
      performedExerciseId: l.exerciseId,
      performedExerciseName: l.name,
      plannedExerciseName: l.name,
      gymName: "Harbor Barbell",
      openEnded: true,
      plannedSets: sets.length,
      plannedRepRange: { ...LEGACY_OPEN_REP_RANGE },
      suggestedWeightLbs: null,
      previousPerformance: null,
      referencePerformance: null,
      weightContext: "none",
      sets,
    });
  };
  const workoutView = (): WorkoutViewDto =>
    view(
      workout({
        loggedSessionId: "ls-w",
        kind: "wing_it",
        sessionName: "Wing-It workout",
        gymName: "Harbor Barbell",
        gymLocked: lifts.some((l) => l.sets.length > 0),
        status,
        exercises: lifts.map(cardOf),
        complete: status === "complete",
      }),
    );
  const detail = (): LoggedWorkoutDetailViewDto => ({
    detail: {
      loggedSessionId: "ls-w",
      kind: "wing_it",
      sessionName: "Wing-It workout",
      dateIso: "2026-11-14",
      dateLabel: "Sat, Nov 14",
      gymName: "Harbor Barbell",
      exercises: lifts
        .filter((l) => l.sets.length > 0)
        .map((l): LoggedWorkoutDetailDto["exercises"][number] => ({
          loggedExerciseId: l.id,
          exerciseId: l.exerciseId,
          historyHref: `/exercises/${l.exerciseId}`,
          performedName: l.name,
          plannedName: l.name,
          swapped: false,
          archived: false,
          skipped: false,
          requiresExternalWeight: true,
          plannedSets: l.sets.length,
          openEnded: true,
          sets: l.sets.map((s) => ({
            loggedSetId: s.id,
            setNumber: s.setNumber,
            weightLbs: s.weightLbs,
            reps: s.reps,
            rir: s.rir,
            extra: false,
          })),
        })),
    },
    summary: null,
    goals: [],
  });

  mockApi.request.mockImplementation(
    async (raw: string, opts: { method?: string; body?: unknown } = {}) => {
      const path = raw.replace(/\?fields=core$/, "");
      if (path === "/workouts/ls-w") return workoutView();
      if (path === "/history/ls-w") return detail();
      const set = path.match(/^\/logged-exercises\/([^/]+)\/sets\/(\d+)$/);
      if (set && opts.method === "PUT") {
        const [, id, n] = set;
        const body = opts.body as {
          weightLbs: number;
          reps: number;
          rir?: number | null;
        };
        puts.push({ loggedExerciseId: id!, setNumber: Number(n), body });
        if (failNext) {
          const e = failNext;
          failNext = null;
          throw e;
        }
        const lift = lifts.find((l) => l.id === id);
        if (!lift) throw new ApiError("not_found", "nope", 404);
        const existing = lift.sets.find((s) => s.setNumber === Number(n));
        const stored: StoredSet = existing ?? {
          id: `${id}-s${n}`,
          setNumber: Number(n),
          weightLbs: body.weightLbs,
          reps: body.reps,
          rir: body.rir ?? null,
        };
        if (!existing) lift.sets.push(stored);
        const dto: LoggedSetDto = {
          ...stored,
          loggedExerciseId: id!,
          createdAt: "2026-11-14T15:00:00.000Z",
          updatedAt: "2026-11-14T15:00:00.000Z",
        };
        return dto;
      }
      if (path === "/workouts/ls-w/complete") {
        status = "complete";
        return { loggedSessionId: "ls-w", status: "complete" };
      }
      throw new ApiError("not_found", `unserved ${path}`, 404);
    },
  );
  return {
    lifts,
    puts,
    add(id: string, name: string) {
      lifts.push({ id, exerciseId: `x-${id}`, name, sets: [] });
    },
    failNextPut(e: ApiError) {
      failNext = e;
    },
  };
}

async function openWorkout() {
  const r = await render(
    <Providers>
      <WorkoutScreen loggedSessionId="ls-w" />
    </Providers>,
  );
  return r;
}

/** Type a set's numbers and press Log set; resolves once the server answered. */
async function logSet(n: number, weight: string, reps: string, rir?: string) {
  const weightBox = await screen.findByLabelText(`Set ${n} weight in pounds`);
  await fireEvent.changeText(weightBox, weight);
  await fireEvent.changeText(screen.getByLabelText(`Set ${n} reps`), reps);
  if (rir) await fireEvent.press(screen.getByRole("button", { name: rir }));
  await fireEvent.press(
    screen.getAllByRole("button", { name: `Log set ${n}` })[0]!,
  );
  await screen.findByLabelText(new RegExp(`^Set ${n}, .* logged`));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light");
  jest
    .spyOn(AccessibilityInfo, "isScreenReaderEnabled")
    .mockResolvedValue(false);
});

describe("a Wing-It exercise logs set after set on the iPhone", () => {
  it("Set 1 → Set 2 → Set 3 each become editable right after the server confirms the one before", async () => {
    const server = wingItServer();
    server.add("le-a", "Leg Press");
    await openWorkout();
    await screen.findByText("Leg Press");

    await logSet(1, "200", "10");
    // The next set is ready from the confirmation alone: no re-read.
    expect(screen.getByLabelText("Set 2 weight in pounds")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Log set 2" })[0],
    ).toBeTruthy();
    expect(screen.queryByText(/sets logged\.$/)).toBeNull();

    await logSet(2, "210", "8");
    expect(screen.getByLabelText("Set 3 weight in pounds")).toBeTruthy();
    await logSet(3, "220", "6");
    expect(screen.getByLabelText("Set 4 weight in pounds")).toBeTruthy();

    expect(
      server.lifts[0]!.sets.map((s) => [s.setNumber, s.weightLbs, s.reps]),
    ).toEqual([
      [1, 200, 10],
      [2, 210, 8],
      [3, 220, 6],
    ]);
    expect(server.puts.map((p) => p.setNumber)).toEqual([1, 2, 3]);
    // Proven without a re-read: the cards' read (`?fields=core`) ran once,
    // on opening; each next set came from the server's confirmation.
    expect(
      mockApi.request.mock.calls.filter(
        ([path]) => path === "/workouts/ls-w?fields=core",
      ),
    ).toHaveLength(1);
  });

  it("the next set's Log set control is a labelled button a screen reader reaches", async () => {
    const server = wingItServer();
    server.add("le-a", "Leg Press");
    await openWorkout();
    await logSet(1, "200", "10");
    const next = screen.getAllByRole("button", { name: "Log set 2" })[0]!;
    expect(next.props.accessibilityState?.disabled).not.toBe(true);
    expect(
      screen.getByLabelText("Set 2 weight in pounds").props.editable,
    ).not.toBe(false);
  });

  it("a second exercise added mid-workout logs several sets; the first keeps its sets", async () => {
    const server = wingItServer();
    server.add("le-a", "Leg Press");
    const r = await openWorkout();
    await logSet(1, "200", "10");
    await logSet(2, "210", "8");
    // The picker added a second exercise (the add re-reads the workout) and
    // asked for its card.
    server.add("le-b", "Cable Fly");
    await r.unmount();
    await openWorkout();
    await act(async () => requestCardFocus("ls-w", "le-b"));
    await screen.findByRole("header", { name: "Cable Fly" });
    await logSet(1, "30", "12");
    await logSet(2, "30", "11");
    expect(screen.getByLabelText("Set 3 weight in pounds")).toBeTruthy();
    expect(server.lifts.map((l) => [l.name, l.sets.length])).toEqual([
      ["Leg Press", 2],
      ["Cable Fly", 2],
    ]);
  });

  it("resuming an in-progress workout opens on the next available set", async () => {
    const server = wingItServer();
    server.add("le-a", "Leg Press");
    server.lifts[0]!.sets.push(
      { id: "s1", setNumber: 1, weightLbs: 200, reps: 10, rir: null },
      { id: "s2", setNumber: 2, weightLbs: 210, reps: 8, rir: 2 },
    );
    await openWorkout();
    expect(await screen.findByLabelText("Set 3 weight in pounds")).toBeTruthy();
    expect(screen.getByLabelText(/^Set 2, .* logged/)).toBeTruthy();
    await logSet(3, "220", "6");
    expect(screen.getByLabelText("Set 4 weight in pounds")).toBeTruthy();
  });

  it("a failed save keeps the numbers; the retry stores the set once and opens the next", async () => {
    const server = wingItServer();
    server.add("le-a", "Leg Press");
    await openWorkout();
    await screen.findByLabelText("Set 1 weight in pounds");
    server.failNextPut(new ApiError("network", "offline", 0));
    await fireEvent.changeText(
      screen.getByLabelText("Set 1 weight in pounds"),
      "200",
    );
    await fireEvent.changeText(screen.getByLabelText("Set 1 reps"), "10");
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Log set 1" })[0]!,
    );
    await waitFor(() => expect(server.puts).toHaveLength(1));
    expect(screen.getByLabelText("Set 1 reps").props.value).toBe("10");
    expect(screen.queryByLabelText("Set 2 weight in pounds")).toBeNull();
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Log set 1" })[0]!,
    );
    await screen.findByLabelText("Set 2 weight in pounds");
    expect(server.lifts[0]!.sets).toHaveLength(1);
    expect(server.puts.map((p) => p.setNumber)).toEqual([1, 1]);
  });

  it("finishing keeps every set, and History shows them", async () => {
    const server = wingItServer();
    server.add("le-a", "Leg Press");
    await openWorkout();
    await logSet(1, "200", "10");
    await logSet(2, "210", "8");
    await logSet(3, "220", "6");
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Finish workout" })[0]!,
    );
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    await render(
      <Providers>
        <LoggedWorkoutScreen loggedSessionId="ls-w" inProgress={false} />
      </Providers>,
    );
    expect(await screen.findByLabelText(/^Set 3, 220 lbs × 6/)).toBeTruthy();
    expect(screen.getByLabelText(/^Set 1, 200 lbs × 10/)).toBeTruthy();
    expect(screen.queryByText(/planned sets/)).toBeNull();
  });
});

describe("planned workouts are unchanged", () => {
  it("a planned card's Set 2 follows Set 1, and after the last planned set it offers Add set", async () => {
    const stored: LoggedSetDto[] = [];
    mockApi.request.mockImplementation(
      async (raw: string, opts: { method?: string; body?: unknown } = {}) => {
        const path = raw.replace(/\?fields=core$/, "");
        if (path === "/workouts/ls-1")
          return view(
            workout({ exercises: [card({ plannedSets: 2, sets: rows(2) })] }),
          );
        const m = path.match(/^\/logged-exercises\/le-bench\/sets\/(\d+)$/);
        if (m && opts.method === "PUT") {
          const b = opts.body as { weightLbs: number; reps: number };
          const s: LoggedSetDto = {
            id: `p${m[1]}`,
            loggedExerciseId: "le-bench",
            setNumber: Number(m[1]),
            weightLbs: b.weightLbs,
            reps: b.reps,
            rir: null,
            createdAt: "2026-11-14T15:00:00.000Z",
            updatedAt: "2026-11-14T15:00:00.000Z",
          };
          stored.push(s);
          return s;
        }
        throw new ApiError("not_found", "nope", 404);
      },
    );
    await render(
      <Providers>
        <WorkoutScreen loggedSessionId="ls-1" />
      </Providers>,
    );
    await logSet(1, "255", "5");
    expect(screen.getByLabelText("Set 2 weight in pounds")).toBeTruthy();
    await logSet(2, "255", "5");
    expect(screen.queryByLabelText("Set 3 weight in pounds")).toBeNull();
    expect(await screen.findByText("All 2 sets logged.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add set" })).toBeTruthy();
    expect(stored.map((s) => s.setNumber)).toEqual([1, 2]);
  });
});
