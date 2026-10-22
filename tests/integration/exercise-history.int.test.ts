import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { defaultAccount } from "./support/accounts";
import { snapshotAccount } from "./isolation/support";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import { getLoggedWorkoutDetail } from "@/lib/logging/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { getExerciseGoals, getGoalDetail } from "@/lib/goals/queries";
import type { Account } from "@/lib/data/account";

/**
 * Exercise History & PR Intelligence through real rows (spec §14.2). History
 * is inserted raw (test-only) to control dates, gyms, and RIR; the correction
 * goes through the canonical `editLoggedSet`. Everything asserted is computed
 * on read.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5 →
 * week 5 = 11/30–12/06 is the scheduled deload. Range 8–10, 3 sets.
 */
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});
const db = () => getTestPrisma();

async function logPerf(opts: {
  mesocycleId: string;
  exerciseId: string;
  plannedExerciseId?: string;
  gymId?: string | null;
  scheduledFor: string;
  sets: [number | null, number][];
  rir?: (number | null)[];
  status?: "in_progress" | "complete";
  plannedSets?: number;
}) {
  const p = db();
  const ls = await p.loggedSession.create({
    data: {
      userId: account.userId,
      mesocycleId: opts.mesocycleId,
      performedOn: new Date(`${opts.scheduledFor}T12:00:00Z`),
      scheduledFor: new Date(`${opts.scheduledFor}T00:00:00Z`),
      status: opts.status ?? "complete",
    },
  });
  const le = await p.loggedExercise.create({
    data: {
      userId: account.userId,
      loggedSessionId: ls.id,
      exerciseId: opts.exerciseId,
      plannedExerciseId: opts.plannedExerciseId ?? opts.exerciseId,
      gymId: opts.gymId ?? null,
      plannedSets: opts.plannedSets ?? 3,
      targetRepMin: 8,
      targetRepMax: 10,
    },
  });
  const setIds: string[] = [];
  for (let i = 0; i < opts.sets.length; i++) {
    const [w, reps] = opts.sets[i];
    const s = await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: w,
        reps,
        rir: opts.rir?.[i] ?? null,
        createdAt: new Date(`2025${opts.scheduledFor.slice(4)}T12:0${i}:00Z`),
      },
    });
    setIds.push(s.id);
  }
  return { loggedSessionId: ls.id, loggedExerciseId: le.id, setIds };
}

const three = (w: number | null, a: number, b: number, c: number) =>
  [
    [w, a],
    [w, b],
    [w, c],
  ] as [number | null, number][];

async function gym(name: string) {
  return db().gym.create({ data: { userId: account.userId, name } });
}

async function history(
  exId: string,
  opts: { scope?: string | null; allSessions?: boolean } = {},
) {
  return (await getExerciseHistory(account, exId, opts))!;
}

