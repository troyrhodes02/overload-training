/**
 * Pitch 25 (OVE-267): Wing-It workouts — the data model and the lifecycle on
 * a real database through the real write modules. Covers the database
 * constraints of migration 9t, start / resume / one-open / refusal while
 * another workout is active, add / duplicate / remove, the open-ended set
 * rule, finish, gym baselines per gym, and the mandatory plan-safety
 * regression: a Wing-It workout started and finished alongside a scheduled
 * workout leaves the plan, the schedule, and missed-day state untouched.
 */
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { Account } from "@/lib/data/account";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import {
  changeGym,
  completeWorkout,
  editPlannedSets,
  setExerciseSkipped,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import {
  addWingItExercise,
  getAddExerciseContext,
  startWingItWorkout,
} from "@/lib/logging/wing-it";
import { getTodayDashboard } from "@/lib/logging/queries";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import {
  WING_IT_MAX_EXERCISES,
  WING_IT_MAX_SETS,
} from "@overload/shared/logging/wing-it";
import { createTestAccount, unknownId } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

const db = () => getTestPrisma();
const TODAY = todayIso("UTC");

async function gym(account: Account, name = "Harbor Barbell") {
  return db().gym.create({ data: { userId: account.userId, name } });
}

async function exercise(
  account: Account,
  name: string,
  equipmentType: "barbell" | "machine" | "cable" | "bodyweight" = "barbell",
) {
  return createTestExercise({
    userId: account.userId,
    name,
    equipmentType,
    primaryMuscle: equipmentType === "bodyweight" ? "core" : "chest",
  });
}

/** An active block with one session scheduled TODAY (and one two days ago). */
async function plannedToday(account: Account) {
  const startIso = addDays(TODAY, -2);
  const meso = await createActiveTestMesocycle({
    userId: account.userId,
    name: "Block",
    startDate: new Date(`${startIso}T00:00:00Z`),
    lengthWeeks: 4,
    deloadEveryWeeks: 4,
  });
  const bench = await exercise(account, "Planned Bench");
  const upper = await createTestSession(meso.id, {
    userId: account.userId,
    name: "Upper Body",
    dayOfWeek: isoWeekday(TODAY),
  });
  await createTestSessionExercise(upper.id, bench.id, {
    userId: account.userId,
    plannedSets: 3,
    targetRepMin: 6,
    targetRepMax: 8,
  });
  const lower = await createTestSession(meso.id, {
    userId: account.userId,
    name: "Lower Body",
    dayOfWeek: isoWeekday(startIso),
  });
  await createTestSessionExercise(lower.id, bench.id, {
    userId: account.userId,
    plannedSets: 3,
    targetRepMin: 6,
    targetRepMax: 8,
  });
  return { meso, upper, lower, bench, missedOn: startIso };
}

/** Every plan, schedule, and missed-day row of the account, as stored. */
async function planState(userId: string) {
  const where = { where: { userId } };
  return JSON.stringify({
    mesocycles: await db().mesocycle.findMany({
      ...where,
      orderBy: { id: "asc" },
    }),
    sessions: await db().session.findMany({ ...where, orderBy: { id: "asc" } }),
    sessionExercises: await db().sessionExercise.findMany({
      ...where,
      orderBy: { id: "asc" },
    }),
    resolutions: await db().missedDayResolution.findMany({
      ...where,
      orderBy: { id: "asc" },
    }),
    moves: await db().scheduleMove.findMany({
      ...where,
      orderBy: { id: "asc" },
    }),
    plannedCardio: await db().plannedCardio.findMany({
      ...where,
      orderBy: { id: "asc" },
    }),
  });
}

describe("Wing-It workouts: the data model (migration 9t)", () => {
  it("every existing-style logged session is planned, and the shape CHECK refuses a mixed row", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper } = await plannedToday(a);
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    const row = await db().loggedSession.findUniqueOrThrow({
      where: { id: planned.loggedSessionId },
    });
    expect(row.kind).toBe("planned");
    expect(row.gymId).toBeNull();

    // A Wing-It row with a session, or without a gym, is refused.
    await expect(
      db().loggedSession.create({
        data: {
          userId: a.userId,
          kind: "wing_it",
          sessionId: upper.id,
          mesocycleId: upper.mesocycleId,
          gymId: g.id,
          performedOn: new Date(TODAY),
          scheduledFor: new Date(TODAY),
        },
      }),
    ).rejects.toThrow(/logged_sessions_kind_shape_check/);
    await expect(
      db().loggedSession.create({
        data: {
          userId: a.userId,
          kind: "wing_it",
          performedOn: new Date(TODAY),
          scheduledFor: new Date(TODAY),
        },
      }),
    ).rejects.toThrow(/logged_sessions_kind_shape_check/);
    // A planned row may not carry a session gym.
    await expect(
      db().loggedSession.update({
        where: { id: planned.loggedSessionId },
        data: { gymId: g.id },
      }),
    ).rejects.toThrow(/logged_sessions_kind_shape_check/);
  });

  it("a kind never changes, and the plan snapshot must match the parent's kind", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    await expect(
      db().loggedSession.update({
        where: { id: loggedSessionId },
        data: { kind: "planned" },
      }),
    ).rejects.toThrow(/immutable|kind_shape_check/);

    // A Wing-It exercise with a snapshot is refused by the trigger…
    await expect(
      db().loggedExercise.create({
        data: {
          userId: a.userId,
          loggedSessionId,
          exerciseId: bench.id,
          plannedExerciseId: bench.id,
          plannedSets: 3,
          targetRepMin: 6,
          targetRepMax: 8,
        },
      }),
    ).rejects.toThrow(/no plan snapshot/);

    // A planned workout's exercise without a snapshot is refused.
    const { upper } = await plannedToday(a);
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    await expect(
      db().loggedExercise.create({
        data: {
          userId: a.userId,
          loggedSessionId: planned.loggedSessionId,
          exerciseId: bench.id,
          plannedExerciseId: bench.id,
        },
      }),
    ).rejects.toThrow(/keeps its plan snapshot/);
    // A partial snapshot is refused by the CHECK.
    await expect(
      db().loggedExercise.create({
        data: {
          userId: a.userId,
          loggedSessionId: planned.loggedSessionId,
          exerciseId: bench.id,
          plannedExerciseId: bench.id,
          plannedSets: 3,
        },
      }),
    ).rejects.toThrow(/plan_snapshot_check/);
  });

  it("a second open Wing-It workout for the same account is refused by the index", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    await startWingItWorkout(a, { gymId: g.id });
    await expect(
      db().loggedSession.create({
        data: {
          userId: a.userId,
          kind: "wing_it",
          gymId: g.id,
          performedOn: new Date(TODAY),
          scheduledFor: new Date(TODAY),
        },
      }),
    ).rejects.toThrow(/one_open_wing_it|Unique constraint/);
  });
});

