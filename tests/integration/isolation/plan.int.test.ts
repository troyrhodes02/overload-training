import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import {
  activateMesocycle,
  archiveDraftMesocycle,
  cloneMesocycle,
  createMesocycle,
  updateMesocycleDetails,
} from "@/lib/plan/mesocycles";
import {
  addSession,
  addSessionExercise,
  duplicateSession,
  moveSession,
  moveSessionExercise,
  removeSession,
  removeSessionExercise,
  renameSession,
  replaceSessionExercise,
  updateSessionExercise,
} from "@/lib/plan/sessions";
import {
  addPlannedCardio,
  removePlannedCardio,
  updatePlannedCardio,
} from "@/lib/plan/cardio";
import {
  getCloneSetup,
  getMesocycleWeek,
  getSessionDetail,
  hasCloneSource,
  listCloneSources,
  listMesocyclesForHome,
} from "@/lib/plan/queries";
import { createCustomExercise } from "@/lib/exercises/exercises";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import {
  expectForeignLikeMissing,
  ownedRowCount,
  snapshotAccount,
} from "./support";

/**
 * Cross-account isolation — the plan domain (Mesocycle, Session,
 * SessionExercise, PlannedCardio). Account A builds a real plan through the
 * write modules; Account B then tries every read and write path against it.
 */

const details = (name: string) => ({
  name,
  startDate: "2026-11-02",
  lengthWeeks: "5",
  deloadEveryWeeks: "5",
});

