/**
 * Pitch 21f — Logging Completeness's mobile endpoints, end to end through the
 * route handlers (spec §12 "API behavior"). Only Supabase Auth is replaced:
 * an opaque token "t.<userId>.s" verifies as that user. The handlers, the
 * pipeline, and every write module are the production code, against a real
 * database. Cross-account cases live in the isolation suite.
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
import { POST as startRoute } from "@/app/api/mobile/v1/workouts/route";
import { GET as workoutRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/route";
import { POST as completeRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/complete/route";
import { PUT as gymRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/gym/route";
import { PUT as setRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]/route";
import { GET as swapCandidatesRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/swap-candidates/route";
import { PUT as swapRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/exercise/route";
import { PUT as skippedRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/skipped/route";
import { PATCH as plannedSetsRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/planned-sets/route";
import { PATCH as editSetRoute } from "@/app/api/mobile/v1/sets/[loggedSetId]/route";
import { PUT as logCardioRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/cardio-logs/[scheduledFor]/route";
import { PATCH as editCardioRoute } from "@/app/api/mobile/v1/cardio-logs/[cardioLogId]/route";
import { GET as historyWeekRoute } from "@/app/api/mobile/v1/history/route";
import { GET as historyWorkoutRoute } from "@/app/api/mobile/v1/history/[loggedSessionId]/route";
import { GET as todayRoute } from "@/app/api/mobile/v1/today/route";
import {
  addDays,
  parseIsoDate,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type {
  ExerciseCardDto,
  SwapContextDto,
} from "@overload/shared/contracts/logging";
import type {
  LoggedSetDto,
  LoggedWorkoutDetailViewDto,
  TodayDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { BLOCK_START, SAT } from "./support/recurring-fixtures";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();

async function call(
  handler: unknown,
  account: Account,
  opts: {
    method?: string;
    json?: unknown;
    params?: Record<string, string>;
    query?: string;
  } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
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
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const code = (r: { status: number; body: { error?: { code: string } } }) => [
  r.status,
  r.body?.error?.code,
];

/**
 * One Saturday workout, "Push", in an active block that started Monday
 * 2026-10-05 (every date used is past): a machine (gym-variable), a barbell
 * lift with a fixed 3 × 5 target, and a bodyweight lift. Two gyms.
 */
async function pushBlock(account: Account) {
  const userId = account.userId;
  const meso = await createActiveTestMesocycle({
    userId,
    startDate: new Date(`${BLOCK_START}T00:00:00Z`),
    lengthWeeks: 5,
    deloadEveryWeeks: 5,
  });
  const machine = await createTestExercise({
    userId,
    name: "Chest Press Machine",
    equipmentType: "machine",
    primaryMuscle: "chest",
  });
  const bench = await createTestExercise({
    userId,
    name: "Barbell Bench Press",
    equipmentType: "barbell",
    primaryMuscle: "chest",
  });
  const pullups = await createTestExercise({
    userId,
    name: "Pull-ups",
    equipmentType: "bodyweight",
    primaryMuscle: "back",
  });
  const push = await createTestSession(meso.id, {
    userId,
    name: "Push",
    dayOfWeek: 6,
  });
  const slots = {
    machine: await createTestSessionExercise(push.id, machine.id, {
      userId,
      position: 0,
      plannedSets: 3,
      targetRepMin: 10,
      targetRepMax: 12,
    }),
    bench: await createTestSessionExercise(push.id, bench.id, {
      userId,
      position: 1,
      plannedSets: 3,
      targetRepMin: 5,
      targetRepMax: 5,
    }),
    pullups: await createTestSessionExercise(push.id, pullups.id, {
      userId,
      position: 2,
      plannedSets: 3,
      targetRepMin: 8,
      targetRepMax: 10,
    }),
  };
  const downtown = await db().gym.create({
    data: { userId, name: "Downtown Gym" },
  });
  const riverside = await db().gym.create({
    data: { userId, name: "Riverside Fitness" },
  });
  return { meso, machine, bench, pullups, push, slots, downtown, riverside };
}
type Block = Awaited<ReturnType<typeof pushBlock>>;

async function start(account: Account, b: Block, date: string, gymId: string) {
  const r = await call(startRoute, account, {
    json: { sessionId: b.push.id, scheduledFor: date, gymId },
  });
  expect(r.status).toBe(200);
  return r.body.loggedSessionId as string;
}

async function readWorkout(account: Account, loggedSessionId: string) {
  const r = await call(workoutRoute, account, { params: { loggedSessionId } });
  expect(r.status).toBe(200);
  return (r.body as WorkoutViewDto).workout;
}

/** The workout's cards by planned exercise. */
async function cards(account: Account, b: Block, loggedSessionId: string) {
  const workout = await readWorkout(account, loggedSessionId);
  const by = (name: string) => {
    const card = workout.exercises.find((e) => e.plannedExerciseName === name);
    if (!card) throw new Error(`no card for ${name}`);
    return card;
  };
  return {
    workout,
    machine: by(b.machine.name),
    bench: by(b.bench.name),
    pullups: by(b.pullups.name),
  };
}

const putSet = (
  account: Account,
  loggedExerciseId: string,
  setNumber: number,
  json: unknown,
) =>
  call(setRoute, account, {
    method: "PUT",
    json,
    params: { loggedExerciseId, setNumber: String(setNumber) },
  });

