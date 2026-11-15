import type { Account } from "@/lib/data/account";
import { cloneMesocycle } from "@/lib/plan/mesocycles";
import { gatherRows } from "@/lib/progression/queries";
import { anchorOfRow, segmentRows } from "@/lib/progression/recurring";
import { prescriptionOf } from "@overload/shared/progression/recurring";
import { defaultAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  logWorkout,
  SAT,
  twoWorkoutBlock,
  WED,
} from "./support/recurring-fixtures";

/**
 * Prescription-Aware Intelligence (spec §7.1; OVE-193): gathered rows carry
 * their workout's lineage and name, and the shared segment rule picks one
 * recurring exercise's comparable run out of an exercise's history.
 */
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

it("rows carry the workout's lineage and name; a segment keeps one recurring workout", async () => {
  const b = await twoWorkoutBlock(account);
  const common = { gymId: b.gym.id, exerciseId: b.exercise.id };
  await logWorkout(account, {
    ...common,
    sessionId: b.upper.id,
    date: WED[0],
    sets: [
      [230, 8],
      [230, 7],
      [230, 7],
    ],
  });
  await logWorkout(account, {
    ...common,
    sessionId: b.push.id,
    date: SAT[0],
    sets: [
      [255, 5],
      [255, 5],
      [255, 4],
    ],
  });

  const rows = await gatherRows(account, b.exercise.id);
  const byName = Object.fromEntries(rows.map((r) => [r.sessionName, r]));
  expect(byName.Push.lineageId).toBe(b.push.lineageId);
  expect(byName.Upper.lineageId).toBe(b.upper.lineageId);
  expect(byName.Push.createdAtIso).toMatch(/^\d{4}-\d\d-\d\dT/);

  const upperSeg = segmentRows(rows, b.exercise.id, {
    key: {
      lineageId: b.upper.lineageId,
      exerciseId: b.exercise.id,
      gymId: b.gym.id,
    },
    prescription: prescriptionOf({ targetRepMin: 6, targetRepMax: 8 }),
    gymVariable: false,
  });
  expect(upperSeg.map((r) => r.sessionName)).toEqual(["Upper"]);
  expect(
    segmentRows(
      rows,
      b.exercise.id,
      anchorOfRow(byName.Push, b.exercise.id, false),
    ),
  ).toEqual([byName.Push]);
});

it("a cloned block's workout continues its source's segment", async () => {
  const b = await twoWorkoutBlock(account);
  await logWorkout(account, {
    sessionId: b.upper.id,
    date: WED[0],
    gymId: b.gym.id,
    exerciseId: b.exercise.id,
    sets: [
      [230, 8],
      [230, 8],
      [230, 8],
    ],
  });
  await getTestPrisma().mesocycle.update({
    where: { id: b.meso.id },
    data: { status: "archived" },
  });
  const { id } = await cloneMesocycle(account, {
    sourceMesocycleId: b.meso.id,
    name: "Block 3",
    startDate: "2026-11-09",
    lengthWeeks: "5",
    deloadEveryWeeks: "5",
  });
  const upper3 = await getTestPrisma().session.findFirstOrThrow({
    where: { mesocycleId: id, name: "Upper" },
  });
  const rows = await gatherRows(account, b.exercise.id);
  const anchor = {
    key: {
      lineageId: upper3.lineageId,
      exerciseId: b.exercise.id,
      gymId: b.gym.id,
    },
    prescription: prescriptionOf({ targetRepMin: 6, targetRepMax: 8 }),
    gymVariable: false,
  };
  expect(segmentRows(rows, b.exercise.id, anchor)).toHaveLength(1);
  // The same workout at a new rep range has nothing comparable yet.
  expect(
    segmentRows(rows, b.exercise.id, {
      ...anchor,
      prescription: prescriptionOf({ targetRepMin: 8, targetRepMax: 10 }),
    }),
  ).toEqual([]);
});
