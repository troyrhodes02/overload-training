import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import { completeWorkout } from "@/lib/logging/sessions";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";
import { snapshotAccount } from "./isolation/support";

let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Recommendations through real rows (Smarter & Explainable Progression spec
 * §11.4, §14.2; AC-1–AC-3). History is inserted raw (test-only) to control
 * dates, gyms, and RIR; the in-progress and correction cases use the
 * canonical write path. Every word is computed on read.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5.
 *   week 1 = 11/02, 2 = 11/09, 3 = 11/16, 4 = 11/23,
 *   5 = 11/30 (SCHEDULED DELOAD), 6 = 12/07.
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
  weights?: (number | null)[];
  rir?: (number | null)[];
  status?: "in_progress" | "complete";
  repMin?: number;
  repMax?: number;
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
      targetRepMin: opts.repMin ?? 6,
      targetRepMax: opts.repMax ?? 8,
    },
  });
  const setIds: string[] = [];
  for (let i = 0; i < opts.reps.length; i++) {
    const w = opts.weights?.[i];
    const s = await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: w === undefined ? 185 : w,
        reps: opts.reps[i],
        rir: opts.rir?.[i] ?? null,
        // Creation order follows the workout date (the working-weight source
        // orders by creation time), a year back so anything the test logs
        // through the write path is newer.
        createdAt: new Date(`2025${opts.scheduledFor.slice(4)}T12:0${i}:00Z`),
      },
    });
    setIds.push(s.id);
  }
  return { loggedSessionId: ls.id, loggedExerciseId: le.id, setIds };
}

async function setup(
  equipmentType: "barbell" | "bodyweight" | "cable" = "barbell",
) {
  const meso = await createTestMesocycle({ status: "active" });
  const ex = await createTestExercise({ equipmentType });
  return { mesoId: meso.id, exId: ex.id };
}

const page = async (exId: string, gymId?: string) =>
  (await getExerciseProgression(account, exId, gymId))!;
const occurrence = async (leId: string) =>
  (await getOccurrenceProgression(account, leId))!;
const planned = (exId: string, scheduledDeloadWeek = false) =>
  getPlannedProgression(account, exId, { scheduledDeloadWeek });

async function inProgress(
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

describe("Progress: the weight to try and the sets that earned it (P1)", () => {
  it("card (today), summary and page (next time), planned list — one evaluation, one wording", async () => {
    const { mesoId, exId } = await setup();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    const done = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
    });

    const evidence = "8 reps on every set, 2 sessions running";
    const p = await page(exId);
    expect(p.tag).toBe("progress");
    expect(p.recommendation).toEqual({
      kind: "progress",
      tone: "strong",
      action: "Try 190 lb next time (+5 lb)",
      evidence,
    });
    expect(p.insufficientNote).toBeNull();

    const summary = (await getSessionProgressionSummary(
      account,
      done.loggedSessionId,
    ))!;
    expect(summary.exercises[0].recommendation).toEqual(p.recommendation);
    expect((await occurrence(done.loggedExerciseId)).recommendation).toEqual(
      p.recommendation,
    );

    const t = await inProgress(mesoId, exId, "2026-11-16");
    expect((await occurrence(t.loggedExerciseId)).recommendation).toEqual({
      kind: "progress",
      tone: "strong",
      action: "Try 190 lb today (+5 lb)",
      evidence,
    });
    const pl = await planned(exId);
    expect(pl.tag).toBe("progress");
    expect(pl.recommendation?.evidence).toBe(evidence);
    expect(pl.recommendation?.action).toBe("Try 190 lb today (+5 lb)");
  });

  it("the card's number holds still while the workout is logged (R9)", async () => {
    const { mesoId, exId } = await setup();
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
    const t = await inProgress(mesoId, exId, "2026-11-16");

    await logSet(account, {
      loggedExerciseId: t.loggedExerciseId,
      setNumber: 1,
      weightLbs: 190,
      reps: 8,
    });
    const occ = await occurrence(t.loggedExerciseId);
    expect(occ.recommendation?.action).toBe("Try 190 lb today (+5 lb)");
    expect(occ.suggestion).toEqual({ lbs: 190, kind: "progress_increment" });

    await logSet(account, {
      loggedExerciseId: t.loggedExerciseId,
      setNumber: 2,
      weightLbs: 190,
      reps: 8,
    });
    await logSet(account, {
      loggedExerciseId: t.loggedExerciseId,
      setNumber: 3,
      weightLbs: 190,
      reps: 7,
    });
    await completeWorkout(account, { loggedSessionId: t.loggedSessionId });

    // Complete: the advice is for next time and judges today's sets too.
    const after = await occurrence(t.loggedExerciseId);
    expect(after.tag).toBeNull();
    expect(after.recommendation).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 190 lb next time",
      evidence: "Last time: 8, 8, 7 of 6–8",
    });
  });

  it("bodyweight: past the plan's top, never a weight", async () => {
    const { mesoId, exId } = await setup("bodyweight");
    for (const d of ["2026-11-02", "2026-11-09"]) {
      await logPerf({
        mesocycleId: mesoId,
        exerciseId: exId,
        scheduledFor: d,
        reps: [12, 12, 12],
        weights: [null, null, null],
        repMin: 8,
        repMax: 12,
      });
    }
    const p = await page(exId);
    expect(p.recommendation).toEqual({
      kind: "progress",
      tone: "strong",
      action: "Next time, go past 12 reps or make it harder",
      evidence: "12 reps on every set, 2 sessions running",
    });
    expect(p.suggestion).toBeNull();
  });
});

