import { DomainError } from "@/lib/actions/result";
import {
  activateMesocycle,
  cloneMesocycle,
  createMesocycle,
} from "@/lib/plan/mesocycles";
import {
  getCloneSetup,
  getMesocycleWeek,
  getSessionDetail,
  listCloneSources,
} from "@/lib/plan/queries";
import {
  removeSessionExercise,
  renameSession,
  replaceSessionExercise,
  updateSessionExercise,
} from "@/lib/plan/sessions";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
  historyCounts,
  seedLoggedHistory,
} from "./support/plan-factories";

/** Split & Mesocycle Builder — clone-forward: plan-forward, never history-forward. */
const prisma = () => getTestPrisma();

async function fails(p: Promise<unknown>): Promise<DomainError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  return err as DomainError;
}

/** An archived PPL-ish source block with a few planned exercises. */
async function hypertrophyBlock3(status: "active" | "archived" = "archived") {
  const m = await createTestMesocycle({
    name: "Hypertrophy Block 3",
    status,
    splitType: "ppl",
    startDate: new Date("2026-09-28T00:00:00Z"),
    lengthWeeks: 5,
    deloadWeek: 4,
  });
  const push = await createTestSession(m.id, {
    name: "Push Day 1",
    dayOfWeek: 1,
  });
  const pull = await createTestSession(m.id, {
    name: "Pull Day 1",
    dayOfWeek: 2,
  });
  const upper = await createTestSession(m.id, {
    name: "Upper A",
    dayOfWeek: null,
  });
  const bench = await createTestExercise({ name: "Barbell Bench Press" });
  const fly = await createTestExercise({ name: "Cable Fly" });
  const row = await createTestExercise({ name: "Barbell Row" });
  const pulldown = await createTestExercise({ name: "Lat Pulldown" });
  await createTestSessionExercise(push.id, bench.id, { position: 0 });
  await createTestSessionExercise(push.id, fly.id, {
    position: 1,
    plannedSets: 4,
    targetRepMin: 12,
    targetRepMax: 15,
  });
  await createTestSessionExercise(pull.id, pulldown.id, { position: 0 });
  await createTestSessionExercise(pull.id, row.id, {
    position: 1,
    targetRepMin: 5,
    targetRepMax: 5,
  });
  return { m, push, pull, upper, bench, fly, row, pulldown };
}

/** Everything about a plan except ids and timestamps. */
async function planShape(mesocycleId: string) {
  const m = await prisma().mesocycle.findUniqueOrThrow({
    where: { id: mesocycleId },
    include: {
      sessions: {
        orderBy: [{ dayOfWeek: "asc" }, { name: "asc" }],
        include: {
          sessionExercises: {
            orderBy: { position: "asc" },
            include: { exercise: { select: { name: true } } },
          },
        },
      },
    },
  });
  return {
    splitType: m.splitType,
    lengthWeeks: m.lengthWeeks,
    deloadWeek: m.deloadWeek,
    sessions: m.sessions.map((s) => ({
      name: s.name,
      dayOfWeek: s.dayOfWeek,
      exercises: s.sessionExercises.map((se) => [
        se.exercise.name,
        se.position,
        se.plannedSets,
        se.targetRepMin,
        se.targetRepMax,
      ]),
    })),
  };
}

const cloneInput = (sourceMesocycleId: string, over = {}) => ({
  sourceMesocycleId,
  name: "Hypertrophy Block 3 Copy",
  startDate: "2026-11-02",
  lengthWeeks: "5",
  deloadWeek: "4",
  ...over,
});

