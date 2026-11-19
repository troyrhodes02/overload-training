/**
 * Pitch 21g — Insights in the Workout, end to end through the mobile route
 * handlers (spec §6, §12 "API"). The phone's insight reads are the existing
 * gated `GET /workouts/{id}` and `GET /history/{id}` WITHOUT `?fields=core`.
 * Only Supabase Auth is replaced (an opaque token "t.<userId>.s" verifies as
 * that user); the handlers, the pipeline, the gate, the engine, and every
 * write module are production code against a real database.
 *
 * What it proves: the phone's call is the web runner's call (one reader);
 * not enough history is the server's own sentence; a deload week suppresses
 * reactive calls; a machine's call follows the workout's gym; a correction,
 * an RIR edit, and a swap change the next read; a Free account's JSON holds
 * no Pro value; Pro → Free is enforced on the next read; another account's
 * workout is not found; and `?fields=core` still leaves the calls out.
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
import { GET as workoutRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/route";
import { PUT as gymRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/gym/route";
import { POST as completeRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/complete/route";
import { GET as historyWorkoutRoute } from "@/app/api/mobile/v1/history/[loggedSessionId]/route";
import { PATCH as editSetRoute } from "@/app/api/mobile/v1/sets/[loggedSetId]/route";
import { PUT as swapRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/exercise/route";
import { getOccurrenceProgression } from "@/lib/progression/queries";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import type { OccurrenceProgressionDto } from "@overload/shared/contracts/progression";
import type {
  LoggedWorkoutDetailViewDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { createTestAccount, grantTestPro } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import { createTestExercise } from "./support/plan-factories";
import {
  logWorkout,
  twoWorkoutBlock,
  WED,
  WED_DELOAD,
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
      { method: opts.method ?? "GET", headers, body },
    ),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** The phone's insight read: the full workout (no `?fields=core`). */
async function insights(account: Account, loggedSessionId: string) {
  const r = await call(workoutRoute, account, { params: { loggedSessionId } });
  expect(r.status).toBe(200);
  return r.body as WorkoutViewDto;
}

function only(v: WorkoutViewDto): OccurrenceProgressionDto {
  expect(v.progression).toHaveLength(1);
  return v.progression[0].progression;
}

type Block = Awaited<ReturnType<typeof twoWorkoutBlock>>;

/** Upper on the given Wednesdays, each 3 sets, then today's (index `at`) started. */
async function upperHistory(
  account: Account,
  b: Block,
  sets: [number | null, number][][],
  at: string,
) {
  const logged = [];
  for (const [i, s] of sets.entries()) {
    logged.push(
      await logWorkout(account, {
        sessionId: b.upper.id,
        date: WED[i],
        gymId: b.gym.id,
        exerciseId: b.exercise.id,
        sets: s,
      }),
    );
  }
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: b.upper.id,
    scheduledFor: at,
    gymId: b.gym.id,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
  return { logged, loggedSessionId, loggedExerciseId: le.id };
}

const TOP: [number, number][] = [
  [180, 8],
  [180, 8],
  [180, 8],
];

describe("a Pro account's card call is the web runner's call", () => {
  it("Progress, with the +5 suggestion inside the server's sentence", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(
      a,
      b,
      [
        TOP,
        [
          [185, 8],
          [185, 8],
          [185, 8],
        ],
      ],
      WED[2],
    );
    const occ = only(await insights(a, t.loggedSessionId));
    expect(occ.tag).toBe("progress");
    expect(occ.locked).toBeNull();
    expect(occ.suggestion).toEqual({ lbs: 190, kind: "progress_increment" });
    expect(occ.recommendation?.action).toBe("Try 190 lb today (+5 lb)");
    expect(occ.insufficientNote).toBeNull();
    // Parity: the web runner reads the same gated reader.
    expect(occ).toEqual(await getOccurrenceProgression(a, t.loggedExerciseId));
  });

  it("?fields=core still leaves every call out (21e clients unchanged)", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(a, b, [TOP, TOP], WED[2]);
    const r = await call(workoutRoute, a, {
      params: { loggedSessionId: t.loggedSessionId },
      query: "fields=core",
    });
    expect(r.status).toBe(200);
    expect(r.body.progression).toEqual([]);
  });

  it("not enough history: no call, and the server's own sentence (RD-3)", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(a, b, [TOP], WED[1]);
    const occ = only(await insights(a, t.loggedSessionId));
    expect(occ.tag).toBeNull();
    expect(occ.recommendation).toBeNull();
    expect(occ.suggestion).toBeNull();
    expect(occ.locked).toBeNull();
    expect(occ.insufficientNote).toBe(
      "Not enough history yet: 1 of 2 complete sessions.",
    );
  });

  it("a deload week: the quiet deload-week line, no reactive tag, no note", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    // A reactive-deload history (below 6 twice) still shows no Deload tag.
    const low: [number, number][] = [
      [180, 6],
      [180, 5],
      [180, 5],
    ];
    const t = await upperHistory(a, b, [TOP, TOP, low, low], WED_DELOAD);
    const v = await insights(a, t.loggedSessionId);
    expect(v.workout.scheduledDeloadWeek).toBe(true);
    const occ = only(v);
    expect(occ.scheduledDeloadWeek).toBe(true);
    expect(occ.tag).toBeNull();
    expect(occ.recommendation?.kind).toBe("scheduled_deload");
    expect(occ.recommendation?.action).toBe("Deload week: 160 lb (90%)");
    expect(occ.insufficientNote).toBeNull();
  });
});