describe("machine at two gyms: one gym's book at a time (AC-2)", () => {
  it("records, points, calls, and sessions of one gym never carry the other's values", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({
      equipmentType: "machine",
      name: "Chest Press Machine",
    });
    const downtown = await gym("Downtown Gym");
    const campus = await gym("Campus Rec Center");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      sets: three(150, 10, 9, 8),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-05",
      sets: three(140, 10, 10, 10),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: campus.id,
      scheduledFor: "2026-11-07",
      sets: three(110, 12, 12, 11),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-09",
      sets: three(140, 10, 10, 10),
    });

    // Default scope: the gym trained at most recently.
    const h = await history(ex.id);
    expect(h.gymVariable).toBe(true);
    expect(h.scopes.map((s) => s.label)).toEqual([
      "Downtown Gym",
      "Campus Rec Center",
    ]);
    expect(h.selectedScope?.key).toBe(downtown.id);
    expect(h.sessions.rows.map((r) => r.dateIso)).toEqual([
      "2026-11-09",
      "2026-11-05",
      "2026-11-02",
    ]);
    expect(h.sessions.rows.every((r) => r.gymName === null)).toBe(true);
    if (h.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(h.records.heaviest).toMatchObject({ weightLbs: 150, reps: 10 });
    expect(h.records.bestSet).toMatchObject({ weightLbs: 150, reps: 10 });
    expect(h.trend.weight?.points.map((p) => p.value)).toEqual([150, 140, 140]);
    expect(JSON.stringify(h)).not.toMatch(/"(weightLbs|value)":110\b/);

    const c = await history(ex.id, { scope: campus.id });
    expect(c.selectedScope?.key).toBe(campus.id);
    expect(c.sessions.rows.map((r) => r.dateIso)).toEqual(["2026-11-07"]);
    if (c.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(c.records.heaviest).toMatchObject({ weightLbs: 110, reps: 12 });
    expect(JSON.stringify(c)).not.toMatch(/"(weightLbs|value)":(140|150)\b/);
    expect(c.next).toEqual({
      kind: "call",
      tag: null,
      recommendation: null,
      insufficientNote:
        "Not enough history yet at Campus Rec Center: 1 of 2 complete sessions.",
    });
  });

  it("legacy rows with no gym form their own scope, with no calls (R5, R6)", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "cable" });
    const downtown = await gym("Downtown Gym");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: null,
      scheduledFor: "2026-11-02",
      sets: three(60, 12, 12, 11),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: null,
      scheduledFor: "2026-11-05",
      sets: three(60, 12, 12, 12),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-09",
      sets: three(50, 10, 10, 10),
    });

    const h = await history(ex.id);
    expect(h.scopes.map((s) => s.key)).toEqual([downtown.id, "none"]);
    expect(h.selectedScope?.key).toBe(downtown.id);
    const none = await history(ex.id, { scope: "none" });
    expect(none.selectedScope?.label).toBe("No gym recorded");
    expect(none.next).toEqual({ kind: "no_gym" });
    expect(none.sessions.rows.map((r) => r.call)).toEqual(["none", "none"]);
    if (none.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(none.records.heaviest).toMatchObject({ weightLbs: 60, reps: 12 });
  });

  it("an unknown or foreign-looking ?gym= is ignored, never an error (R25)", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "machine" });
    const downtown = await gym("Downtown Gym");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      sets: three(100, 10, 10, 10),
    });
    const base = await history(ex.id);
    for (const scope of [
      "8d0c7c1e-0000-4000-8000-000000000000",
      "not-a-uuid",
      "global",
    ]) {
      expect(await history(ex.id, { scope })).toEqual(base);
    }
  });
});

describe("free weight at two gyms: one global book", () => {
  it("rows carry their gym names; records span every gym", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    const downtown = await gym("Downtown Gym");
    const campus = await gym("Campus Rec Center");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      sets: three(185, 8, 8, 8),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: campus.id,
      scheduledFor: "2026-11-05",
      sets: three(195, 8, 8, 7),
    });
    const h = await history(ex.id);
    expect(h.scopes).toEqual([]);
    expect(h.selectedScope?.key).toBe("global");
    expect(h.sessions.rows.map((r) => r.gymName)).toEqual([
      "Campus Rec Center",
      "Downtown Gym",
    ]);
    if (h.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(h.records.heaviest).toMatchObject({
      weightLbs: 195,
      reps: 8,
      dateLabel: "Nov 5",
    });
  });
});

describe("the calls agree with every other surface (spec §14.2)", () => {
  it("newest counted call == the exercise page's and the completed card's call; deload week suppressed", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-02",
      sets: three(185, 10, 10, 10),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-09",
      sets: three(185, 10, 10, 10),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-30",
      sets: three(165, 10, 10, 10),
    }); // week 5
    const short = await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-12-03",
      sets: [[185, 10]],
    }); // week 5, short
    const done = await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-12-07",
      sets: three(190, 9, 8, 8),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-12-10",
      sets: [[190, 8]],
      status: "in_progress",
    });

    const h = await history(ex.id);
    expect(h.sessions.rows.map((r) => [r.dateIso, r.call])).toEqual([
      ["2026-12-10", "in_progress"],
      ["2026-12-07", "hold"],
      ["2026-12-03", "deload_week"],
      ["2026-11-30", "deload_week"],
      ["2026-11-09", "progress"],
      ["2026-11-02", "insufficient"],
    ]);
    expect(short.loggedExerciseId).toBeTruthy();

    const page = (await getExerciseProgression(account, ex.id))!;
    expect(page.state).toBe("hold");
    expect(h.next).toEqual({
      kind: "call",
      tag: page.tag,
      recommendation: page.recommendation,
      insufficientNote: page.insufficientNote,
    });
    const occ = (await getOccurrenceProgression(
      account,
      done.loggedExerciseId,
    ))!;
    expect(occ.tag).toBe(page.tag);
    expect(occ.recommendation).toEqual(page.recommendation);
    // The e1RM view is the page's existing chart.
    expect(h.trend.e1rm?.points.map((p) => p.value)).toEqual(
      page.points.map((p) => p.e1rm),
    );
    expect(h.trend.e1rm?.latest).toBe(page.currentE1rm);
  });

  it("a short finished session is not counted but its sets hold records (R22)", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-02",
      sets: [[225, 3]],
    });
    const h = await history(ex.id);
    expect(h.sessions.rows[0].call).toBe("not_counted");
    if (h.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(h.records.heaviest).toMatchObject({ weightLbs: 225, reps: 3 });
  });
});