async function libraryExercise(name: string) {
  return getTestPrisma().exercise.create({
    data: {
      name,
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
}

/** A's plan: an active block (Push + slot + cardio) and a draft (empty Pull). */
async function buildPlan(a: Account) {
  const bench = await libraryExercise("Barbell Bench Press");
  const custom = await createCustomExercise(a, {
    name: "Landmine Press",
    primaryMuscle: "shoulders",
    equipmentType: "other",
  });
  const active = await createMesocycle(a, {
    ...details("A Strength"),
    splitType: "custom",
  });
  const push = await addSession(a, {
    mesocycleId: active.id,
    name: "Push",
    dayOfWeek: 1,
  });
  const slot = await addSessionExercise(a, {
    sessionId: push.id,
    exerciseId: custom.id,
    plannedSets: "3",
    targetRepMin: "6",
    targetRepMax: "8",
  });
  await addSessionExercise(a, {
    sessionId: push.id,
    exerciseId: bench.id,
    plannedSets: "3",
    targetRepMin: "5",
    targetRepMax: "5",
  });
  const cardio = await addPlannedCardio(a, {
    mesocycleId: active.id,
    dayOfWeek: 2,
    type: "Incline walk",
    durationMin: "30",
  });
  await activateMesocycle(a, {
    mesocycleId: active.id,
    expectedActiveId: null,
  });
  const draft = await createMesocycle(a, {
    ...details("A Draft"),
    splitType: "custom",
  });
  const pull = await addSession(a, {
    mesocycleId: draft.id,
    name: "Pull",
    dayOfWeek: 3,
  });
  return { bench, custom, active, draft, push, pull, slot, cardio };
}

let a: Account;
let b: Account;
let plan: Awaited<ReturnType<typeof buildPlan>>;

beforeEach(async () => {
  a = await createTestAccount("America/Chicago");
  b = await createTestAccount("Europe/Berlin");
  plan = await buildPlan(a);
});

describe("plan reads never show another account's blocks", () => {
  it("lists are empty for a second account", async () => {
    expect(await listMesocyclesForHome(b)).toEqual({
      active: null,
      drafts: [],
      previous: [],
    });
    expect(await hasCloneSource(b)).toBe(false);
    expect(await listCloneSources(b)).toEqual([]);
    // …while the owner still sees everything.
    expect((await listMesocyclesForHome(a)).active?.id).toBe(plan.active.id);
  });

  it("a block, session, or clone setup by foreign id is not found", async () => {
    expect(
      await expectForeignLikeMissing(plan.active.id, (id) =>
        getMesocycleWeek(b, id),
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      await expectForeignLikeMissing(plan.push.id, (id) =>
        getSessionDetail(b, plan.active.id, id),
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      await expectForeignLikeMissing(plan.active.id, (id) =>
        getCloneSetup(b, id),
      ),
    ).toEqual({ ok: true, value: null });
  });
});

describe("plan writes with another account's ids behave like missing ids and change nothing", () => {
  it("every mesocycle, session, slot, and cardio write", async () => {
    const before = await snapshotAccount(a.userId);
    const cases: [string, (id: string) => Promise<unknown>][] = [
      [
        plan.active.id,
        (id) => updateMesocycleDetails(b, { mesocycleId: id, ...details("x") }),
      ],
      [
        plan.draft.id,
        (id) =>
          activateMesocycle(b, { mesocycleId: id, expectedActiveId: null }),
      ],
      [plan.draft.id, (id) => archiveDraftMesocycle(b, { mesocycleId: id })],
      [
        plan.active.id,
        (id) =>
          cloneMesocycle(b, { sourceMesocycleId: id, ...details("Stolen") }),
      ],
      [
        plan.active.id,
        (id) => addSession(b, { mesocycleId: id, name: "x", dayOfWeek: 4 }),
      ],
      [
        plan.push.id,
        (id) => renameSession(b, { sessionId: id, name: "Hijacked" }),
      ],
      [plan.push.id, (id) => moveSession(b, { sessionId: id, dayOfWeek: 6 })],
      [
        plan.push.id,
        (id) => duplicateSession(b, { sessionId: id, dayOfWeek: 6 }),
      ],
      [plan.pull.id, (id) => removeSession(b, { sessionId: id })],
      [
        plan.push.id,
        (id) =>
          addSessionExercise(b, {
            sessionId: id,
            exerciseId: plan.bench.id,
            plannedSets: "3",
            targetRepMin: "5",
            targetRepMax: "5",
          }),
      ],
      [
        plan.slot.id,
        (id) =>
          updateSessionExercise(b, {
            sessionExerciseId: id,
            plannedSets: "9",
            targetRepMin: "1",
            targetRepMax: "2",
          }),
      ],
      [
        plan.slot.id,
        (id) =>
          replaceSessionExercise(b, {
            sessionExerciseId: id,
            exerciseId: plan.bench.id,
          }),
      ],
      [
        plan.slot.id,
        (id) =>
          moveSessionExercise(b, { sessionExerciseId: id, direction: "down" }),
      ],
      [
        plan.slot.id,
        (id) => removeSessionExercise(b, { sessionExerciseId: id }),
      ],
      [
        plan.active.id,
        (id) =>
          addPlannedCardio(b, {
            mesocycleId: id,
            dayOfWeek: 5,
            type: "Bike",
            durationMin: "10",
          }),
      ],
      [
        plan.cardio.id,
        (id) =>
          updatePlannedCardio(b, {
            plannedCardioId: id,
            dayOfWeek: 2,
            type: "Hijacked",
            durationMin: "99",
          }),
      ],
      [plan.cardio.id, (id) => removePlannedCardio(b, { plannedCardioId: id })],
    ];
    for (const [foreignId, call] of cases) {
      const result = await expectForeignLikeMissing(foreignId, call);
      expect(result).toMatchObject({ ok: false, code: "not_found" });
    }
    expect(await snapshotAccount(a.userId)).toEqual(before);
    // B wrote nothing at all (its profile is its only row).
    expect(await ownedRowCount(b.userId)).toBe(1);
  });

  it("another account's custom exercise can't be planned (same as a missing exercise)", async () => {
    const own = await createMesocycle(b, {
      ...details("B Block"),
      splitType: "custom",
    });
    const session = await addSession(b, {
      mesocycleId: own.id,
      name: "B Push",
      dayOfWeek: 1,
    });
    const result = await expectForeignLikeMissing(plan.custom.id, (id) =>
      addSessionExercise(b, {
        sessionId: session.id,
        exerciseId: id,
        plannedSets: "3",
        targetRepMin: "6",
        targetRepMax: "8",
      }),
    );
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    // The shared library exercise is fine to plan.
    await addSessionExercise(b, {
      sessionId: session.id,
      exerciseId: plan.bench.id,
      plannedSets: "3",
      targetRepMin: "5",
      targetRepMax: "5",
    });
  });
});

describe("per-account plan rules", () => {
  // "Each account may have its own active mesocycle" needs the per-account
  // unique index from 10_account_ownership_enforce; it lives in
  // ownership-enforce.int.test.ts (OVE-40).

  it("rows a second account creates are owned by it, never by the first", async () => {
    const own = await createMesocycle(b, {
      ...details("B Block"),
      splitType: "ppl",
    });
    const rows = await getTestPrisma().session.findMany({
      where: { mesocycleId: own.id },
      select: { userId: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId === b.userId)).toBe(true);
    const meso = await getTestPrisma().mesocycle.findUniqueOrThrow({
      where: { id: own.id },
    });
    expect(meso.userId).toBe(b.userId);
  });

  it("clone-forward copies only the acting account's plan", async () => {
    const clone = await cloneMesocycle(a, {
      sourceMesocycleId: plan.active.id,
      ...details("A Next"),
    });
    const rows = await getTestPrisma().sessionExercise.findMany({
      where: { session: { mesocycleId: clone.id } },
      select: { userId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === a.userId)).toBe(true);
  });
});
