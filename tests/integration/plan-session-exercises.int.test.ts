import { DomainError } from "@/lib/actions/result";
import { listExercises } from "@/lib/exercises/queries";
import { activateMesocycle } from "@/lib/plan/mesocycles";
import { getMesocycleWeek, getSessionDetail } from "@/lib/plan/queries";
import {
  addSessionExercise,
  moveSessionExercise,
  removeSessionExercise,
  replaceSessionExercise,
  updateSessionExercise,
} from "@/lib/plan/sessions";
import { getTestPrisma } from "./support/db";
import {
  createReadyDraft,
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

/** Split & Mesocycle Builder — planned exercises inside a session. */
const prisma = () => getTestPrisma();

async function fails(p: Promise<unknown>): Promise<DomainError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  return err as DomainError;
}

const plan = { plannedSets: "3", targetRepMin: "6", targetRepMax: "8" };

async function setup() {
  const m = await createTestMesocycle();
  const s = await createTestSession(m.id);
  const bench = await createTestExercise({ isFavorite: true });
  const incline = await createTestExercise({ name: "Incline Dumbbell Press" });
  const fly = await createTestExercise({ name: "Cable Fly" });
  return { m, s, bench, incline, fly };
}

const order = async (sessionId: string) =>
  (
    await prisma().sessionExercise.findMany({
      where: { sessionId },
      orderBy: { position: "asc" },
      include: { exercise: { select: { name: true } } },
    })
  ).map((x) => [x.exercise.name, x.position]);