describe("Wing-It workouts: start, resume, and one active workout", () => {
  it("starts with no plan: an empty, in-progress workout at the chosen gym", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const out = await startWingItWorkout(a, { gymId: g.id });
    expect(out.resumed).toBe(false);
    const ls = await db().loggedSession.findUniqueOrThrow({
      where: { id: out.loggedSessionId },
      include: { loggedExercises: true },
    });
    expect(ls).toMatchObject({
      kind: "wing_it",
      status: "in_progress",
      gymId: g.id,
      mesocycleId: null,
      sessionId: null,
    });
    expect(ls.loggedExercises).toEqual([]);
    expect(ls.scheduledFor.toISOString().slice(0, 10)).toBe(TODAY);
    expect(await getTodayDashboard(a)).toEqual({ kind: "no_plan" });
  });

  it("a second start resumes the same workout, and moves it while it has no set", async () => {
    const a = await createTestAccount();
    const g1 = await gym(a, "One");
    const g2 = await gym(a, "Two");
    const first = await startWingItWorkout(a, { gymId: g1.id });
    const bench = await exercise(a, "Bench");
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId: first.loggedSessionId,
      exerciseId: bench.id,
    });
    const again = await startWingItWorkout(a, { gymId: g2.id });
    expect(again).toEqual({
      loggedSessionId: first.loggedSessionId,
      resumed: true,
    });
    expect(
      (
        await db().loggedSession.findUniqueOrThrow({
          where: { id: first.loggedSessionId },
        })
      ).gymId,
    ).toBe(g2.id);
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: loggedExerciseId },
        })
      ).gymId,
    ).toBe(g2.id);

    // Once a set exists the gym stays.
    await logSet(a, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    await startWingItWorkout(a, { gymId: g1.id });
    expect(
      (
        await db().loggedSession.findUniqueOrThrow({
          where: { id: first.loggedSessionId },
        })
      ).gymId,
    ).toBe(g2.id);
    expect(
      await db().loggedSession.count({ where: { userId: a.userId } }),
    ).toBe(1);
  });

  it("concurrent starts (two tabs, web and phone) create exactly one workout", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => startWingItWorkout(a, { gymId: g.id })),
    );
    expect(new Set(results.map((r) => r.loggedSessionId)).size).toBe(1);
    expect(
      await db().loggedSession.count({
        where: { userId: a.userId, kind: "wing_it" },
      }),
    ).toBe(1);
  });

  it("is refused while another workout is in progress with saved sets, naming it; allowed when it has none", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper } = await plannedToday(a);
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    // The planned workout has no set yet: nothing is at stake, Wing-It starts.
    const w = await startWingItWorkout(a, { gymId: g.id });
    // Finish that Wing-It workout so it does not hold the slot.
    const bench = await exercise(a, "Bench W");
    const le = await addWingItExercise(a, {
      loggedSessionId: w.loggedSessionId,
      exerciseId: bench.id,
    });
    await logSet(a, {
      loggedExerciseId: le.loggedExerciseId,
      setNumber: 1,
      weightLbs: 50,
      reps: 5,
    });
    await completeWorkout(a, { loggedSessionId: w.loggedSessionId });

    const ple = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId: planned.loggedSessionId },
    });
    await logSet(a, {
      loggedExerciseId: ple.id,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    const before = await db().loggedSession.count({
      where: { userId: a.userId },
    });
    await expect(startWingItWorkout(a, { gymId: g.id })).rejects.toMatchObject({
      code: "conflict",
      details: {
        loggedSessionId: planned.loggedSessionId,
        sessionName: "Upper Body",
      },
    });
    expect(
      await db().loggedSession.count({ where: { userId: a.userId } }),
    ).toBe(before);
  });

  it("a planned start is never refused because of an active Wing-It workout (RD-21)", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper } = await plannedToday(a);
    const w = await startWingItWorkout(a, { gymId: g.id });
    const bench = await exercise(a, "Bench W");
    const le = await addWingItExercise(a, {
      loggedSessionId: w.loggedSessionId,
      exerciseId: bench.id,
    });
    await logSet(a, {
      loggedExerciseId: le.loggedExerciseId,
      setNumber: 1,
      weightLbs: 50,
      reps: 5,
    });
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    expect(planned.loggedSessionId).not.toBe(w.loggedSessionId);
  });

  it("refuses an archived gym and another account's gym like a missing one", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const archived = await db().gym.create({
      data: { userId: a.userId, name: "Old", deletedAt: new Date() },
    });
    const bGym = await gym(b);
    for (const gymId of [archived.id, bGym.id, unknownId(), "not-a-uuid"]) {
      await expect(startWingItWorkout(a, { gymId })).rejects.toMatchObject({
        code: "validation_error",
      });
    }
    expect(
      await db().loggedSession.count({ where: { userId: a.userId } }),
    ).toBe(0);
  });
});

