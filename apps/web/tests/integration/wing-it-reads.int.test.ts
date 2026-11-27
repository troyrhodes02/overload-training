/**
 * Pitch 25 (OVE-268): every read that shows logged training understands a
 * Wing-It workout, and none invents a plan target. Today's section, the
 * workout and its open-ended cards (with the legacy fields TestFlight 1.0.0
 * (2) reads), the logged detail, History (active and logged weeks), the
 * unfinished list, exercise history and records, goals, the summary — and
 * that a Wing-It workout never changes a planned workout's call or card.
 * Free, with the free-Pro period off and on.
 */
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { Account } from "@/lib/data/account";
import { logSet } from "@/lib/logging/logged-sets";
import {
  completeWorkout,
  setExerciseSkipped,
  startOrResumeWorkout,
} from "@/lib/logging/sessions";
import { addWingItExercise, startWingItWorkout } from "@/lib/logging/wing-it";
import {
  getLoggedWorkoutDetail,
  getWorkout,
  listUnfinishedWorkouts,
} from "@/lib/logging/queries";
import { getHistoryWeek } from "@/lib/logging/history-week";
import { getTodayView } from "@/lib/views/today";
import { getWorkoutView } from "@/lib/views/workout";
import {
  getQualifyingSessionE1rms,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import { createGoal, reconcileGoalCompletions } from "@/lib/goals/goals";
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

async function gym(a: Account, name = "Harbor Barbell") {
  return db().gym.create({ data: { userId: a.userId, name } });
}

async function exercise(
  a: Account,
  name: string,
  equipmentType: "barbell" | "machine" = "barbell",
) {
  return createTestExercise({
    userId: a.userId,
    name,
    equipmentType,
    primaryMuscle: "chest",
  });
}

/** A Wing-It workout today: each exercise with its sets, optionally finished. */
async function wingIt(
  a: Account,
  gymId: string,
  lifts: { exerciseId: string; sets: [number, number][] }[],
  finish = true,
) {
  const { loggedSessionId } = await startWingItWorkout(a, { gymId });
  const ids: string[] = [];
  for (const l of lifts) {
    const { loggedExerciseId } = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: l.exerciseId,
    });
    ids.push(loggedExerciseId);
    for (const [i, [w, r]] of l.sets.entries()) {
      await logSet(a, {
        loggedExerciseId,
        setNumber: i + 1,
        weightLbs: w,
        reps: r,
      });
    }
  }
  if (finish) await completeWorkout(a, { loggedSessionId });
  return { loggedSessionId, loggedExerciseIds: ids };
}

/** An active block: Upper Body scheduled today (bench 3 × 6–8). */
async function block(a: Account, startDaysAgo = 0) {
  const startIso = addDays(TODAY, -startDaysAgo);
  const meso = await createActiveTestMesocycle({
    userId: a.userId,
    name: "Block",
    startDate: new Date(`${startIso}T00:00:00Z`),
    lengthWeeks: 4,
    deloadEveryWeeks: 4,
  });
  const bench = await exercise(a, "Bench");
  const upper = await createTestSession(meso.id, {
    userId: a.userId,
    name: "Upper Body",
    dayOfWeek: isoWeekday(TODAY),
  });
  await createTestSessionExercise(upper.id, bench.id, {
    userId: a.userId,
    plannedSets: 3,
    targetRepMin: 6,
    targetRepMax: 8,
  });
  return { meso, upper, bench };
}

