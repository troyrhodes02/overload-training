/**
 * Pitch 21i — Goals & Exercise History's mobile endpoints, end to end through
 * the route handlers (spec §12 "API"). Only Supabase Auth is replaced: an
 * opaque token "t.<userId>.s" verifies as that user. The handlers, the
 * pipeline, and every read and write module are the production code, against
 * a real database. Cross-account cases live in the isolation suite.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { GET as goalsRoute } from "@/app/api/mobile/v1/goals/route";
import { GET as goalHistoryRoute } from "@/app/api/mobile/v1/goals/history/route";
import { GET as goalRoute } from "@/app/api/mobile/v1/goals/[goalId]/route";
import { PUT as goalArchivedRoute } from "@/app/api/mobile/v1/goals/[goalId]/archived/route";
import { PUT as goalAcknowledgedRoute } from "@/app/api/mobile/v1/goals/[goalId]/acknowledged/route";
import { createGoal } from "@/lib/goals/goals";
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { archiveGym, createGym } from "@/lib/gyms/gyms";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type {
  GoalDetailDto,
  GoalHistoryListDto,
  GoalsOverviewDto,
} from "@overload/shared/contracts/goals";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();
const today = () => todayIso("UTC");

async function call(
  handler: unknown,
  account: Account,
  opts: {
    method?: string;
    json?: unknown;
    params?: Record<string, string>;
    query?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
    ...opts.headers,
  });
  const body = opts.json === undefined ? undefined : JSON.stringify(opts.json);
  if (body !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request(
      `http://localhost/api/mobile/v1/x${opts.query ? `?${opts.query}` : ""}`,
      {
        method: opts.method ?? (body === undefined ? "GET" : "POST"),
        headers,
        body,
      },
    ),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, text, body: text ? JSON.parse(text) : null };
}

async function libraryExercise(
  name: string,
  equipmentType: "barbell" | "machine" | "bodyweight",
) {
  return db().exercise.create({
    data: {
      name,
      primaryMuscle: "chest",
      equipmentType,
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
}

/**
 * A block that started three weeks ago with "Push" on today's weekday (bench
 * 3 × 5, chest press machine 3 × 8–10), two gyms, and finished Push workouts
 * two weeks and one week ago at Downtown: bench 135 then 140 × 5, the machine
 * 100 × 10. Written with the plain modules, so no goal is reconciled.
 */
async function story(account: Account) {
  const bench = await libraryExercise(`Bench ${randomUUID()}`, "barbell");
  const machine = await libraryExercise(
    `Chest Press ${randomUUID()}`,
    "machine",
  );
  const downtown = await createGym(account, { name: "Downtown Gym" });
  const harbor = await createGym(account, { name: "Harbor Barbell" });
  const meso = await createMesocycle(account, {
    name: "Spring Strength",
    startDate: addDays(today(), -21),
    lengthWeeks: "6",
    deloadEveryWeeks: "6",
    splitType: "custom",
  });
  const push = await addSession(account, {
    mesocycleId: meso.id,
    name: "Push",
    dayOfWeek: isoWeekday(today()),
  });
  for (const [exerciseId, sets, min, max] of [
    [bench.id, "3", "5", "5"],
    [machine.id, "3", "8", "10"],
  ] as const) {
    await addSessionExercise(account, {
      sessionId: push.id,
      exerciseId,
      plannedSets: sets,
      targetRepMin: min,
      targetRepMax: max,
    });
  }
  await activateMesocycle(account, {
    mesocycleId: meso.id,
    expectedActiveId: null,
  });
  const train = async (
    daysAgo: number,
    benchLbs: number,
    opts: { complete?: boolean; gymId?: string } = {},
  ) => {
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId: push.id,
      scheduledFor: addDays(today(), -daysAgo),
      gymId: opts.gymId ?? downtown.id,
    });
    const les = await db().loggedExercise.findMany({
      where: { loggedSessionId },
    });
    for (const le of les) {
      const isBench = le.exerciseId === bench.id;
      for (let n = 1; n <= 3; n++) {
        await logSet(account, {
          loggedExerciseId: le.id,
          setNumber: n,
          weightLbs: isBench ? benchLbs : 100,
          reps: isBench ? 5 : 10,
        });
      }
    }
    if (opts.complete !== false) {
      await completeWorkout(account, { loggedSessionId });
    }
    return { loggedSessionId, les };
  };
  await train(14, 135);
  await train(7, 140);
  return { bench, machine, downtown, harbor, meso, push, train };
}