describe("Hold says what holding means", () => {
  it("short of the top: stay at the working weight; the reps judged", async () => {
    const { mesoId, exId } = await setup();
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
      reps: [8, 7, 6],
    });
    const p = await page(exId);
    expect(p.tag).toBeNull();
    expect(p.recommendation).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 185 lb next time",
      evidence: "Last time: 8, 7, 6 of 6–8",
    });
  });

  it("top once: progress needs it twice", async () => {
    const { mesoId, exId } = await setup();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: [8, 7, 7],
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
    });
    expect((await page(exId)).recommendation?.evidence).toBe(
      "8 on every set last time; progress needs 2 sessions running",
    );
  });

  it("names the date when the latest counted session isn't the last one (R17)", async () => {
    const { mesoId, exId } = await setup();
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
      reps: [8, 7, 6],
    });
    // Finished on 11/16 with only 2 of 3 planned sets: not counted.
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: [8, 8],
    });
    expect((await page(exId)).recommendation?.evidence).toBe(
      "On Nov 9: 8, 7, 6 of 6–8",
    );
  });

  it("stalled: the rule, not e1RM figures (H2)", async () => {
    const { mesoId, exId } = await setup();
    for (const d of ["2026-11-02", "2026-11-09", "2026-11-16"]) {
      await logPerf({
        mesocycleId: mesoId,
        exerciseId: exId,
        scheduledFor: d,
        reps: TOP,
      });
    }
    const p = await page(exId);
    expect(p.tag).toBe("stalled");
    expect(p.recommendation).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 185 lb next time",
      evidence:
        "Top of the range 2 sessions running, but e1RM hasn't risen over 3 sessions",
    });
  });
});

describe("RIR appears only when it changed the call (H1, P3)", () => {
  it("case A holds with the limit named; the same reps without RIR progress", async () => {
    const { mesoId, exId } = await setup();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    const last = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [2, 1, 0],
    });
    expect((await page(exId)).recommendation).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 185 lb next time",
      evidence: "Top of the range, but at your limit last time (0 RIR)",
    });
    // Clear the 0 through the canonical edit: RIR no longer matters, and the words say so.
    await editLoggedSet(account, {
      loggedSetId: last.setIds[2],
      weightLbs: 185,
      reps: 8,
      rir: null,
    });
    const p = await page(exId);
    expect(p.recommendation?.action).toBe("Try 190 lb next time (+5 lb)");
    expect(p.recommendation?.evidence).not.toMatch(/RIR|reserve/);
  });

  it("case B releases a flat stall, naming the reps to spare", async () => {
    const { mesoId, exId } = await setup();
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
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: TOP,
      rir: [3, 2, 2],
    });
    expect((await page(exId)).recommendation).toEqual({
      kind: "progress",
      tone: "strong",
      action: "Try 190 lb next time (+5 lb)",
      evidence: "e1RM flat, but every set last time had 2+ in reserve",
    });
  });
});

