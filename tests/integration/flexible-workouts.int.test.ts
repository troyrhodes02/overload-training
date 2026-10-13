import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { logSet } from "@/lib/logging/logged-sets";
import {
  completeWorkout,
  setExerciseSkipped,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { getLoggedWorkoutDetail, getWorkout } from "@/lib/logging/queries";
import {
  getExerciseProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";

/**
 * Flexible workouts: extra sets beyond the plan, "Didn't do" for a planned
 * exercise, and finishing without every planned set. Logged history stays the
 * source of truth; progression, goals, and baselines keep reading only
 * exercises with every planned working set (sets 1..plannedSets).
 */
const db = () => getTestPrisma();

async function workout(
  opts: {
    equipment?: string;
    scheduledFor?: string;
    plannedSets?: number;
  } = {},
) {
  const meso = await createTestMesocycle();
  const bench = await createTestExercise({
    name: "Barbell Bench Press",
    equipmentType: (opts.equipment ?? "barbell") as never,
  });
  const fly = await createTestExercise({
    name: "Cable Fly",
    equipmentType: "cable",
  });
  const session = await createTestSession(meso.id, { dayOfWeek: 1 });
  await createTestSessionExercise(session.id, bench.id, {
    position: 0,
    plannedSets: opts.plannedSets ?? 2,
    targetRepMin: 6,
    targetRepMax: 8,
  });
  await createTestSessionExercise(session.id, fly.id, {
    position: 1,
    plannedSets: 2,
  });
  const gym = await db().gym.create({ data: { name: "Downtown Gym" } });
  const { loggedSessionId } = await startOrResumeWorkout({
    sessionId: session.id,
    scheduledFor: opts.scheduledFor ?? "2026-11-02",
    gymId: gym.id,
  });
  const [benchLe, flyLe] = await db().loggedExercise.findMany({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
  });
  return { session, gym, bench, fly, loggedSessionId, benchLe, flyLe };
}

const set = (
  loggedExerciseId: string,
  setNumber: number,
  weightLbs: number,
  reps: number,
) => logSet({ loggedExerciseId, setNumber, weightLbs, reps });

describe("extra sets", () => {
  it("are allowed after every planned set, in sequence, and shown as extra", async () => {
    const w = await workout();
    await set(w.benchLe.id, 1, 185, 8);
    await expect(set(w.benchLe.id, 3, 185, 6)).rejects.toMatchObject({
      code: "validation_error",
    });
    await set(w.benchLe.id, 2, 185, 8);
    await set(w.benchLe.id, 3, 185, 6); // extra
    await expect(set(w.benchLe.id, 5, 185, 5)).rejects.toMatchObject({
      code: "validation_error",
    }); // no gaps
    await set(w.benchLe.id, 3, 185, 6); // identical retry is idempotent
    await set(w.benchLe.id, 4, 175, 8);
    expect(
      await db().loggedSet.count({ where: { loggedExerciseId: w.benchLe.id } }),
    ).toBe(4);

    const card = (await getWorkout(w.loggedSessionId))!.exercises[0];
    expect(card.sets.map((s) => [s.setNumber, s.extra])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, true],
    ]);
    const detail = (await getLoggedWorkoutDetail(w.loggedSessionId))!
      .exercises[0];
    expect(detail.sets.filter((s) => s.extra)).toHaveLength(2);
  });

  it("caps extras at 10 beyond the plan", async () => {
    const w = await workout({ plannedSets: 1 });
    await set(w.benchLe.id, 1, 185, 8);
    for (let n = 2; n <= 11; n++) await set(w.benchLe.id, n, 135, 10);
    await expect(set(w.benchLe.id, 12, 135, 10)).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("never change the progression call or e1RM: the planned working sets decide", async () => {
    // Two all-top performances → Progress. A heavy 1-rep extra set would
    // change the e1RM if counted; its low reps would break "all at the top".
    const first = await workout({ scheduledFor: "2026-11-02" });
    const { loggedSessionId: secondId } = await startOrResumeWorkout({
      sessionId: first.session.id,
      scheduledFor: "2026-11-09",
      gymId: first.gym.id,
    });
    const second = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId: secondId, exerciseId: first.bench.id },
    });
    for (const [lsId, leId] of [
      [first.loggedSessionId, first.benchLe.id],
      [secondId, second.id],
    ]) {
      await set(leId, 1, 185, 8);
      await set(leId, 2, 185, 8);
      await set(leId, 3, 225, 1); // extra
      await completeWorkout({ loggedSessionId: lsId });
    }
    const p = (await getExerciseProgression(first.bench.id))!;
    expect(p.state).toBe("progress");
    expect(p.currentE1rm).toBe(Math.round(185 * (1 + 8 / 30)));
  });

  it("don't change a gym baseline (median of the planned working sets)", async () => {
    const w = await workout({ equipment: "machine" });
    await set(w.benchLe.id, 1, 150, 8);
    await set(w.benchLe.id, 2, 150, 8);
    const baseline = () =>
      db().gymExerciseBaseline.findUniqueOrThrow({
        where: {
          gymId_exerciseId: { gymId: w.gym.id, exerciseId: w.bench.id },
        },
      });
    expect(Number((await baseline()).weightLbs)).toBe(150);
    await set(w.benchLe.id, 3, 300, 3); // extra at a wildly different weight
    expect(Number((await baseline()).weightLbs)).toBe(150);
  });
});

