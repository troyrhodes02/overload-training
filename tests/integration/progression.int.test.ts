import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import {
  getExerciseProgression,
  getOccurrenceProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Progressive Overload Engine read layer (OVE-27). Logged history is inserted
 * raw (test-only) to control dates, gyms, completion, and rep ranges precisely.
 * Covers gym scope/isolation, scheduled-deload suppression & exclusion, swap
 * identity, historical rep ranges, suggestions, and past-log re-derivation.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon), deloadEveryWeeks 5.
 *   week 1 = 11/02 … 11/08, week 2 = 11/09, week 3 = 11/16, week 4 = 11/23,
 *   week 5 = 11/30 (SCHEDULED DELOAD), week 6 = 12/07.
 */
const db = () => getTestPrisma();

async function logPerf(opts: {
  mesocycleId: string;
  exerciseId: string;
  plannedExerciseId?: string;
  gymId?: string | null;
  scheduledFor: string;
  plannedSets?: number;
  repMin?: number;
  repMax?: number;
  reps: number[];
  weights?: number[];
  status?: "in_progress" | "complete";
}) {
  const p = db();
  const plannedSets = opts.plannedSets ?? opts.reps.length;
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
      plannedSets,
      targetRepMin: opts.repMin ?? 6,
      targetRepMax: opts.repMax ?? 8,
    },
  });
  for (let i = 0; i < opts.reps.length; i++) {
    await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: i + 1,
        weightLbs: opts.weights?.[i] ?? 185,
        reps: opts.reps[i],
      },
    });
  }
  return { loggedSessionId: ls.id, loggedExerciseId: le.id };
}

describe("free-weight (gym-consistent) progression is global across gyms", () => {
  it("qualifying sessions at different gyms form one sequence and one trend", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });
    const a = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    const b = await db().gym.create({
      data: { userId: account.userId, name: "Campus Rec" },
    });

    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      gymId: a.id,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
      weights: [185, 185, 185],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      gymId: b.id,
      scheduledFor: "2026-11-09",
      reps: [8, 8, 8],
      weights: [185, 185, 185],
    });

    const dto = (await getExerciseProgression(account, bench.id))!;
    expect(dto.isGymVariable).toBe(false);
    expect(dto.gyms).toEqual([]); // no gym selector for free weights
    expect(dto.tag).toBe("progress");
    expect(dto.points).toHaveLength(2); // one global series across both gyms
    expect(dto.suggestion).toEqual({ lbs: 190, kind: "progress_increment" });
  });
});

describe("machine (gym-variable) progression is scoped per (exercise, gym)", () => {
  it("isolates Gym A and Gym B sequences, trends, and suggestions", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const press = await createTestExercise({
      name: "Chest Press Machine",
      equipmentType: "machine",
    });
    const a = await db().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    const b = await db().gym.create({
      data: { userId: account.userId, name: "Campus Rec" },
    });
    // Gym A baseline (working-weight source for suggestions); Gym B untouched.
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: a.id,
        exerciseId: press.id,
        weightLbs: 120,
      },
    });
    await db().gymExerciseBaseline.create({
      data: {
        userId: account.userId,
        gymId: b.id,
        exerciseId: press.id,
        weightLbs: 90,
      },
    });

    // Gym A: three all-top sessions with rising e1RM → progress survives stall.
    for (const [d, w] of [
      ["2026-11-02", 110],
      ["2026-11-09", 115],
      ["2026-11-16", 120],
    ] as const) {
      await logPerf({
        mesocycleId: meso.id,
        exerciseId: press.id,
        gymId: a.id,
        scheduledFor: d,
        reps: [8, 8, 8],
        weights: [w, w, w],
      });
    }
    // Gym B: only one session → insufficient at B even though A has history.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: press.id,
      gymId: b.id,
      scheduledFor: "2026-11-05",
      reps: [8, 8, 8],
      weights: [90, 90, 90],
    });

    const atA = (await getExerciseProgression(account, press.id, a.id))!;
    expect(atA.selectedGymName).toBe("Downtown Gym");
    expect(atA.tag).toBe("progress");
    expect(atA.points).toHaveLength(3); // A only — B excluded
    expect(atA.points.every((p) => p.gymName === "Downtown Gym")).toBe(true);
    expect(atA.suggestion).toEqual({ lbs: 125, kind: "progress_increment" }); // 120 + 5

    const atB = (await getExerciseProgression(account, press.id, b.id))!;
    expect(atB.selectedGymName).toBe("Campus Rec");
    expect(atB.state).toBe("insufficient"); // one session at B is not enough
    expect(atB.tag).toBeNull();
    expect(atB.points).toHaveLength(1); // B only — A excluded

    // Both gyms appear in the selector, most-recent first (A's latest is 11/16).
    expect(atA.gyms.map((g) => g.name)).toEqual(["Downtown Gym", "Campus Rec"]);

    // Displaying suggestions mutated no baseline.
    const baselineB = await db().gymExerciseBaseline.findUniqueOrThrow({
      where: { gymId_exerciseId: { gymId: b.id, exerciseId: press.id } },
    });
    expect(Number(baselineB.weightLbs)).toBe(90);
  });
});