describe("adding exercises from the library (spec D19)", () => {
  it("adds an active exercise with the sets and reps typed, at the end", async () => {
    const { m, s, bench, incline } = await setup();
    await addSessionExercise({
      sessionId: s.id,
      exerciseId: bench.id,
      ...plan,
    });
    await addSessionExercise({
      sessionId: s.id,
      exerciseId: incline.id,
      plannedSets: "3",
      targetRepMin: "8",
      targetRepMax: "10",
    });
    const detail = await getSessionDetail(m.id, s.id);
    expect(
      detail?.exercises.map((e) => [
        e.exerciseName,
        e.plannedSets,
        e.targetRepMin,
        e.targetRepMax,
        e.position,
      ]),
    ).toEqual([
      ["Barbell Bench Press", 3, 6, 8, 0],
      ["Incline Dumbbell Press", 3, 8, 10, 1],
    ]);
  });

  it("archived exercises are absent from the picker and can't be added", async () => {
    const { s, bench } = await setup();
    const archived = await createTestExercise({
      name: "Barbell Row",
      deletedAt: new Date(),
    });
    const list = await listExercises({});
    expect(list.items.map((e) => e.name)).not.toContain("Barbell Row");
    const err = await fails(
      addSessionExercise({ sessionId: s.id, exerciseId: archived.id, ...plan }),
    );
    expect(err.message).toBe("That exercise is archived.");
    expect(await prisma().sessionExercise.count()).toBe(0);
    // Never reactivated as a side effect.
    expect(
      (
        await prisma().exercise.findUniqueOrThrow({
          where: { id: archived.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    void bench;
  });

  it("the same exercise can't appear twice in one session", async () => {
    const { s, bench } = await setup();
    await addSessionExercise({
      sessionId: s.id,
      exerciseId: bench.id,
      ...plan,
    });
    const err = await fails(
      addSessionExercise({ sessionId: s.id, exerciseId: bench.id, ...plan }),
    );
    expect(err.message).toBe("Already in this session.");
    expect(await prisma().sessionExercise.count()).toBe(1);
  });

  it("validates sets and the rep range, never swapping it", async () => {
    const { s, bench } = await setup();
    for (const [bad, field] of [
      [{ plannedSets: "0" }, "plannedSets"],
      [{ targetRepMin: "0" }, "targetRepMin"],
      [{ targetRepMax: "0" }, "targetRepMax"],
      [{ targetRepMin: "10", targetRepMax: "8" }, "targetRepMax"],
      [{ plannedSets: "2.5" }, "plannedSets"],
    ] as const) {
      const err = await fails(
        addSessionExercise({
          sessionId: s.id,
          exerciseId: bench.id,
          ...plan,
          ...bad,
        }),
      );
      expect(err.code).toBe("validation_error");
      expect(err.details).toHaveProperty(field);
    }
    expect(await prisma().sessionExercise.count()).toBe(0);
    await addSessionExercise({
      sessionId: s.id,
      exerciseId: bench.id,
      plannedSets: "4",
      targetRepMin: "5",
      targetRepMax: "5",
    });
    expect(
      await prisma().sessionExercise.findFirstOrThrow({
        select: { targetRepMin: true, targetRepMax: true },
      }),
    ).toEqual({ targetRepMin: 5, targetRepMax: 5 });
  });
});

describe("editing, ordering, removing (spec D23, D24)", () => {
  it("updates sets and the rep range", async () => {
    const { s, bench } = await setup();
    const { id } = await addSessionExercise({
      sessionId: s.id,
      exerciseId: bench.id,
      ...plan,
    });
    await updateSessionExercise({
      sessionExerciseId: id,
      plannedSets: "4",
      targetRepMin: "4",
      targetRepMax: "6",
    });
    expect(
      await prisma().sessionExercise.findUniqueOrThrow({
        where: { id },
        select: { plannedSets: true, targetRepMin: true, targetRepMax: true },
      }),
    ).toEqual({ plannedSets: 4, targetRepMin: 4, targetRepMax: 6 });
  });

  it("order persists; up/down swap neighbors; the ends are no-ops", async () => {
    const { s, bench, incline, fly } = await setup();
    const a = await addSessionExercise({
      sessionId: s.id,
      exerciseId: bench.id,
      ...plan,
    });
    await addSessionExercise({
      sessionId: s.id,
      exerciseId: incline.id,
      ...plan,
    });
    const c = await addSessionExercise({
      sessionId: s.id,
      exerciseId: fly.id,
      ...plan,
    });
    await moveSessionExercise({ sessionExerciseId: c.id, direction: "up" });
    expect(await order(s.id)).toEqual([
      ["Barbell Bench Press", 0],
      ["Cable Fly", 1],
      ["Incline Dumbbell Press", 2],
    ]);
    await moveSessionExercise({ sessionExerciseId: a.id, direction: "up" });
    await moveSessionExercise({ sessionExerciseId: a.id, direction: "down" });
    expect(await order(s.id)).toEqual([
      ["Cable Fly", 0],
      ["Barbell Bench Press", 1],
      ["Incline Dumbbell Press", 2],
    ]);
  });

  it("removing renumbers and never touches the Exercise row", async () => {
    const { s, bench, incline, fly } = await setup();
    await addSessionExercise({
      sessionId: s.id,
      exerciseId: bench.id,
      ...plan,
    });
    const b = await addSessionExercise({
      sessionId: s.id,
      exerciseId: incline.id,
      ...plan,
    });
    await addSessionExercise({ sessionId: s.id, exerciseId: fly.id, ...plan });
    const before = await prisma().exercise.findUniqueOrThrow({
      where: { id: incline.id },
    });
    await removeSessionExercise({ sessionExerciseId: b.id });
    expect(await order(s.id)).toEqual([
      ["Barbell Bench Press", 0],
      ["Cable Fly", 1],
    ]);
    expect(
      await prisma().exercise.findUniqueOrThrow({ where: { id: incline.id } }),
    ).toEqual(before);
    // Favorites untouched too.
    expect(
      (await prisma().exercise.findUniqueOrThrow({ where: { id: bench.id } }))
        .isFavorite,
    ).toBe(true);
  });
});

describe("archived exercises in a plan: repair, never substitute (spec D29, D36, D58)", () => {
  it("surfaces the slot, blocks activation, and replace repairs it keeping sets and reps", async () => {
    const { mesocycle, session, slot, exercise } = await createReadyDraft();
    await prisma().exercise.update({
      where: { id: exercise.id },
      data: { deletedAt: new Date() },
    });
    const detail = await getSessionDetail(mesocycle.id, session.id);
    expect(detail?.exercises[0]).toMatchObject({
      exerciseName: "Barbell Bench Press",
      isArchived: true,
    });
    expect((await getMesocycleWeek(mesocycle.id))?.readiness.ready).toBe(false);

    const replacement = await createTestExercise({
      name: "Chest Press Machine",
    });
    await replaceSessionExercise({
      sessionExerciseId: slot.id,
      exerciseId: replacement.id,
    });
    expect(
      await prisma().sessionExercise.findUniqueOrThrow({
        where: { id: slot.id },
        select: {
          exerciseId: true,
          plannedSets: true,
          targetRepMin: true,
          targetRepMax: true,
          position: true,
        },
      }),
    ).toEqual({
      exerciseId: replacement.id,
      plannedSets: 3,
      targetRepMin: 6,
      targetRepMax: 8,
      position: 0,
    });
    // The archived exercise stays archived.
    expect(
      (
        await prisma().exercise.findUniqueOrThrow({
          where: { id: exercise.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    await expect(
      activateMesocycle({ mesocycleId: mesocycle.id, expectedActiveId: null }),
    ).resolves.toMatchObject({ id: mesocycle.id });
  });

  it("removing the archived slot also repairs readiness", async () => {
    const { mesocycle, session, slot, exercise } = await createReadyDraft();
    const other = await createTestExercise({ name: "Cable Fly" });
    await createTestSessionExercise(session.id, other.id, { position: 1 });
    await prisma().exercise.update({
      where: { id: exercise.id },
      data: { deletedAt: new Date() },
    });
    await removeSessionExercise({ sessionExerciseId: slot.id });
    expect((await getMesocycleWeek(mesocycle.id))?.readiness.ready).toBe(true);
  });

  it("replace refuses an archived target and one already in the session", async () => {
    const { session, slot } = await createReadyDraft();
    const archived = await createTestExercise({
      name: "Barbell Row",
      deletedAt: new Date(),
    });
    expect(
      (
        await fails(
          replaceSessionExercise({
            sessionExerciseId: slot.id,
            exerciseId: archived.id,
          }),
        )
      ).message,
    ).toBe("That exercise is archived.");
    const other = await createTestExercise({ name: "Cable Fly" });
    await createTestSessionExercise(session.id, other.id, { position: 1 });
    expect(
      (
        await fails(
          replaceSessionExercise({
            sessionExerciseId: slot.id,
            exerciseId: other.id,
          }),
        )
      ).message,
    ).toBe("Already in this session.");
  });
});

describe("archived mesocycles are read-only", () => {
  it("rejects every slot write", async () => {
    const { session, slot } = await createReadyDraft({ status: "archived" });
    const e = await createTestExercise({ name: "Cable Fly" });
    for (const op of [
      addSessionExercise({ sessionId: session.id, exerciseId: e.id, ...plan }),
      updateSessionExercise({ sessionExerciseId: slot.id, ...plan }),
      replaceSessionExercise({ sessionExerciseId: slot.id, exerciseId: e.id }),
      removeSessionExercise({ sessionExerciseId: slot.id }),
      moveSessionExercise({ sessionExerciseId: slot.id, direction: "down" }),
    ]) {
      expect((await fails(op)).code).toBe("invalid_state_transition");
    }
  });
});