describe("machines and cables are judged per gym, and say which (D1, N1)", () => {
  it("a deload at Gym A names Gym A; Gym B has its own (insufficient) history", async () => {
    const { mesoId, exId } = await setup("cable");
    const a = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    const b = await db().gym.create({
      data: { userId: account.userId, name: "Campus Rec" },
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: a.id,
        exerciseId: exId,
        weightLbs: 40,
      },
    });
    const opts = {
      mesocycleId: mesoId,
      exerciseId: exId,
      repMin: 12,
      repMax: 15,
    };
    await logPerf({
      ...opts,
      gymId: a.id,
      scheduledFor: "2026-11-02",
      reps: [12, 11, 10],
      weights: [40, 40, 40],
    });
    await logPerf({
      ...opts,
      gymId: a.id,
      scheduledFor: "2026-11-09",
      reps: [12, 10, 9],
      weights: [40, 40, 40],
    });
    await logPerf({
      ...opts,
      gymId: b.id,
      scheduledFor: "2026-11-11",
      reps: [15, 15, 15],
      weights: [70, 70, 70],
    });

    const atA = await page(exId, a.id);
    expect(atA.tag).toBe("deload");
    expect(atA.recommendation).toEqual({
      kind: "deload",
      tone: "strong",
      action: "Lower the weight next time",
      evidence: "A set below 12 reps, 2 sessions running at Downtown Gym",
    });
    const atB = await page(exId, b.id);
    expect(atB.recommendation).toBeNull();
    expect(atB.insufficientNote).toBe(
      "Not enough history yet at Campus Rec: 1 of 2 complete sessions.",
    );

    // Today's card at Gym A carries the same call, for today.
    const t = await inProgress(mesoId, exId, "2026-11-16", a.id);
    expect(
      (await occurrence(t.loggedExerciseId)).recommendation?.evidence,
    ).toBe("A set below 12 reps, 2 sessions running at Downtown Gym");
    // Before a gym is chosen the planned list makes no machine call.
    expect((await planned(exId)).recommendation).toBeNull();
  });
});

describe("the scheduled deload week speaks only for the plan (S1)", () => {
  it("suppresses reactive words, shows the 90% load, and resumes the week after", async () => {
    const { mesoId, exId } = await setup();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: [7, 5, 5],
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-23",
      reps: [6, 5, 5],
    });
    expect((await page(exId)).tag).toBe("deload");

    const wk5 = await inProgress(mesoId, exId, "2026-11-30");
    const occ = await occurrence(wk5.loggedExerciseId);
    expect(occ.tag).toBeNull();
    expect(occ.recommendation).toEqual({
      kind: "scheduled_deload",
      tone: "quiet",
      action: "Deload week: 165 lb (90%)",
      evidence: "Planned recovery, not a verdict. Calls resume next week.",
    });
    expect(JSON.stringify(occ.recommendation)).not.toMatch(
      /Lower|below|Deload\b(?! week)/,
    );
    expect((await planned(exId, true)).recommendation).toBeNull();

    const wk6 = await inProgress(mesoId, exId, "2026-12-07");
    expect(
      (await occurrence(wk6.loggedExerciseId)).recommendation?.action,
    ).toBe("Lower the weight today");
  });
});

describe("history corrections change the words on the next read (AC-2)", () => {
  it("a past set corrected below the top turns Progress into a Hold with the corrected reps", async () => {
    const { mesoId, exId } = await setup();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    const last = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
    });
    expect((await page(exId)).recommendation?.kind).toBe("progress");

    await editLoggedSet(account, {
      loggedSetId: last.setIds[2],
      weightLbs: 185,
      reps: 6,
    });
    expect((await page(exId)).recommendation).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 185 lb next time",
      evidence: "Last time: 8, 8, 6 of 6–8",
    });
  });
});

describe("reading recommendations writes nothing (AC-3)", () => {
  it("every surface, every scenario: the account's rows are byte-identical", async () => {
    const { mesoId, exId } = await setup();
    const cable = await createTestExercise({
      name: "Cable Fly",
      equipmentType: "cable",
    });
    const gym = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: gym.id,
        exerciseId: cable.id,
        weightLbs: 40,
      },
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    const done = await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: TOP,
      rir: [2, 2, 3],
    });
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: cable.id,
      gymId: gym.id,
      scheduledFor: "2026-11-09",
      reps: [12, 12, 12],
      weights: [40, 40, 40],
      repMin: 10,
      repMax: 12,
    });
    const t = await inProgress(mesoId, exId, "2026-11-16");
    const wk5 = await inProgress(mesoId, cable.id, "2026-11-30", gym.id);

    const before = await snapshotAccount(account.userId);
    for (let i = 0; i < 2; i++) {
      await page(exId);
      await page(cable.id, gym.id);
      await planned(exId);
      await planned(exId, true);
      await planned(cable.id);
      await occurrence(t.loggedExerciseId);
      await occurrence(wk5.loggedExerciseId);
      await occurrence(done.loggedExerciseId);
      await getSessionProgressionSummary(account, done.loggedSessionId);
    }
    expect(await snapshotAccount(account.userId)).toEqual(before);
  });
});