async function logSets(
  account: Account,
  card: ExerciseCardDto,
  sets: { weightLbs?: number; reps: number; rir?: number }[],
) {
  const out: LoggedSetDto[] = [];
  for (const [i, json] of sets.entries()) {
    const r = await putSet(account, card.loggedExerciseId, i + 1, json);
    expect(r.status).toBe(200);
    out.push(r.body as LoggedSetDto);
  }
  return out;
}

const finish = (account: Account, loggedSessionId: string) =>
  call(completeRoute, account, {
    method: "POST",
    params: { loggedSessionId },
  });

const putGym = (account: Account, loggedSessionId: string, json: unknown) =>
  call(gymRoute, account, {
    method: "PUT",
    json,
    params: { loggedSessionId },
  });

const putSkipped = (
  account: Account,
  loggedExerciseId: string,
  json: unknown,
) =>
  call(skippedRoute, account, {
    method: "PUT",
    json,
    params: { loggedExerciseId },
  });

const putSwap = (account: Account, loggedExerciseId: string, json: unknown) =>
  call(swapRoute, account, {
    method: "PUT",
    json,
    params: { loggedExerciseId },
  });

const patchSet = (account: Account, loggedSetId: string, json: unknown) =>
  call(editSetRoute, account, {
    method: "PATCH",
    json,
    params: { loggedSetId },
  });

const patchPlanned = (
  account: Account,
  loggedExerciseId: string,
  json: unknown,
) =>
  call(plannedSetsRoute, account, {
    method: "PATCH",
    json,
    params: { loggedExerciseId },
  });

const baselines = (userId: string) =>
  db().gymExerciseBaseline.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

const MACHINE_SETS = [
  { weightLbs: 100, reps: 12 },
  { weightLbs: 100, reps: 11 },
  { weightLbs: 100, reps: 10 },
];

let account: Account;
beforeEach(async () => {
  account = await createTestAccount();
});

describe("the workout's gym (E8)", () => {
  it("changes before any set, is repeatable, and locks once a set exists", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.riverside.id);
    const gymIds = async () => [
      ...new Set(
        (
          await db().loggedExercise.findMany({
            where: { loggedSessionId: id },
          })
        ).map((le) => le.gymId),
      ),
    ];

    const moved = await putGym(account, id, { gymId: b.downtown.id });
    expect([moved.status, moved.body]).toEqual([
      200,
      { loggedSessionId: id, gymId: b.downtown.id },
    ]);
    expect(await gymIds()).toEqual([b.downtown.id]);
    const { workout, bench } = await cards(account, b, id);
    expect([workout.gymName, workout.gymLocked]).toEqual([
      "Downtown Gym",
      false,
    ]);

    // The same gym again changes nothing.
    expect((await putGym(account, id, { gymId: b.downtown.id })).status).toBe(
      200,
    );
    expect(await gymIds()).toEqual([b.downtown.id]);

    // A shape error and an archived gym are refused.
    const noGym = await putGym(account, id, { gymId: 7 });
    expect([noGym.status, Object.keys(noGym.body.error.details)]).toEqual([
      400,
      ["gymId"],
    ]);
    await db().gym.update({
      where: { id: b.riverside.id },
      data: { deletedAt: new Date() },
    });
    expect(code(await putGym(account, id, { gymId: b.riverside.id }))).toEqual([
      400,
      "validation_error",
    ]);
    await db().gym.update({
      where: { id: b.riverside.id },
      data: { deletedAt: null },
    });

    // Once a set is saved the gym is locked, and the set keeps its gym.
    await logSets(account, bench, [{ weightLbs: 185, reps: 5 }]);
    const locked = await putGym(account, id, { gymId: b.riverside.id });
    expect(code(locked)).toEqual([400, "invalid_state_transition"]);
    expect(locked.body.error.message).toBe(
      "The gym is locked once sets are logged.",
    );
    expect(await gymIds()).toEqual([b.downtown.id]);
    expect((await readWorkout(account, id)).gymLocked).toBe(true);
  });

  it("a machine's history follows the gym; a barbell lift's doesn't", async () => {
    const b = await pushBlock(account);
    // Week 1 at Downtown: the machine and the bench.
    const first = await start(account, b, SAT[0], b.downtown.id);
    const c1 = await cards(account, b, first);
    await logSets(account, c1.machine, MACHINE_SETS);
    await logSets(account, c1.bench, [
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
    ]);
    expect((await finish(account, first)).status).toBe(200);

    // Week 2 started at Riverside: the machine has no history THERE.
    const second = await start(account, b, SAT[1], b.riverside.id);
    const away = await cards(account, b, second);
    expect(away.machine.weightContext).not.toBe("trusted");
    expect(away.machine.suggestedWeightLbs).toBeNull();
    expect(away.machine.previousPerformance).toBeNull();
    expect(away.machine.gymName).toBe("Riverside Fitness");
    // The barbell lift is the same lift at any gym.
    expect([away.bench.weightContext, away.bench.suggestedWeightLbs]).toEqual([
      "trusted",
      185,
    ]);
    expect(away.bench.gymName).toBeNull();

    // Changing to Downtown brings that gym's machine history.
    expect(
      (await putGym(account, second, { gymId: b.downtown.id })).status,
    ).toBe(200);
    const home = await cards(account, b, second);
    expect([
      home.machine.weightContext,
      home.machine.suggestedWeightLbs,
      home.machine.gymName,
    ]).toEqual(["trusted", 100, "Downtown Gym"]);
  });

  it("the first machine log at another gym establishes only that gym's baseline", async () => {
    const b = await pushBlock(account);
    const first = await start(account, b, SAT[0], b.downtown.id);
    const c1 = await cards(account, b, first);
    await logSets(account, c1.machine, MACHINE_SETS);
    await finish(account, first);
    const before = await baselines(account.userId);
    expect(before.map((x) => [x.gymId, x.exerciseId])).toEqual([
      [b.downtown.id, b.machine.id],
    ]);

    const second = await start(account, b, SAT[1], b.riverside.id);
    const c2 = await cards(account, b, second);
    await logSets(account, c2.machine, [
      { weightLbs: 140, reps: 12 },
      { weightLbs: 140, reps: 11 },
      { weightLbs: 140, reps: 10 },
    ]);
    await logSets(account, c2.bench, [
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
    ]);
    const after = await baselines(account.userId);
    // Downtown's row is byte-for-byte what it was.
    expect(after.find((x) => x.gymId === b.downtown.id)).toEqual(before[0]);
    const riverside = after.find((x) => x.gymId === b.riverside.id);
    expect([riverside?.exerciseId, Number(riverside?.weightLbs)]).toEqual([
      b.machine.id,
      140,
    ]);
    // A barbell lift never gets a baseline at either gym.
    expect(after.filter((x) => x.exerciseId === b.bench.id)).toEqual([]);
    expect(after).toHaveLength(2);
  });
});