describe("corrections flow through on the next read (Journey I)", () => {
  it("correcting an overstated set through editLoggedSet changes every record, point, and call", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-02",
      sets: three(185, 10, 10, 10),
    });
    const wrong = await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-09",
      sets: three(185, 10, 10, 10),
    });
    await db().loggedSet.update({
      where: { id: wrong.setIds[0] },
      data: { weightLbs: 225 },
    }); // the typo, as logged

    const before = await history(ex.id);
    if (before.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(before.records.heaviest.weightLbs).toBe(225);
    expect(before.sessions.rows[0].call).toBe("progress");

    await editLoggedSet(account, {
      loggedSetId: wrong.setIds[0],
      weightLbs: 185,
      reps: 9,
    });

    const after = await history(ex.id);
    if (after.records?.kind !== "loaded")
      throw new Error("loaded records expected");
    expect(after.records.heaviest).toMatchObject({
      weightLbs: 185,
      reps: 10,
      dateIso: "2026-11-02",
    });
    expect(after.records.repRecords.map((r) => [r.weightLbs, r.reps])).toEqual([
      [185, 10],
    ]);
    expect(after.trend.weight?.points.map((p) => p.value)).toEqual([185, 185]);
    expect(after.sessions.rows[0].call).toBe("hold");
    expect(after.next).toMatchObject({ kind: "call", tag: null });
  });
});

describe("archive never removes history (R28)", () => {
  it("an archived custom exercise and an archived gym keep everything; only new goals are withheld", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({
      equipmentType: "machine",
      isCustom: true,
    });
    const home = await gym("Home Garage");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: home.id,
      scheduledFor: "2026-11-02",
      sets: three(60, 12, 12, 12),
    });
    await db().exercise.update({
      where: { id: ex.id },
      data: { deletedAt: new Date() },
    });
    await db().gym.update({
      where: { id: home.id },
      data: { deletedAt: new Date() },
    });

    const h = await history(ex.id);
    expect(h.hasHistory).toBe(true);
    expect(h.scopes).toEqual([
      { key: home.id, label: "Home Garage (archived)", archived: true },
    ]);
    expect(h.sessions.rows).toHaveLength(1);
    expect(h.records).not.toBeNull();
    const goals = await getExerciseGoals(account, ex.id);
    expect(goals.newGoalEligible).toBe(false);
  });
});

