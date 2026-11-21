/**
 * Pitch 21e — the Workout Loop's mobile endpoints, end to end through the
 * route handlers (spec §11 "API behavior"). Only Supabase Auth is replaced:
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

import type { Account } from "@/lib/data/account";
import { POST as startRoute } from "@/app/api/mobile/v1/workouts/route";
import { GET as workoutRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/route";
import { POST as completeRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/complete/route";
import { PUT as setRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]/route";
import { GET as historyWeekRoute } from "@/app/api/mobile/v1/history/route";
import { GET as historyWorkoutRoute } from "@/app/api/mobile/v1/history/[loggedSessionId]/route";
import { GET as todayRoute } from "@/app/api/mobile/v1/today/route";
import { cloneMesocycle } from "@/lib/plan/mesocycles";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type { ExerciseCardDto } from "@overload/shared/contracts/logging";
import type {
  LoggedWorkoutDetailViewDto,
  TodayDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  logWorkout,
  SAT,
  twoWorkoutBlock,
  WED,
} from "./support/recurring-fixtures";

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
    rawBody?: string;
    params?: Record<string, string>;
    query?: string;
  } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
  });
  const body =
    opts.rawBody ??
    (opts.json === undefined ? undefined : JSON.stringify(opts.json));
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

type Block = Awaited<ReturnType<typeof twoWorkoutBlock>>;

async function start(
  account: Account,
  b: Block,
  sessionId: string,
  date: string,
) {
  const r = await call(startRoute, account, {
    json: { sessionId, scheduledFor: date, gymId: b.gym.id },
  });
  expect(r.status).toBe(200);
  return r.body.loggedSessionId as string;
}

async function readWorkout(account: Account, loggedSessionId: string) {
  const r = await call(workoutRoute, account, { params: { loggedSessionId } });
  expect(r.status).toBe(200);
  return r.body as WorkoutViewDto;
}

async function cardVia(
  account: Account,
  b: Block,
  sessionId: string,
  date: string,
): Promise<ExerciseCardDto> {
  const view = await readWorkout(
    account,
    await start(account, b, sessionId, date),
  );
  const card = view.workout.exercises.find(
    (e) => e.performedExerciseId === b.exercise.id,
  );
  if (!card) throw new Error("card not found");
  return card;
}

const putSet = (
  account: Account,
  loggedExerciseId: string,
  setNumber: string,
  json: unknown,
) =>
  call(setRoute, account, {
    method: "PUT",
    json,
    params: { loggedExerciseId, setNumber },
  });

const heavy: [number, number][] = [
  [255, 5],
  [255, 5],
  [255, 4],
];
const volume: [number, number][] = [
  [230, 8],
  [230, 7],
  [230, 7],
];

let account: Account;
beforeEach(async () => {
  account = await createTestAccount();
});

describe("a full workout through the API", () => {
  it("starts, logs every planned set, and finishes once", async () => {
    const b = await twoWorkoutBlock(account);
    const loggedSessionId = await start(account, b, b.push.id, SAT[0]);
    const view = await readWorkout(account, loggedSessionId);
    expect(view.workout).toMatchObject({
      sessionName: "Push",
      status: "in_progress",
      scheduledFor: SAT[0],
      gymName: "Downtown Gym",
    });
    const [card] = view.workout.exercises;
    expect(card.plannedSets).toBe(3);
    expect(card.plannedRepRange).toEqual({ min: 3, max: 5 });

    for (const [i, [weightLbs, reps]] of heavy.entries()) {
      const r = await putSet(account, card.loggedExerciseId, String(i + 1), {
        weightLbs,
        reps,
      });
      expect(r.status).toBe(200);
    }
    const after = await readWorkout(account, loggedSessionId);
    expect(
      after.workout.exercises[0].sets.map((s) => [
        s.weightLbs,
        s.reps,
        s.saved,
      ]),
    ).toEqual([
      [255, 5, true],
      [255, 5, true],
      [255, 4, true],
    ]);

    const done = await call(completeRoute, account, {
      method: "POST",
      params: { loggedSessionId },
    });
    expect(done.status).toBe(200);
    expect(
      await db().loggedSession.count({ where: { userId: account.userId } }),
    ).toBe(1);
    const stored = await db().loggedSet.findMany({
      where: { loggedExerciseId: card.loggedExerciseId },
      orderBy: { setNumber: "asc" },
    });
    expect(stored.map((s) => [Number(s.weightLbs), s.reps, s.rir])).toEqual([
      [255, 5, null],
      [255, 5, null],
      [255, 4, null],
    ]);
  });

  it("a finished workout refuses a new set and keeps its sets", async () => {
    const b = await twoWorkoutBlock(account);
    const { loggedSessionId, loggedExerciseId } = await logWorkout(account, {
      sessionId: b.push.id,
      date: SAT[0],
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets: [[255, 5]],
    });
    const r = await putSet(account, loggedExerciseId, "2", {
      weightLbs: 255,
      reps: 5,
    });
    expect([r.status, r.body.error.code]).toEqual([
      400,
      "invalid_state_transition",
    ]);
    expect(await db().loggedSet.count({ where: { loggedExerciseId } })).toBe(1);
    const finished = await readWorkout(account, loggedSessionId);
    expect(finished.workout.status).toBe("complete");
    // A finished workout's cards carry no calls (review #5).
    expect(finished.progression).toEqual([]);
  });

  it("finishing with no set logged is refused and changes nothing", async () => {
    const b = await twoWorkoutBlock(account);
    const loggedSessionId = await start(account, b, b.push.id, SAT[0]);
    const r = await call(completeRoute, account, {
      method: "POST",
      params: { loggedSessionId },
    });
    expect([r.status, r.body.error.code]).toEqual([400, "validation_error"]);
    expect(
      (
        await db().loggedSession.findUniqueOrThrow({
          where: { id: loggedSessionId },
        })
      ).status,
    ).toBe("in_progress");
  });
});

describe("validation, with the web's own messages", () => {
  it("refuses bad set numbers, weights, reps, and bodies, and stores nothing", async () => {
    const b = await twoWorkoutBlock(account);
    const loggedSessionId = await start(account, b, b.push.id, SAT[0]);
    const [card] = (await readWorkout(account, loggedSessionId)).workout
      .exercises;
    const id = card.loggedExerciseId;

    for (const n of ["0", "abc", "1000", "01", "1.5"]) {
      const r = await putSet(account, id, n, { weightLbs: 100, reps: 5 });
      expect([n, r.status, Object.keys(r.body.error.details ?? {})]).toEqual([
        n,
        400,
        ["setNumber"],
      ]);
    }
    const asString = await putSet(account, id, "1", {
      weightLbs: "185",
      reps: 5,
    });
    expect([asString.status, asString.body.error.details.weightLbs]).toEqual([
      400,
      "Enter a weight above 0.",
    ]);
    const tooPrecise = await putSet(account, id, "1", {
      weightLbs: 185.125,
      reps: 5,
    });
    expect(tooPrecise.body.error.details.weightLbs).toBe(
      "Use at most two decimal places.",
    );
    const noReps = await putSet(account, id, "1", { weightLbs: 185, reps: 0 });
    expect(noReps.body.error.details.reps).toBe("Enter reps above 0.");
    const notJson = await call(setRoute, account, {
      method: "PUT",
      rawBody: "{",
      params: { loggedExerciseId: id, setNumber: "1" },
    });
    expect([notJson.status, notJson.body.error.code]).toEqual([
      400,
      "validation_error",
    ]);
    // Beyond the plan, an extra set must follow the logged ones.
    const gap = await putSet(account, id, "5", { weightLbs: 185, reps: 5 });
    expect(gap.status).toBe(400);
    expect(
      await db().loggedSet.count({ where: { loggedExerciseId: id } }),
    ).toBe(0);
  });

  it("refuses a start without a gym, a date, or a session", async () => {
    const b = await twoWorkoutBlock(account);
    for (const [json, field] of [
      [{ sessionId: b.push.id, scheduledFor: SAT[0] }, "gymId"],
      [{ sessionId: b.push.id, gymId: b.gym.id }, "scheduledFor"],
      [{ scheduledFor: SAT[0], gymId: b.gym.id }, "sessionId"],
    ] as const) {
      const r = await call(startRoute, account, { json });
      expect([r.status, Object.keys(r.body.error.details)]).toEqual([
        400,
        [field],
      ]);
    }
    // A day the block doesn't schedule this workout.
    const wrongDay = await call(startRoute, account, {
      json: { sessionId: b.push.id, scheduledFor: WED[0], gymId: b.gym.id },
    });
    expect([wrongDay.status, wrongDay.body.error.message]).toEqual([
      400,
      "That workout isn't scheduled on that day.",
    ]);
    expect(
      await db().loggedSession.count({ where: { userId: account.userId } }),
    ).toBe(0);
  });
});

describe("Free capture", () => {
  it("a Free account starts, logs, and finishes", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b = await twoWorkoutBlock(free);
    const loggedSessionId = await start(free, b, b.push.id, SAT[0]);
    const [card] = (await readWorkout(free, loggedSessionId)).workout.exercises;
    const r = await putSet(free, card.loggedExerciseId, "1", {
      weightLbs: 100,
      reps: 5,
    });
    expect(r.status).toBe(200);
    const done = await call(completeRoute, free, {
      method: "POST",
      params: { loggedSessionId },
    });
    expect(done.status).toBe(200);
  });
});

describe("Prescription-Aware weight context, as the phone receives it", () => {
  const log = (
    b: Block,
    sessionId: string,
    date: string,
    sets: [number, number][],
  ) =>
    logWorkout(account, {
      sessionId,
      date,
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets,
    });

  it("Saturday Push offers 255 from Push", async () => {
    const b = await twoWorkoutBlock(account);
    await log(b, b.push.id, SAT[0], heavy);
    const card = await cardVia(account, b, b.push.id, SAT[1]);
    expect(card).toMatchObject({
      weightContext: "trusted",
      suggestedWeightLbs: 255,
      referencePerformance: null,
    });
    expect(card.previousPerformance?.sessionName).toBe("Push");
  });

  it("the first Upper leaves the box empty and shows Push only as reference", async () => {
    const b = await twoWorkoutBlock(account);
    await log(b, b.push.id, SAT[0], heavy);
    const card = await cardVia(account, b, b.upper.id, WED[1]);
    expect(card).toMatchObject({
      weightContext: "reference_only",
      suggestedWeightLbs: null,
      previousPerformance: null,
    });
    expect(card.referencePerformance).toMatchObject({
      sessionName: "Push",
      repRange: { min: 3, max: 5 },
    });
  });

  it("Upper with its own history offers 230, never Saturday's 255", async () => {
    const b = await twoWorkoutBlock(account);
    await log(b, b.push.id, SAT[0], heavy);
    await log(b, b.upper.id, WED[1], volume);
    await log(b, b.push.id, SAT[1], heavy);
    const card = await cardVia(account, b, b.upper.id, WED[2]);
    expect(card).toMatchObject({
      weightContext: "trusted",
      suggestedWeightLbs: 230,
    });
    expect(card.previousPerformance?.sessionName).toBe("Upper");
  });

  it("returning to an older rep range does not revive the old weight", async () => {
    const b = await twoWorkoutBlock(account);
    await log(b, b.upper.id, WED[0], volume); // Block 1: 6–8
    // Two-week blocks (deload in week 2), back to back: 6–8, then 8–10, then
    // 6–8 again. Every Wednesday used is a normal week 1.
    await db().mesocycle.update({
      where: { id: b.meso.id },
      data: { lengthWeeks: 2, deloadEveryWeeks: 2 },
    });
    const next = async (
      sourceMesocycleId: string,
      startDate: string,
      reps: [number, number],
    ) => {
      const { id } = await cloneMesocycle(account, {
        sourceMesocycleId,
        name: `Block from ${startDate}`,
        startDate,
        lengthWeeks: "2",
        deloadEveryWeeks: "2",
      });
      await db().mesocycle.updateMany({
        where: { userId: account.userId, status: "active" },
        data: { status: "archived" },
      });
      await db().mesocycle.update({
        where: { id },
        data: { status: "active" },
      });
      const upper = await db().session.findFirstOrThrow({
        where: { mesocycleId: id, name: "Upper" },
      });
      await db().sessionExercise.updateMany({
        where: { sessionId: upper.id },
        data: { targetRepMin: reps[0], targetRepMax: reps[1] },
      });
      return { mesocycleId: id, upper };
    };
    const block2 = await next(b.meso.id, "2026-10-19", [8, 10]);
    await log(b, block2.upper.id, "2026-10-21", [
      [205, 10],
      [205, 9],
      [205, 9],
    ]);
    const block3 = await next(block2.mesocycleId, "2026-11-02", [6, 8]);
    const card = await cardVia(account, b, block3.upper.id, "2026-11-04");
    expect(card.plannedRepRange).toEqual({ min: 6, max: 8 });
    expect(card.weightContext).not.toBe("trusted");
    expect(card.suggestedWeightLbs).toBeNull();
  });

  it("a cable machine offers the latest comparable 55 lb, not the 50 lb baseline", async () => {
    const b = await twoWorkoutBlock(account, {
      equipmentType: "cable",
      name: "Triceps Pushdown",
      upper: { reps: [10, 12] },
    });
    await log(b, b.upper.id, WED[0], [
      [50, 12],
      [50, 12],
      [50, 12],
    ]);
    await log(b, b.upper.id, WED[1], [
      [55, 12],
      [55, 11],
      [55, 10],
    ]);
    const baseline = await db().gymExerciseBaseline.findUniqueOrThrow({
      where: {
        gymId_exerciseId: { gymId: b.gym.id, exerciseId: b.exercise.id },
      },
    });
    expect(Number(baseline.weightLbs)).toBe(50);
    const card = await cardVia(account, b, b.upper.id, WED[2]);
    expect(card).toMatchObject({
      weightContext: "trusted",
      suggestedWeightLbs: 55,
      workingWeightFromBaseline: false,
    });
  });

  it("a started workout keeps its copied plan after the plan is edited", async () => {
    const b = await twoWorkoutBlock(account);
    const loggedSessionId = await start(account, b, b.upper.id, WED[0]);
    await db().sessionExercise.updateMany({
      where: { sessionId: b.upper.id },
      data: { targetRepMin: 10, targetRepMax: 12, plannedSets: 5 },
    });
    const [card] = (await readWorkout(account, loggedSessionId)).workout
      .exercises;
    expect([card.plannedSets, card.plannedRepRange]).toEqual([
      3,
      { min: 6, max: 8 },
    ]);
  });
});

describe("all-time history through the API (E5, E6)", () => {
  it("reaches a week two blocks back, keeps archived exercises, and stops at the first week", async () => {
    const b = await twoWorkoutBlock(account);
    const first = await logWorkout(account, {
      sessionId: b.upper.id,
      date: WED[0],
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets: volume,
    });
    await db().mesocycle.update({
      where: { id: b.meso.id },
      data: { lengthWeeks: 2, deloadEveryWeeks: 2 },
    });
    let source = b.meso.id;
    for (const startDate of ["2026-10-19", "2026-11-02"]) {
      const { id } = await cloneMesocycle(account, {
        sourceMesocycleId: source,
        name: `Block from ${startDate}`,
        startDate,
        lengthWeeks: "2",
        deloadEveryWeeks: "2",
      });
      await db().mesocycle.updateMany({
        where: { userId: account.userId, status: "active" },
        data: { status: "archived" },
      });
      await db().mesocycle.update({
        where: { id },
        data: { status: "active" },
      });
      source = id;
    }
    // The lift is archived after it was logged: history keeps it.
    await db().exercise.update({
      where: { id: b.exercise.id },
      data: { deletedAt: new Date() },
    });

    const week = await call(historyWeekRoute, account, {
      query: `week=${WED[0]}`,
    });
    expect(week.status).toBe(200);
    const dto = week.body as HistoryWeekDto;
    expect(dto.weekStart).toBe("2026-10-05");
    expect(dto.prevWeekStart).toBeNull();
    expect(dto.view.kind).toBe("logged");
    if (dto.view.kind !== "logged") throw new Error("unreachable");
    const workouts = dto.view.days.flatMap((d) => d.workouts);
    expect(
      workouts.map((w) => [w.loggedSessionId, w.sessionName, w.state]),
    ).toEqual([[first.loggedSessionId, "Upper", "complete"]]);
    expect(dto.earlierBlocks.map((e) => e.mesocycleId)).toContain(b.meso.id);

    const detail = await call(historyWorkoutRoute, account, {
      params: { loggedSessionId: first.loggedSessionId },
    });
    expect(detail.status).toBe(200);
    const [exercise] = (detail.body as LoggedWorkoutDetailViewDto).detail
      .exercises;
    expect(exercise).toMatchObject({
      performedName: "Barbell Bench Press",
      archived: true,
      skipped: false,
    });
    expect(exercise.sets.map((s) => [s.weightLbs, s.reps])).toEqual([
      [230, 8],
      [230, 7],
      [230, 7],
    ]);
  });

  it("an account with nothing logged and no plan has an empty history", async () => {
    const r = await call(historyWeekRoute, account);
    expect(r.status).toBe(200);
    expect((r.body as HistoryWeekDto).hasAnyHistory).toBe(false);
  });
});

describe("core fields only (?fields=core, Checkpoint A round 2 RD-28)", () => {
  const core = "fields=core";

  it("the workout is the full answer's workout, with no calls computed", async () => {
    const b = await twoWorkoutBlock(account);
    await logWorkout(account, {
      sessionId: b.push.id,
      date: SAT[0],
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets: heavy,
    });
    const loggedSessionId = await start(account, b, b.push.id, SAT[1]);
    const full = await call(workoutRoute, account, {
      params: { loggedSessionId },
    });
    const lean = await call(workoutRoute, account, {
      params: { loggedSessionId },
      query: core,
    });
    expect(lean.status).toBe(200);
    expect((full.body as WorkoutViewDto).progression.length).toBeGreaterThan(0);
    expect(lean.body).toEqual({
      workout: (full.body as WorkoutViewDto).workout,
      progression: [],
    });
    // Any other value is the full answer.
    const other = await call(workoutRoute, account, {
      params: { loggedSessionId },
      query: "fields=everything",
    });
    expect(other.body).toEqual(full.body);
  });

  it("the logged workout is the full answer's record, with no summary or goals", async () => {
    const b = await twoWorkoutBlock(account);
    const { loggedSessionId } = await logWorkout(account, {
      sessionId: b.push.id,
      date: SAT[0],
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets: heavy,
    });
    const full = await call(historyWorkoutRoute, account, {
      params: { loggedSessionId },
    });
    const lean = await call(historyWorkoutRoute, account, {
      params: { loggedSessionId },
      query: core,
    });
    expect(lean.status).toBe(200);
    expect((full.body as LoggedWorkoutDetailViewDto).summary).not.toBeNull();
    expect(lean.body).toEqual({
      detail: (full.body as LoggedWorkoutDetailViewDto).detail,
      summary: null,
      goals: [],
    });
    // Not found stays not found.
    const missing = await call(historyWorkoutRoute, account, {
      params: { loggedSessionId: "00000000-0000-4000-8000-000000000000" },
      query: core,
    });
    expect(missing.status).toBe(404);
  });

  it("Today is the full answer's day and greeting, with no calls, summary, or goals", async () => {
    await twoWorkoutBlock(account);
    const full = await call(todayRoute, account);
    const lean = await call(todayRoute, account, { query: core });
    expect(lean.status).toBe(200);
    const f = full.body as TodayDto;
    expect(lean.body).toEqual({
      today: f.today,
      greeting: f.greeting,
      dashboard: f.dashboard,
      plannedProgression: [],
      sessionSummary: null,
      sessionGoals: [],
      goals: null,
      // Pitch 21g (OVE-228): unfinished earlier workouts are state, not a
      // call, so the core answer carries them, exactly as the full one does.
      unfinishedWorkouts: f.unfinishedWorkouts,
    });
    expect(f.unfinishedWorkouts).toEqual([]);
  });
});
