import {
  applyImport,
  inspect,
  verifyImport,
} from "../../scripts/import/real-plan/import";
import { planExercises } from "../../scripts/import/real-plan/plan";
import { getTestPrisma } from "./support/db";
import { createTestMesocycle } from "./support/plan-factories";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: the import targets the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * The one-time real-plan import (scripts/import/real-plan), run end to end
 * against the THROWAWAY test database only: a clean dry run, one-transaction
 * apply through the app's write modules, verification, idempotent re-run, and
 * refusal when an active plan already exists.
 */
const prisma = () => getTestPrisma();

/** Equipment/muscle for the library rows the plan references. */
const LIBRARY_META: Record<string, [string, string]> = {
  "Barbell_Bench_Press_-_Medium_Grip": ["barbell", "chest"],
  Incline_Dumbbell_Press: ["dumbbell", "chest"],
  Machine_Shoulder_Military_Press: ["machine", "shoulders"],
  "Triceps_Pushdown_-_Rope_Attachment": ["cable", "triceps"],
  Pullups: ["bodyweight", "back"],
  Bent_Over_Barbell_Row: ["barbell", "back"],
  Leverage_Iso_Row: ["machine", "back"],
  "Wide-Grip_Lat_Pulldown": ["cable", "back"],
  Reverse_Machine_Flyes: ["machine", "shoulders"],
  Incline_Dumbbell_Curl: ["dumbbell", "biceps"],
  Hammer_Curls: ["dumbbell", "biceps"],
  Hack_Squat: ["machine", "quads"],
  Romanian_Deadlift: ["barbell", "hamstrings"],
  Leg_Press: ["machine", "quads"],
  Seated_Leg_Curl: ["machine", "hamstrings"],
  Standing_Calf_Raises: ["machine", "calves"],
  "Sit-Up": ["bodyweight", "core"],
  Dumbbell_Side_Bend: ["dumbbell", "core"],
  Smith_Machine_Incline_Bench_Press: ["machine", "chest"],
  Leverage_Chest_Press: ["machine", "chest"],
  Butterfly: ["machine", "chest"],
  "EZ-Bar_Skullcrusher": ["ez_bar", "triceps"],
  Triceps_Pushdown: ["cable", "triceps"],
  Crunches: ["bodyweight", "core"],
  Russian_Twist: ["bodyweight", "core"],
  "V-Bar_Pulldown": ["cable", "back"],
  "One-Arm_Dumbbell_Row": ["dumbbell", "back"],
  Seated_Cable_Rows: ["cable", "back"],
  "Straight-Arm_Pulldown": ["cable", "back"],
  Cable_Rear_Delt_Fly: ["cable", "shoulders"],
  Preacher_Curl: ["barbell", "biceps"],
  Standing_Biceps_Cable_Curl: ["cable", "biceps"],
  Barbell_Hip_Thrust: ["barbell", "glutes"],
  Leg_Extensions: ["machine", "quads"],
  Seated_Calf_Raise: ["machine", "calves"],
};

beforeEach(async () => {
  const library = planExercises().flatMap((e) =>
    e.kind === "library" ? [e] : [],
  );
  await prisma().exercise.createMany({
    data: library.map((e) => ({
      name: e.name,
      sourceId: e.sourceId,
      equipmentType: LIBRARY_META[e.sourceId][0] as never,
      primaryMuscle: LIBRARY_META[e.sourceId][1] as never,
      isCustom: false,
    })),
  });
});

describe("real-plan import (throwaway database only)", () => {
  it("dry run is read-only and clean on an empty account", async () => {
    const ins = await inspect(prisma(), account);
    expect(ins.blockers).toEqual([]);
    expect(ins.alreadyImported).toBe(false);
    expect(ins.gyms.map((g) => g.action)).toEqual(["create", "create"]);
    expect(
      ins.exercises
        .filter((e) => e.match === "create-custom")
        .map((e) => e.productionName),
    ).toEqual([
      "Cable Lateral Raise",
      "Machine Tricep Pushdown",
      "Smith Machine Bulgarian Split Squat",
    ]);
    expect(await prisma().mesocycle.count()).toBe(0);
    expect(await prisma().gym.count()).toBe(0);
  });

  it("applies in one transaction, verifies, and creates no history", async () => {
    // A pre-existing gym (case-insensitive match) is reused, not duplicated.
    await prisma().gym.create({
      data: { userId: account.userId, name: "eos desoto" },
    });
    const ins = await inspect(prisma(), account);
    expect(ins.gyms[0]).toMatchObject({ action: "reuse" });
    const result = await applyImport(account, ins);
    expect(await verifyImport(prisma(), account, ins, result)).toEqual([]);

    expect(await prisma().gym.count()).toBe(2);
    const blocks = await prisma().mesocycle.findMany({
      orderBy: { name: "asc" },
    });
    expect(blocks.map((b) => [b.name, b.status])).toEqual([
      ["Fall 2026 — Block 1", "active"],
      ["Winter 2026 — Block 2", "draft"],
    ]);
    expect(await prisma().sessionExercise.count()).toBe(2 * 43);
    expect(await prisma().plannedCardio.count()).toBe(8);
    for (const n of [
      await prisma().loggedSession.count(),
      await prisma().loggedSet.count(),
      await prisma().gymExerciseBaseline.count(),
      await prisma().goal.count(),
      await prisma().cardioLog.count(),
    ])
      expect(n).toBe(0);

    // A second run recognizes the finished import and writes nothing.
    const again = await inspect(prisma(), account);
    expect(again.alreadyImported).toBe(true);
    await expect(applyImport(account, again)).rejects.toThrow(
      /already imported/,
    );
  });

  it("refuses when an active plan already exists", async () => {
    await createTestMesocycle({ status: "active", name: "Something Else" });
    const ins = await inspect(prisma(), account);
    expect(ins.blockers.join("\n")).toMatch(
      /An active mesocycle already exists/,
    );
    await expect(applyImport(account, ins)).rejects.toThrow(
      /Refusing to apply/,
    );
    expect(await prisma().mesocycle.count()).toBe(1);
  });
});