describe("the call follows the evidence", () => {
  it("a machine's call follows the workout's gym (RD-D)", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a, {
      equipmentType: "machine",
      name: "Chest Press Machine",
    });
    const other = await db().gym.create({
      data: { userId: a.userId, name: "Riverside" },
    });
    const sets: [number, number][] = [
      [100, 8],
      [100, 8],
      [100, 8],
    ];
    for (const [i, gymId] of [b.gym.id, b.gym.id, other.id].entries()) {
      await logWorkout(a, {
        sessionId: b.upper.id,
        date: WED[i],
        gymId,
        exerciseId: b.exercise.id,
        sets,
      });
    }
    const { loggedSessionId } = await startOrResumeWorkout(a, {
      sessionId: b.upper.id,
      scheduledFor: WED[3],
      gymId: b.gym.id,
    });
    const atHome = only(await insights(a, loggedSessionId));
    expect(atHome.recommendation).not.toBeNull();
    expect(atHome.recommendation?.evidence).toContain("at Downtown Gym");

    const moved = await call(gymRoute, a, {
      method: "PUT",
      params: { loggedSessionId },
      json: { gymId: other.id },
    });
    expect(moved.status).toBe(200);
    const atRiverside = only(await insights(a, loggedSessionId));
    expect(atRiverside.recommendation).toBeNull();
    expect(atRiverside.insufficientNote).toBe(
      "Not enough history yet at Riverside: 1 of 2 complete sessions.",
    );
  });

  it("correcting reps, then RIR, changes the next read (no stored call)", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(
      a,
      b,
      [
        TOP,
        [
          [180, 8],
          [180, 8],
          [180, 7],
        ],
      ],
      WED[2],
    );
    const before = only(await insights(a, t.loggedSessionId));
    expect(before.recommendation?.kind).toBe("hold");
    expect(before.recommendation?.action).toBe("Stay at 180 lb today");

    const set3 = await db().loggedSet.findFirstOrThrow({
      where: { loggedExerciseId: t.logged[1].loggedExerciseId, setNumber: 3 },
    });
    const setsBefore = await db().loggedSet.count({
      where: { userId: a.userId },
    });
    const reps = await call(editSetRoute, a, {
      method: "PATCH",
      params: { loggedSetId: set3.id },
      json: { weightLbs: 180, reps: 8 },
    });
    expect(reps.status).toBe(200);
    const fixed = only(await insights(a, t.loggedSessionId));
    expect(fixed.tag).toBe("progress");
    expect(fixed.recommendation?.action).toBe("Try 185 lb today (+5 lb)");

    const rir = await call(editSetRoute, a, {
      method: "PATCH",
      params: { loggedSetId: set3.id },
      json: { weightLbs: 180, reps: 8, rir: 0 },
    });
    expect(rir.status).toBe(200);
    const atLimit = only(await insights(a, t.loggedSessionId));
    expect(atLimit.tag).toBeNull();
    expect(atLimit.rirEffect).toBe("held_at_limit");
    expect(atLimit.recommendation?.evidence).toContain("(0 RIR)");
    // Corrections edit in place: no set was added or removed.
    expect(await db().loggedSet.count({ where: { userId: a.userId } })).toBe(
      setsBefore,
    );
  });

  it("a swap's call is about the performed exercise, with its own history", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(a, b, [TOP, TOP], WED[2]);
    const sub = await createTestExercise({
      userId: a.userId,
      name: "Dumbbell Bench Press",
      equipmentType: "dumbbell",
      primaryMuscle: "chest",
    });
    const swapped = await call(swapRoute, a, {
      method: "PUT",
      params: { loggedExerciseId: t.loggedExerciseId },
      json: { newExerciseId: sub.id },
    });
    expect(swapped.status).toBe(200);
    const occ = only(await insights(a, t.loggedSessionId));
    expect(occ.tag).toBeNull();
    expect(occ.recommendation).toBeNull();
    expect(occ.insufficientNote).toBe(
      "Not enough history yet: 0 of 2 complete sessions.",
    );
  });

  it("the summary's calls are next-time calls about the finished workout", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(a, b, [TOP], WED[1]);
    const le = t.loggedExerciseId;
    for (const n of [1, 2, 3]) {
      await logSet(a, {
        loggedExerciseId: le,
        setNumber: n,
        weightLbs: 180,
        reps: 8,
      });
    }
    const done = await call(completeRoute, a, {
      method: "POST",
      params: { loggedSessionId: t.loggedSessionId },
    });
    expect(done.status).toBe(200);
    const r = await call(historyWorkoutRoute, a, {
      params: { loggedSessionId: t.loggedSessionId },
    });
    expect(r.status).toBe(200);
    const v = r.body as LoggedWorkoutDetailViewDto;
    expect(v.summary?.locked).toBeNull();
    const row = v.summary!.exercises[0];
    expect(row.tag).toBe("progress");
    expect(row.recommendation?.action).toBe("Try 185 lb next time (+5 lb)");
    expect(v.detail.exercises[0].sets).toHaveLength(3);
  });
});

