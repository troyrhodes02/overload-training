import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import type { Account } from "@/lib/data/account";
import { createTestAccount, defaultAccount } from "./support/accounts";
import { snapshotAccount } from "./isolation/support";

/**
 * Workout Logging Refinements — the below-minimum reassess call through real
 * rows (spec §3.1, §13; RD-1–RD-5). The reported case: 90 lb planned at 6–10,
 * logged at 3. History is inserted raw (test-only) to control dates; the read
 * layer computes everything on read.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5, so
 * 11/02, 11/09, 11/16, 11/23 are ordinary weeks.
 */
const db = () => getTestPrisma();

async function logPerf(
  account: Account,
  opts: {
    mesocycleId: string;
    exerciseId: string;
    scheduledFor: string;
    reps: number[];
    weight?: number | null;
    status?: "in_progress" | "complete";
    repMin?: number;
    repMax?: number;
  },
) {
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
      plannedSets: 3,
      targetRepMin: opts.repMin ?? 6,
      targetRepMax: opts.repMax ?? 10,
    },
  });
  for (let i = 0; i < opts.reps.length; i++) {
    await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: opts.weight === undefined ? 90 : opts.weight,
        reps: opts.reps[i],
        createdAt: new Date(`2025${opts.scheduledFor.slice(4)}T12:0${i}:00Z`),
      },
    });
  }
  return { loggedSessionId: ls.id, loggedExerciseId: le.id };
}

async function setup(
  account: Account,
  equipmentType: "barbell" | "bodyweight" = "barbell",
) {
  const meso = await createTestMesocycle({
    status: "active",
    userId: account.userId,
  });
  const ex = await createTestExercise({
    equipmentType,
    userId: account.userId,
  });
  return { mesoId: meso.id, exId: ex.id };
}

const REASSESS_EVIDENCE =
  "Last time: 3, 8, 8 of 6–10, below 6. Two sessions running below 6 call for a deload.";