describe("Wing-It workouts: exercises and sets", () => {
  async function open(a: Account) {
    const g = await gym(a);
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    return { g, loggedSessionId };
  }

  it("adds exercises in order, with no plan snapshot, at the workout gym; a duplicate returns the same card", async () => {
    const a = await createTestAccount();
    const { g, loggedSessionId } = await open(a);
    const bench = await exercise(a, "Bench");
    const press = await exercise(a, "Leg Press", "machine");
    const first = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    const second = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: press.id,
    });
    const dup = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    expect(first.added).toBe(true);
    expect(dup).toEqual({ ...first, added: false });
    const rows = await db().loggedExercise.findMany({
      where: { loggedSessionId },
      orderBy: { position: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([
      first.loggedExerciseId,
      second.loggedExerciseId,
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({
        plannedSets: null,
        targetRepMin: null,
        targetRepMax: null,
        sessionExerciseId: null,
        gymId: g.id,
      });
      expect(r.plannedExerciseId).toBe(r.exerciseId);
    }
  });

  it("refuses an archived exercise, another account's custom exercise, a planned workout, and a finished one", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const { g, loggedSessionId } = await open(a);
    const archived = await createTestExercise({
      userId: a.userId,
      name: "Gone",
      deletedAt: new Date(),
    });
    const theirs = await exercise(b, "Theirs");
    for (const exerciseId of [archived.id, theirs.id, unknownId()]) {
      await expect(
        addWingItExercise(a, { loggedSessionId, exerciseId }),
      ).rejects.toMatchObject({ code: "validation_error" });
    }
    const { upper, bench } = await plannedToday(a);
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    await expect(
      addWingItExercise(a, {
        loggedSessionId: planned.loggedSessionId,
        exerciseId: bench.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });

    const le = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await logSet(a, {
      loggedExerciseId: le.loggedExerciseId,
      setNumber: 1,
      weightLbs: 60,
      reps: 5,
    });
    await completeWorkout(a, { loggedSessionId });
    const other = await exercise(a, "Other");
    await expect(
      addWingItExercise(a, { loggedSessionId, exerciseId: other.id }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("sets run 1, 2, 3 with no gaps up to the limit; a replay is idempotent and a different value conflicts", async () => {
    const a = await createTestAccount();
    const { loggedSessionId } = await open(a);
    const bench = await exercise(a, "Bench");
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await expect(
      logSet(a, { loggedExerciseId, setNumber: 2, weightLbs: 100, reps: 5 }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const s1 = await logSet(a, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    const again = await logSet(a, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    expect(again.id).toBe(s1.id);
    await expect(
      logSet(a, { loggedExerciseId, setNumber: 1, weightLbs: 105, reps: 5 }),
    ).rejects.toMatchObject({ code: "conflict" });
    for (let n = 2; n <= WING_IT_MAX_SETS; n++) {
      await logSet(a, {
        loggedExerciseId,
        setNumber: n,
        weightLbs: 100,
        reps: 5,
      });
    }
    await expect(
      logSet(a, {
        loggedExerciseId,
        setNumber: WING_IT_MAX_SETS + 1,
        weightLbs: 100,
        reps: 5,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(await db().loggedSet.count({ where: { loggedExerciseId } })).toBe(
      WING_IT_MAX_SETS,
    );
  });

  it("a bodyweight exercise logs reps only", async () => {
    const a = await createTestAccount();
    const { loggedSessionId } = await open(a);
    const crunch = await exercise(a, "Crunch", "bodyweight");
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: crunch.id,
    });
    await expect(
      logSet(a, { loggedExerciseId, setNumber: 1, weightLbs: 10, reps: 20 }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const set = await logSet(a, { loggedExerciseId, setNumber: 1, reps: 20 });
    expect(set.weightLbs).toBeNull();
  });

  it("remove is the not-done mark, only with no sets; adding again restores the card; no row is deleted", async () => {
    const a = await createTestAccount();
    const { loggedSessionId } = await open(a);
    const bench = await exercise(a, "Bench");
    const fly = await exercise(a, "Fly");
    const b = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    const f = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: fly.id,
    });
    await logSet(a, {
      loggedExerciseId: b.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    await expect(
      setExerciseSkipped(a, {
        loggedExerciseId: b.loggedExerciseId,
        skipped: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    await setExerciseSkipped(a, {
      loggedExerciseId: f.loggedExerciseId,
      skipped: true,
    });
    const ctx = await getAddExerciseContext(a, loggedSessionId);
    expect(ctx?.candidates.find((c) => c.id === fly.id)?.inWorkout).toBe(false);
    expect(ctx?.candidates.find((c) => c.id === bench.id)?.inWorkout).toBe(
      true,
    );
    const back = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: fly.id,
    });
    expect(back).toEqual({ ...f, added: true });
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: f.loggedExerciseId },
        })
      ).skippedAt,
    ).toBeNull();
    expect(
      await db().loggedExercise.count({ where: { loggedSessionId } }),
    ).toBe(2);
  });

  it("swap and planned-set corrections are refused on a Wing-It exercise", async () => {
    const a = await createTestAccount();
    const { loggedSessionId } = await open(a);
    const bench = await exercise(a, "Bench");
    const fly = await exercise(a, "Fly");
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await expect(
      swapExercise(a, { loggedExerciseId, newExerciseId: fly.id }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    await logSet(a, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    await expect(
      editPlannedSets(a, { loggedExerciseId, plannedSets: 1 }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("change gym moves the workout and its exercises while no set exists", async () => {
    const a = await createTestAccount();
    const { loggedSessionId } = await open(a);
    const other = await gym(a, "Other");
    const bench = await exercise(a, "Bench");
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await changeGym(a, { loggedSessionId, gymId: other.id });
    expect(
      (
        await db().loggedSession.findUniqueOrThrow({
          where: { id: loggedSessionId },
        })
      ).gymId,
    ).toBe(other.id);
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: loggedExerciseId },
        })
      ).gymId,
    ).toBe(other.id);
    // An exercise added afterwards takes the new gym.
    const fly = await exercise(a, "Fly");
    const later = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: fly.id,
    });
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: later.loggedExerciseId },
        })
      ).gymId,
    ).toBe(other.id);
  });

  it("finish needs one set, stamps untouched exercises not done, and a past set stays correctable", async () => {
    const a = await createTestAccount();
    const { loggedSessionId } = await open(a);
    await expect(completeWorkout(a, { loggedSessionId })).rejects.toMatchObject(
      {
        code: "validation_error",
      },
    );
    const bench = await exercise(a, "Bench");
    const fly = await exercise(a, "Fly");
    const b = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    const f = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: fly.id,
    });
    const set = await logSet(a, {
      loggedExerciseId: b.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    await completeWorkout(a, { loggedSessionId });
    await completeWorkout(a, { loggedSessionId }); // idempotent
    const ls = await db().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    expect(ls.status).toBe("complete");
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: f.loggedExerciseId },
        })
      ).skippedAt,
    ).not.toBeNull();
    await expect(
      logSet(a, {
        loggedExerciseId: b.loggedExerciseId,
        setNumber: 2,
        weightLbs: 100,
        reps: 5,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    const edited = await editLoggedSet(a, {
      loggedSetId: set.id,
      weightLbs: 102.5,
      reps: 6,
    });
    expect(Number(edited.weightLbs)).toBe(102.5);
    // A new Wing-It workout can start the same day.
    const next = await startWingItWorkout(a, { gymId: ls.gymId! });
    expect(next.loggedSessionId).not.toBe(loggedSessionId);
  });
});

describe("Wing-It workouts: review fixes", () => {
  it("removed exercises take no place toward the 30-exercise limit (#3)", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    for (let i = 0; i < WING_IT_MAX_EXERCISES; i++) {
      const ex = await exercise(a, `Lift ${i}`);
      const { loggedExerciseId } = await addWingItExercise(a, {
        loggedSessionId,
        exerciseId: ex.id,
      });
      await setExerciseSkipped(a, { loggedExerciseId, skipped: true });
    }
    const one = await exercise(a, "One more");
    const out = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: one.id,
    });
    expect(out.added).toBe(true);
  });

  it("a stale start resumes the open workout with sets even if its gym was archived since (#9)", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    const bench = await exercise(a, "Bench");
    const le = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await logSet(a, {
      loggedExerciseId: le.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    await db().gym.update({
      where: { id: g.id },
      data: { deletedAt: new Date() },
    });
    expect(await startWingItWorkout(a, { gymId: g.id })).toEqual({
      loggedSessionId,
      resumed: true,
    });
  });

  it("the picker is closed for a finished Wing-It workout (#2)", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    const bench = await exercise(a, "Bench");
    const le = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await logSet(a, {
      loggedExerciseId: le.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    expect(await getAddExerciseContext(a, loggedSessionId)).not.toBeNull();
    await completeWorkout(a, { loggedSessionId });
    expect(await getAddExerciseContext(a, loggedSessionId)).toBeNull();
  });
});

describe("Wing-It workouts: gym baselines (RD-24)", () => {
  it("a machine's first Wing-It set at a gym establishes that gym's baseline; a large deviation corrects it; another gym is untouched", async () => {
    const a = await createTestAccount();
    const g1 = await gym(a, "One");
    const g2 = await gym(a, "Two");
    const press = await exercise(a, "Leg Press", "machine");
    const curl = await exercise(a, "Curl", "barbell");
    await db().gymExerciseBaseline.create({
      data: {
        userId: a.userId,
        gymId: g2.id,
        exerciseId: press.id,
        weightLbs: 500,
      },
    });
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g1.id });
    const p = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: press.id,
    });
    const c = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: curl.id,
    });
    await logSet(a, {
      loggedExerciseId: p.loggedExerciseId,
      setNumber: 1,
      weightLbs: 200,
      reps: 10,
    });
    const base = () =>
      db().gymExerciseBaseline.findUnique({
        where: { gymId_exerciseId: { gymId: g1.id, exerciseId: press.id } },
      });
    expect(Number((await base())?.weightLbs)).toBe(200);
    // Within the threshold: unchanged (median 205 is 2.5% away).
    await logSet(a, {
      loggedExerciseId: p.loggedExerciseId,
      setNumber: 2,
      weightLbs: 210,
      reps: 10,
    });
    expect(Number((await base())?.weightLbs)).toBe(200);
    // Median of 200, 210, 300 = 210 (5%): unchanged; then 300, 300 → median 300 (50%): corrected.
    await logSet(a, {
      loggedExerciseId: p.loggedExerciseId,
      setNumber: 3,
      weightLbs: 300,
      reps: 10,
    });
    await logSet(a, {
      loggedExerciseId: p.loggedExerciseId,
      setNumber: 4,
      weightLbs: 300,
      reps: 10,
    });
    await logSet(a, {
      loggedExerciseId: p.loggedExerciseId,
      setNumber: 5,
      weightLbs: 300,
      reps: 10,
    });
    expect(Number((await base())?.weightLbs)).toBe(300);
    // Gym Two's baseline never moved; a free weight has none.
    expect(
      Number(
        (
          await db().gymExerciseBaseline.findUniqueOrThrow({
            where: { gymId_exerciseId: { gymId: g2.id, exerciseId: press.id } },
          })
        ).weightLbs,
      ),
    ).toBe(500);
    await logSet(a, {
      loggedExerciseId: c.loggedExerciseId,
      setNumber: 1,
      weightLbs: 50,
      reps: 10,
    });
    expect(
      await db().gymExerciseBaseline.count({ where: { exerciseId: curl.id } }),
    ).toBe(0);
  });
});

