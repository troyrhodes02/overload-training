import { DomainError } from "@/lib/actions/result";
import {
  activateMesocycle,
  archiveDraftMesocycle,
  createMesocycle,
  updateMesocycleDetails,
} from "@/lib/plan/mesocycles";
import { getMesocycleWeek, listMesocyclesForHome } from "@/lib/plan/queries";
import { getTestPrisma } from "./support/db";
import {
  createReadyDraft,
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

/**
 * Split & Mesocycle Builder — lifecycle, presets, configuration, and the DB
 * constraints behind them, against the throwaway database.
 */
const prisma = () => getTestPrisma();

async function fails(p: Promise<unknown>): Promise<DomainError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  return err as DomainError;
}

const base = {
  name: "Strength Block",
  startDate: "",
  lengthWeeks: "5",
  deloadWeek: "5",
};

describe("creating a mesocycle", () => {
  it("is a draft, with the 5 / 5 pre-fill accepted and no start date inferred", async () => {
    const { id } = await createMesocycle({ ...base, splitType: "custom" });
    const row = await prisma().mesocycle.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "draft",
      lengthWeeks: 5,
      deloadWeek: 5,
      startDate: null,
      splitType: "custom",
    });
  });

  it("accepts any valid length and deload week (the default is not a rule)", async () => {
    const { id } = await createMesocycle({
      name: "Short Block",
      startDate: "2026-11-02",
      lengthWeeks: "3",
      deloadWeek: "2",
      splitType: "custom",
    });
    const row = await prisma().mesocycle.findUniqueOrThrow({ where: { id } });
    expect([row.lengthWeeks, row.deloadWeek]).toEqual([3, 2]);
    expect(row.startDate?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("allows duplicate names (identity is the record)", async () => {
    await createMesocycle({ ...base, splitType: "custom" });
    await createMesocycle({ ...base, splitType: "custom" });
    expect(await prisma().mesocycle.count()).toBe(2);
  });

  it("rejects invalid input and writes nothing", async () => {
    const err = await fails(
      createMesocycle({
        name: " ",
        lengthWeeks: "0",
        deloadWeek: "5",
        splitType: "nope",
      }),
    );
    expect(err.code).toBe("validation_error");
    expect(Object.keys(err.details ?? {}).sort()).toEqual([
      "lengthWeeks",
      "name",
      "splitType",
    ]);
    expect(await prisma().mesocycle.count()).toBe(0);
  });

  it("can save a deload week past the end in a draft (surfaced, not moved)", async () => {
    const { id } = await createMesocycle({
      ...base,
      lengthWeeks: "4",
      deloadWeek: "5",
      splitType: "custom",
    });
    const week = await getMesocycleWeek(id);
    expect(week?.deloadWeek).toBe(5);
    expect(week?.readiness.issues).toContainEqual({
      code: "deload_out_of_range",
      deloadWeek: 5,
      lengthWeeks: 4,
    });
  });
});

describe("presets create structure only (spec D8–D13)", () => {
  const expected: Record<string, (string | null)[]> = {
    ppl: [
      "Push Day 1",
      "Pull Day 1",
      "Leg Day 1",
      "Push Day 2",
      "Pull Day 2",
      "Leg Day 2",
      null,
    ],
    arnold: [
      "Chest & Back 1",
      "Shoulders & Arms 1",
      "Legs 1",
      "Chest & Back 2",
      "Shoulders & Arms 2",
      "Legs 2",
      null,
    ],
    bro: ["Chest", "Back", "Shoulders", "Legs", "Arms", null, null],
    custom: [null, null, null, null, null, null, null],
  };

  it.each(Object.keys(expected))(
    "%s creates exactly the approved sessions and no exercises, sets, or reps",
    async (splitType) => {
      await createTestExercise({ isFavorite: true }); // must not be picked up
      const { id } = await createMesocycle({ ...base, splitType });
      const week = await getMesocycleWeek(id);
      expect(week?.week.map((s) => s?.name ?? null)).toEqual(
        expected[splitType],
      );
      expect(week?.unscheduled).toEqual([]);
      expect(week?.week.every((s) => !s || s.exerciseCount === 0)).toBe(true);
      expect(await prisma().sessionExercise.count()).toBe(0);
      const sessions = await prisma().session.findMany({
        where: { mesocycleId: id },
      });
      // Independent records: every preset session is its own row.
      expect(new Set(sessions.map((s) => s.id)).size).toBe(sessions.length);
    },
  );
});

describe("readiness and activation", () => {
  it("an incomplete draft saves but cannot activate", async () => {
    const { id } = await createMesocycle({ ...base, splitType: "ppl" });
    const err = await fails(
      activateMesocycle({ mesocycleId: id, expectedActiveId: null }),
    );
    expect(err.code).toBe("invalid_state_transition");
    expect(err.message).toBe("This plan isn't ready: Add a start date.");
    const row = await prisma().mesocycle.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("draft");
  });

  it("a scheduled empty session blocks activation; an unscheduled one does not", async () => {
    const { mesocycle } = await createReadyDraft();
    const empty = await createTestSession(mesocycle.id, {
      name: "Leg Day 1",
      dayOfWeek: 3,
    });
    await fails(
      activateMesocycle({ mesocycleId: mesocycle.id, expectedActiveId: null }),
    );
    await prisma().session.update({
      where: { id: empty.id },
      data: { dayOfWeek: null },
    });
    await expect(
      activateMesocycle({ mesocycleId: mesocycle.id, expectedActiveId: null }),
    ).resolves.toEqual({ id: mesocycle.id, archivedId: null });
  });

  it("an archived exercise in the plan blocks activation until repaired", async () => {
    const { mesocycle, exercise } = await createReadyDraft();
    await prisma().exercise.update({
      where: { id: exercise.id },
      data: { deletedAt: new Date() },
    });
    const err = await fails(
      activateMesocycle({ mesocycleId: mesocycle.id, expectedActiveId: null }),
    );
    expect(err.message).toBe(
      "This plan isn't ready: Barbell Bench Press in Push Day 1 is archived. Replace or remove it.",
    );
  });

  it("a valid draft activates", async () => {
    const { mesocycle } = await createReadyDraft();
    await activateMesocycle({
      mesocycleId: mesocycle.id,
      expectedActiveId: null,
    });
    const row = await prisma().mesocycle.findUniqueOrThrow({
      where: { id: mesocycle.id },
    });
    expect(row.status).toBe("active");
  });

  it("activating archives the previous active block in the same step", async () => {
    const a = await createReadyDraft({ name: "Hypertrophy Block 3" });
    await activateMesocycle({
      mesocycleId: a.mesocycle.id,
      expectedActiveId: null,
    });
    const b = await createReadyDraft({ name: "Strength Block" });
    const result = await activateMesocycle({
      mesocycleId: b.mesocycle.id,
      expectedActiveId: a.mesocycle.id,
    });
    expect(result).toEqual({ id: b.mesocycle.id, archivedId: a.mesocycle.id });
    const statuses = await prisma().mesocycle.findMany({
      select: { name: true, status: true },
      orderBy: { name: "asc" },
    });
    expect(statuses).toEqual([
      { name: "Hypertrophy Block 3", status: "archived" },
      { name: "Strength Block", status: "active" },
    ]);
    const home = await listMesocyclesForHome();
    expect(home.active?.id).toBe(b.mesocycle.id);
    expect(home.previous.map((m) => m.id)).toEqual([a.mesocycle.id]);
  });

  it("refuses when the active block is not the one the lifter confirmed", async () => {
    const a = await createReadyDraft({ name: "A" });
    await activateMesocycle({
      mesocycleId: a.mesocycle.id,
      expectedActiveId: null,
    });
    const b = await createReadyDraft({ name: "B" });
    const err = await fails(
      activateMesocycle({
        mesocycleId: b.mesocycle.id,
        expectedActiveId: null,
      }),
    );
    expect(err.code).toBe("conflict");
    const rows = await prisma().mesocycle.findMany({
      select: { name: true, status: true },
      orderBy: { name: "asc" },
    });
    expect(rows).toEqual([
      { name: "A", status: "active" },
      { name: "B", status: "draft" },
    ]);
  });

  it("the database never holds two active mesocycles", async () => {
    await createTestMesocycle({ name: "A", status: "active" });
    await expect(
      createTestMesocycle({ name: "B", status: "active" }),
    ).rejects.toThrow();
    const b = await createTestMesocycle({ name: "B" });
    await expect(
      prisma().$executeRawUnsafe(
        `UPDATE "mesocycles" SET "status" = 'active' WHERE "id" = $1::uuid`,
        b.id,
      ),
    ).rejects.toThrow();
    expect(
      await prisma().mesocycle.count({ where: { status: "active" } }),
    ).toBe(1);
  });

  it("the database never holds an ill-formed active block", async () => {
    await expect(
      createTestMesocycle({ status: "active", startDate: null }),
    ).rejects.toThrow();
    await expect(
      createTestMesocycle({ status: "active", lengthWeeks: 4, deloadWeek: 5 }),
    ).rejects.toThrow();
  });

  it("only drafts activate", async () => {
    const m = await createTestMesocycle({ status: "archived" });
    const err = await fails(
      activateMesocycle({ mesocycleId: m.id, expectedActiveId: null }),
    );
    expect(err.code).toBe("invalid_state_transition");
  });
});

describe("editing details", () => {
  it("a draft may save an incomplete configuration; length never moves deload", async () => {
    const { mesocycle } = await createReadyDraft();
    await updateMesocycleDetails({
      mesocycleId: mesocycle.id,
      name: "Strength Block",
      startDate: "",
      lengthWeeks: "4",
      deloadWeek: "5",
    });
    const row = await prisma().mesocycle.findUniqueOrThrow({
      where: { id: mesocycle.id },
    });
    expect(row).toMatchObject({
      lengthWeeks: 4,
      deloadWeek: 5,
      startDate: null,
    });
  });

  it("an active block must keep a start date and an in-range deload week", async () => {
    const { mesocycle } = await createReadyDraft();
    await activateMesocycle({
      mesocycleId: mesocycle.id,
      expectedActiveId: null,
    });
    const err = await fails(
      updateMesocycleDetails({
        mesocycleId: mesocycle.id,
        name: "Strength Block",
        startDate: "",
        lengthWeeks: "4",
        deloadWeek: "5",
      }),
    );
    expect(err.code).toBe("validation_error");
    expect(err.details).toEqual({
      startDate: "An active block needs a start date.",
      deloadWeek: "An active block needs a deload week inside it.",
    });
    await updateMesocycleDetails({
      mesocycleId: mesocycle.id,
      name: "Strength Block II",
      startDate: "2026-11-09",
      lengthWeeks: "6",
      deloadWeek: "6",
    });
    const row = await prisma().mesocycle.findUniqueOrThrow({
      where: { id: mesocycle.id },
    });
    expect(row).toMatchObject({ name: "Strength Block II", status: "active" });
  });

  it("archived mesocycles are read-only but readable", async () => {
    const { mesocycle } = await createReadyDraft({ status: "archived" });
    const err = await fails(
      updateMesocycleDetails({
        mesocycleId: mesocycle.id,
        name: "Changed",
        startDate: "2026-11-02",
        lengthWeeks: "5",
        deloadWeek: "5",
      }),
    );
    expect(err.code).toBe("invalid_state_transition");
    const week = await getMesocycleWeek(mesocycle.id);
    expect(week?.name).toBe("Strength Block");
    expect(week?.week[0]?.exerciseCount).toBe(1);
  });
});

describe("archiving a draft", () => {
  it("moves a draft to archived, never deletes it", async () => {
    const m = await createTestMesocycle();
    await archiveDraftMesocycle({ mesocycleId: m.id });
    const row = await prisma().mesocycle.findUniqueOrThrow({
      where: { id: m.id },
    });
    expect(row.status).toBe("archived");
  });

  it("only from draft", async () => {
    const m = await createTestMesocycle({ status: "archived" });
    expect(
      (await fails(archiveDraftMesocycle({ mesocycleId: m.id }))).code,
    ).toBe("invalid_state_transition");
  });
});

describe("plan-shape constraints in the database", () => {
  it("zero or one session per weekday; any number unscheduled", async () => {
    const m = await createTestMesocycle();
    await createTestSession(m.id, { dayOfWeek: 1 });
    await expect(
      createTestSession(m.id, { name: "Upper A", dayOfWeek: 1 }),
    ).rejects.toThrow();
    await createTestSession(m.id, { name: "Upper A", dayOfWeek: null });
    await createTestSession(m.id, { name: "Upper B", dayOfWeek: null });
    await expect(
      createTestSession(m.id, { name: "Bad", dayOfWeek: 8 }),
    ).rejects.toThrow();
    await expect(createTestSession(m.id, { name: "  " })).rejects.toThrow();
  });

  it("sets ≥ 1, reps ≥ 1, min ≤ max, one occurrence per session", async () => {
    const m = await createTestMesocycle();
    const s = await createTestSession(m.id);
    const e = await createTestExercise();
    const e2 = await createTestExercise({ name: "Cable Fly" });
    for (const bad of [
      { plannedSets: 0 },
      { targetRepMin: 0, targetRepMax: 0 },
      { targetRepMin: 10, targetRepMax: 8 },
    ]) {
      await expect(
        createTestSessionExercise(s.id, e.id, bad),
      ).rejects.toThrow();
    }
    await createTestSessionExercise(s.id, e.id, {
      targetRepMin: 5,
      targetRepMax: 5,
    });
    await expect(
      createTestSessionExercise(s.id, e.id, { position: 1 }),
    ).rejects.toThrow();
    await createTestSessionExercise(s.id, e2.id, { position: 1 });
  });

  it("an exercise in a plan cannot be hard-deleted (Restrict)", async () => {
    const { exercise } = await createReadyDraft();
    await expect(
      prisma().exercise.delete({ where: { id: exercise.id } }),
    ).rejects.toThrow();
  });
});
