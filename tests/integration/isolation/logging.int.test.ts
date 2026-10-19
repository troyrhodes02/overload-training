import type { Account } from "@/lib/data/account";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import {
  changeGym,
  completeWorkout,
  setExerciseSkipped,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import {
  getLoggedWorkoutDetail,
  getSwapContext,
  getTodayDashboard,
  getWeekSchedule,
  getWorkout,
} from "@/lib/logging/queries";
import { editCardioLog, logCardio } from "@/lib/cardio/cardio-logs";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getQualifyingSessionE1rms,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { addDays } from "@/lib/plan/calendar";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { activePlan, library, startToday, today, type Lib } from "./fixtures";
import {
  expectForeignLikeMissing,
  ownedRowCount,
  snapshotAccount,
} from "./support";

/**
 * Second accounts here log against a DRAFT block (starting a workout needs a
 * session, not an active block); two accounts each holding an active block
 * is proven in ownership-enforce.int.test.ts, which needs the per-account
 * index from migration 10.
 *
 * Cross-account isolation — logged history, gym baselines, missed days,
 * cardio, and the progression reads derived from them (LoggedSession,
 * LoggedExercise, LoggedSet, GymExerciseBaseline, MissedDayResolution,
 * CardioLog). History is the most sensitive data in the product.
 */

let a: Account;
let b: Account;
let lib: Lib;
let A: {
  plan: Awaited<ReturnType<typeof activePlan>>;
  loggedSessionId: string;
  pressLe: string;
  benchLe: string;
  setId: string;
  cardioLogId: string;
};

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  lib = await library();
  const plan = await activePlan(a, lib, "A");
  const { loggedSessionId, les } = await startToday(a, plan);
  const [press, bench] = les;
  for (const n of [1, 2, 3]) {
    await logSet(a, {
      loggedExerciseId: press.id,
      setNumber: n,
      weightLbs: 120,
      reps: 8,
    });
  }
  await logSet(a, {
    loggedExerciseId: bench.id,
    setNumber: 1,
    weightLbs: 185,
    reps: 5,
  });
  await completeWorkout(a, { loggedSessionId });
  await resolveMissedDay(a, {
    mesocycleId: plan.meso.id,
    missedOn: addDays(today(), -7),
    outcome: "skipped",
  });
  const { cardioLogId } = await logCardio(a, {
    mesocycleId: plan.meso.id,
    scheduledFor: today(),
    type: "Incline walk",
    durationMin: "25",
  });
  const set = await getTestPrisma().loggedSet.findFirstOrThrow({
    where: { loggedExerciseId: press.id },
  });
  A = {
    plan,
    loggedSessionId,
    pressLe: press.id,
    benchLe: bench.id,
    setId: set.id,
    cardioLogId,
  };
});

describe("reads never surface another account's training", () => {
  it("Today and the week at a glance are empty for a second account", async () => {
    expect(await getTodayDashboard(b)).toEqual({ kind: "no_plan" });
    expect(await getWeekSchedule(b)).toBeNull();
    // …while the owner's are populated.
    expect((await getTodayDashboard(a)).kind).not.toBe("no_plan");
  });

  it("a workout, its detail, swap context, and progression by foreign id are not found", async () => {
    for (const [id, call] of [
      [A.loggedSessionId, (x: string) => getWorkout(b, x)],
      [A.loggedSessionId, (x: string) => getLoggedWorkoutDetail(b, x)],
      [A.loggedSessionId, (x: string) => getSessionProgressionSummary(b, x)],
      [A.pressLe, (x: string) => getSwapContext(b, x)],
      [A.pressLe, (x: string) => getOccurrenceProgression(b, x)],
    ] as const) {
      expect(await expectForeignLikeMissing(id, call)).toEqual({
        ok: true,
        value: null,
      });
    }
  });

  it("progression and e1RM on a shared exercise use only the acting account's sets", async () => {
    const mine = await getExerciseProgression(a, lib.chestPress.id);
    const theirs = await getExerciseProgression(b, lib.chestPress.id);
    expect(mine?.points.length).toBeGreaterThan(0);
    expect(theirs?.points).toEqual([]);
    expect(theirs?.tag ?? null).toBeNull();
    expect(await getQualifyingSessionE1rms(b, lib.chestPress.id, null)).toEqual(
      [],
    );
    expect(
      (await getQualifyingSessionE1rms(a, lib.chestPress.id, null)).length,
    ).toBeGreaterThan(0);
  });
});