describe("didn't do", () => {
  it("marks an exercise with no sets as not done, refuses logging until undone", async () => {
    const w = await workout();
    await setExerciseSkipped({ loggedExerciseId: w.flyLe.id, skipped: true });
    await expect(set(w.flyLe.id, 1, 40, 12)).rejects.toMatchObject({
      code: "invalid_state_transition",
    });
    expect((await getWorkout(w.loggedSessionId))!.exercises[1].skipped).toBe(
      true,
    );
    await setExerciseSkipped({ loggedExerciseId: w.flyLe.id, skipped: false });
    await set(w.flyLe.id, 1, 40, 12);
  });

  it("is refused once a set is logged (a logged set is never hidden)", async () => {
    const w = await workout();
    await set(w.benchLe.id, 1, 185, 8);
    await expect(
      setExerciseSkipped({ loggedExerciseId: w.benchLe.id, skipped: true }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("is refused after the workout is finished", async () => {
    const w = await workout();
    await set(w.benchLe.id, 1, 185, 8);
    await completeWorkout({ loggedSessionId: w.loggedSessionId });
    await expect(
      setExerciseSkipped({ loggedExerciseId: w.flyLe.id, skipped: false }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("swapping in a substitute clears it", async () => {
    const w = await workout();
    const alt = await createTestExercise({
      name: "Pec Deck",
      primaryMuscle: "chest",
      equipmentType: "machine",
    });
    await setExerciseSkipped({ loggedExerciseId: w.flyLe.id, skipped: true });
    await swapExercise({ loggedExerciseId: w.flyLe.id, newExerciseId: alt.id });
    expect(
      (
        await db().loggedExercise.findUniqueOrThrow({
          where: { id: w.flyLe.id },
        })
      ).skippedAt,
    ).toBeNull();
  });
});

describe("finishing early", () => {
  it("records untouched exercises as not done and keeps partial ones as logged", async () => {
    const w = await workout();
    await set(w.benchLe.id, 1, 185, 8); // 1 of 2
    await completeWorkout({ loggedSessionId: w.loggedSessionId });
    const [bench, fly] = await db().loggedExercise.findMany({
      where: { loggedSessionId: w.loggedSessionId },
      orderBy: { position: "asc" },
    });
    expect(bench.skippedAt).toBeNull();
    expect(fly.skippedAt).not.toBeNull();
    expect(await db().loggedSet.count()).toBe(1);

    const detail = (await getLoggedWorkoutDetail(w.loggedSessionId))!;
    expect(detail.exercises.map((e) => e.skipped)).toEqual([false, true]);

    // The skipped lift gets no summary row; the partial one is not a
    // qualifying performance (no call, no chart point).
    const summary = (await getSessionProgressionSummary(w.loggedSessionId))!;
    expect(summary.exercises.map((e) => e.performedExerciseName)).toEqual([
      "Barbell Bench Press",
    ]);
    const p = (await getExerciseProgression(w.bench.id))!;
    expect(p.qualifyingCount).toBe(0);
    expect(p.points).toEqual([]);
  });

  it("an archived exercise no longer blocks finishing — it is recorded as not done", async () => {
    const w = await workout();
    await db().exercise.update({
      where: { id: w.fly.id },
      data: { deletedAt: new Date() },
    });
    await set(w.benchLe.id, 1, 185, 8);
    await set(w.benchLe.id, 2, 185, 8);
    await completeWorkout({ loggedSessionId: w.loggedSessionId });
    const fly = await db().loggedExercise.findUniqueOrThrow({
      where: { id: w.flyLe.id },
    });
    expect(fly.skippedAt).not.toBeNull();
  });

  it("a fully logged workout is unchanged by the new rules", async () => {
    const w = await workout();
    for (const le of [w.benchLe, w.flyLe]) {
      await set(le.id, 1, 100, 8);
      await set(le.id, 2, 100, 8);
    }
    await completeWorkout({ loggedSessionId: w.loggedSessionId });
    expect(
      await db().loggedExercise.count({ where: { skippedAt: { not: null } } }),
    ).toBe(0);
  });
});