describe("exercise swap (E9, E10)", () => {
  it("lists any muscle group, favorites first, without the performed exercise", async () => {
    const b = await pushBlock(account);
    const fav = await createTestExercise({
      userId: account.userId,
      name: "Zottman Chest Press",
      primaryMuscle: "chest",
    });
    await db().exerciseFavorite.create({
      data: { userId: account.userId, exerciseId: fav.id },
    });
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine } = await cards(account, b, id);
    const get = (query?: string) =>
      call(swapCandidatesRoute, account, {
        params: { loggedExerciseId: machine.loggedExerciseId },
        query,
      });

    const chest = (await get()).body as SwapContextDto;
    expect([
      chest.plannedMuscle,
      chest.selectedMuscle,
      chest.selectedMuscleLabel,
      chest.swapLocked,
    ]).toEqual(["chest", "chest", "Chest", false]);
    expect(chest.candidates.map((c) => c.name)).toEqual([
      "Zottman Chest Press",
      "Barbell Bench Press",
    ]);
    expect(chest.candidates[0].isFavorite).toBe(true);

    const back = (await get("muscle=back")).body as SwapContextDto;
    expect([back.plannedMuscle, back.selectedMuscle]).toEqual([
      "chest",
      "back",
    ]);
    expect(back.candidates.map((c) => c.name)).toEqual(["Pull-ups"]);

    const unknown = (await get("muscle=wings")).body as SwapContextDto;
    expect(unknown.selectedMuscle).toBe("chest");
    const empty = (await get("muscle=calves")).body as SwapContextDto;
    expect(empty.candidates).toEqual([]);
  });

  it("changes the performed exercise only, and never the plan", async () => {
    const b = await pushBlock(account);
    const substitute = await createTestExercise({
      userId: account.userId,
      name: "Dumbbell Fly",
      equipmentType: "dumbbell",
      primaryMuscle: "chest",
    });
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine } = await cards(account, b, id);
    const le = () =>
      db().loggedExercise.findUniqueOrThrow({
        where: { id: machine.loggedExerciseId },
      });

    const r = await putSwap(account, machine.loggedExerciseId, {
      newExerciseId: substitute.id,
    });
    expect([r.status, r.body]).toEqual([
      200,
      { loggedExerciseId: machine.loggedExerciseId, exerciseId: substitute.id },
    ]);
    expect([(await le()).exerciseId, (await le()).plannedExerciseId]).toEqual([
      substitute.id,
      b.machine.id,
    ]);
    // The plan is untouched.
    expect(
      (
        await db().sessionExercise.findUniqueOrThrow({
          where: { id: b.slots.machine.id },
        })
      ).exerciseId,
    ).toBe(b.machine.id);
    const swapped = (await readWorkout(account, id)).exercises.find(
      (e) => e.loggedExerciseId === machine.loggedExerciseId,
    );
    expect([
      swapped?.swapped,
      swapped?.performedExerciseName,
      swapped?.plannedExerciseName,
      swapped?.isGymVariable,
    ]).toEqual([true, "Dumbbell Fly", "Chest Press Machine", false]);

    // The same swap again is the same row; a different muscle group is allowed.
    expect(
      (
        await putSwap(account, machine.loggedExerciseId, {
          newExerciseId: substitute.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await putSwap(account, machine.loggedExerciseId, {
          newExerciseId: b.pullups.id,
        })
      ).status,
    ).toBe(200);
    expect((await le()).exerciseId).toBe(b.pullups.id);
    expect(
      await db().loggedExercise.count({ where: { loggedSessionId: id } }),
    ).toBe(3);
  });

  it("is refused for a bad, archived, or missing exercise, after a set, and once finished", async () => {
    const b = await pushBlock(account);
    const archived = await createTestExercise({
      userId: account.userId,
      name: "Old Press",
      primaryMuscle: "chest",
      deletedAt: new Date(),
    });
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine, bench } = await cards(account, b, id);

    const shape = await putSwap(account, machine.loggedExerciseId, {});
    expect([shape.status, Object.keys(shape.body.error.details)]).toEqual([
      400,
      ["newExerciseId"],
    ]);
    for (const newExerciseId of [archived.id, randomUUID(), "nope"]) {
      const r = await putSwap(account, machine.loggedExerciseId, {
        newExerciseId,
      });
      expect([code(r), r.body.error.message]).toEqual([
        [400, "validation_error"],
        "That exercise isn't available.",
      ]);
    }

    // A skipped exercise that is swapped is being done: the mark is cleared.
    await putSkipped(account, machine.loggedExerciseId, { skipped: true });
    await putSwap(account, machine.loggedExerciseId, {
      newExerciseId: b.bench.id,
    });
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: machine.loggedExerciseId },
        })
      ).skippedAt,
    ).toBeNull();

    await logSets(account, bench, [{ weightLbs: 185, reps: 5 }]);
    const locked = await putSwap(account, bench.loggedExerciseId, {
      newExerciseId: b.pullups.id,
    });
    expect([code(locked), locked.body.error.message]).toEqual([
      [400, "invalid_state_transition"],
      "Sets are logged — this exercise is locked.",
    ]);
    const ctx = (
      await call(swapCandidatesRoute, account, {
        params: { loggedExerciseId: bench.loggedExerciseId },
      })
    ).body as SwapContextDto;
    expect(ctx.swapLocked).toBe(true);

    await finish(account, id);
    const done = await putSwap(account, machine.loggedExerciseId, {
      newExerciseId: b.pullups.id,
    });
    expect([code(done), done.body.error.message]).toEqual([
      [400, "invalid_state_transition"],
      "This workout is already finished.",
    ]);
  });
});