describe("clone-forward creates a new draft (spec D30, D31)", () => {
  it("copies split type, length, deload, sessions, days, names, exercises, order, sets, reps", async () => {
    const { m } = await hypertrophyBlock3();
    const { id } = await cloneMesocycle(cloneInput(m.id));
    expect(id).not.toBe(m.id);
    const clone = await prisma().mesocycle.findUniqueOrThrow({ where: { id } });
    expect(clone).toMatchObject({
      status: "draft",
      name: "Hypertrophy Block 3 Copy",
      splitType: "ppl",
    });
    expect(clone.startDate?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(await planShape(id)).toEqual(await planShape(m.id));
  });

  it("never mutates the source (deep snapshot before and after)", async () => {
    const { m } = await hypertrophyBlock3();
    const snapshot = async () =>
      prisma().mesocycle.findUniqueOrThrow({
        where: { id: m.id },
        include: { sessions: { include: { sessionExercises: true } } },
      });
    const before = await snapshot();
    await cloneMesocycle(cloneInput(m.id));
    expect(await snapshot()).toEqual(before);
  });

  it("an active block can be the source too; a draft cannot", async () => {
    const { m } = await hypertrophyBlock3("active");
    await expect(cloneMesocycle(cloneInput(m.id))).resolves.toHaveProperty(
      "id",
    );
    const draft = await createTestMesocycle({ name: "Strength Block" });
    expect((await fails(cloneMesocycle(cloneInput(draft.id)))).code).toBe(
      "invalid_state_transition",
    );
    expect((await listCloneSources()).map((s) => s.id)).toEqual([m.id]);
  });

  it("validates the clone form like any mesocycle", async () => {
    const { m } = await hypertrophyBlock3();
    const err = await fails(cloneMesocycle(cloneInput(m.id, { name: " " })));
    expect(err.code).toBe("validation_error");
    expect(await prisma().mesocycle.count()).toBe(1);
  });
});

describe("clone defaults (spec D33–D35)", () => {
  it("name + Copy, start = source end + 1 day, same length and deload", async () => {
    const { m } = await hypertrophyBlock3();
    const setup = await getCloneSetup(m.id);
    expect(setup?.defaults).toEqual({
      name: "Hypertrophy Block 3 Copy",
      startDate: "2026-11-02", // 2026-09-28 + 5 weeks; the source ends Sun 2026-11-01
      lengthWeeks: 5,
      deloadWeek: 4,
    });
    expect(setup?.source.endDate).toBe("2026-11-01");
    expect(setup?.exerciseCount).toBe(4);
  });

  it("every default is editable (a gap, a new length, a new deload week)", async () => {
    const { m } = await hypertrophyBlock3();
    const { id } = await cloneMesocycle(
      cloneInput(m.id, {
        name: "Strength Block",
        startDate: "2026-11-16",
        lengthWeeks: "6",
        deloadWeek: "6",
      }),
    );
    const clone = await prisma().mesocycle.findUniqueOrThrow({ where: { id } });
    expect(clone).toMatchObject({
      name: "Strength Block",
      lengthWeeks: 6,
      deloadWeek: 6,
    });
    expect(clone.startDate?.toISOString().slice(0, 10)).toBe("2026-11-16");
  });

  it("a source with no start date leaves the clone's start empty", async () => {
    const m = await createTestMesocycle({
      status: "archived",
      startDate: null,
    });
    expect((await getCloneSetup(m.id))?.defaults.startDate).toBeNull();
  });
});

describe("clone independence (spec D31)", () => {
  it("editing the clone never changes the source, and vice versa", async () => {
    const { m } = await hypertrophyBlock3("active");
    const sourceBefore = await planShape(m.id);
    const { id } = await cloneMesocycle(cloneInput(m.id));
    const cloneSlots = await prisma().sessionExercise.findMany({
      where: { session: { mesocycleId: id } },
      orderBy: { position: "asc" },
    });
    const cloneSession = await prisma().session.findFirstOrThrow({
      where: { mesocycleId: id, dayOfWeek: 1 },
    });
    await renameSession({ sessionId: cloneSession.id, name: "Push A" });
    await updateSessionExercise({
      sessionExerciseId: cloneSlots[0].id,
      plannedSets: "5",
      targetRepMin: "3",
      targetRepMax: "5",
    });
    await removeSessionExercise({ sessionExerciseId: cloneSlots[1].id });
    expect(await planShape(m.id)).toEqual(sourceBefore);

    const cloneBefore = await planShape(id);
    const sourceSlot = await prisma().sessionExercise.findFirstOrThrow({
      where: { session: { mesocycleId: m.id } },
    });
    await updateSessionExercise({
      sessionExerciseId: sourceSlot.id,
      plannedSets: "6",
      targetRepMin: "6",
      targetRepMax: "6",
    });
    expect(await planShape(id)).toEqual(cloneBefore);
  });
});

describe("clone-forward never copies performed data (spec D32)", () => {
  it("logged sessions, exercises, sets, goals, and baselines are untouched", async () => {
    const { m, push, bench } = await hypertrophyBlock3();
    await seedLoggedHistory({
      mesocycleId: m.id,
      sessionId: push.id,
      exerciseId: bench.id,
    });
    const gym = await prisma().gym.create({ data: { name: "Downtown Gym" } });
    await prisma().gymExerciseBaseline.create({
      data: { gymId: gym.id, exerciseId: bench.id, weightLbs: 185 },
    });
    await prisma().goal.create({
      data: { exerciseId: bench.id, targetWeightLbs: 315, targetReps: 1 },
    });
    const before = await historyCounts();
    const { id } = await cloneMesocycle(cloneInput(m.id));
    expect(await historyCounts()).toEqual(before);
    expect(
      await prisma().loggedSession.count({ where: { mesocycleId: id } }),
    ).toBe(0);
  });
});

describe("archived exercises in a clone (spec D36)", () => {
  it("are preserved as repair slots: not dropped, not reactivated, not replaced; activation blocked until repaired", async () => {
    const { m, fly, row, pull } = await hypertrophyBlock3();
    const favorite = await createTestExercise({
      name: "Pec Deck",
      isFavorite: true,
    }); // a same-muscle favorite must NOT be substituted
    await prisma().exercise.updateMany({
      where: { id: { in: [fly.id, row.id] } },
      data: { deletedAt: new Date() },
    });

    const setup = await getCloneSetup(m.id);
    expect(setup?.archivedReferences).toEqual([
      { exerciseName: "Cable Fly", sessionName: "Push Day 1" },
      { exerciseName: "Barbell Row", sessionName: "Pull Day 1" },
    ]);

    const { id } = await cloneMesocycle(cloneInput(m.id));
    expect(await planShape(id)).toEqual(await planShape(m.id));
    const archivedIds = (
      await prisma().exercise.findMany({
        where: { id: { in: [fly.id, row.id] } },
        select: { deletedAt: true },
      })
    ).map((e) => e.deletedAt !== null);
    expect(archivedIds).toEqual([true, true]);
    expect(
      await prisma().sessionExercise.count({
        where: { exerciseId: favorite.id },
      }),
    ).toBe(0);

    const week = await getMesocycleWeek(id);
    expect(
      week?.readiness.issues
        .filter((i) => i.code === "exercise_archived")
        .map((i) => ("exerciseName" in i ? i.exerciseName : "")),
    ).toEqual(["Cable Fly", "Barbell Row"]);
    expect(
      (
        await fails(
          activateMesocycle({ mesocycleId: id, expectedActiveId: null }),
        )
      ).code,
    ).toBe("invalid_state_transition");

    // Repair: replace one, remove the other.
    const clonePull = await prisma().session.findFirstOrThrow({
      where: { mesocycleId: id, name: pull.name },
    });
    const detail = await getSessionDetail(id, clonePull.id);
    const rowSlot = detail?.exercises.find(
      (e) => e.exerciseName === "Barbell Row",
    );
    const cableRow = await createTestExercise({ name: "Seated Cable Row" });
    await replaceSessionExercise({
      sessionExerciseId: rowSlot!.id,
      exerciseId: cableRow.id,
    });
    const flySlot = await prisma().sessionExercise.findFirstOrThrow({
      where: { exerciseId: fly.id, session: { mesocycleId: id } },
    });
    await removeSessionExercise({ sessionExerciseId: flySlot.id });
    await expect(
      activateMesocycle({ mesocycleId: id, expectedActiveId: null }),
    ).resolves.toMatchObject({ id });
  });
});

describe("a clone of a cloned plan", () => {
  it("copies the selected plan's current structure, with no lineage", async () => {
    const { m } = await createMesocycle({
      name: "A",
      startDate: "2026-11-02",
      lengthWeeks: "5",
      deloadWeek: "5",
      splitType: "bro",
    }).then(async ({ id }) => ({
      m: await prisma().mesocycle.update({
        where: { id },
        data: { status: "archived" },
      }),
    }));
    const b = await cloneMesocycle(
      cloneInput(m.id, { name: "B", deloadWeek: "5" }),
    );
    await prisma().mesocycle.update({
      where: { id: b.id },
      data: { status: "archived" },
    });
    const c = await cloneMesocycle(
      cloneInput(b.id, { name: "C", deloadWeek: "5" }),
    );
    expect(await planShape(c.id)).toEqual(await planShape(m.id));
    const columns = await prisma().$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('mesocycles','sessions','session_exercises')
          AND (column_name ILIKE '%source%' OR column_name ILIKE '%parent%' OR column_name ILIKE '%clone%')`,
    );
    expect(columns).toEqual([]);
  });
});
