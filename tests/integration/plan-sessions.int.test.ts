import { DomainError } from "@/lib/actions/result";
import { activateMesocycle } from "@/lib/plan/mesocycles";
import { getMesocycleWeek, getSessionDetail } from "@/lib/plan/queries";
import {
  addSession,
  moveSession,
  removeSession,
  renameSession,
} from "@/lib/plan/sessions";
import { getTestPrisma } from "./support/db";
import {
  createReadyDraft,
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
  historyCounts,
  seedLoggedHistory,
} from "./support/plan-factories";

/** Split & Mesocycle Builder — the weekly schedule and session authoring. */
const prisma = () => getTestPrisma();

async function fails(p: Promise<unknown>): Promise<DomainError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  return err as DomainError;
}

describe("zero or one lifting session per day (spec D14, D15, D56)", () => {
  it("a rest day is valid and one session on a day is valid", async () => {
    const m = await createTestMesocycle();
    const { id } = await addSession({
      mesocycleId: m.id,
      name: "Push Day 1",
      dayOfWeek: 1,
    });
    const week = await getMesocycleWeek(m.id);
    expect(week?.week.map((s) => s?.id ?? null)).toEqual([
      id,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("an occupied day is never silently overwritten", async () => {
    const m = await createTestMesocycle();
    const push = await createTestSession(m.id, {
      name: "Push Day 2",
      dayOfWeek: 4,
    });
    const err = await fails(
      addSession({ mesocycleId: m.id, name: "Upper A", dayOfWeek: 4 }),
    );
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("Thursday already has Push Day 2.");
    expect(err.details).toEqual({ occupiedBy: "Push Day 2", dayOfWeek: "4" });
    const rows = await prisma().session.findMany({
      where: { mesocycleId: m.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: push.id, dayOfWeek: 4 });
  });

  it("an explicit replace keeps the displaced session, unscheduled", async () => {
    const m = await createTestMesocycle();
    const push = await createTestSession(m.id, {
      name: "Push Day 2",
      dayOfWeek: 4,
    });
    const { id } = await addSession({
      mesocycleId: m.id,
      name: "Upper A",
      dayOfWeek: 4,
      replace: true,
    });
    const week = await getMesocycleWeek(m.id);
    expect(week?.week[3]?.id).toBe(id);
    expect(week?.unscheduled.map((s) => s.id)).toEqual([push.id]);
  });

  it("moving onto an occupied day asks; with replace, swaps it off the schedule", async () => {
    const m = await createTestMesocycle();
    const a = await createTestSession(m.id, {
      name: "Push Day 1",
      dayOfWeek: 1,
    });
    const b = await createTestSession(m.id, {
      name: "Push Day 2",
      dayOfWeek: 4,
    });
    expect(
      (await fails(moveSession({ sessionId: a.id, dayOfWeek: 4 }))).code,
    ).toBe("conflict");
    expect(
      await moveSession({ sessionId: a.id, dayOfWeek: 4, replace: true }),
    ).toEqual({ id: a.id, displacedId: b.id });
    const rows = await prisma().session.findMany({
      where: { mesocycleId: m.id },
      select: { name: true, dayOfWeek: true },
      orderBy: { name: "asc" },
    });
    expect(rows).toEqual([
      { name: "Push Day 1", dayOfWeek: 4 },
      { name: "Push Day 2", dayOfWeek: null },
    ]);
  });

  it("moving to a rest day, off the schedule, or onto its own day", async () => {
    const m = await createTestMesocycle();
    const a = await createTestSession(m.id, { dayOfWeek: 1 });
    await moveSession({ sessionId: a.id, dayOfWeek: 3 });
    await moveSession({ sessionId: a.id, dayOfWeek: 3 }); // no-op
    expect(
      (await prisma().session.findUniqueOrThrow({ where: { id: a.id } }))
        .dayOfWeek,
    ).toBe(3);
    await moveSession({ sessionId: a.id, dayOfWeek: null });
    expect(
      (await prisma().session.findUniqueOrThrow({ where: { id: a.id } }))
        .dayOfWeek,
    ).toBeNull();
  });

  it("rejects an invalid day", async () => {
    const m = await createTestMesocycle();
    expect(
      (await fails(addSession({ mesocycleId: m.id, name: "X", dayOfWeek: 8 })))
        .code,
    ).toBe("validation_error");
  });
});

describe("session names (spec D17)", () => {
  it("are required and need not be unique", async () => {
    const m = await createTestMesocycle();
    expect(
      (await fails(addSession({ mesocycleId: m.id, name: "  ", dayOfWeek: 1 })))
        .details,
    ).toEqual({ name: "Enter a name." });
    const a = await addSession({
      mesocycleId: m.id,
      name: "Push",
      dayOfWeek: 1,
    });
    await addSession({ mesocycleId: m.id, name: "Push", dayOfWeek: 2 });
    await renameSession({ sessionId: a.id, name: "  Push Day 1 " });
    expect(
      (await prisma().session.findUniqueOrThrow({ where: { id: a.id } })).name,
    ).toBe("Push Day 1");
  });
});

describe("empty sessions (spec D18)", () => {
  it("a draft session may be empty; scheduled empty blocks activation", async () => {
    const { mesocycle } = await createReadyDraft();
    const { id } = await addSession({
      mesocycleId: mesocycle.id,
      name: "Leg Day 1",
      dayOfWeek: 3,
    });
    const week = await getMesocycleWeek(mesocycle.id);
    expect(week?.readiness.issues).toContainEqual({
      code: "session_empty",
      sessionId: id,
      sessionName: "Leg Day 1",
      dayOfWeek: 3,
    });
    await moveSession({ sessionId: id, dayOfWeek: null });
    expect((await getMesocycleWeek(mesocycle.id))?.readiness.ready).toBe(true);
  });
});

describe("removing a session is plan authoring (spec D25, D53)", () => {
  it("deletes only the session and its planned slots", async () => {
    const { mesocycle, session, exercise } = await createReadyDraft();
    const other = await createReadyDraft({ name: "Other block" });
    const before = await prisma().exercise.findUniqueOrThrow({
      where: { id: exercise.id },
    });
    await removeSession({ sessionId: session.id });
    expect(await prisma().session.count({ where: { id: session.id } })).toBe(0);
    expect(
      await prisma().sessionExercise.count({
        where: { sessionId: session.id },
      }),
    ).toBe(0);
    expect(
      await prisma().exercise.findUniqueOrThrow({ where: { id: exercise.id } }),
    ).toEqual(before);
    expect(
      await prisma().sessionExercise.count({
        where: { sessionId: other.session.id },
      }),
    ).toBe(1);
    expect(
      await prisma().mesocycle.count({ where: { id: mesocycle.id } }),
    ).toBe(1);
  });

  it("a session with logged history can't be removed (history is never detached)", async () => {
    const { mesocycle, session, exercise } = await createReadyDraft();
    await seedLoggedHistory({
      mesocycleId: mesocycle.id,
      sessionId: session.id,
      exerciseId: exercise.id,
    });
    const before = await historyCounts();
    const err = await fails(removeSession({ sessionId: session.id }));
    expect(err.code).toBe("invalid_state_transition");
    expect(await historyCounts()).toEqual(before);
    expect(await prisma().session.count({ where: { id: session.id } })).toBe(1);
  });
});

describe("archived mesocycles are read-only", () => {
  it("rejects every session write", async () => {
    const { mesocycle, session } = await createReadyDraft({
      status: "archived",
    });
    for (const op of [
      addSession({ mesocycleId: mesocycle.id, name: "X", dayOfWeek: 2 }),
      renameSession({ sessionId: session.id, name: "X" }),
      moveSession({ sessionId: session.id, dayOfWeek: 2 }),
      removeSession({ sessionId: session.id }),
    ]) {
      expect((await fails(op)).code).toBe("invalid_state_transition");
    }
  });

  it("an active mesocycle stays editable", async () => {
    const { mesocycle, session } = await createReadyDraft();
    await activateMesocycle({
      mesocycleId: mesocycle.id,
      expectedActiveId: null,
    });
    await renameSession({ sessionId: session.id, name: "Push A" });
    await addSession({
      mesocycleId: mesocycle.id,
      name: "Pull A",
      dayOfWeek: 2,
    });
    const week = await getMesocycleWeek(mesocycle.id);
    expect(week?.status).toBe("active");
    // An empty scheduled session in the live plan: still active, needs attention.
    expect(week?.readiness.ready).toBe(false);
  });
});

describe("session detail", () => {
  it("returns ordered planned exercises, archived flagged, and day occupancy", async () => {
    const m = await createTestMesocycle();
    const s = await createTestSession(m.id, { dayOfWeek: 1 });
    await createTestSession(m.id, { name: "Pull Day 1", dayOfWeek: 2 });
    const bench = await createTestExercise();
    const fly = await createTestExercise({
      name: "Cable Fly",
      deletedAt: new Date(),
    });
    await createTestSessionExercise(s.id, fly.id, { position: 1 });
    await createTestSessionExercise(s.id, bench.id, { position: 0 });
    const detail = await getSessionDetail(m.id, s.id);
    expect(
      detail?.exercises.map((e) => [e.exerciseName, e.isArchived]),
    ).toEqual([
      ["Barbell Bench Press", false],
      ["Cable Fly", true],
    ]);
    expect(detail?.occupancy.slice(0, 3).map((d) => d.sessionName)).toEqual([
      "Push Day 1",
      "Pull Day 1",
      null,
    ]);
    const other = await createTestMesocycle({ name: "Other" });
    expect(await getSessionDetail(other.id, s.id)).toBeNull();
  });
});