describe("Free and Pro (RD-F)", () => {
  const PRO_KEYS = ["tag", "rirEffect", "suggestion", "recommendation"];

  it("a Free account's JSON holds no Pro value; the note about its own data stays", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b = await twoWorkoutBlock(free);
    const t = await upperHistory(free, b, [TOP, TOP], WED[2]);
    const occ = only(await insights(free, t.loggedSessionId));
    for (const k of PRO_KEYS) {
      expect(occ[k as keyof OccurrenceProgressionDto]).toBeNull();
    }
    expect(occ.locked).toBe("progression_insights");

    const fresh = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b2 = await twoWorkoutBlock(fresh);
    const t2 = await upperHistory(fresh, b2, [TOP], WED[1]);
    const thin = only(await insights(fresh, t2.loggedSessionId));
    expect(thin.locked).toBeNull();
    expect(thin.insufficientNote).toBe(
      "Not enough history yet: 1 of 2 complete sessions.",
    );
  });

  it("Pro → Free is enforced on the next read; Pro again restores the call", async () => {
    const a = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(a, b, [TOP, TOP], WED[2]);
    expect(only(await insights(a, t.loggedSessionId)).tag).toBe("progress");

    await db().entitlement.updateMany({
      where: { userId: a.userId, source: "comp", revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const locked = only(await insights(a, t.loggedSessionId));
    expect(locked.locked).toBe("progression_insights");
    for (const k of PRO_KEYS) {
      expect(locked[k as keyof OccurrenceProgressionDto]).toBeNull();
    }

    await db().entitlement.deleteMany({
      where: { userId: a.userId, source: "comp" },
    });
    await grantTestPro(a.userId);
    expect(only(await insights(a, t.loggedSessionId)).tag).toBe("progress");
  });
});

describe("isolation (first invariant)", () => {
  it("another account's workout and record are not found on the full reads", async () => {
    const a = await createTestAccount();
    const intruder = await createTestAccount();
    const b = await twoWorkoutBlock(a);
    const t = await upperHistory(a, b, [TOP, TOP], WED[2]);
    const w = await call(workoutRoute, intruder, {
      params: { loggedSessionId: t.loggedSessionId },
    });
    expect(w.status).toBe(404);
    expect(JSON.stringify(w.body)).not.toContain("Bench");
    const h = await call(historyWorkoutRoute, intruder, {
      params: { loggedSessionId: t.logged[0].loggedSessionId },
    });
    expect(h.status).toBe(404);
    expect(JSON.stringify(h.body)).not.toContain("Bench");
  });
});