describe("GET /goals (E1)", () => {
  it("runs the completion check first: a met target arrives as a reached card", async () => {
    const a = await createTestAccount();
    const s = await story(a);
    const { id } = await createGoal(a, {
      exerciseId: s.bench.id,
      gymId: null,
      targetWeightLbs: "150",
      targetReps: "5",
    });
    // Today's Push reaches 155 × 5, logged without the workflow's check.
    await s.train(0, 155);
    expect((await db().goal.findUniqueOrThrow({ where: { id } })).status).toBe(
      "active",
    );

    const r = await call(goalsRoute, a);
    const body = r.body as GoalsOverviewDto;
    expect(r.status).toBe(200);
    expect(body.active).toEqual([]);
    expect(body.reached.map((g) => [g.goalId, g.alreadyReached])).toEqual([
      [id, false],
    ]);
    expect(body.historyCount).toBe(1);
    const stored = await db().goal.findUniqueOrThrow({ where: { id } });
    expect([stored.status, stored.archiveReason]).toEqual([
      "archived",
      "completed",
    ]);
  });

  it("lists active goals oldest first with the web's percent, best, and target", async () => {
    const a = await createTestAccount();
    const s = await story(a);
    const benchGoal = await createGoal(a, {
      exerciseId: s.bench.id,
      gymId: null,
      targetWeightLbs: "185",
      targetReps: "5",
    });
    const machineGoal = await createGoal(a, {
      exerciseId: s.machine.id,
      gymId: s.harbor.id,
      targetWeightLbs: "120",
      targetReps: "10",
    });
    const r = await call(goalsRoute, a);
    const body = r.body as GoalsOverviewDto;
    expect(body.active.map((g) => g.goalId)).toEqual([
      benchGoal.id,
      machineGoal.id,
    ]);
    const [bench, machine] = body.active;
    // 140 × 5 against 185 × 5 through the one e1RM formula: 163.3 / 215.8.
    expect(bench).toMatchObject({
      targetLabel: "185 lb × 5",
      percent: 75,
      targetE1rm: 216,
      best: { weightLbs: 140, reps: 5, e1rm: 163 },
      gymId: null,
    });
    // The machine goal is measured at Harbor only, where nothing is logged.
    expect(machine).toMatchObject({
      gymName: "Harbor Barbell",
      percent: null,
      best: null,
    });
    expect([body.reached, body.historyCount]).toEqual([[], 0]);
  });

  it("an account with no goals gets empty lists", async () => {
    const a = await createTestAccount();
    const r = await call(goalsRoute, a);
    expect([r.status, r.body]).toEqual([
      200,
      { reached: [], active: [], historyCount: 0 },
    ]);
  });
});

describe("GET /goals/history (E2) and GET /goals/{id} (E3)", () => {
  it("history lists reached and archived goals with their outcomes, newest first", async () => {
    const a = await createTestAccount();
    const s = await story(a);
    const reached = await createGoal(a, {
      exerciseId: s.bench.id,
      gymId: null,
      targetWeightLbs: "135",
      targetReps: "5",
    });
    expect(reached.outcome).toBe("completed");
    const manual = await createGoal(a, {
      exerciseId: s.machine.id,
      gymId: s.downtown.id,
      targetWeightLbs: "200",
      targetReps: "10",
    });
    const archived = await call(goalArchivedRoute, a, {
      method: "PUT",
      params: { goalId: manual.id },
      json: { archived: true },
    });
    expect(archived.status).toBe(200);
    const r = await call(goalHistoryRoute, a);
    expect(
      (r.body as GoalHistoryListDto).goals.map((g) => [g.goalId, g.outcome]),
    ).toEqual([
      [manual.id, "manual"],
      [reached.id, "completed"],
    ]);
  });

  it("an archived gym still resolves on its goal, and is marked", async () => {
    const a = await createTestAccount();
    const s = await story(a);
    const goal = await createGoal(a, {
      exerciseId: s.machine.id,
      gymId: s.downtown.id,
      targetWeightLbs: "130",
      targetReps: "10",
    });
    await archiveGym(a, { gymId: s.downtown.id });
    const r = await call(goalRoute, a, { params: { goalId: goal.id } });
    const body = r.body as GoalDetailDto;
    expect(r.status).toBe(200);
    expect(body).toMatchObject({
      kind: "active",
      gymName: "Downtown Gym",
      gymArchived: true,
      // 100 × 10 at Downtown still counts there.
      best: { weightLbs: 100, reps: 10 },
    });
  });

  it("a reached goal shows its card until acknowledged, then never again", async () => {
    const a = await createTestAccount();
    const s = await story(a);
    const goal = await createGoal(a, {
      exerciseId: s.bench.id,
      gymId: null,
      targetWeightLbs: "140",
      targetReps: "5",
    });
    const first = await call(goalRoute, a, { params: { goalId: goal.id } });
    expect(first.body).toMatchObject({
      kind: "archived",
      outcome: "completed",
      unacknowledged: true,
      alreadyReached: true,
    });
    const ack = await call(goalAcknowledgedRoute, a, {
      method: "PUT",
      params: { goalId: goal.id },
      json: { acknowledged: true },
    });
    expect(ack.status).toBe(200);
    const after = await call(goalRoute, a, { params: { goalId: goal.id } });
    expect(after.body).toMatchObject({ unacknowledged: false });
    const overview = await call(goalsRoute, a);
    expect((overview.body as GoalsOverviewDto).reached).toEqual([]);
  });

  it("a malformed or unknown id is a 404", async () => {
    const a = await createTestAccount();
    for (const goalId of ["nope", randomUUID()]) {
      const r = await call(goalRoute, a, { params: { goalId } });
      expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
    }
  });

  it("archive asks for exactly { archived: true }", async () => {
    const a = await createTestAccount();
    const s = await story(a);
    const goal = await createGoal(a, {
      exerciseId: s.bench.id,
      gymId: null,
      targetWeightLbs: "200",
      targetReps: "5",
    });
    for (const json of [{}, { archived: "true" }, { archived: false }]) {
      const r = await call(goalArchivedRoute, a, {
        method: "PUT",
        params: { goalId: goal.id },
        json,
      });
      expect([r.status, r.body.error.code]).toEqual([400, "validation_error"]);
    }
    expect(
      (await db().goal.findUniqueOrThrow({ where: { id: goal.id } })).status,
    ).toBe("active");
  });
});