describe("scheduled-deload weeks: suppression, exclusion, and chart visibility", () => {
  it("excludes the deload session from the reactive sequence but shows it on the chart", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });

    // normal (below-min) · scheduled-deload (below-min) · normal (below-min)
    // If the deload counted, the last two would be two consecutive below-min
    // sessions → deload. Because it is excluded, only weeks 1 & 6 qualify.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      repMin: 8,
      repMax: 10,
      reps: [10, 10, 10],
    }); // week 1 all-top
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-30",
      repMin: 8,
      repMax: 10,
      reps: [7, 7, 7],
    }); // week 5 scheduled deload — below min, must be ignored
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-12-07",
      repMin: 8,
      repMax: 10,
      reps: [10, 10, 10],
    }); // week 6 all-top

    const dto = (await getExerciseProgression(account, bench.id))!;
    // Qualifying = weeks 1 & 6 (both all-top) → progress, NOT deload.
    expect(dto.tag).toBe("progress");
    expect(dto.qualifyingCount).toBe(2);
    // All three completed performances are on the chart; the deload one marked.
    expect(dto.points).toHaveLength(3);
    const marked = dto.points.filter((p) => p.scheduledDeload);
    expect(marked).toHaveLength(1);
    expect(marked[0].dateIso).toBe("2026-11-30");
  });

  it("suppresses the reactive tag during a scheduled-deload occurrence and resumes after", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });
    // Two prior all-top qualifying sessions → would be progress.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
      weights: [185, 185, 185],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      reps: [8, 8, 8],
      weights: [185, 185, 185],
    });

    // A scheduled-deload-week occurrence (week 5), not yet logged.
    const deloadOcc = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-30",
      reps: [],
      status: "in_progress",
    });
    const sup = (await getOccurrenceProgression(
      account,
      deloadOcc.loggedExerciseId,
    ))!;
    expect(sup.scheduledDeloadWeek).toBe(true);
    expect(sup.tag).toBeNull(); // reactive suppressed entirely
    expect(sup.suggestion).toEqual({ lbs: 165, kind: "scheduled_deload" }); // 185*0.9=166.5 → 165

    // A normal occurrence after the deload week resumes evaluation → progress.
    const after = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-12-07",
      reps: [],
      status: "in_progress",
    });
    const resumed = (await getOccurrenceProgression(
      account,
      after.loggedExerciseId,
    ))!;
    expect(resumed.scheduledDeloadWeek).toBe(false);
    expect(resumed.tag).toBe("progress");
    expect(resumed.suggestion).toEqual({
      lbs: 190,
      kind: "progress_increment",
    });
  });

  it("shows scheduled-deload state without a number when no working weight exists", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const fresh = await createTestExercise({ equipmentType: "barbell" });
    const occ = await logPerf({
      mesocycleId: meso.id,
      exerciseId: fresh.id,
      scheduledFor: "2026-11-30",
      reps: [],
      status: "in_progress",
    });
    const dto = (await getOccurrenceProgression(
      account,
      occ.loggedExerciseId,
    ))!;
    expect(dto.scheduledDeloadWeek).toBe(true);
    expect(dto.suggestion).toBeNull(); // never fabricate a load
  });
});

