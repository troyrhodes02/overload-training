import { DomainError } from "@/lib/actions/result";
import {
  addPlannedCardio,
  removePlannedCardio,
  updatePlannedCardio,
} from "@/lib/plan/cardio";
import { cloneMesocycle } from "@/lib/plan/mesocycles";
import { getCloneSetup, getMesocycleWeek } from "@/lib/plan/queries";
import { duplicateSession } from "@/lib/plan/sessions";
import { getTestPrisma } from "./support/db";
import {
  createReadyDraft,
  createTestMesocycle,
  createTestSession,
  historyCounts,
} from "./support/plan-factories";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Cardio Logging — planned cardio in the mesocycle builder (OVE-33; spec
 * §11e, R1–R12, R48–R49, R56, R63–R64). Cardio belongs to the DAY: zero or one
 * per weekday, beside or instead of a lifting Session, and never an Exercise,
 * SessionExercise, LoggedExercise, or LoggedSet.
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

const strengthCounts = async () => ({
  exercises: await prisma().exercise.count(),
  sessions: await prisma().session.count(),
  sessionExercises: await prisma().sessionExercise.count(),
  ...(await historyCounts()),
});

/** A CardioLog row for a mesocycle, inserted raw (history the plan must never touch). */
async function seedCardioLog(mesocycleId: string, scheduledFor = "2026-11-03") {
  return prisma().cardioLog.create({
    data: {
      userId: account.userId,
      mesocycleId,
      scheduledFor: new Date(`${scheduledFor}T00:00:00Z`),
      plannedType: "Incline Walk",
      plannedDurationMin: 20,
      type: "Bike",
      durationMin: 25,
      performedOn: new Date(`${scheduledFor}T00:00:00Z`),
    },
  });
}

describe("adding planned cardio", () => {
  it("puts one item on a lifting day (combined day) without touching the session", async () => {
    const { mesocycle, session } = await createReadyDraft();
    const before = await strengthCounts();
    const { id } = await addPlannedCardio(account, {
      mesocycleId: mesocycle.id,
      dayOfWeek: session.dayOfWeek,
      type: "  Incline Walk ",
      durationMin: "20",
    });
    const row = await prisma().plannedCardio.findUniqueOrThrow({
      where: { id },
    });
    expect(row).toMatchObject({
      mesocycleId: mesocycle.id,
      dayOfWeek: 1,
      type: "Incline Walk",
      durationMin: 20,
    });
    expect(await strengthCounts()).toEqual(before);
    const week = await getMesocycleWeek(account, mesocycle.id);
    expect(week?.week[0]?.name).toBe("Push Day 1");
    expect(week?.cardio[0]).toMatchObject({ type: "Incline Walk" });
  });

  it("puts cardio on a rest day (cardio-only day) with no session required", async () => {
    const m = await createTestMesocycle();
    await addPlannedCardio(account, {
      mesocycleId: m.id,
      dayOfWeek: 6,
      type: "Bike",
      durationMin: 30,
    });
    const week = await getMesocycleWeek(account, m.id);
    expect(week?.week[5]).toBeNull();
    expect(week?.cardio[5]).toMatchObject({ type: "Bike", durationMin: 30 });
    expect(await prisma().session.count()).toBe(0);
  });

  it("allows zero cardio on every day", async () => {
    const m = await createTestMesocycle();
    expect((await getMesocycleWeek(account, m.id))?.cardio).toEqual(
      Array(7).fill(null),
    );
  });

  it("rejects a second planned cardio item on the same day (app and database)", async () => {
    const m = await createTestMesocycle();
    await addPlannedCardio(account, {
      mesocycleId: m.id,
      dayOfWeek: 2,
      type: "Incline Walk",
      durationMin: 20,
    });
    const err = await fails(
      addPlannedCardio(account, {
        mesocycleId: m.id,
        dayOfWeek: 2,
        type: "Bike",
        durationMin: 15,
      }),
    );
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("Tuesday already has cardio.");
    // The unique index backs the rule even if the check were bypassed.
    await expect(
      prisma().plannedCardio.create({
        data: {
          userId: account.userId,
          mesocycleId: m.id,
          dayOfWeek: 2,
          type: "Bike",
          durationMin: 15,
        },
      }),
    ).rejects.toThrow();
    expect(await prisma().plannedCardio.count()).toBe(1);
  });

  it.each([
    [{ type: "", durationMin: "20" }, "type"],
    [{ type: "   ", durationMin: "20" }, "type"],
    [{ type: "Bike", durationMin: "" }, "durationMin"],
    [{ type: "Bike", durationMin: "0" }, "durationMin"],
    [{ type: "Bike", durationMin: "-5" }, "durationMin"],
    [{ type: "Bike", durationMin: "2.5" }, "durationMin"],
  ])("rejects %p and writes nothing", async (fields, key) => {
    const m = await createTestMesocycle();
    const err = await fails(
      addPlannedCardio(account, { mesocycleId: m.id, dayOfWeek: 3, ...fields }),
    );
    expect(err.code).toBe("validation_error");
    expect(err.details?.[key]).toBeTruthy();
    expect(await prisma().plannedCardio.count()).toBe(0);
  });

  it("requires a real day", async () => {
    const m = await createTestMesocycle();
    for (const dayOfWeek of [null, 0, 8, "none"]) {
      const err = await fails(
        addPlannedCardio(account, {
          mesocycleId: m.id,
          dayOfWeek,
          type: "Bike",
          durationMin: 20,
        }),
      );
      expect(err.details?.dayOfWeek).toBe("Choose a day.");
    }
  });

  it("the database rejects invalid rows even if the app check were bypassed", async () => {
    const m = await createTestMesocycle();
    for (const data of [
      { dayOfWeek: 0, type: "Bike", durationMin: 20 },
      { dayOfWeek: 1, type: "Bike", durationMin: 0 },
      { dayOfWeek: 1, type: "  ", durationMin: 20 },
      { dayOfWeek: 1, type: " Bike", durationMin: 20 },
    ]) {
      await expect(
        prisma().plannedCardio.create({
          data: { userId: account.userId, mesocycleId: m.id, ...data },
        }),
      ).rejects.toThrow();
    }
  });

  it("works on an active block and is refused on an archived one", async () => {
    const active = await createTestMesocycle({ status: "active" });
    await addPlannedCardio(account, {
      mesocycleId: active.id,
      dayOfWeek: 1,
      type: "Bike",
      durationMin: 20,
    });
    const archived = await createTestMesocycle({ status: "archived" });
    const err = await fails(
      addPlannedCardio(account, {
        mesocycleId: archived.id,
        dayOfWeek: 1,
        type: "Bike",
        durationMin: 20,
      }),
    );
    expect(err.code).toBe("invalid_state_transition");
  });
});

