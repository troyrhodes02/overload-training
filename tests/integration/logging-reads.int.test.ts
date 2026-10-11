import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import { getTodayDashboard, getWorkout } from "@/lib/logging/queries";

/**
 * Read layer for the dashboard and runner (OVE-22). Dashboard "today" logic is
 * covered deterministically by the schedule unit tests; here we cover the reads
 * that don't depend on the wall clock.
 */
const db = () => getTestPrisma();

describe("getTodayDashboard", () => {
  it("returns no_plan when there is no active mesocycle", async () => {
    await createTestMesocycle({ status: "draft" });
    expect(await getTodayDashboard()).toEqual({ kind: "no_plan" });
  });
});

describe("getWorkout", () => {
  it("builds the runner DTO with saved/unsaved rows, gym lock, and gym-variable context", async () => {
    const meso = await createTestMesocycle();
    const exercise = await createTestExercise({
      name: "Chest Press Machine",
      equipmentType: "machine",
      primaryMuscle: "chest",
    });
    const session = await createTestSession(meso.id, { dayOfWeek: 1 });
    await createTestSessionExercise(session.id, exercise.id, {
      plannedSets: 3,
    });
    const gym = await db().gym.create({ data: { name: "Downtown Gym" } });

    const { loggedSessionId } = await startOrResumeWorkout({
      sessionId: session.id,
      scheduledFor: "2026-11-02",
      gymId: gym.id,
    });
    const le = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId },
    });
    await logSet({
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 120,
      reps: 8,
    });

    const workout = await getWorkout(loggedSessionId);
    expect(workout).not.toBeNull();
    expect(workout!.sessionName).toBe("Push Day 1");
    expect(workout!.gymLocked).toBe(true); // a set exists
    expect(workout!.gymName).toBe("Downtown Gym");
    expect(workout!.exercises).toHaveLength(1);

    const card = workout!.exercises[0];
    expect(card.performedExerciseName).toBe("Chest Press Machine");
    expect(card.isGymVariable).toBe(true);
    expect(card.swapped).toBe(false);
    expect(card.plannedSets).toBe(3);
    expect(card.plannedRepRange).toEqual({ min: 6, max: 8 });
    expect(card.sets.map((s) => s.saved)).toEqual([true, false, false]);
    expect(card.sets[0]).toMatchObject({
      setNumber: 1,
      weightLbs: 120,
      reps: 8,
    });
    // Suggested weight comes from the most recent logged set when no baseline yet.
    expect(card.suggestedWeightLbs).toBe(120);
  });

  it("returns null for an unknown workout", async () => {
    expect(await getWorkout("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
