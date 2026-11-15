import type { Account } from "@/lib/data/account";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { getWorkout, type ExerciseCardDto } from "@/lib/logging/queries";
import { cloneMesocycle } from "@/lib/plan/mesocycles";
import { createTestAccount, defaultAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import { createTestExercise } from "./support/plan-factories";
import {
  logWorkout,
  SAT,
  twoWorkoutBlock,
  WED,
  WED_DELOAD,
} from "./support/recurring-fixtures";

/**
 * Prescription-Aware Intelligence — the exercise card (spec §7.2, §13;
 * scenarios A–F, I, K, L). Every workout is logged through the real write
 * paths; the card is read through getWorkout. The card's weight is only ever
 * a weight lifted before in this recurring workout at a comparable
 * prescription; anything else is reference; the gym baseline is not a source.
 */
let account: Account;
const db = () => getTestPrisma();

beforeEach(async () => {
  account = await defaultAccount();
});

type Block = Awaited<ReturnType<typeof twoWorkoutBlock>>;

async function cardFor(
  acct: Account,
  b: Block,
  sessionId: string,
  date: string,
): Promise<ExerciseCardDto> {
  const { loggedSessionId } = await startOrResumeWorkout(acct, {
    sessionId,
    scheduledFor: date,
    gymId: b.gym.id,
  });
  const w = await getWorkout(acct, loggedSessionId);
  const card = w?.exercises.find(
    (e) => e.performedExerciseId === b.exercise.id,
  );
  if (!card) throw new Error("card not found");
  return card;
}

const log = (
  acct: Account,
  b: Block,
  sessionId: string,
  date: string,
  sets: [number | null, number][],
) =>
  logWorkout(acct, {
    sessionId,
    date,
    gymId: b.gym.id,
    exerciseId: b.exercise.id,
    sets,
  });

const heavy: [number, number][] = [
  [255, 5],
  [255, 5],
  [255, 4],
];
const volume: [number, number][] = [
  [230, 8],
  [230, 7],
  [230, 7],
];

describe("Scenario A — first Saturday, no history", () => {
  it("offers nothing and invents nothing", async () => {
    const b = await twoWorkoutBlock(account);
    const card = await cardFor(account, b, b.push.id, SAT[0]);
    expect(card).toMatchObject({
      suggestedWeightLbs: null,
      previousPerformance: null,
      referencePerformance: null,
      weightContext: "none",
      workingWeightFromBaseline: false,
    });
  });
});

describe("Scenario B — first Wednesday after Saturday's 255", () => {
  it("leaves the box empty and shows Push only as reference", async () => {
    const b = await twoWorkoutBlock(account);
    await log(account, b, b.push.id, SAT[0], heavy);
    const card = await cardFor(account, b, b.upper.id, WED[1]);
    expect(card.suggestedWeightLbs).toBeNull();
    expect(card.previousPerformance).toBeNull();
    expect(card.weightContext).toBe("reference_only");
    expect(card.referencePerformance).toMatchObject({
      dateIso: SAT[0],
      sessionName: "Push",
      repRange: { min: 3, max: 5 },
    });
    expect(card.referencePerformance?.sets.map((s) => s.weightLbs)).toEqual([
      255, 255, 255,
    ]);
  });
});

describe("Scenario C — each workout recovers its own weight", () => {
  it("Saturday offers 255 from Push and Wednesday 230 from Upper", async () => {
    const b = await twoWorkoutBlock(account);
    await log(account, b, b.push.id, SAT[0], heavy);
    await log(account, b, b.upper.id, WED[1], volume);
    await log(account, b, b.push.id, SAT[1], heavy);

    const wed = await cardFor(account, b, b.upper.id, WED[2]);
    expect(wed.suggestedWeightLbs).toBe(230);
    expect(wed.weightContext).toBe("trusted");
    expect(wed.previousPerformance).toMatchObject({
      dateIso: WED[1],
      sessionName: "Upper",
      repRange: { min: 6, max: 8 },
    });
    expect(wed.referencePerformance).toBeNull();

    await log(account, b, b.upper.id, WED[2], volume);
    const sat = await cardFor(account, b, b.push.id, SAT[2]);
    expect(sat.suggestedWeightLbs).toBe(255);
    expect(sat.previousPerformance).toMatchObject({
      dateIso: SAT[1],
      sessionName: "Push",
    });
  });

  it("the card's offer is Free (prefill and reference are capture, not Pro)", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b = await twoWorkoutBlock(free);
    await log(free, b, b.push.id, SAT[0], heavy);
    await log(free, b, b.upper.id, WED[1], volume);
    expect(
      (await cardFor(free, b, b.upper.id, WED[2])).suggestedWeightLbs,
    ).toBe(230);
    const sat = await cardFor(free, b, b.push.id, SAT[1]);
    expect(sat.suggestedWeightLbs).toBe(255);
  });
});

