/**
 * Pitch 25 (OVE-269): the Wing-It workout through the mobile API, as the
 * iPhone app runs it — the production route handlers on a real database
 * (only Supabase Auth is replaced). Start / resume / the 409 that names the
 * workout to finish, the picker, add and re-add, remove through the existing
 * skip endpoint, the workout's open-ended cards with the legacy values the
 * TestFlight 1.0.0 (2) build reads, finish, the logged detail, Today, and
 * History. The isolation suite covers the second account.
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

import { isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { Account } from "@/lib/data/account";
import { POST as startWingItRoute } from "@/app/api/mobile/v1/wing-it-workouts/route";
import { GET as candidatesRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/exercise-candidates/route";
import { PUT as addRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/exercises/[exerciseId]/route";
import { POST as startRoute } from "@/app/api/mobile/v1/workouts/route";
import { GET as workoutRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/route";
import { POST as completeRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/complete/route";
import { PUT as setRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]/route";
import { PUT as skippedRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/skipped/route";
import { PUT as swapRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/exercise/route";
import { PATCH as plannedSetsRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/planned-sets/route";
import { GET as historyWorkoutRoute } from "@/app/api/mobile/v1/history/[loggedSessionId]/route";
import { GET as historyWeekRoute } from "@/app/api/mobile/v1/history/route";
import { GET as todayRoute } from "@/app/api/mobile/v1/today/route";
import type {
  AddExerciseContextDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";
import type {
  LoggedWorkoutDetailViewDto,
  TodayDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import { LEGACY_OPEN_REP_RANGE } from "@overload/shared/logging/wing-it";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

const db = () => getTestPrisma();
const TODAY = todayIso("UTC");

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

async function call<T = unknown>(
  handler: unknown,
  a: Account,
  opts: {
    method?: string;
    json?: unknown;
    params?: Record<string, string>;
    query?: string;
    version?: string;
  } = {},
): Promise<{ status: number; body: T }> {
  const headers = new Headers({
    "x-overload-app-version": opts.version ?? "9.9.9",
    authorization: `Bearer t.${a.userId}.s`,
  });
  if (opts.json !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request(
      `http://localhost/api/mobile/v1/x${opts.query ? `?${opts.query}` : ""}`,
      {
        method: opts.method ?? (opts.json !== undefined ? "POST" : "GET"),
        headers,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      },
    ),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function setup() {
  const a = await createTestAccount();
  const gym = await db().gym.create({
    data: { userId: a.userId, name: "Harbor Barbell" },
  });
  const press = await createTestExercise({
    userId: a.userId,
    name: "Leg Press",
    equipmentType: "machine",
    primaryMuscle: "quads",
  });
  const fly = await createTestExercise({
    userId: a.userId,
    name: "Cable Fly",
    equipmentType: "cable",
    primaryMuscle: "chest",
  });
  return { a, gym, press, fly };
}

describe("a Wing-It workout through the mobile API", () => {
  it("start, pick, add, log, remove, finish — and every read says Wing-It", async () => {
    const { a, gym, press, fly } = await setup();

    const started = await call<{ loggedSessionId: string; resumed: boolean }>(
      startWingItRoute,
      a,
      { json: { gymId: gym.id } },
    );
    expect(started.status).toBe(200);
    expect(started.body.resumed).toBe(false);
    const id = started.body.loggedSessionId;
    const again = await call(startWingItRoute, a, { json: { gymId: gym.id } });
    expect(again.body).toEqual({ loggedSessionId: id, resumed: true });

    // The picker: every group by default, one group on request.
    const all = await call<AddExerciseContextDto>(candidatesRoute, a, {
      params: { loggedSessionId: id },
    });
    expect(all.status).toBe(200);
    expect(all.body.selectedMuscle).toBe("all");
    expect(all.body.selectedMuscleLabel).toBe("All muscle groups");
    expect(all.body.candidates.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Leg Press", "Cable Fly"]),
    );
    const quads = await call<AddExerciseContextDto>(candidatesRoute, a, {
      params: { loggedSessionId: id },
      query: "muscle=quads",
    });
    expect(
      quads.body.candidates.every((c) => c.primaryMuscle === "quads"),
    ).toBe(true);
    const bogus = await call<AddExerciseContextDto>(candidatesRoute, a, {
      params: { loggedSessionId: id },
      query: "muscle=elbows",
    });
    expect(bogus.body.selectedMuscle).toBe("all");

    // Add, then add again: one card.
    const add = await call<{ loggedExerciseId: string; added: boolean }>(
      addRoute,
      a,
      {
        method: "PUT",
        params: { loggedSessionId: id, exerciseId: press.id },
      },
    );
    expect(add.status).toBe(200);
    expect(add.body.added).toBe(true);
    const dup = await call(addRoute, a, {
      method: "PUT",
      params: { loggedSessionId: id, exerciseId: press.id },
    });
    expect(dup.body).toEqual({ ...add.body, added: false });
    const marked = await call<AddExerciseContextDto>(candidatesRoute, a, {
      params: { loggedSessionId: id },
    });
    expect(
      marked.body.candidates.find((c) => c.id === press.id)?.inWorkout,
    ).toBe(true);
    const flyAdd = await call<{ loggedExerciseId: string }>(addRoute, a, {
      method: "PUT",
      params: { loggedSessionId: id, exerciseId: fly.id },
    });

    // Log two sets of the press; set 3 out of order is refused.
    const le = add.body.loggedExerciseId;
    for (const [n, w] of [
      [1, 200],
      [2, 220],
    ] as const) {
      const r = await call(setRoute, a, {
        method: "PUT",
        json: { weightLbs: w, reps: 10 },
        params: { loggedExerciseId: le, setNumber: String(n) },
      });
      expect(r.status).toBe(200);
    }
    const gap = await call(setRoute, a, {
      method: "PUT",
      json: { weightLbs: 220, reps: 10 },
      params: { loggedExerciseId: le, setNumber: "4" },
    });
    expect(gap.status).toBe(400);

    // Swap and planned-set corrections (offered by an old build) are refused.
    const swap = await call<{ error: { code: string } }>(swapRoute, a, {
      method: "PUT",
      json: { newExerciseId: fly.id },
      params: { loggedExerciseId: flyAdd.body.loggedExerciseId },
    });
    expect([swap.status, swap.body.error.code]).toEqual([
      400,
      "invalid_state_transition",
    ]);
    const fewer = await call<{ error: { code: string } }>(plannedSetsRoute, a, {
      method: "PATCH",
      json: { plannedSets: 1 },
      params: { loggedExerciseId: le },
    });
    expect([fewer.status, fewer.body.error.code]).toEqual([
      400,
      "invalid_state_transition",
    ]);

    // Remove the fly (no sets) through the existing skip endpoint.
    const removed = await call(skippedRoute, a, {
      method: "PUT",
      json: { skipped: true },
      params: { loggedExerciseId: flyAdd.body.loggedExerciseId },
    });
    expect(removed.status).toBe(200);

    // The workout as the app reads it (core fields).
    const view = await call<WorkoutViewDto>(workoutRoute, a, {
      params: { loggedSessionId: id },
      query: "fields=core",
    });
    const w: WorkoutDto = view.body.workout;
    expect(w).toMatchObject({
      kind: "wing_it",
      sessionName: "Wing-It workout",
      gymName: "Harbor Barbell",
      gymLocked: true,
      status: "in_progress",
    });
    expect(w.exercises).toHaveLength(1);
    const card = w.exercises[0]!;
    expect(card).toMatchObject({
      openEnded: true,
      plannedSets: 3,
      plannedRepRange: LEGACY_OPEN_REP_RANGE,
      suggestedWeightLbs: null,
      gymName: "Harbor Barbell",
    });
    expect(card.sets.map((s) => [s.setNumber, s.saved, s.extra])).toEqual([
      [1, true, false],
      [2, true, false],
      [3, false, false],
    ]);
    // The full answer has no calls (and nothing locked) for a Wing-It workout.
    const full = await call<WorkoutViewDto>(workoutRoute, a, {
      params: { loggedSessionId: id },
    });
    expect(full.body.progression).toEqual([]);

    // Today while open.
    const today = await call<TodayDto>(todayRoute, a, { query: "fields=core" });
    expect(today.body.wingIt?.open).toMatchObject({
      loggedSessionId: id,
      setsLogged: 2,
      exerciseCount: 1,
      gymName: "Harbor Barbell",
    });

    // Finish, twice.
    for (let i = 0; i < 2; i++) {
      const done = await call(completeRoute, a, {
        method: "POST",
        params: { loggedSessionId: id },
      });
      expect(done.body).toEqual({ loggedSessionId: id, status: "complete" });
    }

    // The logged detail.
    const detail = await call<LoggedWorkoutDetailViewDto>(
      historyWorkoutRoute,
      a,
      {
        params: { loggedSessionId: id },
      },
    );
    expect(detail.body.summary).toBeNull();
    expect(detail.body.detail).toMatchObject({
      kind: "wing_it",
      sessionName: "Wing-It workout",
      gymName: "Harbor Barbell",
    });
    expect(detail.body.detail.exercises).toHaveLength(1);
    expect(detail.body.detail.exercises[0]).toMatchObject({
      openEnded: true,
      plannedSets: 2,
    });

    // Today after finishing; History.
    const after = await call<TodayDto>(todayRoute, a);
    expect(after.body.wingIt).toEqual({
      open: null,
      blockedBy: null,
      finishedToday: [
        {
          loggedSessionId: id,
          gymName: "Harbor Barbell",
          exerciseCount: 1,
          setsLogged: 2,
          startedOn: TODAY,
        },
      ],
    });
    const week = await call<HistoryWeekDto>(historyWeekRoute, a);
    expect(week.body.view.kind).toBe("logged");
    expect(JSON.stringify(week.body)).toContain(id);
  });

  it("409 names the planned workout holding saved sets; nothing starts", async () => {
    const { a, gym, press } = await setup();
    const meso = await createActiveTestMesocycle({
      userId: a.userId,
      name: "Block",
      startDate: new Date(`${TODAY}T00:00:00Z`),
      lengthWeeks: 4,
      deloadEveryWeeks: 4,
    });
    const upper = await createTestSession(meso.id, {
      userId: a.userId,
      name: "Upper Body",
      dayOfWeek: isoWeekday(TODAY),
    });
    await createTestSessionExercise(upper.id, press.id, {
      userId: a.userId,
      plannedSets: 3,
      targetRepMin: 8,
      targetRepMax: 10,
    });
    const planned = await call<{ loggedSessionId: string }>(startRoute, a, {
      json: { sessionId: upper.id, scheduledFor: TODAY, gymId: gym.id },
    });
    const ple = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId: planned.body.loggedSessionId },
    });
    await call(setRoute, a, {
      method: "PUT",
      json: { weightLbs: 200, reps: 10 },
      params: { loggedExerciseId: ple.id, setNumber: "1" },
    });
    const refused = await call<{
      error: { code: string; message: string; details: Record<string, string> };
    }>(startWingItRoute, a, { json: { gymId: gym.id } });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({
      code: "conflict",
      message:
        "Finish Upper Body first. It's still in progress with sets saved.",
      details: {
        loggedSessionId: planned.body.loggedSessionId,
        sessionName: "Upper Body",
      },
    });
    expect(
      await db().loggedSession.count({
        where: { userId: a.userId, kind: "wing_it" },
      }),
    ).toBe(0);
    // Today says the same, and the planned day is unchanged.
    const today = await call<TodayDto>(todayRoute, a, { query: "fields=core" });
    expect(today.body.wingIt?.blockedBy?.loggedSessionId).toBe(
      planned.body.loggedSessionId,
    );
    expect(today.body.dashboard.kind).toBe("in_progress");
  });

  it("a planned workout's id is refused by the picker and the add endpoint", async () => {
    const { a, gym, press } = await setup();
    const meso = await createActiveTestMesocycle({
      userId: a.userId,
      name: "Block",
      startDate: new Date(`${TODAY}T00:00:00Z`),
      lengthWeeks: 4,
      deloadEveryWeeks: 4,
    });
    const upper = await createTestSession(meso.id, {
      userId: a.userId,
      name: "Upper Body",
      dayOfWeek: isoWeekday(TODAY),
    });
    await createTestSessionExercise(upper.id, press.id, {
      userId: a.userId,
      plannedSets: 3,
      targetRepMin: 8,
      targetRepMax: 10,
    });
    const planned = await call<{ loggedSessionId: string }>(startRoute, a, {
      json: { sessionId: upper.id, scheduledFor: TODAY, gymId: gym.id },
    });
    const pick = await call(candidatesRoute, a, {
      params: { loggedSessionId: planned.body.loggedSessionId },
    });
    expect(pick.status).toBe(404);
    const add = await call<{ error: { code: string } }>(addRoute, a, {
      method: "PUT",
      params: {
        loggedSessionId: planned.body.loggedSessionId,
        exerciseId: press.id,
      },
    });
    expect([add.status, add.body.error.code]).toEqual([
      400,
      "invalid_state_transition",
    ]);
  });
});