describe("skipping an exercise (E11)", () => {
  it("records a fact, is repeatable with the first time kept, and can be undone", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine, bench } = await cards(account, b, id);
    const skippedAt = async () =>
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: machine.loggedExerciseId },
        })
      ).skippedAt;

    const bad = await putSkipped(account, machine.loggedExerciseId, {
      skipped: "yes",
    });
    expect([bad.status, Object.keys(bad.body.error.details)]).toEqual([
      400,
      ["skipped"],
    ]);

    const r = await putSkipped(account, machine.loggedExerciseId, {
      skipped: true,
    });
    expect([r.status, r.body]).toEqual([
      200,
      { loggedExerciseId: machine.loggedExerciseId, skipped: true },
    ]);
    const first = await skippedAt();
    expect(first).not.toBeNull();
    // No set, weight, reps, or RIR was invented.
    expect(
      await db().loggedSet.count({ where: { userId: account.userId } }),
    ).toBe(0);
    expect(
      (await readWorkout(account, id)).exercises.find(
        (e) => e.loggedExerciseId === machine.loggedExerciseId,
      )?.skipped,
    ).toBe(true);

    // A retry keeps the moment it was first marked (RD-3).
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(
      (await putSkipped(account, machine.loggedExerciseId, { skipped: true }))
        .status,
    ).toBe(200);
    expect(await skippedAt()).toEqual(first);

    // A skipped exercise takes no set until the mark is undone.
    const blocked = await putSet(account, machine.loggedExerciseId, 1, {
      weightLbs: 100,
      reps: 10,
    });
    expect(code(blocked)).toEqual([400, "invalid_state_transition"]);

    const undo = await putSkipped(account, machine.loggedExerciseId, {
      skipped: false,
    });
    expect([undo.status, undo.body.skipped]).toEqual([200, false]);
    expect(await skippedAt()).toBeNull();
    expect(
      (await putSkipped(account, machine.loggedExerciseId, { skipped: false }))
        .status,
    ).toBe(200);

    // With a set logged it can't be marked not done.
    await logSets(account, bench, [{ weightLbs: 185, reps: 5 }]);
    const partly = await putSkipped(account, bench.loggedExerciseId, {
      skipped: true,
    });
    expect(code(partly)).toEqual([400, "invalid_state_transition"]);
  });

  it("a workout with a skipped exercise finishes, and then nothing can be skipped", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine, bench, pullups } = await cards(account, b, id);
    await putSkipped(account, machine.loggedExerciseId, { skipped: true });
    await logSets(account, bench, [{ weightLbs: 185, reps: 5 }]);
    expect((await finish(account, id)).status).toBe(200);
    const detail = (
      await call(historyWorkoutRoute, account, {
        params: { loggedSessionId: id },
      })
    ).body as LoggedWorkoutDetailViewDto;
    expect(
      detail.detail.exercises.map((e) => [e.performedName, e.skipped]),
    ).toEqual([
      ["Chest Press Machine", true],
      ["Barbell Bench Press", false],
      ["Pull-ups", true],
    ]);
    for (const skipped of [true, false]) {
      const r = await putSkipped(account, pullups.loggedExerciseId, {
        skipped,
      });
      expect([code(r), r.body.error.message]).toEqual([
        [400, "invalid_state_transition"],
        "This workout is already finished.",
      ]);
    }
  });
});