describe("exercise identity: swaps and incomplete work", () => {
  it("attributes swapped sets to the performed exercise, not the planned one", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const planned = await createTestExercise({
      name: "Chest Press Machine",
      equipmentType: "machine",
    });
    const performed = await createTestExercise({
      name: "Incline DB Press",
      equipmentType: "dumbbell",
    });

    await logPerf({
      mesocycleId: meso.id,
      exerciseId: performed.id,
      plannedExerciseId: planned.id,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: performed.id,
      plannedExerciseId: planned.id,
      scheduledFor: "2026-11-09",
      reps: [8, 8, 8],
    });

    const performedDto = (await getExerciseProgression(account, performed.id))!;
    expect(performedDto.tag).toBe("progress");
    expect(performedDto.points).toHaveLength(2);

    const plannedDto = (await getExerciseProgression(account, planned.id))!;
    expect(plannedDto.state).toBe("insufficient"); // no performed history
    expect(plannedDto.points).toHaveLength(0);
  });

  it("excludes partial and in-progress occurrences from the sequence", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
    }); // complete
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      plannedSets: 3,
      reps: [8, 8], // only 2 of 3 planned sets → not completed
      status: "complete",
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-16",
      reps: [8, 8, 8],
      status: "in_progress", // session not complete
    });

    const dto = (await getExerciseProgression(account, bench.id))!;
    expect(dto.qualifyingCount).toBe(1); // only the first
    expect(dto.state).toBe("insufficient");
    expect(dto.points).toHaveLength(1); // only completed performances charted
  });
});

describe("historical rep ranges and past-log re-derivation", () => {
  it("judges each occurrence against the rep range that applied then", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });
    // Old block 3×8–10, 10/10/10 all-top; new block 3×5–6, 6/6/6 all-top.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      repMin: 8,
      repMax: 10,
      reps: [10, 10, 10],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      repMin: 5,
      repMax: 6,
      reps: [6, 6, 6],
    });
    const dto = (await getExerciseProgression(account, bench.id))!;
    expect(dto.tag).toBe("progress");
  });

  it("re-derives tag and trend after a past set is edited, writing no recompute row", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });
    const first = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      repMin: 6,
      repMax: 8,
      reps: [8, 8, 8],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      repMin: 6,
      repMax: 8,
      reps: [8, 8, 8],
    });

    const before = (await getExerciseProgression(account, bench.id))!;
    expect(before.tag).toBe("progress");

    // Correct the first session's last set down to 6 reps → no longer all-top.
    const set = await db().loggedSet.findFirstOrThrow({
      where: { loggedExerciseId: first.loggedExerciseId, setNumber: 3 },
    });
    const baselinesBefore = await db().gymExerciseBaseline.count();
    await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 185,
      reps: 6,
    });

    const after = (await getExerciseProgression(account, bench.id))!;
    expect(after.tag).toBeNull(); // progress withdrawn on the next read
    // No recompute/trend rows exist to synchronize; baselines untouched.
    expect(await db().gymExerciseBaseline.count()).toBe(baselinesBefore);
  });
});

describe("session summary", () => {
  it("reports per-exercise calls and suppresses tags on a scheduled-deload session", async () => {
    const meso = await createTestMesocycle({ status: "active" });
    const bench = await createTestExercise({ equipmentType: "barbell" });

    // Build two prior qualifying all-top sessions.
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-02",
      reps: [8, 8, 8],
    });
    await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-09",
      reps: [8, 8, 8],
    });

    // A scheduled-deload-week session (week 5) with this exercise performed.
    const deloadSession = await logPerf({
      mesocycleId: meso.id,
      exerciseId: bench.id,
      scheduledFor: "2026-11-30",
      reps: [8, 8, 8],
    });
    const summary = (await getSessionProgressionSummary(
      account,
      deloadSession.loggedSessionId,
    ))!;
    expect(summary.scheduledDeloadWeek).toBe(true);
    expect(summary.exercises).toHaveLength(1);
    expect(summary.exercises[0].tag).toBeNull(); // suppressed in the summary too
  });
});