describe("review audit of #86: the number is the judged session's, or none (R9, R33)", () => {
  it("an extra back-off set never becomes the weight to stay at or add to", async () => {
    const { mesoId, exId } = await setup();
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    // Working sets 185 × 8, 7, 6, then a back-off extra 135 × 12 logged last.
    await logPerf({
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: [8, 7, 6, 12],
      weights: [185, 185, 185, 135],
    });
    const hold = await page(exId);
    // The extra 135 is excluded; the number is the judged session's TOP planned
    // set (185), not the back-off set and not withheld (OVE-61, R33).
    expect(hold.recommendation).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 185 lb next time",
      evidence: "Last time: 8, 7, 6 of 6–8",
    });

    const m2 = mesoId;
    const e2 = (await createTestExercise({ name: "Overhead Press" })).id;
    await logPerf({
      mesocycleId: m2,
      exerciseId: e2,
      scheduledFor: "2026-11-02",
      reps: TOP,
    });
    await logPerf({
      mesocycleId: m2,
      exerciseId: e2,
      scheduledFor: "2026-11-09",
      reps: [8, 8, 8, 12],
      weights: [185, 185, 185, 135],
    });
    const prog = await page(e2);
    expect(prog.tag).toBe("progress");
    // The back-off 135 is excluded, so the +5 is on the top set (185 → 190),
    // not withheld and never 135-based (OVE-61, R33).
    expect(prog.suggestion).toEqual({ lbs: 190, kind: "progress_increment" });
    expect(prog.recommendation?.action).toBe("Try 190 lb next time (+5 lb)");
  });

  it("a baseline the in-progress workout corrected is not that workout's context", async () => {
    const { mesoId, exId } = await setup("cable");
    const gym = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: gym.id,
        exerciseId: exId,
        weightLbs: 100,
      },
    });
    const opts = { mesocycleId: mesoId, exerciseId: exId, gymId: gym.id };
    await logPerf({
      ...opts,
      scheduledFor: "2026-11-02",
      reps: TOP,
      weights: [100, 100, 100],
    });
    await logPerf({
      ...opts,
      scheduledFor: "2026-11-09",
      reps: TOP,
      weights: [100, 100, 100],
    });
    const t = await inProgress(mesoId, exId, "2026-11-16", gym.id);
    expect((await occurrence(t.loggedExerciseId)).recommendation?.action).toBe(
      "Try 105 lb today (+5 lb)",
    );

    for (const n of [1, 2, 3]) {
      await logSet(account, {
        loggedExerciseId: t.loggedExerciseId,
        setNumber: n,
        weightLbs: 120,
        reps: 8,
      });
    }
    const corrected = await db().gymExerciseBaseline.findFirstOrThrow({
      where: { gymId: gym.id, exerciseId: exId },
    });
    expect(Number(corrected.weightLbs)).toBe(120); // the logging path corrected it
    // The card no longer prints a number it can't stand behind.
    expect((await occurrence(t.loggedExerciseId)).recommendation?.action).toBe(
      "Ready to add weight today",
    );
  });

  it("the planned list and the exercise page ignore today's unfinished sets, like the card", async () => {
    const { mesoId, exId } = await setup();
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
    const t = await inProgress(mesoId, exId, "2026-11-16");
    await logSet(account, {
      loggedExerciseId: t.loggedExerciseId,
      setNumber: 1,
      weightLbs: 200,
      reps: 8,
    });

    expect((await planned(exId)).suggestion).toEqual({
      lbs: 190,
      kind: "progress_increment",
    });
    expect((await page(exId)).recommendation?.action).toBe(
      "Try 190 lb next time (+5 lb)",
    );
    expect((await occurrence(t.loggedExerciseId)).recommendation?.action).toBe(
      "Try 190 lb today (+5 lb)",
    );
  });

  it("a second slot of the same exercise in the same workout ignores the first slot's sets", async () => {
    const { mesoId, exId } = await setup();
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
    const t = await inProgress(mesoId, exId, "2026-11-16");
    const second = await db().loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: t.loggedSessionId,
        exerciseId: exId,
        plannedExerciseId: exId,
        position: 1,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });
    for (const n of [1, 2, 3]) {
      await logSet(account, {
        loggedExerciseId: t.loggedExerciseId,
        setNumber: n,
        weightLbs: 200,
        reps: 8,
      });
    }
    expect((await occurrence(second.id)).recommendation?.action).toBe(
      "Try 190 lb today (+5 lb)",
    );
  });
});