describe("reps in reserve and extra sets (E3)", () => {
  it("stores RIR as sent, and nothing as NULL (never 0)", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    const le = bench.loggedExerciseId;
    const sets = await logSets(account, bench, [
      { weightLbs: 185, reps: 5, rir: 2 },
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5, rir: 0 },
    ]);
    expect(sets.map((s) => s.rir)).toEqual([2, null, 0]);
    const stored = await db().loggedSet.findMany({
      where: { loggedExerciseId: le },
      orderBy: { setNumber: "asc" },
    });
    expect(stored.map((s) => s.rir)).toEqual([2, null, 0]);
    expect(
      (await readWorkout(account, id)).exercises
        .find((e) => e.loggedExerciseId === le)
        ?.sets.map((s) => s.rir),
    ).toEqual([2, null, 0]);

    // A retry with the same RIR is the same row; a different RIR is a conflict.
    const same = await putSet(account, le, 1, {
      weightLbs: 185,
      reps: 5,
      rir: 2,
    });
    expect([same.status, same.body.id]).toEqual([200, sets[0].id]);
    const other = await putSet(account, le, 1, {
      weightLbs: 185,
      reps: 5,
      rir: 3,
    });
    expect(code(other)).toEqual([409, "conflict"]);
    expect(
      await db().loggedSet.count({ where: { loggedExerciseId: le } }),
    ).toBe(3);
  });

  it("refuses an RIR off the scale and stores nothing", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    for (const rir of [5, -1, 1.5, "2"]) {
      const r = await putSet(account, bench.loggedExerciseId, 1, {
        weightLbs: 185,
        reps: 5,
        rir,
      });
      expect([rir, r.status, r.body.error.details]).toEqual([
        rir,
        400,
        { rir: "Choose an RIR from 0 to 4+." },
      ]);
    }
    expect(
      await db().loggedSet.count({ where: { userId: account.userId } }),
    ).toBe(0);
  });

  it("allows extra sets only after the planned ones, in order, up to ten", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    const le = bench.loggedExerciseId;
    const set = { weightLbs: 185, reps: 5 };
    await logSets(account, bench, [set, set]);
    const early = await putSet(account, le, 4, set);
    expect([early.status, Object.keys(early.body.error.details)]).toEqual([
      400,
      ["setNumber"],
    ]);
    expect((await putSet(account, le, 3, set)).status).toBe(200);
    for (let n = 4; n <= 13; n++) {
      expect([n, (await putSet(account, le, n, set)).status]).toEqual([n, 200]);
    }
    expect((await putSet(account, le, 14, set)).status).toBe(400);
    const rows = (await readWorkout(account, id)).exercises.find(
      (e) => e.loggedExerciseId === le,
    )?.sets;
    expect(rows?.map((s) => s.extra)).toEqual([
      ...Array(3).fill(false),
      ...Array(10).fill(true),
    ]);
    // The planned count is what the plan said.
    expect(
      (await db().loggedExercise.findUniqueOrThrow({ where: { id: le } }))
        .plannedSets,
    ).toBe(3);
  });
});

