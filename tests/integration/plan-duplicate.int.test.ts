import { DomainError } from "@/lib/actions/result";
import { getSessionDetail } from "@/lib/plan/queries";
import {
  addSessionExercise,
  duplicateSession,
  moveSessionExercise,
  removeSession,
  removeSessionExercise,
  renameSession,
  updateSessionExercise,
} from "@/lib/plan/sessions";
import { copyName } from "@/lib/plan/validation";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
  historyCounts,
  seedLoggedHistory,
} from "./support/plan-factories";

/** Split & Mesocycle Builder — duplicating a session onto another day. */
const prisma = () => getTestPrisma();

async function fails(p: Promise<unknown>): Promise<DomainError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  return err as DomainError;
}

async function pushDay() {
  const m = await createTestMesocycle();
  const s = await createTestSession(m.id, { name: "Push Day 1", dayOfWeek: 1 });
  const bench = await createTestExercise();
  const incline = await createTestExercise({ name: "Incline Dumbbell Press" });
  const fly = await createTestExercise({ name: "Cable Fly" });
  await createTestSessionExercise(s.id, bench.id, { position: 0 });
  await createTestSessionExercise(s.id, incline.id, {
    position: 1,
    targetRepMin: 8,
    targetRepMax: 10,
  });
  await createTestSessionExercise(s.id, fly.id, {
    position: 2,
    plannedSets: 4,
    targetRepMin: 12,
    targetRepMax: 15,
  });
  return { m, s, bench, incline, fly };
}

const shape = async (mesocycleId: string, sessionId: string) =>
  (await getSessionDetail(mesocycleId, sessionId))?.exercises.map((e) => [
    e.exerciseName,
    e.position,
    e.plannedSets,
    e.targetRepMin,
    e.targetRepMax,
    e.isArchived,
  ]);

describe("duplicating a session (spec D26–D29)", () => {
  it("creates a separate session with the same exercises, order, sets, and reps", async () => {
    const { m, s } = await pushDay();
    const { id } = await duplicateSession({ sessionId: s.id, dayOfWeek: 4 });
    expect(id).not.toBe(s.id);
    const copy = await prisma().session.findUniqueOrThrow({ where: { id } });
    expect(copy).toMatchObject({
      name: "Push Day 1 Copy",
      dayOfWeek: 4,
      mesocycleId: m.id,
    });
    expect(await shape(m.id, id)).toEqual(await shape(m.id, s.id));
    // New rows, not shared ones.
    const sourceSlots = await prisma().sessionExercise.findMany({
      where: { sessionId: s.id },
    });
    const copySlots = await prisma().sessionExercise.findMany({
      where: { sessionId: id },
    });
    expect(copySlots.map((x) => x.id)).not.toEqual(
      expect.arrayContaining(sourceSlots.map((x) => x.id)),
    );
  });

  it("editing the copy never changes the source", async () => {
    const { m, s, bench } = await pushDay();
    const before = await shape(m.id, s.id);
    const { id } = await duplicateSession({ sessionId: s.id, dayOfWeek: 4 });
    const copySlots = await prisma().sessionExercise.findMany({
      where: { sessionId: id },
      orderBy: { position: "asc" },
    });
    await renameSession({ sessionId: id, name: "Push Day 2" });
    await updateSessionExercise({
      sessionExerciseId: copySlots[0].id,
      plannedSets: "5",
      targetRepMin: "3",
      targetRepMax: "5",
    });
    await moveSessionExercise({
      sessionExerciseId: copySlots[2].id,
      direction: "up",
    });
    await removeSessionExercise({ sessionExerciseId: copySlots[1].id });
    const press = await createTestExercise({ name: "Overhead Press" });
    await addSessionExercise({
      sessionId: id,
      exerciseId: press.id,
      plannedSets: "3",
      targetRepMin: "6",
      targetRepMax: "8",
    });
    expect(await shape(m.id, s.id)).toEqual(before);
    expect(
      (await prisma().session.findUniqueOrThrow({ where: { id: s.id } })).name,
    ).toBe("Push Day 1");
    void bench;
  });

  it("editing the source never changes the copy; removing the copy keeps the source", async () => {
    const { m, s } = await pushDay();
    const { id } = await duplicateSession({ sessionId: s.id, dayOfWeek: 4 });
    const copyBefore = await shape(m.id, id);
    const sourceSlots = await prisma().sessionExercise.findMany({
      where: { sessionId: s.id },
      orderBy: { position: "asc" },
    });
    await updateSessionExercise({
      sessionExerciseId: sourceSlots[0].id,
      plannedSets: "5",
      targetRepMin: "5",
      targetRepMax: "5",
    });
    expect(await shape(m.id, id)).toEqual(copyBefore);
    await removeSession({ sessionId: id });
    expect(await prisma().session.count({ where: { id: s.id } })).toBe(1);
    expect(
      await prisma().sessionExercise.count({ where: { sessionId: s.id } }),
    ).toBe(3);
  });

  it("an archived exercise comes across as a repair slot, not dropped or replaced", async () => {
    const { m, s, fly } = await pushDay();
    await prisma().exercise.update({
      where: { id: fly.id },
      data: { deletedAt: new Date() },
    });
    const { id } = await duplicateSession({ sessionId: s.id, dayOfWeek: 4 });
    const copy = await shape(m.id, id);
    expect(copy?.[2]).toEqual(["Cable Fly", 2, 4, 12, 15, true]);
    expect(
      (await prisma().exercise.findUniqueOrThrow({ where: { id: fly.id } }))
        .deletedAt,
    ).not.toBeNull();
  });

  it("copies no history (logged rows, goals, baselines unchanged)", async () => {
    const { m, s, bench } = await pushDay();
    await seedLoggedHistory({
      mesocycleId: m.id,
      sessionId: s.id,
      exerciseId: bench.id,
    });
    const before = await historyCounts();
    await duplicateSession({ sessionId: s.id, dayOfWeek: 4 });
    expect(await historyCounts()).toEqual(before);
  });

  it("an occupied target day needs an explicit replace", async () => {
    const { m, s } = await pushDay();
    const thu = await createTestSession(m.id, { name: "Legs", dayOfWeek: 4 });
    const err = await fails(
      duplicateSession({ sessionId: s.id, dayOfWeek: 4 }),
    );
    expect(err.code).toBe("conflict");
    expect(await prisma().session.count({ where: { mesocycleId: m.id } })).toBe(
      2,
    );
    await duplicateSession({ sessionId: s.id, dayOfWeek: 4, replace: true });
    expect(
      (await prisma().session.findUniqueOrThrow({ where: { id: thu.id } }))
        .dayOfWeek,
    ).toBeNull();
  });

  it("can be duplicated off the schedule", async () => {
    const { m, s } = await pushDay();
    const { id } = await duplicateSession({ sessionId: s.id, dayOfWeek: null });
    expect(
      (await prisma().session.findUniqueOrThrow({ where: { id } })).dayOfWeek,
    ).toBeNull();
    void m;
  });

  it("is rejected for an archived mesocycle", async () => {
    const m = await createTestMesocycle({ status: "archived" });
    const s = await createTestSession(m.id);
    expect(
      (await fails(duplicateSession({ sessionId: s.id, dayOfWeek: 2 }))).code,
    ).toBe("invalid_state_transition");
  });
});

describe("copyName", () => {
  it("appends Copy and stays within 80 characters", () => {
    expect(copyName("Push Day 1")).toBe("Push Day 1 Copy");
    const long = "x".repeat(80);
    expect(copyName(long)).toHaveLength(80);
    expect(copyName(long).endsWith(" Copy")).toBe(true);
  });
});