describe("Today's Wing-It section", () => {
  it("open, finished today, and blocked — in the core fields and the full answer", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const empty = await getTodayView(a, { core: true });
    expect(empty.wingIt).toEqual({
      open: null,
      finishedToday: [],
      blockedBy: null,
    });

    const first = await wingIt(a, g.id, [
      {
        exerciseId: bench.id,
        sets: [
          [100, 8],
          [100, 8],
        ],
      },
    ]);
    const open = await startWingItWorkout(a, { gymId: g.id });
    const press = await exercise(a, "Press");
    await addWingItExercise(a, {
      loggedSessionId: open.loggedSessionId,
      exerciseId: press.id,
    });
    for (const core of [true, false]) {
      const v = await getTodayView(a, { core });
      expect(v.wingIt?.finishedToday).toEqual([
        {
          loggedSessionId: first.loggedSessionId,
          gymName: "Harbor Barbell",
          exerciseCount: 1,
          setsLogged: 2,
          startedOn: TODAY,
        },
      ]);
      expect(v.wingIt?.open).toMatchObject({
        loggedSessionId: open.loggedSessionId,
        exerciseCount: 1,
        setsLogged: 0,
      });
      expect(v.wingIt?.blockedBy).toBeNull();
      expect(v.dashboard).toEqual({ kind: "no_plan" });
    }
  });

  it("names the planned workout to finish first, and the planned day is unchanged", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper } = await block(a);
    const before = (await getTodayView(a, { core: true })).dashboard;
    const planned = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    const le = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId: planned.loggedSessionId },
    });
    await logSet(a, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    const v = await getTodayView(a);
    expect(v.wingIt?.blockedBy).toEqual({
      loggedSessionId: planned.loggedSessionId,
      sessionName: "Upper Body",
    });
    expect(before.kind).toBe("pending");
  });

  it("a Free account runs a Wing-It workout with the free-Pro period off and on (RD-2)", async () => {
    const saved = process.env.OVERLOAD_FREE_PRO_PERIOD;
    const accounts: string[] = [];
    try {
      for (const period of [undefined, "true"]) {
        if (period) process.env.OVERLOAD_FREE_PRO_PERIOD = period;
        else delete process.env.OVERLOAD_FREE_PRO_PERIOD;
        const a = await createTestAccount("UTC", undefined, {
          entitlement: "none",
        });
        accounts.push(a.userId);
        const g = await gym(a);
        const bench = await exercise(a, "Bench");
        const w = await wingIt(a, g.id, [
          { exerciseId: bench.id, sets: [[95, 10]] },
        ]);
        const v = await getTodayView(a);
        expect(v.wingIt?.finishedToday).toHaveLength(1);
        expect(
          await getSessionProgressionSummary(a, w.loggedSessionId),
        ).toBeNull();
        expect(
          await getLoggedWorkoutDetail(a, w.loggedSessionId),
        ).toMatchObject({
          kind: "wing_it",
        });
      }
    } finally {
      if (saved === undefined) delete process.env.OVERLOAD_FREE_PRO_PERIOD;
      else process.env.OVERLOAD_FREE_PRO_PERIOD = saved;
    }
    // Nothing about a Wing-It workout grants access (RD-15): the Free
    // accounts still hold no entitlement row at all.
    expect(
      await db().entitlement.count({ where: { userId: { in: accounts } } }),
    ).toBe(0);
  });
});

describe("the workout and its open-ended cards", () => {
  it("rows, legacy fields, a reference last time (gym-scoped), no offer, no calls", async () => {
    const a = await createTestAccount();
    const g1 = await gym(a, "One");
    const g2 = await gym(a, "Two");
    const press = await exercise(a, "Leg Press", "machine");
    // Earlier: at Two (heavier) and at One.
    await wingIt(a, g2.id, [{ exerciseId: press.id, sets: [[400, 10]] }]);
    await wingIt(a, g1.id, [
      {
        exerciseId: press.id,
        sets: [
          [270, 12],
          [270, 10],
        ],
      },
    ]);
    const now = await wingIt(
      a,
      g1.id,
      [{ exerciseId: press.id, sets: [[280, 10]] }],
      false,
    );
    const w = await getWorkout(a, now.loggedSessionId);
    expect(w).toMatchObject({
      kind: "wing_it",
      sessionName: "Wing-It workout",
      gymName: "One",
      scheduledDeloadWeek: false,
    });
    const c = w!.exercises[0]!;
    expect(c.openEnded).toBe(true);
    expect(c.sets.map((s) => [s.setNumber, s.saved, s.extra])).toEqual([
      [1, true, false],
      [2, false, false],
    ]);
    expect(c.plannedSets).toBe(2);
    expect(c.plannedRepRange).toEqual(LEGACY_OPEN_REP_RANGE);
    expect(c.suggestedWeightLbs).toBeNull();
    expect(c.previousPerformance).toBeNull();
    expect(c.weightContext).toBe("reference_only");
    expect(c.referencePerformance).toMatchObject({
      gymScoped: true,
      sessionName: "Wing-It workout",
      openEnded: true,
      sets: [
        { setNumber: 1, weightLbs: 270, reps: 12 },
        { setNumber: 2, weightLbs: 270, reps: 10 },
      ],
    });
    const view = await getWorkoutView(a, now.loggedSessionId);
    expect(view?.progression).toEqual([]);
  });

  it("a removed card is not shown; a finished workout has no open row", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const fly = await exercise(a, "Fly");
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    const b = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    const f = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: fly.id,
    });
    await setExerciseSkipped(a, {
      loggedExerciseId: f.loggedExerciseId,
      skipped: true,
    });
    expect(
      (await getWorkout(a, loggedSessionId))!.exercises.map(
        (e) => e.loggedExerciseId,
      ),
    ).toEqual([b.loggedExerciseId]);
    await logSet(a, {
      loggedExerciseId: b.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    await completeWorkout(a, { loggedSessionId });
    const done = await getWorkout(a, loggedSessionId);
    expect(done!.exercises[0]!.sets.every((s) => s.saved)).toBe(true);
    expect(done!.complete).toBe(true);
  });

  it("a planned card ignores Wing-It history: offer and last time are the plan's own (RD-27)", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper, bench } = await block(a, 7);
    // Last week's Upper Body at 200; then a heavier Wing-It bench at 300.
    const lastWeek = addDays(TODAY, -7);
    const p1 = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: lastWeek,
      gymId: g.id,
    });
    const le1 = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId: p1.loggedSessionId },
    });
    for (let n = 1; n <= 3; n++)
      await logSet(a, {
        loggedExerciseId: le1.id,
        setNumber: n,
        weightLbs: 200,
        reps: 8,
      });
    await completeWorkout(a, { loggedSessionId: p1.loggedSessionId });
    await wingIt(a, g.id, [{ exerciseId: bench.id, sets: [[300, 5]] }]);

    const p2 = await startOrResumeWorkout(a, {
      sessionId: upper.id,
      scheduledFor: TODAY,
      gymId: g.id,
    });
    const card = (await getWorkout(a, p2.loggedSessionId))!.exercises[0]!;
    expect(card.openEnded).toBe(false);
    expect(card.suggestedWeightLbs).toBe(200);
    expect(card.previousPerformance?.sessionName).toBe("Upper Body");
    expect(card.referencePerformance).toBeNull();
  });
});