describe("90 × 3 against 6–10 never says to stay at 90 lb (Pro)", () => {
  let account: Account;
  beforeEach(async () => {
    account = await defaultAccount();
  });

  it("card, summary, exercise page, and planned list all ask to reassess", async () => {
    const { mesoId, exId } = await setup(account);
    await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
    });
    const failed = await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: [3, 8, 8],
    });

    const card = (await getOccurrenceProgression(
      account,
      failed.loggedExerciseId,
    ))!;
    expect(card.tag).toBeNull(); // a reassess is a hold: no tag
    expect(card.suggestion).toBeNull();
    expect(card.recommendation).toEqual({
      kind: "reassess",
      tone: "strong",
      action: "Reassess the weight next time",
      evidence: REASSESS_EVIDENCE,
    });

    const summary = (await getSessionProgressionSummary(
      account,
      failed.loggedSessionId,
    ))!;
    expect(summary.exercises[0].recommendation?.action).toBe(
      "Reassess the weight next time",
    );

    const page = (await getExerciseProgression(account, exId))!;
    expect(page.state).toBe("hold");
    expect(page.recommendation?.action).toBe("Reassess the weight next time");

    const planned = await getPlannedProgression(account, exId, {
      scheduledDeloadWeek: false,
    });
    expect(planned.recommendation?.action).toBe("Reassess the weight today");

    for (const rec of [
      card.recommendation,
      summary.exercises[0].recommendation,
      page.recommendation,
      planned.recommendation,
    ]) {
      expect(rec?.action).not.toMatch(/Stay at|90/);
    }
  });

  it("a workout finished after one failed set blocks the Progress the older sessions earned", async () => {
    const { mesoId, exId } = await setup(account);
    for (const d of ["2026-11-02", "2026-11-09"]) {
      await logPerf(account, {
        mesocycleId: mesoId,
        exerciseId: exId,
        scheduledFor: d,
        reps: [10, 10, 10],
      });
    }
    // Before the short workout: Progress, +5 lb.
    expect((await getExerciseProgression(account, exId))!.state).toBe(
      "progress",
    );
    const short = await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: [3],
    });
    const page = (await getExerciseProgression(account, exId))!;
    expect(page.state).toBe("hold");
    expect(page.tag).toBeNull();
    expect(page.suggestion).toBeNull();
    expect(page.recommendation?.action).toBe("Reassess the weight next time");
    expect(page.recommendation?.evidence).toBe(
      "Last time: 3 of 6–10, below 6. Two sessions running below 6 call for a deload.",
    );

    // The exercise history labels the short failed workout with the call it
    // led to (a hold), not "Not counted".
    const history = await getExerciseHistory(account, exId);
    const row = history!.sessions.rows.find(
      (s) => s.loggedExerciseId === short.loggedExerciseId,
    );
    expect(row?.call).toBe("hold");
  });

  it("a workout still in progress doesn't change today's advice (RD-4)", async () => {
    const { mesoId, exId } = await setup(account);
    for (const d of ["2026-11-02", "2026-11-09"]) {
      await logPerf(account, {
        mesocycleId: mesoId,
        exerciseId: exId,
        scheduledFor: d,
        reps: [10, 10, 10],
      });
    }
    const open = await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: [3],
      status: "in_progress",
    });
    const card = (await getOccurrenceProgression(
      account,
      open.loggedExerciseId,
    ))!;
    expect(card.tag).toBe("progress");
  });

  it("a fixed target of 10: 10 progresses, a miss reassesses with one number", async () => {
    const { mesoId, exId } = await setup(account);
    for (const d of ["2026-11-02", "2026-11-09"]) {
      await logPerf(account, {
        mesocycleId: mesoId,
        exerciseId: exId,
        scheduledFor: d,
        reps: [10, 10, 10],
        repMin: 10,
        repMax: 10,
      });
    }
    expect((await getExerciseProgression(account, exId))!.state).toBe(
      "progress",
    );
    await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-16",
      reps: [10, 6, 4],
      repMin: 10,
      repMax: 10,
    });
    const page = (await getExerciseProgression(account, exId))!;
    expect(page.recommendation?.evidence).toBe(
      "Last time: 10, 6, 4 of 10, below 10. Two sessions running below 10 call for a deload.",
    );
  });

  it("bodyweight: reassess the difficulty, never a weight", async () => {
    const { mesoId, exId } = await setup(account, "bodyweight");
    await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
      weight: null,
    });
    await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: [3, 8, 8],
      weight: null,
    });
    const page = (await getExerciseProgression(account, exId))!;
    expect(page.recommendation?.action).toBe(
      "Reassess the difficulty next time",
    );
  });

  it("reading the call writes nothing: sets, baselines, plan untouched", async () => {
    const { mesoId, exId } = await setup(account);
    await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
    });
    const failed = await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: [3, 8, 8],
    });
    const before = await snapshotAccount(account.userId);
    await getOccurrenceProgression(account, failed.loggedExerciseId);
    await getSessionProgressionSummary(account, failed.loggedSessionId);
    await getExerciseProgression(account, exId);
    await getPlannedProgression(account, exId, { scheduledDeloadWeek: false });
    expect(await snapshotAccount(account.userId)).toEqual(before);
  });
});

describe("a Free account never receives the reassess call", () => {
  it("the card and page withhold it and mark it locked; the sets are still logged", async () => {
    const account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const { mesoId, exId } = await setup(account);
    await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
    });
    const failed = await logPerf(account, {
      mesocycleId: mesoId,
      exerciseId: exId,
      scheduledFor: "2026-11-09",
      reps: [3, 8, 8],
    });
    const card = (await getOccurrenceProgression(
      account,
      failed.loggedExerciseId,
    ))!;
    expect(card.locked).toBe("progression_insights");
    expect(card.recommendation).toBeNull();
    const summary = (await getSessionProgressionSummary(
      account,
      failed.loggedSessionId,
    ))!;
    expect(summary.locked).toBe("progression_insights");
    expect(summary.exercises.every((e) => e.recommendation === null)).toBe(
      true,
    );
    expect(
      await db().loggedSet.count({ where: { userId: account.userId } }),
    ).toBe(6);
  });
});