describe("goals on the lift agree with the Goals feature (R17–R19)", () => {
  it("best set == the goal's best; active and past goals with Goals' own labels", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-02",
      sets: three(205, 5, 5, 4),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-05",
      sets: three(185, 10, 10, 10),
    });
    const active = await db().goal.create({
      data: {
        userId: account.userId,
        exerciseId: ex.id,
        targetWeightLbs: 225,
        targetReps: 5,
      },
    });
    await db().goal.create({
      data: {
        userId: account.userId,
        exerciseId: ex.id,
        targetWeightLbs: 205,
        targetReps: 5,
        status: "archived",
        archiveReason: "completed",
        archivedAt: new Date("2026-11-02T18:00:00Z"),
        completionAcknowledgedAt: new Date("2026-11-02T18:00:00Z"),
      },
    });

    const h = await history(ex.id);
    const detail = await getGoalDetail(account, active.id);
    if (h.records?.kind !== "loaded" || detail?.kind !== "active")
      throw new Error("shape");
    expect(detail.best).toMatchObject({
      weightLbs: h.records.bestSet.weightLbs,
      reps: h.records.bestSet.reps,
      dateIso: h.records.bestSet.dateIso,
      e1rm: h.records.bestE1rm,
    });

    const goals = await getExerciseGoals(account, ex.id);
    expect(goals.active?.goalId).toBe(active.id);
    expect(goals.active?.percent).toBe(detail.percent);
    expect(goals.past.map((g) => [g.targetLabel, g.outcome])).toEqual([
      ["205 lb × 5", "completed"],
    ]);
    expect(goals.newGoalEligible).toBe(false);
    expect(goals.bodyweight).toBe(false);
  });

  it("a machine goal is measured at its own gym; bodyweight lifts have none", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "machine" });
    const a = await gym("Downtown Gym");
    const b = await gym("Campus Rec Center");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: a.id,
      scheduledFor: "2026-11-02",
      sets: three(150, 10, 10, 10),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: b.id,
      scheduledFor: "2026-11-05",
      sets: three(110, 12, 12, 12),
    });
    await db().goal.create({
      data: {
        userId: account.userId,
        exerciseId: ex.id,
        gymId: b.id,
        targetWeightLbs: 160,
        targetReps: 10,
      },
    });
    const goals = await getExerciseGoals(account, ex.id);
    expect(goals.active?.gymName).toBe("Campus Rec Center");
    expect(goals.active?.best).toMatchObject({ weightLbs: 110, reps: 12 });

    const pushups = await createTestExercise({ equipmentType: "bodyweight" });
    expect(await getExerciseGoals(account, pushups.id)).toEqual({
      active: null,
      past: [],
      newGoalEligible: false,
      bodyweight: true,
    });
  });
});

describe("empty, sparse, bodyweight, sessions paging, swaps", () => {
  it("never logged: no records, no call, no points (Journey H)", async () => {
    const ex = await createTestExercise({ equipmentType: "cable" });
    const h = await history(ex.id);
    expect(h).toMatchObject({
      hasHistory: false,
      scopes: [],
      selectedScope: null,
      next: null,
      records: null,
      trend: { e1rm: null, weight: null, reps: null },
      sessions: { rows: [], total: 0 },
    });
  });

  it("one session: real records, one point, no call (Journey G)", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-02",
      sets: three(185, 8, 8, 7),
    });
    const h = await history(ex.id);
    expect(h.records?.kind).toBe("loaded");
    expect(h.trend.e1rm?.points).toHaveLength(1);
    expect(h.sessions.rows[0].call).toBe("insufficient");
    expect(h.next).toMatchObject({
      insufficientNote: "Not enough history yet: 1 of 2 complete sessions.",
    });
  });

  it("bodyweight: most reps, a reps view, no load anywhere", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "bodyweight" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-02",
      sets: [
        [null, 18],
        [null, 15],
      ],
      plannedSets: 2,
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-05",
      sets: [
        [null, 20],
        [null, 19],
      ],
      plannedSets: 2,
    });
    const h = await history(ex.id);
    expect(h.externalLoad).toBe(false);
    expect(h.records).toEqual({
      kind: "bodyweight",
      mostReps: { reps: 20, dateIso: "2026-11-05", dateLabel: "Nov 5" },
    });
    expect(h.trend.e1rm).toBeNull();
    expect(h.trend.weight).toBeNull();
    expect(h.trend.reps?.points.map((p) => [p.value, p.setsLabel])).toEqual([
      [18, "18 · 15 reps"],
      [20, "20 · 19 reps"],
    ]);
  });

  it("10 recent sessions by default, all on request; swaps name the planned exercise", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "barbell" });
    const planned = await createTestExercise({
      equipmentType: "dumbbell",
      name: "Incline Dumbbell Press",
    });
    for (let d = 2; d <= 13; d++) {
      await logPerf({
        mesocycleId: meso.id,
        exerciseId: ex.id,
        plannedExerciseId: d === 13 ? planned.id : ex.id,
        scheduledFor: `2026-11-${String(d).padStart(2, "0")}`,
        sets: three(135, 10, 10, 10),
      });
    }
    // A skipped occurrence (no sets) is not a session on this page.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      scheduledFor: "2026-11-14",
      sets: [],
    });
    const recent = await history(ex.id);
    expect(recent.sessions).toMatchObject({ total: 12, showingAll: false });
    expect(recent.sessions.rows).toHaveLength(10);
    expect(recent.sessions.rows[0]).toMatchObject({
      dateIso: "2026-11-13",
      swappedFromName: "Incline Dumbbell Press",
    });
    const all = await history(ex.id, { allSessions: true });
    expect(all.sessions).toMatchObject({ total: 12, showingAll: true });
    expect(all.sessions.rows).toHaveLength(12);
  });
});

