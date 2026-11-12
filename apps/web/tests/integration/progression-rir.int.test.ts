import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getPlannedProgression,
  getQualifyingSessionE1rms,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * RIR-aware progression through real rows (RIR Logging & Autoregulation spec
 * §6, §11.6, §14.2; R11–R21, R26). History is inserted raw (test-only) to
 * control dates, gyms, and RIR precisely; the reads compute everything.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5.
 *   week 1 = 11/02, week 2 = 11/09, week 3 = 11/16, week 4 = 11/23,
 *   week 5 = 11/30 (SCHEDULED DELOAD), week 6 = 12/07.
 * Bench 3 × 6–8; "top" = 8, 8, 8.
 */
const db = () => getTestPrisma();
const TOP = [8, 8, 8];

async function logPerf(opts: {
  mesocycleId: string;
  exerciseId: string;
  gymId?: string | null;
  scheduledFor: string;
  reps: number[];
  weights?: number[];
  rir?: (number | null)[];
  status?: "in_progress" | "complete";
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
      plannedExerciseId: opts.exerciseId,
      gymId: opts.gymId ?? null,
      plannedSets: 3,
      targetRepMin: 6,
      targetRepMax: 8,
    },
  });
  const setIds: string[] = [];
  for (let i = 0; i < opts.reps.length; i++) {
    const s = await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: opts.weights?.[i] ?? 185,
        reps: opts.reps[i],
        rir: opts.rir?.[i] ?? null,
      },
    });
    setIds.push(s.id);
  }
  return { loggedSessionId: ls.id, loggedExerciseId: le.id, setIds };
}

async function bench() {
  const meso = await createTestMesocycle({ status: "active" });
  const ex = await createTestExercise({ equipmentType: "barbell" });
  return { mesoId: meso.id, exId: ex.id };
}

/** Today's not-yet-logged occurrence, so the card's call can be read. */
async function today(
  mesoId: string,
  exId: string,
  date: string,
  gymId?: string,
) {
  return logPerf({
    mesocycleId: mesoId,
    exerciseId: exId,
    gymId,
    scheduledFor: date,
    reps: [],
    status: "in_progress",
  });
}

describe("case A — reaching the top at 0 RIR holds (AC-3)", () => {
  it("the exercise page, today's card, and the dashboard all hold with the reason", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [2, 1, 0],
    });

    const page = (await getExerciseProgression(account, exId))!;
    expect(page.state).toBe("hold");
    expect(page.tag).toBeNull();
    expect(page.rirEffect).toBe("held_at_limit");
    expect(page.suggestion).toBeNull();

    const t = await today(mesoId, exId, "2026-11-16");
    const occ = (await getOccurrenceProgression(account, t.loggedExerciseId))!;
    expect(occ).toMatchObject({
      tag: null,
      rirEffect: "held_at_limit",
      suggestion: null,
    });

    const planned = await getPlannedProgression(account, exId, {
      scheduledDeloadWeek: false,
    });
    expect(planned.tag).toBeNull();
  });

  it("the same reps with reps to spare are Progress with +5 (the AC-3 pair)", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [2, 2, 3],
    });
    const page = (await getExerciseProgression(account, exId))!;
    expect(page).toMatchObject({
      state: "progress",
      tag: "progress",
      rirEffect: null,
      suggestion: { lbs: 190, kind: "progress_increment" },
    });
  });

  it("a history with no RIR at all is unchanged: Progress, no effect (AC-2)", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
    });
    const page = (await getExerciseProgression(account, exId))!;
    expect(page).toMatchObject({
      state: "progress",
      tag: "progress",
      rirEffect: null,
    });
  });
});

describe("case B — a flat trend with every set 2+ releases to Progress", () => {
  it("Progress with its +5 suggestion and the reason; any unrecorded set keeps the stall", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
    });
    const latest = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: TOP,
      rir: [3, 2, 2],
    });
    expect((await getExerciseProgression(account, exId))!).toMatchObject({
      state: "progress",
      tag: "progress",
      rirEffect: "released_stall",
      suggestion: { lbs: 190, kind: "progress_increment" },
    });

    // Clear one set's RIR: coverage incomplete → the existing stall stands.
    await editLoggedSet(account, {
      loggedSetId: latest.setIds[1],
      weightLbs: 185,
      reps: 8,
      rir: null,
    });
    expect((await getExerciseProgression(account, exId))!).toMatchObject({
      state: "stalled",
      tag: "stalled",
      rirEffect: null,
      suggestion: null,
    });
  });
});

describe("historical corrections re-derive the call (Journey E, pitch §4.12)", () => {
  it("0 → 2 releases the hold; clearing keeps Progress; 0 again holds — nothing stored", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    const latest = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [2, 1, 0],
    });
    const effect = async () =>
      (await getExerciseProgression(account, exId))!.rirEffect;
    const state = async () =>
      (await getExerciseProgression(account, exId))!.state;

    expect(await effect()).toBe("held_at_limit");
    const edit = (rir: number | null) =>
      editLoggedSet(account, {
        loggedSetId: latest.setIds[2],
        weightLbs: 185,
        reps: 8,
        rir,
      });
    await edit(2);
    expect(await state()).toBe("progress");
    expect(await effect()).toBeNull();
    await edit(null);
    expect(await state()).toBe("progress");
    await edit(0);
    expect(await state()).toBe("hold");
    // Weight and reps were never changed by these corrections.
    const rows = await db().loggedSet.findMany({
      where: { loggedExerciseId: latest.loggedExerciseId },
      orderBy: { setNumber: "asc" },
    });
    expect(rows.map((r) => [Number(r.weightLbs), r.reps])).toEqual([
      [185, 8],
      [185, 8],
      [185, 8],
    ]);
  });
});

