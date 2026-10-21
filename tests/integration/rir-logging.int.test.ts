import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { getLoggedWorkoutDetail, getWorkout } from "@/lib/logging/queries";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

/**
 * RIR Logging & Autoregulation — the stored fact (spec §11.2, §12, §14.2;
 * Resolved Decisions R4, R8–R10). RIR is optional per set: omitted or null is
 * stored NULL ("not recorded"), 0 is stored 0, and only 0..4 can be written.
 * It is written only by logSet in the same write as weight and reps, and
 * corrected only by editLoggedSet, which never touches anything else.
 *
 * Mesocycle anchor: startDate 2026-11-02 (Mon).
 */
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

const db = () => getTestPrisma();

async function workout(opts: { equipment: string; plannedSets?: number }) {
  const meso = await createTestMesocycle();
  const exercise = await createTestExercise({
    name: `RIR ${opts.equipment}`,
    equipmentType: opts.equipment as never,
    primaryMuscle: "chest",
  });
  const session = await createTestSession(meso.id, {
    name: "Push Day 1",
    dayOfWeek: 1,
  });
  await createTestSessionExercise(session.id, exercise.id, {
    plannedSets: opts.plannedSets ?? 3,
    targetRepMin: 6,
    targetRepMax: 8,
  });
  const gym = await db().gym.create({
    data: { userId: account.userId, name: "Downtown Gym" },
  });
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: session.id,
    scheduledFor: "2026-11-02",
    gymId: gym.id,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
  return {
    loggedSessionId,
    loggedExerciseId: le.id,
    exerciseId: exercise.id,
    gymId: gym.id,
  };
}

const rawRir = async (id: string) =>
  (
    await db().$queryRaw<{ rir: number | null }[]>`
      SELECT rir FROM logged_sets WHERE id = ${id}::uuid`
  )[0].rir;

describe("storing RIR with a set", () => {
  it("an omitted RIR is stored NULL — not recorded, never 0", async () => {
    const w = await workout({ equipment: "barbell" });
    const set = await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    expect(set.rir).toBeNull();
    expect(await rawRir(set.id)).toBeNull();
  });

  it("an explicit null is stored NULL; 0 is stored 0; 4 (4+) is stored 4", async () => {
    const w = await workout({ equipment: "barbell" });
    const values = [null, 0, 4] as const;
    for (let i = 0; i < values.length; i++) {
      const set = await logSet(account, {
        loggedExerciseId: w.loggedExerciseId,
        setNumber: i + 1,
        weightLbs: 185,
        reps: 8,
        rir: values[i],
      });
      expect(await rawRir(set.id)).toBe(values[i]);
    }
  });

  it("RIR is stored beside the reps, never added to them", async () => {
    const w = await workout({ equipment: "barbell" });
    const set = await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
      rir: 2,
    });
    expect(set.reps).toBe(8);
    expect(set.rir).toBe(2);
    expect(Number(set.weightLbs)).toBe(185);
  });

  it.each([
    ["5 (above 4+)", 5],
    ["-1", -1],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["a numeric string", "2"],
  ])(
    "rejects an RIR of %s, writes nothing, and moves no baseline",
    async (_l, rir) => {
      const w = await workout({ equipment: "machine", plannedSets: 1 });
      await expect(
        logSet(account, {
          loggedExerciseId: w.loggedExerciseId,
          setNumber: 1,
          weightLbs: 100,
          reps: 8,
          rir: rir as never,
        }),
      ).rejects.toMatchObject({
        code: "validation_error",
        details: { rir: "Choose an RIR from 0 to 4+." },
      });
      expect(await db().loggedSet.count()).toBe(0);
      expect(await db().gymExerciseBaseline.count()).toBe(0);
    },
  );

  it("a bodyweight set takes reps plus RIR, with weight still NULL", async () => {
    const w = await workout({ equipment: "bodyweight", plannedSets: 2 });
    const set = await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      reps: 12,
      rir: 1,
    });
    expect(set.weightLbs).toBeNull();
    expect(set.rir).toBe(1);
    // A supplied weight is still refused on a bodyweight exercise.
    await expect(
      logSet(account, {
        loggedExerciseId: w.loggedExerciseId,
        setNumber: 2,
        weightLbs: 0,
        reps: 12,
        rir: 1,
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: { weightLbs: expect.any(String) },
    });
  });

  it("an identical retry (RIR included) is idempotent; a different RIR conflicts", async () => {
    const w = await workout({ equipment: "barbell" });
    const input = {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
      rir: 2,
    };
    const first = await logSet(account, input);
    expect((await logSet(account, input)).id).toBe(first.id);
    await expect(logSet(account, { ...input, rir: 0 })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      logSet(account, { ...input, rir: null }),
    ).rejects.toMatchObject({ code: "conflict" });
    const rows = await db().loggedSet.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].rir).toBe(2);
  });

  it("the database refuses an out-of-range RIR even outside the write module", async () => {
    const w = await workout({ equipment: "barbell" });
    for (const rir of [5, -1]) {
      await expect(
        db().loggedSet.create({
          data: {
            userId: account.userId,
            loggedExerciseId: w.loggedExerciseId,
            setNumber: 1,
            weightLbs: 185,
            reps: 8,
            rir,
          },
        }),
      ).rejects.toThrow();
    }
    expect(await db().loggedSet.count()).toBe(0);
  });
});