describe("History, the logged detail, and the unfinished list", () => {
  it("active-block weeks list Wing-It workouts by date; two on one day both appear", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    await block(a);
    const bench = await exercise(a, "Bench W");
    const w1 = await wingIt(a, g.id, [
      { exerciseId: bench.id, sets: [[100, 5]] },
    ]);
    const w2 = await wingIt(a, g.id, [
      { exerciseId: bench.id, sets: [[105, 5]] },
    ]);
    // An untouched draft is left out.
    await startWingItWorkout(a, { gymId: g.id });
    const week = await getHistoryWeek(a);
    expect(week.view.kind).toBe("active");
    if (week.view.kind !== "active") return;
    expect(week.view.wingItWorkouts).toEqual([
      {
        loggedSessionId: w1.loggedSessionId,
        dateIso: TODAY,
        dayLabel: expect.any(String),
        sessionName: "Wing-It workout",
        state: "complete",
      },
      expect.objectContaining({ loggedSessionId: w2.loggedSessionId }),
    ]);
    // The planned days are only the plan's.
    expect(week.view.days.map((d) => d.sessionName)).toEqual(["Upper Body"]);
  });

  it("with no active block, logged weeks name and mark Wing-It workouts", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const w = await wingIt(a, g.id, [
      { exerciseId: bench.id, sets: [[100, 5]] },
    ]);
    const week = await getHistoryWeek(a);
    expect(week.hasAnyHistory).toBe(true);
    expect(week.view.kind).toBe("logged");
    if (week.view.kind !== "logged") return;
    expect(week.view.days[0]?.workouts).toEqual([
      expect.objectContaining({
        loggedSessionId: w.loggedSessionId,
        sessionName: "Wing-It workout",
        kind: "wing_it",
        mesocycleId: "",
        state: "complete",
      }),
    ]);
  });

  it("the logged detail: Wing-It name, gym, sets as recorded, no planned count; untouched exercises left out", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const fly = await exercise(a, "Fly");
    const { loggedSessionId } = await startWingItWorkout(a, { gymId: g.id });
    const b = await addWingItExercise(a, {
      loggedSessionId,
      exerciseId: bench.id,
    });
    await addWingItExercise(a, { loggedSessionId, exerciseId: fly.id });
    await logSet(a, {
      loggedExerciseId: b.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 5,
    });
    await logSet(a, {
      loggedExerciseId: b.loggedExerciseId,
      setNumber: 2,
      weightLbs: 105,
      reps: 4,
    });
    await completeWorkout(a, { loggedSessionId });
    const d = await getLoggedWorkoutDetail(a, loggedSessionId);
    expect(d).toMatchObject({
      kind: "wing_it",
      sessionName: "Wing-It workout",
      gymName: "Harbor Barbell",
    });
    expect(d!.exercises).toHaveLength(1);
    expect(d!.exercises[0]).toMatchObject({
      performedName: "Bench",
      swapped: false,
      openEnded: true,
      plannedSets: 2,
    });
    expect(
      d!.exercises[0]!.sets.map((s) => [s.weightLbs, s.reps, s.extra]),
    ).toEqual([
      [100, 5, false],
      [105, 4, false],
    ]);
  });

  it("an earlier day's open Wing-It workout with sets is listed as unfinished, by name and gym", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const w = await wingIt(
      a,
      g.id,
      [
        {
          exerciseId: bench.id,
          sets: [
            [100, 5],
            [100, 5],
          ],
        },
      ],
      false,
    );
    // Pretend it was started yesterday.
    const yesterday = new Date(`${addDays(TODAY, -1)}T00:00:00Z`);
    await db().loggedSession.update({
      where: { id: w.loggedSessionId },
      data: { scheduledFor: yesterday, performedOn: yesterday },
    });
    expect(await listUnfinishedWorkouts(a)).toEqual([
      {
        loggedSessionId: w.loggedSessionId,
        kind: "wing_it",
        sessionName: "Wing-It workout",
        scheduledFor: addDays(TODAY, -1),
        gymName: "Harbor Barbell",
        setsLogged: 2,
      },
    ]);
  });
});