describe("Wing-It workouts never touch the plan (mandatory regression, RD-4)", () => {
  it("Upper Body is scheduled today: Wing-It started and finished instead leaves the plan, the schedule, and missed-day state unchanged", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper, missedOn, meso } = await plannedToday(a);
    const before = await planState(a.userId);
    const dashBefore = await getTodayDashboard(a);
    expect(dashBefore.kind).toBe("missed_day"); // Lower Body two days ago

    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    expect(await planState(a.userId)).toBe(before);
    const press = await exercise(a, "Leg Press", "machine");
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: press.id,
    });
    await logSet(a, {
      loggedExerciseId,
      setNumber: 1,
      weightLbs: 200,
      reps: 10,
    });
    await completeWorkout(a, { loggedSessionId });

    expect(await planState(a.userId)).toBe(before);
    expect(await getTodayDashboard(a)).toEqual(dashBefore);
    // The scheduled Upper Body occurrence has no logged session.
    expect(
      await db().loggedSession.count({
        where: { userId: a.userId, sessionId: upper.id },
      }),
    ).toBe(0);

    // Missed-day handling still works on its own.
    await resolveMissedDay(a, {
      mesocycleId: meso.id,
      missedOn,
      outcome: "skipped",
    });
    const after = await getTodayDashboard(a);
    expect(after.kind).toBe("pending");
    if (after.kind === "pending") expect(after.sessionName).toBe("Upper Body");
    // And the planned workout can still be started and logged.
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    expect(planned.loggedSessionId).not.toBe(loggedSessionId);
  });
});