describe("Scenario D — same machine, same gym, two workouts", () => {
  it("each workout offers its own weight; a baseline correction dictates neither", async () => {
    const b = await twoWorkoutBlock(account, {
      equipmentType: "machine",
      name: "Hip Abduction Machine",
      push: { reps: [12, 15], sets: 2 },
      upper: { reps: [12, 15], sets: 2 },
    });
    await log(account, b, b.upper.id, WED[0], [
      [100, 15],
      [100, 14],
    ]);
    // 20% lighter on the other day: the baseline write path still corrects.
    await log(account, b, b.push.id, SAT[0], [
      [80, 15],
      [80, 15],
    ]);
    const baseline = await db().gymExerciseBaseline.findUniqueOrThrow({
      where: {
        gymId_exerciseId: { gymId: b.gym.id, exerciseId: b.exercise.id },
      },
    });
    expect(Number(baseline.weightLbs)).toBe(80);

    const wed = await cardFor(account, b, b.upper.id, WED[1]);
    expect(wed.suggestedWeightLbs).toBe(100);
    expect(wed.workingWeightFromBaseline).toBe(false);
    const sat = await cardFor(account, b, b.push.id, SAT[1]);
    expect(sat.suggestedWeightLbs).toBe(80);
  });
});

describe("Scenario E — machine progression without the baseline lag", () => {
  it("offers the latest comparable 55 lb, not the sticky 50 lb baseline", async () => {
    const b = await twoWorkoutBlock(account, {
      equipmentType: "cable",
      name: "Triceps Pushdown",
      upper: { reps: [10, 12] },
    });
    await log(account, b, b.upper.id, WED[0], [
      [50, 12],
      [50, 12],
      [50, 12],
    ]);
    await log(account, b, b.upper.id, WED[1], [
      [55, 12],
      [55, 11],
      [55, 10],
    ]);
    // 10% is below the correction threshold: the baseline stays 50 (writes
    // unchanged) — and the card no longer reads it.
    const baseline = await db().gymExerciseBaseline.findUniqueOrThrow({
      where: {
        gymId_exerciseId: { gymId: b.gym.id, exerciseId: b.exercise.id },
      },
    });
    expect(Number(baseline.weightLbs)).toBe(50);
    const card = await cardFor(account, b, b.upper.id, WED[2]);
    expect(card.suggestedWeightLbs).toBe(55);
  });
});

describe("Scenario F — an off day is not interpreted", () => {
  it("offers the latest comparable 45 lb; the 55 lb workout stays in history", async () => {
    const b = await twoWorkoutBlock(account, {
      equipmentType: "machine",
      name: "Machine Shoulder Press",
      upper: { reps: [6, 10], sets: 2 },
    });
    await log(account, b, b.upper.id, WED[0], [
      [55, 10],
      [55, 9],
    ]);
    await log(account, b, b.upper.id, WED[1], [
      [45, 8],
      [45, 8],
    ]);
    const card = await cardFor(account, b, b.upper.id, WED[2]);
    expect(card.suggestedWeightLbs).toBe(45);
    expect(card.previousPerformance?.dateIso).toBe(WED[1]);
    expect(
      await db().loggedSet.count({
        where: {
          weightLbs: 55,
          loggedExercise: { exerciseId: b.exercise.id },
        },
      }),
    ).toBe(2);
  });
});

describe("Scenario I (card) — a scheduled-deload week", () => {
  it("never prefills a normal week's load; the normal week is reference", async () => {
    const b = await twoWorkoutBlock(account);
    await log(account, b, b.upper.id, WED[2], volume);
    await log(account, b, b.upper.id, WED[3], volume);
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId: b.upper.id,
      scheduledFor: WED_DELOAD,
      gymId: b.gym.id,
    });
    const w = await getWorkout(account, loggedSessionId);
    expect(w?.scheduledDeloadWeek).toBe(true);
    const card = w!.exercises[0];
    expect(card.suggestedWeightLbs).toBeNull();
    expect(card.weightContext).toBe("reference_only");
    expect(card.referencePerformance).toMatchObject({
      dateIso: WED[3],
      sessionName: "Upper",
    });
  });
});