describe("writes naming another account's history behave like missing ids and change nothing", () => {
  it("every logging, missed-day, and cardio write", async () => {
    const bPlan = await activePlan(b, lib, "B", { activate: false });
    const before = await snapshotAccount(a.userId);
    const bRowsBefore = await ownedRowCount(b.userId);
    const cases: [string, (id: string) => Promise<unknown>][] = [
      [
        A.plan.session.id,
        (id) =>
          startOrResumeWorkout(b, {
            sessionId: id,
            scheduledFor: today(),
            gymId: bPlan.gym.id,
          }),
      ],
      [
        A.plan.gym.id,
        (id) =>
          startOrResumeWorkout(b, {
            sessionId: bPlan.session.id,
            scheduledFor: today(),
            gymId: id,
          }),
      ],
      [
        A.loggedSessionId,
        (id) => changeGym(b, { loggedSessionId: id, gymId: bPlan.gym.id }),
      ],
      [
        A.pressLe,
        (id) =>
          logSet(b, {
            loggedExerciseId: id,
            setNumber: 1,
            weightLbs: 100,
            reps: 5,
          }),
      ],
      [
        A.setId,
        (id) => editLoggedSet(b, { loggedSetId: id, weightLbs: 999, reps: 1 }),
      ],
      [
        A.benchLe,
        (id) =>
          swapExercise(b, {
            loggedExerciseId: id,
            newExerciseId: lib.incline.id,
          }),
      ],
      [
        A.benchLe,
        (id) => setExerciseSkipped(b, { loggedExerciseId: id, skipped: true }),
      ],
      [A.loggedSessionId, (id) => completeWorkout(b, { loggedSessionId: id })],
      [
        A.plan.meso.id,
        (id) =>
          resolveMissedDay(b, {
            mesocycleId: id,
            missedOn: addDays(today(), -14),
            outcome: "skipped",
          }),
      ],
      [
        A.plan.meso.id,
        (id) =>
          logCardio(b, {
            mesocycleId: id,
            scheduledFor: today(),
            type: "Bike",
            durationMin: "10",
          }),
      ],
      [
        A.cardioLogId,
        (id) =>
          editCardioLog(b, {
            cardioLogId: id,
            type: "Hijacked",
            durationMin: "1",
          }),
      ],
    ];
    for (const [foreignId, call] of cases) {
      const result = await expectForeignLikeMissing(foreignId, call);
      expect(result.ok).toBe(false);
    }
    expect(await snapshotAccount(a.userId)).toEqual(before);
    expect(await ownedRowCount(b.userId)).toBe(bRowsBefore);
  });

  it("another account's custom exercise is not a swap candidate (same as a missing one)", async () => {
    const bPlan = await activePlan(b, lib, "B", { activate: false });
    const { les } = await startToday(b, bPlan);
    const bench = les[1];
    const result = await expectForeignLikeMissing(A.plan.custom.id, (id) =>
      swapExercise(b, { loggedExerciseId: bench.id, newExerciseId: id }),
    );
    expect(result).toMatchObject({ ok: false, code: "validation_error" });
    const ctx = await getSwapContext(b, bench.id);
    expect(ctx?.candidates.map((c) => c.id)).not.toContain(A.plan.custom.id);
    expect(ctx?.candidates.map((c) => c.id)).toContain(lib.incline.id);
  });
});

describe("gym baselines are per account and per gym", () => {
  it("a second account's log never reads or moves another account's baseline", async () => {
    const p = getTestPrisma();
    const aBaseline = await p.gymExerciseBaseline.findFirstOrThrow({
      where: { userId: a.userId, exerciseId: lib.chestPress.id },
    });
    expect(Number(aBaseline.weightLbs)).toBe(120);

    const bPlan = await activePlan(b, lib, "B", { activate: false });
    const { loggedSessionId, les } = await startToday(b, bPlan);
    // No history of its own: the card suggests nothing, never A's 120 lb.
    const workout = await getWorkout(b, loggedSessionId);
    expect(workout?.exercises[0].suggestedWeightLbs).toBeNull();
    expect(workout?.exercises[1].suggestedWeightLbs).toBeNull();

    for (const n of [1, 2, 3]) {
      await logSet(b, {
        loggedExerciseId: les[0].id,
        setNumber: n,
        weightLbs: 60,
        reps: 8,
      });
    }
    const bBaseline = await p.gymExerciseBaseline.findFirstOrThrow({
      where: { userId: b.userId, exerciseId: lib.chestPress.id },
    });
    expect(Number(bBaseline.weightLbs)).toBe(60);
    expect(bBaseline.gymId).toBe(bPlan.gym.id);
    expect(
      await p.gymExerciseBaseline.findUniqueOrThrow({
        where: { id: aBaseline.id },
      }),
    ).toEqual(aBaseline);
  });

  it("logged rows a second account writes are owned by it", async () => {
    const bPlan = await activePlan(b, lib, "B", { activate: false });
    const { loggedSessionId, les } = await startToday(b, bPlan);
    await logSet(b, {
      loggedExerciseId: les[1].id,
      setNumber: 1,
      weightLbs: 95,
      reps: 5,
    });
    const p = getTestPrisma();
    const owners = [
      ...(await p.loggedSession.findMany({ where: { id: loggedSessionId } })),
      ...(await p.loggedExercise.findMany({ where: { loggedSessionId } })),
      ...(await p.loggedSet.findMany({
        where: { loggedExercise: { loggedSessionId } },
      })),
    ].map((r) => r.userId);
    expect(owners.length).toBeGreaterThan(2);
    expect(owners.every((u) => u === b.userId)).toBe(true);
  });
});