describe("correcting a logged set (E12)", () => {
  it("changes the values and nothing else, and never replays a baseline", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine } = await cards(account, b, id);
    const [first] = await logSets(account, machine, MACHINE_SETS);
    const before = await db().loggedSet.findUniqueOrThrow({
      where: { id: first.id },
    });
    const baselineBefore = await baselines(account.userId);
    expect(baselineBefore).toHaveLength(1);

    const r = await patchSet(account, first.id, { weightLbs: 107.5, reps: 11 });
    expect(r.status).toBe(200);
    expect(r.body as LoggedSetDto).toMatchObject({
      id: first.id,
      loggedExerciseId: machine.loggedExerciseId,
      setNumber: 1,
      weightLbs: 107.5,
      reps: 11,
      rir: null,
      createdAt: before.createdAt.toISOString(),
    });
    const after = await db().loggedSet.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect({
      ...after,
      weightLbs: null,
      reps: null,
      updatedAt: null,
    }).toEqual({ ...before, weightLbs: null, reps: null, updatedAt: null });
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );
    expect(
      await db().loggedSet.count({ where: { userId: account.userId } }),
    ).toBe(3);
    // The stored baseline is exactly what live logging left.
    expect(await baselines(account.userId)).toEqual(baselineBefore);

    // The same correction again stores the same values.
    const again = await patchSet(account, first.id, {
      weightLbs: 107.5,
      reps: 11,
    });
    expect([again.status, again.body.weightLbs, again.body.reps]).toEqual([
      200, 107.5, 11,
    ]);
    expect(
      await db().loggedSet.count({ where: { userId: account.userId } }),
    ).toBe(3);
  });

  it("keeps, clears, or sets RIR exactly as asked", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    const [set] = await logSets(account, bench, [
      { weightLbs: 185, reps: 5, rir: 2 },
    ]);
    const rir = async () =>
      (await db().loggedSet.findUniqueOrThrow({ where: { id: set.id } })).rir;

    // No `rir` key: the stored value is kept.
    await patchSet(account, set.id, { weightLbs: 190, reps: 5 });
    expect(await rir()).toBe(2);
    await patchSet(account, set.id, { weightLbs: 190, reps: 5, rir: 3 });
    expect(await rir()).toBe(3);
    await patchSet(account, set.id, { weightLbs: 190, reps: 5, rir: 0 });
    expect(await rir()).toBe(0);
    const cleared = await patchSet(account, set.id, {
      weightLbs: 190,
      reps: 5,
      rir: null,
    });
    expect([cleared.status, cleared.body.rir, await rir()]).toEqual([
      200,
      null,
      null,
    ]);

    for (const [json, field] of [
      [{ weightLbs: 190, reps: 5, rir: 7 }, "rir"],
      [{ weightLbs: 0, reps: 5 }, "weightLbs"],
      [{ weightLbs: 190.125, reps: 5 }, "weightLbs"],
      [{ weightLbs: "190", reps: 5 }, "weightLbs"],
      [{ reps: 5 }, "weightLbs"],
      [{ weightLbs: 190, reps: 0 }, "reps"],
      [{ weightLbs: 190 }, "reps"],
    ] as const) {
      const r = await patchSet(account, set.id, json);
      expect([json, r.status, Object.keys(r.body.error.details)]).toEqual([
        json,
        400,
        [field],
      ]);
    }
    const stored = await db().loggedSet.findUniqueOrThrow({
      where: { id: set.id },
    });
    expect([Number(stored.weightLbs), stored.reps, stored.rir]).toEqual([
      190,
      5,
      null,
    ]);
  });

  it("corrects a bodyweight set as reps only", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { pullups } = await cards(account, b, id);
    expect(pullups.requiresExternalWeight).toBe(false);
    const withWeight = await putSet(account, pullups.loggedExerciseId, 1, {
      weightLbs: 25,
      reps: 8,
    });
    expect(withWeight.body.error.details.weightLbs).toBe(
      "This is a bodyweight exercise — log reps only.",
    );
    const [set] = await logSets(account, pullups, [{ reps: 8 }]);
    expect(set.weightLbs).toBeNull();

    const refused = await patchSet(account, set.id, { weightLbs: 25, reps: 9 });
    expect([refused.status, Object.keys(refused.body.error.details)]).toEqual([
      400,
      ["weightLbs"],
    ]);
    const r = await patchSet(account, set.id, { reps: 9 });
    expect([r.status, r.body.weightLbs, r.body.reps]).toEqual([200, null, 9]);
    expect(
      (await db().loggedSet.findUniqueOrThrow({ where: { id: set.id } }))
        .weightLbs,
    ).toBeNull();
  });

  it("corrects a finished workout, which stays finished, and later reads follow", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    const sets = await logSets(account, bench, [
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
    ]);
    await finish(account, id);
    const done = await db().loggedSession.findUniqueOrThrow({ where: { id } });

    const r = await patchSet(account, sets[2].id, { weightLbs: 195, reps: 4 });
    expect(r.status).toBe(200);
    const still = await db().loggedSession.findUniqueOrThrow({ where: { id } });
    expect([still.status, still.completedAt]).toEqual([
      "complete",
      done.completedAt,
    ]);

    // History reads the corrected record.
    const detail = (
      await call(historyWorkoutRoute, account, {
        params: { loggedSessionId: id },
      })
    ).body as LoggedWorkoutDetailViewDto;
    expect(
      detail.detail.exercises
        .find((e) => e.exerciseId === b.bench.id)
        ?.sets.map((s) => [s.weightLbs, s.reps]),
    ).toEqual([
      [185, 5],
      [185, 5],
      [195, 4],
    ]);
    // So does next week's card: nothing derived was stored to go stale.
    const next = await start(account, b, SAT[1], b.downtown.id);
    const card = (await cards(account, b, next)).bench;
    expect(
      card.previousPerformance?.sets.map((s) => [s.weightLbs, s.reps]),
    ).toEqual([
      [185, 5],
      [185, 5],
      [195, 4],
    ]);
  });

  it("a missing or malformed set id is not found", async () => {
    for (const loggedSetId of [randomUUID(), "abc"]) {
      const r = await patchSet(account, loggedSetId, {
        weightLbs: 100,
        reps: 5,
      });
      expect(code(r)).toEqual([404, "not_found"]);
    }
  });
});

describe("this workout's planned sets (E13)", () => {
  it("lowers this occurrence only, keeps every set, and never raises", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    const le = bench.loggedExerciseId;
    await logSets(account, bench, [
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 5 },
    ]);
    const planned = async () =>
      (await db().loggedExercise.findUniqueOrThrow({ where: { id: le } }))
        .plannedSets;

    for (const plannedSets of [0, 1.5, "2", null, 4]) {
      const r = await patchPlanned(account, le, { plannedSets });
      expect([plannedSets, code(r)]).toEqual([
        plannedSets,
        [400, "validation_error"],
      ]);
    }
    expect(await planned()).toBe(3);

    const r = await patchPlanned(account, le, { plannedSets: 2 });
    expect([r.status, r.body]).toEqual([
      200,
      { loggedExerciseId: le, plannedSets: 2 },
    ]);
    expect(await planned()).toBe(2);
    expect(
      await db().loggedSet.count({ where: { loggedExerciseId: le } }),
    ).toBe(2);
    // The plan still says three, and the next occurrence copies three.
    expect(
      (
        await db().sessionExercise.findUniqueOrThrow({
          where: { id: b.slots.bench.id },
        })
      ).plannedSets,
    ).toBe(3);
    const card = (await cards(account, b, id)).bench;
    expect([card.plannedSets, card.sets.map((s) => s.saved)]).toEqual([
      2,
      [true, true],
    ]);

    // The same count again is a no-op; it can't go back up.
    expect((await patchPlanned(account, le, { plannedSets: 2 })).status).toBe(
      200,
    );
    const up = await patchPlanned(account, le, { plannedSets: 3 });
    expect([code(up), up.body.error.message]).toEqual([
      [400, "validation_error"],
      "You can only lower the planned sets for a past workout.",
    ]);

    await finish(account, id);
    const next = await start(account, b, SAT[1], b.downtown.id);
    expect((await cards(account, b, next)).bench.plannedSets).toBe(3);
  });

  it("below the logged count, the later sets read as extra and none is removed", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { machine } = await cards(account, b, id);
    await logSets(account, machine, MACHINE_SETS);
    await finish(account, id);
    // Allowed on a finished workout too (the web corrects from History).
    const r = await patchPlanned(account, machine.loggedExerciseId, {
      plannedSets: 1,
    });
    expect(r.status).toBe(200);
    const detail = (
      await call(historyWorkoutRoute, account, {
        params: { loggedSessionId: id },
      })
    ).body as LoggedWorkoutDetailViewDto;
    const ex = detail.detail.exercises.find(
      (e) => e.exerciseId === b.machine.id,
    );
    expect([ex?.plannedSets, ex?.sets.map((s) => s.extra)]).toEqual([
      1,
      [false, true, true],
    ]);
    expect(
      await db().loggedSet.count({
        where: { loggedExerciseId: machine.loggedExerciseId },
      }),
    ).toBe(3);
  });

  it("a missing or malformed exercise id is not found", async () => {
    for (const loggedExerciseId of [randomUUID(), "abc"]) {
      expect(
        code(await patchPlanned(account, loggedExerciseId, { plannedSets: 1 })),
      ).toEqual([404, "not_found"]);
    }
  });
});