describe("Scenario K — rename, move, and clone keep the recurring workout", () => {
  it("the next block's renamed, moved workout offers its own last weight", async () => {
    const b = await twoWorkoutBlock(account);
    await log(account, b, b.upper.id, WED[3], volume);
    const { id } = await cloneMesocycle(account, {
      sourceMesocycleId: b.meso.id,
      name: "Block 3",
      startDate: "2026-11-09",
      lengthWeeks: "5",
      deloadEveryWeeks: "5",
    });
    await db().mesocycle.update({
      where: { id: b.meso.id },
      data: { status: "archived" },
    });
    await db().mesocycle.update({
      where: { id },
      data: { status: "active" },
    });
    const upper3 = await db().session.findFirstOrThrow({
      where: { mesocycleId: id, name: "Upper" },
    });
    await db().session.update({
      where: { id: upper3.id },
      data: { name: "Upper A", dayOfWeek: 4 },
    });
    const card = await cardFor(account, b, upper3.id, "2026-11-12");
    expect(card.suggestedWeightLbs).toBe(230);
    // Old history keeps its own block's name.
    expect(card.previousPerformance).toMatchObject({
      dateIso: WED[3],
      sessionName: "Upper",
    });
  });

  it("a rep range changed in the next block is reference only", async () => {
    const b = await twoWorkoutBlock(account);
    await log(account, b, b.upper.id, WED[3], volume);
    const { id } = await cloneMesocycle(account, {
      sourceMesocycleId: b.meso.id,
      name: "Block 3",
      startDate: "2026-11-09",
      lengthWeeks: "5",
      deloadEveryWeeks: "5",
    });
    await db().mesocycle.update({
      where: { id: b.meso.id },
      data: { status: "archived" },
    });
    await db().mesocycle.update({ where: { id }, data: { status: "active" } });
    const upper3 = await db().session.findFirstOrThrow({
      where: { mesocycleId: id, name: "Upper" },
    });
    await db().sessionExercise.updateMany({
      where: { sessionId: upper3.id },
      data: { targetRepMin: 8, targetRepMax: 10 },
    });
    const card = await cardFor(account, b, upper3.id, "2026-11-11");
    expect(card.suggestedWeightLbs).toBeNull();
    expect(card.referencePerformance).toMatchObject({
      dateIso: WED[3],
      repRange: { min: 6, max: 8 },
    });
  });
});

describe("Scenario L — no cross-account inference", () => {
  it("another account with the same library exercise and a forged lineage sees nothing", async () => {
    const lib = await createTestExercise({
      isCustom: false,
      sourceId: "test-library-bench",
      name: "Barbell Bench Press",
      equipmentType: "barbell",
    });
    const a = await twoWorkoutBlock(account, { exercise: lib });
    await log(account, a, a.upper.id, WED[0], volume);

    const other = await createTestAccount();
    const b = await twoWorkoutBlock(other, {
      exercise: lib,
      lineage: { push: a.push.lineageId, upper: a.upper.lineageId },
    });
    expect(b.upper.lineageId).toBe(a.upper.lineageId);
    const card = await cardFor(other, b, b.upper.id, WED[1]);
    expect(card).toMatchObject({
      suggestedWeightLbs: null,
      previousPerformance: null,
      referencePerformance: null,
      weightContext: "none",
    });
    // And the first account still sees its own history.
    expect(
      (await cardFor(account, a, a.upper.id, WED[1])).suggestedWeightLbs,
    ).toBe(230);
  });
});

describe("review of #227 — weightContext", () => {
  it("a bodyweight exercise with a comparable last time is 'trusted' with no weight", async () => {
    const b = await twoWorkoutBlock(account, {
      equipmentType: "bodyweight",
      name: "Pull-Ups",
      upper: { reps: [6, 10] },
    });
    await log(account, b, b.upper.id, WED[0], [
      [null, 8],
      [null, 7],
      [null, 7],
    ]);
    const card = await cardFor(account, b, b.upper.id, WED[1]);
    expect(card.suggestedWeightLbs).toBeNull();
    expect(card.previousPerformance?.sessionName).toBe("Upper");
    expect(card.weightContext).toBe("trusted");
  });
});