describe("editing and removing planned cardio", () => {
  async function tuesdayWalk() {
    const m = await createTestMesocycle({ status: "active" });
    const { id } = await addPlannedCardio(account, {
      mesocycleId: m.id,
      dayOfWeek: 2,
      type: "Incline Walk",
      durationMin: 20,
    });
    return { m, id };
  }

  it("changes type and minutes in place", async () => {
    const { id } = await tuesdayWalk();
    const res = await updatePlannedCardio(account, {
      plannedCardioId: id,
      dayOfWeek: 2,
      type: "Treadmill",
      durationMin: "25",
    });
    expect(res.id).toBe(id);
    expect(
      await prisma().plannedCardio.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ type: "Treadmill", durationMin: 25, dayOfWeek: 2 });
  });

  it("moves it to a free day as a fresh plan row", async () => {
    const { m, id } = await tuesdayWalk();
    const res = await updatePlannedCardio(account, {
      plannedCardioId: id,
      dayOfWeek: 4,
      type: "Incline Walk",
      durationMin: 20,
    });
    const rows = await prisma().plannedCardio.findMany({
      where: { mesocycleId: m.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: res.id, dayOfWeek: 4 });
  });

  it("refuses to move it onto a day that already has cardio", async () => {
    const { m, id } = await tuesdayWalk();
    await addPlannedCardio(account, {
      mesocycleId: m.id,
      dayOfWeek: 4,
      type: "Stair Climber",
      durationMin: 15,
    });
    const err = await fails(
      updatePlannedCardio(account, {
        plannedCardioId: id,
        dayOfWeek: 4,
        type: "Incline Walk",
        durationMin: 20,
      }),
    );
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("Thursday already has cardio.");
    const rows = await prisma().plannedCardio.findMany({
      orderBy: { dayOfWeek: "asc" },
    });
    expect(rows.map((r) => [r.dayOfWeek, r.type])).toEqual([
      [2, "Incline Walk"],
      [4, "Stair Climber"],
    ]);
  });

  it("never rewrites or deletes logged cardio when the plan is edited, moved, or removed", async () => {
    const { m, id } = await tuesdayWalk();
    const log = await seedCardioLog(m.id);
    await updatePlannedCardio(account, {
      plannedCardioId: id,
      dayOfWeek: 2,
      type: "Elliptical",
      durationMin: 40,
    });
    const moved = await updatePlannedCardio(account, {
      plannedCardioId: id,
      dayOfWeek: 5,
      type: "Elliptical",
      durationMin: 40,
    });
    await removePlannedCardio(account, { plannedCardioId: moved.id });
    expect(await prisma().plannedCardio.count()).toBe(0);
    expect(
      await prisma().cardioLog.findUniqueOrThrow({ where: { id: log.id } }),
    ).toEqual(log);
  });

  it("is read-only on an archived block", async () => {
    const { m, id } = await tuesdayWalk();
    await prisma().mesocycle.update({
      where: { id: m.id },
      data: { status: "archived" },
    });
    const edit = await fails(
      updatePlannedCardio(account, {
        plannedCardioId: id,
        dayOfWeek: 2,
        type: "Bike",
        durationMin: 20,
      }),
    );
    expect(edit.code).toBe("invalid_state_transition");
    const remove = await fails(
      removePlannedCardio(account, { plannedCardioId: id }),
    );
    expect(remove.code).toBe("invalid_state_transition");
  });

  it("returns not_found for an unknown item", async () => {
    const err = await fails(
      removePlannedCardio(account, {
        plannedCardioId: "00000000-0000-4000-8000-000000000000",
      }),
    );
    expect(err.code).toBe("not_found");
  });
});