describe("fixed targets", () => {
  it("a 3 × 5 lift reads as one target and logs like any other", async () => {
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.downtown.id);
    const { bench } = await cards(account, b, id);
    expect([bench.plannedSets, bench.plannedRepRange]).toEqual([
      3,
      { min: 5, max: 5 },
    ]);
    const sets = await logSets(account, bench, [
      { weightLbs: 185, reps: 5 },
      { weightLbs: 185, reps: 6 },
      { weightLbs: 185, reps: 4 },
    ]);
    expect(sets.map((s) => s.reps)).toEqual([5, 6, 4]);
  });
});

describe("cardio (E14, E15)", () => {
  const TODAY = toIsoDate(new Date());
  const weekday = (iso: string) =>
    ((parseIsoDate(iso)!.getUTCDay() + 6) % 7) + 1;

  /**
   * A block starting today (UTC, the test account's zone), with cardio on
   * today's weekday and a cardio-only day two days on, both planned long
   * before (so the occurrence floor isn't in play). No lifting.
   */
  async function cardioBlock(status: "active" | "draft" = "active") {
    const userId = account.userId;
    const make =
      status === "active" ? createActiveTestMesocycle : createTestMesocycle;
    const meso = await make({
      userId,
      status,
      startDate: parseIsoDate(TODAY)!,
      lengthWeeks: 5,
    });
    const longAgo = parseIsoDate(addDays(TODAY, -30))!;
    for (const [dayOfWeek, type, durationMin] of [
      [weekday(TODAY), "Incline Walk", 20],
      [weekday(addDays(TODAY, 2)), "Bike", 30],
    ] as const) {
      await db().plannedCardio.create({
        data: {
          userId,
          mesocycleId: meso.id,
          dayOfWeek,
          type,
          durationMin,
          createdAt: longAgo,
        },
      });
    }
    return meso;
  }
  const put = (mesocycleId: string, scheduledFor: string, json: unknown) =>
    call(logCardioRoute, account, {
      method: "PUT",
      json,
      params: { mesocycleId, scheduledFor },
    });
  const patch = (cardioLogId: string, json: unknown) =>
    call(editCardioRoute, account, {
      method: "PATCH",
      json,
      params: { cardioLogId },
    });
  const logs = () =>
    db().cardioLog.findMany({ where: { userId: account.userId } });

  it("records today's cardio once; a repeat returns the stored record untouched", async () => {
    const meso = await cardioBlock();
    const before = (await call(todayRoute, account)).body as TodayDto;
    expect(before.dashboard.kind).toBe("rest");

    const first = await put(meso.id, TODAY, {
      type: " Incline Walk ",
      durationMin: 25,
    });
    expect([first.status, first.body.alreadyLogged]).toEqual([200, false]);
    const again = await put(meso.id, TODAY, {
      type: "Incline Walk",
      durationMin: 25,
    });
    const different = await put(meso.id, TODAY, {
      type: "Bike",
      durationMin: 90,
    });
    for (const r of [again, different]) {
      expect([r.status, r.body]).toEqual([
        200,
        { cardioLogId: first.body.cardioLogId, alreadyLogged: true },
      ]);
    }
    const stored = await logs();
    expect(
      stored.map((l) => [
        l.type,
        l.durationMin,
        l.plannedType,
        l.plannedDurationMin,
        toIsoDate(l.scheduledFor),
      ]),
    ).toEqual([["Incline Walk", 25, "Incline Walk", 20, TODAY]]);

    // Today and History show the record; cardio never changes the day's kind
    // and never creates a workout.
    const today = (await call(todayRoute, account)).body as TodayDto;
    expect(today.dashboard.kind).toBe("rest");
    const entry =
      today.dashboard.kind === "rest" ? today.dashboard.cardio[0] : null;
    expect([entry?.state, entry?.log, entry?.differsFromPlan]).toEqual([
      "complete",
      { id: first.body.cardioLogId, type: "Incline Walk", durationMin: 25 },
      true,
    ]);
    const week = (await call(historyWeekRoute, account)).body as HistoryWeekDto;
    expect(week.view.kind).toBe("active");
    const rows = week.view.kind === "active" ? week.view.cardio : [];
    expect(rows.map((c) => [c.dateIso, c.state])).toEqual([
      [TODAY, "complete"],
      [addDays(TODAY, 2), "upcoming"],
    ]);
    expect(
      await db().loggedSession.count({ where: { userId: account.userId } }),
    ).toBe(0);
  });

  it("refuses days that aren't a due, planned cardio day of the active block", async () => {
    const meso = await cardioBlock();
    const ok = { type: "Bike", durationMin: 30 };
    expect(code(await put(meso.id, addDays(TODAY, 2), ok))).toEqual([
      400,
      "invalid_state_transition",
    ]);
    expect(code(await put(meso.id, addDays(TODAY, 1), ok))).toEqual([
      404,
      "not_found",
    ]);
    expect(code(await put(meso.id, "not-a-date", ok))).toEqual([
      400,
      "validation_error",
    ]);
    expect(code(await put(randomUUID(), TODAY, ok))).toEqual([
      404,
      "not_found",
    ]);
    expect(code(await put("abc", TODAY, ok))).toEqual([404, "not_found"]);
    expect(await logs()).toEqual([]);
  });

  it("refuses a draft block", async () => {
    const draft = await cardioBlock("draft");
    expect(
      code(await put(draft.id, TODAY, { type: "Walk", durationMin: 20 })),
    ).toEqual([400, "invalid_state_transition"]);
    expect(await logs()).toEqual([]);
  });

  it("validates the activity and minutes with the web's messages", async () => {
    const meso = await cardioBlock();
    for (const [json, details] of [
      [{ type: "  ", durationMin: 20 }, { type: "Enter the activity." }],
      [
        { type: "x".repeat(41), durationMin: 20 },
        { type: "Keep it to 40 characters or fewer." },
      ],
      [
        { type: "Walk", durationMin: 0 },
        { durationMin: "Enter whole minutes, 1 or more." },
      ],
      [
        { type: "Walk", durationMin: 1.5 },
        { durationMin: "Enter whole minutes, 1 or more." },
      ],
      [
        { type: "Walk", durationMin: 601 },
        { durationMin: "Keep it to 600 minutes or fewer." },
      ],
      [
        {},
        {
          type: "Enter the activity.",
          durationMin: "Enter whole minutes, 1 or more.",
        },
      ],
    ] as const) {
      const r = await put(meso.id, TODAY, json);
      expect([r.status, r.body.error.details]).toEqual([400, details]);
    }
    expect(await logs()).toEqual([]);
  });

  it("a Free account logs and corrects its cardio", async () => {
    account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const meso = await cardioBlock();
    const logged = await put(meso.id, TODAY, {
      type: "Incline Walk",
      durationMin: 20,
    });
    expect(logged.status).toBe(200);
    expect(
      (await patch(logged.body.cardioLogId, { type: "Bike", durationMin: 30 }))
        .status,
    ).toBe(200);
  });

  it("corrects the activity and minutes and nothing else", async () => {
    const meso = await cardioBlock();
    const { cardioLogId } = (
      await put(meso.id, TODAY, { type: "Incline Walk", durationMin: 20 })
    ).body;
    const [before] = await logs();

    const r = await patch(cardioLogId, {
      type: "Stair Climber",
      durationMin: 35,
    });
    expect([r.status, r.body]).toEqual([200, { cardioLogId }]);
    const [after] = await logs();
    expect([after.type, after.durationMin]).toEqual(["Stair Climber", 35]);
    expect({
      ...after,
      type: null,
      durationMin: null,
      updatedAt: null,
    }).toEqual({ ...before, type: null, durationMin: null, updatedAt: null });

    const bad = await patch(cardioLogId, { type: "", durationMin: 0 });
    expect([bad.status, Object.keys(bad.body.error.details).sort()]).toEqual([
      400,
      ["durationMin", "type"],
    ]);
    for (const id of [randomUUID(), "abc"]) {
      expect(code(await patch(id, { type: "Bike", durationMin: 30 }))).toEqual([
        404,
        "not_found",
      ]);
    }
    expect((await logs()).map((l) => l.type)).toEqual(["Stair Climber"]);
  });
});

describe("Free capture", () => {
  it("a Free account changes gym, swaps, skips, corrects, and lowers sets", async () => {
    account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b = await pushBlock(account);
    const id = await start(account, b, SAT[0], b.riverside.id);
    expect((await putGym(account, id, { gymId: b.downtown.id })).status).toBe(
      200,
    );
    const { machine, bench, pullups } = await cards(account, b, id);
    expect(
      (
        await call(swapCandidatesRoute, account, {
          params: { loggedExerciseId: machine.loggedExerciseId },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await putSwap(account, machine.loggedExerciseId, {
          newExerciseId: b.bench.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (await putSkipped(account, pullups.loggedExerciseId, { skipped: true }))
        .status,
    ).toBe(200);
    const [set] = await logSets(account, bench, [
      { weightLbs: 185, reps: 5, rir: 1 },
    ]);
    expect(
      (await patchSet(account, set.id, { weightLbs: 190, reps: 5 })).status,
    ).toBe(200);
    expect(
      (await patchPlanned(account, bench.loggedExerciseId, { plannedSets: 1 }))
        .status,
    ).toBe(200);
  });
});