describe("scheduled deload weeks stay silent (R26; Pitch 5 R37–R38)", () => {
  it("RIR logged in the deload week is never 'latest'; the deload occurrence has no call", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-23",
      reps: TOP,
      rir: [2, 2, 2],
    });
    // Week 5: scheduled deload, lighter, logged at the limit.
    const deload = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-30",
      reps: TOP,
      weights: [165, 165, 165],
      rir: [0, 0, 0],
    });
    const occDeload = (await getOccurrenceProgression(
      account,
      deload.loggedExerciseId,
    ))!;
    expect(occDeload).toMatchObject({
      scheduledDeloadWeek: true,
      tag: null,
      rirEffect: null,
    });
    // Week 6: the latest QUALIFYING performance is week 4 (2+), so Progress.
    const t = await today(mesoId, exId, "2026-12-07");
    const occ = (await getOccurrenceProgression(account, t.loggedExerciseId))!;
    expect(occ).toMatchObject({
      scheduledDeloadWeek: false,
      tag: "progress",
      rirEffect: null,
    });
  });

  it("the planned list in a deload week carries no call and no effect", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [0, 0, 0],
    });
    expect(
      await getPlannedProgression(account, exId, { scheduledDeloadWeek: true }),
    ).toMatchObject({ tag: null, rirEffect: null });
  });
});

describe("gym scope holds for machines and cables (pitch §4.13)", () => {
  it("a 0 RIR at Gym B holds only Gym B; Gym A's call and baseline are untouched", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const cable = await createTestExercise({ equipmentType: "cable" });
    const gymA = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    const gymB = await db().gym.create({
      data: { userId: account.userId, name: "Campus Rec Center" },
    });
    const baselineA = await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: gymA.id,
        exerciseId: cable.id,
        weightLbs: 50,
      },
    });
    for (const [d, rir] of [
      ["2026-11-02", null],
      ["2026-11-09", [2, 2, 2]],
    ] as const) {
      await logPerf({
        mesocycleId: meso.id,
        exerciseId: cable.id,
        gymId: gymA.id,
        scheduledFor: d,
        reps: TOP,
        weights: [50, 50, 50],
        rir: rir ? [...rir] : undefined,
      });
    }
    for (const [d, rir] of [
      ["2026-11-03", null],
      ["2026-11-10", [1, 1, 0]],
    ] as const) {
      await logPerf({
        mesocycleId: meso.id,
        exerciseId: cable.id,
        gymId: gymB.id,
        scheduledFor: d,
        reps: TOP,
        weights: [70, 70, 70],
        rir: rir ? [...rir] : undefined,
      });
    }
    const atA = (await getExerciseProgression(account, cable.id, gymA.id))!;
    const atB = (await getExerciseProgression(account, cable.id, gymB.id))!;
    expect(atA).toMatchObject({ state: "progress", rirEffect: null });
    expect(atB).toMatchObject({ state: "hold", rirEffect: "held_at_limit" });
    const after = await db().gymExerciseBaseline.findUniqueOrThrow({
      where: { id: baselineA.id },
    });
    expect(Number(after.weightLbs)).toBe(50);
    expect(after.updatedAt).toEqual(baselineA.updatedAt);
    expect(await db().gymExerciseBaseline.count()).toBe(1);
  });
});

describe("RIR never enters e1RM or goal strength (R16)", () => {
  it("the same sets with and without RIR produce identical qualifying e1RMs", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const plain = await createTestExercise({
      name: "Plain Bench",
      equipmentType: "barbell",
    });
    const withRir = await createTestExercise({
      name: "RIR Bench",
      equipmentType: "barbell",
    });
    for (const [ex, rir] of [
      [plain.id, undefined],
      [withRir.id, [0, 2, 4]],
    ] as const) {
      await logPerf({
        mesocycleId: meso.id,
        exerciseId: ex,
        scheduledFor: "2026-11-02",
        reps: [8, 7, 6],
        weights: [185, 190, 195],
        rir: rir ? [...rir] : undefined,
      });
    }
    const strip = (
      rows: Awaited<ReturnType<typeof getQualifyingSessionE1rms>>,
    ) =>
      rows.map((r) => ({
        e1rm: r.e1rm,
        bestSet: r.bestSet,
        dateIso: r.dateIso,
      }));
    expect(
      strip(await getQualifyingSessionE1rms(account, withRir.id, null)),
    ).toEqual(strip(await getQualifyingSessionE1rms(account, plain.id, null)));
    const a = (await getExerciseProgression(account, plain.id))!;
    const b = (await getExerciseProgression(account, withRir.id))!;
    expect(b.points.map((p) => p.e1rm)).toEqual(a.points.map((p) => p.e1rm));
    expect(b.currentE1rm).toBe(a.currentE1rm);
  });
});

describe("the day-complete summary carries the effect", () => {
  it("reports held_at_limit for the exercise that held", async () => {
    const { mesoId, exId } = await bench();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    const latest = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [2, 1, 0],
    });
    const summary = (await getSessionProgressionSummary(
      account,
      latest.loggedSessionId,
    ))!;
    expect(summary.exercises).toEqual([
      expect.objectContaining({ tag: null, rirEffect: "held_at_limit" }),
    ]);
  });
});