describe("cardio and session duplication (R11)", () => {
  it("duplicating a session never copies the source day's cardio", async () => {
    const m = await createTestMesocycle();
    const s = await createTestSession(m.id, {
      name: "Pull Day 1",
      dayOfWeek: 2,
    });
    await addPlannedCardio(account, {
      mesocycleId: m.id,
      dayOfWeek: 2,
      type: "Incline Walk",
      durationMin: 20,
    });
    await duplicateSession(account, { sessionId: s.id, dayOfWeek: 4 });
    const week = await getMesocycleWeek(account, m.id);
    expect(week?.week[3]?.name).toBe("Pull Day 1 Copy");
    expect(week?.cardio[3]).toBeNull();
    expect(week?.cardio[1]).toMatchObject({ type: "Incline Walk" });
    expect(await prisma().plannedCardio.count()).toBe(1);
  });
});

describe("clone-forward (R12, R48)", () => {
  it("copies planned cardio type, minutes, and day — never cardio logs", async () => {
    const { mesocycle } = await createReadyDraft({ status: "active" });
    await addPlannedCardio(account, {
      mesocycleId: mesocycle.id,
      dayOfWeek: 2,
      type: "Incline Walk",
      durationMin: 20,
    });
    await addPlannedCardio(account, {
      mesocycleId: mesocycle.id,
      dayOfWeek: 6,
      type: "Bike",
      durationMin: 30,
    });
    await seedCardioLog(mesocycle.id);
    expect((await getCloneSetup(account, mesocycle.id))?.cardioDayCount).toBe(
      2,
    );

    const { id } = await cloneMesocycle(account, {
      sourceMesocycleId: mesocycle.id,
      name: "Strength Block Copy",
      startDate: "2026-12-07",
      lengthWeeks: "5",
      deloadEveryWeeks: "5",
    });
    const copied = await prisma().plannedCardio.findMany({
      where: { mesocycleId: id },
      orderBy: { dayOfWeek: "asc" },
    });
    expect(copied.map((c) => [c.dayOfWeek, c.type, c.durationMin])).toEqual([
      [2, "Incline Walk", 20],
      [6, "Bike", 30],
    ]);
    expect(await prisma().cardioLog.count({ where: { mesocycleId: id } })).toBe(
      0,
    );
    expect(await prisma().cardioLog.count()).toBe(1);
    // The source plan is untouched.
    expect(
      await prisma().plannedCardio.count({
        where: { mesocycleId: mesocycle.id },
      }),
    ).toBe(2);
  });
});