describe("history links on the other surfaces (R4)", () => {
  it("card, summary, and workout detail link to the right book", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const machine = await createTestExercise({ equipmentType: "machine" });
    const downtown = await gym("Downtown Gym");
    const done = await logPerf({
      mesocycleId: meso.id,
      exerciseId: machine.id,
      gymId: downtown.id,
      scheduledFor: "2026-11-02",
      sets: three(100, 10, 10, 10),
    });
    const occ = (await getOccurrenceProgression(
      account,
      done.loggedExerciseId,
    ))!;
    expect(occ.historyHref).toBe(`/exercises/${machine.id}?gym=${downtown.id}`);
    const summary = (await getSessionProgressionSummary(
      account,
      done.loggedSessionId,
    ))!;
    expect(summary.exercises[0].historyHref).toBe(occ.historyHref);
    const detail = (await getLoggedWorkoutDetail(
      account,
      done.loggedSessionId,
    ))!;
    expect(detail.exercises[0]).toMatchObject({
      exerciseId: machine.id,
      historyHref: occ.historyHref,
    });

    const first = await logPerf({
      mesocycleId: meso.id,
      exerciseId: machine.id,
      gymId: (await gym("Campus Rec Center")).id,
      scheduledFor: "2026-11-03",
      sets: [],
      status: "in_progress",
    });
    expect(
      (await getOccurrenceProgression(account, first.loggedExerciseId))!
        .historyHref,
    ).toBeNull();

    // Review audit of #90: a legacy machine row with no gym links to the
    // "No gym recorded" scope, not to another gym's history.
    const legacy = await logPerf({
      mesocycleId: meso.id,
      exerciseId: machine.id,
      gymId: null,
      scheduledFor: "2026-11-04",
      sets: three(90, 10, 10, 10),
    });
    const legacyHref = `/exercises/${machine.id}?gym=none`;
    expect(
      (await getOccurrenceProgression(account, legacy.loggedExerciseId))!
        .historyHref,
    ).toBe(legacyHref);
    expect(
      (await getLoggedWorkoutDetail(account, legacy.loggedSessionId))!
        .exercises[0].historyHref,
    ).toBe(legacyHref);
  });
});

describe("read-only (pitch §4.19)", () => {
  it("every read the page makes leaves every owned table byte-identical", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const ex = await createTestExercise({ equipmentType: "machine" });
    const a = await gym("Downtown Gym");
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: a.id,
      scheduledFor: "2026-11-02",
      sets: three(100, 10, 10, 10),
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: ex.id,
      gymId: a.id,
      scheduledFor: "2026-11-05",
      sets: three(100, 10, 10, 10),
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: a.id,
        exerciseId: ex.id,
        weightLbs: 100,
      },
    });
    // A goal already reached: the page must not archive it (R18).
    await db().goal.create({
      data: {
        userId: account.userId,
        exerciseId: ex.id,
        gymId: a.id,
        targetWeightLbs: 100,
        targetReps: 10,
      },
    });

    const before = await snapshotAccount(account.userId);
    for (const scope of [undefined, a.id, "none"]) {
      for (const allSessions of [false, true]) {
        await getExerciseHistory(account, ex.id, { scope, allSessions });
      }
    }
    const goals = await getExerciseGoals(account, ex.id);
    expect(goals.active?.percent).toBe(100);
    expect(await snapshotAccount(account.userId)).toEqual(before);
  });
});