describe("gym baselines ignore RIR", () => {
  it("a machine completion with RIR establishes exactly the baseline it would without", async () => {
    const withRir = await workout({ equipment: "machine", plannedSets: 2 });
    for (const [n, rir] of [
      [1, 0],
      [2, 3],
    ] as const) {
      await logSet(account, {
        loggedExerciseId: withRir.loggedExerciseId,
        setNumber: n,
        weightLbs: n === 1 ? 100 : 110,
        reps: 8,
        rir,
      });
    }
    const baseline = await db().gymExerciseBaseline.findFirstOrThrow({
      where: { gymId: withRir.gymId, exerciseId: withRir.exerciseId },
    });
    // Median of 100 and 110, exactly as Guided Workout Logging defines it.
    expect(Number(baseline.weightLbs)).toBe(105);
  });

  it("correcting only a set's RIR never touches the baseline", async () => {
    const w = await workout({ equipment: "machine", plannedSets: 1 });
    const set = await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
      rir: 1,
    });
    const before = await db().gymExerciseBaseline.findFirstOrThrow({
      where: { gymId: w.gymId, exerciseId: w.exerciseId },
    });
    await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 100,
      reps: 8,
      rir: 0,
    });
    const after = await db().gymExerciseBaseline.findFirstOrThrow({
      where: { gymId: w.gymId, exerciseId: w.exerciseId },
    });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(Number(after.weightLbs)).toBe(Number(before.weightLbs));
  });
});

describe("correcting RIR", () => {
  async function loggedOnce(rir: number | null) {
    const w = await workout({ equipment: "barbell" });
    // Planned sets log in any order; set 2 alone keeps the fixture small.
    const set = await logSet(account, {
      loggedExerciseId: w.loggedExerciseId,
      setNumber: 2,
      weightLbs: 185,
      reps: 8,
      rir,
    });
    return { w, set };
  }

  it("changes only the RIR — weight, reps, set number, exercise, and creation time stay", async () => {
    const { set } = await loggedOnce(0);
    const edited = await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 185,
      reps: 8,
      rir: 2,
    });
    expect(edited.rir).toBe(2);
    expect(Number(edited.weightLbs)).toBe(185);
    expect(edited.reps).toBe(8);
    expect(edited.setNumber).toBe(set.setNumber);
    expect(edited.loggedExerciseId).toBe(set.loggedExerciseId);
    expect(edited.createdAt).toEqual(set.createdAt);
    expect(await db().loggedSet.count()).toBe(1);
  });

  it("an edit without rir leaves the stored RIR unchanged", async () => {
    const { set } = await loggedOnce(3);
    const edited = await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 190,
      reps: 7,
    });
    expect(edited.rir).toBe(3);
    expect(edited.reps).toBe(7);
  });

  it("rir: null clears it to not recorded — never 0", async () => {
    const { set } = await loggedOnce(1);
    await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 185,
      reps: 8,
      rir: null,
    });
    expect(await rawRir(set.id)).toBeNull();
  });

  it("a past set logged without RIR can be given one", async () => {
    const { set } = await loggedOnce(null);
    await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 185,
      reps: 8,
      rir: 0,
    });
    expect(await rawRir(set.id)).toBe(0);
  });

  it("an invalid RIR on edit is rejected and the set is unchanged", async () => {
    const { set } = await loggedOnce(2);
    await expect(
      editLoggedSet(account, {
        loggedSetId: set.id,
        weightLbs: 185,
        reps: 8,
        rir: 7,
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: { rir: expect.any(String) },
    });
    expect(await rawRir(set.id)).toBe(2);
  });
});

describe("reads carry RIR as recorded", () => {
  it("the card and the History day show the stored RIR and null where none was recorded", async () => {
    const w = await workout({ equipment: "barbell" });
    for (const [n, rir] of [
      [1, 2],
      [2, null],
      [3, 0],
    ] as const) {
      await logSet(account, {
        loggedExerciseId: w.loggedExerciseId,
        setNumber: n,
        weightLbs: 185,
        reps: 8,
        rir,
      });
    }
    const card = (await getWorkout(account, w.loggedSessionId))!.exercises[0];
    expect(card.sets.map((s) => s.rir)).toEqual([2, null, 0]);
    const day = (await getLoggedWorkoutDetail(account, w.loggedSessionId))!
      .exercises[0];
    expect(day.sets.map((s) => s.rir)).toEqual([2, null, 0]);
  });

  it("an unsaved card row has no RIR", async () => {
    const w = await workout({ equipment: "barbell" });
    const card = (await getWorkout(account, w.loggedSessionId))!.exercises[0];
    expect(card.sets.every((s) => !s.saved && s.rir === null)).toBe(true);
  });
});