describe("exercise history, records, e1RM, and goals (RD-10, RD-25)", () => {
  it("Wing-It sets are sessions, records, and trend points with no call; a planned call is unchanged", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const { upper, bench } = await block(a, 14);
    const day = (n: number) => addDays(TODAY, -14 + n * 7);
    // Two planned Upper Body sessions a week apart, top of range both times.
    for (const n of [0, 1]) {
      const p = await startOrResumeWorkout(a, {
        sessionId: upper.id,
        scheduledFor: day(n),
        gymId: g.id,
      });
      const le = await db().loggedExercise.findFirstOrThrow({
        where: { loggedSessionId: p.loggedSessionId },
      });
      for (let s = 1; s <= 3; s++)
        await logSet(a, {
          loggedExerciseId: le.id,
          setNumber: s,
          weightLbs: 200,
          reps: 8,
        });
      await completeWorkout(a, { loggedSessionId: p.loggedSessionId });
    }
    const before = await getExerciseHistory(a, bench.id);
    // A Wing-It bench with a below-range set and a heavier single.
    const w = await wingIt(a, g.id, [
      {
        exerciseId: bench.id,
        sets: [
          [150, 3],
          [250, 2],
        ],
      },
    ]);
    const after = await getExerciseHistory(a, bench.id);

    // The planned "next time" call and each planned session's call: unchanged.
    expect(after!.next).toEqual(before!.next);
    expect(after!.nextByWorkout).toEqual(before!.nextByWorkout);
    const callOf = (h: typeof after, id: string) =>
      h!.sessions.rows.find((r) => r.loggedSessionId === id)?.call;
    for (const r of before!.sessions.rows)
      expect(callOf(after, r.loggedSessionId)).toBe(r.call);

    const row = after!.sessions.rows.find(
      (r) => r.loggedSessionId === w.loggedSessionId,
    );
    expect(row).toMatchObject({
      sessionName: "Wing-It workout",
      call: "none",
      swappedFromName: null,
      extraSets: [],
    });
    expect(row!.workingSets).toHaveLength(2);
    // The heaviest set is the Wing-It 250.
    expect(after!.records).toMatchObject({
      kind: "loaded",
      heaviest: { weightLbs: 250 },
    });
    expect(after!.trend.e1rm?.points.length).toBe(
      before!.trend.e1rm!.points.length + 1,
    );
    expect(after!.sessions.total).toBe(before!.sessions.total + 1);
  });

  it("goals count Wing-It strength and complete on it", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    const goal = await createGoal(a, {
      exerciseId: bench.id,
      targetWeightLbs: "225",
      targetReps: "5",
    });
    expect(goal.outcome).toBe("active");
    await wingIt(a, g.id, [{ exerciseId: bench.id, sets: [[230, 5]] }]);
    const e1rms = await getQualifyingSessionE1rms(a, bench.id, null);
    expect(e1rms).toHaveLength(1);
    await reconcileGoalCompletions(a);
    expect(
      (await db().goal.findUniqueOrThrow({ where: { id: goal.id } })).status,
    ).toBe("archived");
  });

  it("an in-progress Wing-It workout counts toward nothing yet", async () => {
    const a = await createTestAccount();
    const g = await gym(a);
    const bench = await exercise(a, "Bench");
    await wingIt(a, g.id, [{ exerciseId: bench.id, sets: [[230, 5]] }], false);
    expect(await getQualifyingSessionE1rms(a, bench.id, null)).toEqual([]);
  });
});
