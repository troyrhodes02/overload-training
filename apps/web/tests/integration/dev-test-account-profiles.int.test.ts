/**
 * Pitch 21g (OVE-227; spec §11, RD-15): every test-account profile is proven
 * through the REAL engine, not by its name. Each profile's fixture is seeded
 * into a fresh account on a throwaway Postgres through the application's own
 * write modules, today's workout is started exactly as the phone starts it,
 * and every expectation is checked against the GATED card reader the mobile
 * API serves (getOccurrenceProgression) — the same call the phone shows.
 */
import { isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { Account } from "@/lib/data/account";
import { getWorkout } from "@/lib/logging/queries";
import { changeGym, startOrResumeWorkout } from "@/lib/logging/sessions";
import { getOccurrenceProgression } from "@/lib/progression/queries";
import { getTodayView } from "@/lib/views/today";
import {
  DEMO_LIBRARY,
  VARIANT_LIBRARY,
  type FixtureExercise,
} from "../../scripts/demo/fixture";
import { executeDemoSeed } from "../../scripts/demo/seed";
import { compareCall } from "../../scripts/dev-test-account/engine-check";
import {
  PROFILE_NAMES,
  anchorFor,
  profileOf,
  type ProfileName,
} from "../../scripts/dev-test-account/profiles";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

const EQUIPMENT: Record<FixtureExercise, string> = {
  BENCH: "barbell",
  OHP: "barbell",
  INCLINE_DB: "dumbbell",
  PULLDOWN: "cable",
  CHEST_PRESS: "machine",
  CABLE_ROW: "cable",
  LATERAL: "dumbbell",
  SQUAT: "barbell",
  RDL: "barbell",
  LEG_PRESS: "machine",
  LEG_CURL: "machine",
  PULLUPS: "bodyweight",
  CRUNCHES: "bodyweight",
};

const LIBRARY = { ...DEMO_LIBRARY, ...VARIANT_LIBRARY } as Record<
  FixtureExercise,
  string
>;

/** The library rows the fixtures plan (the tables are emptied between tests). */
async function seedLibrary() {
  for (const [key, sourceId] of Object.entries(LIBRARY) as [
    FixtureExercise,
    string,
  ][]) {
    await getTestPrisma().exercise.upsert({
      where: { sourceId },
      create: {
        name: sourceId.replace(/_/g, " "),
        sourceId,
        primaryMuscle: "chest",
        equipmentType: EQUIPMENT[key] as never,
        isCustom: false,
      },
      update: {},
    });
  }
}

const TODAY = todayIso("UTC");

/** A fresh account with the profile's plan, seeded at the profile's anchor. */
async function seedProfile(name: ProfileName) {
  const p = profileOf(name);
  await seedLibrary();
  const account = await createTestAccount("UTC", undefined, {
    entitlement: p.access === "free" ? "none" : "pro",
  });
  const anchor = anchorFor(name, TODAY);
  await executeDemoSeed(account, anchor, p.variant);
  return { account, anchor, profile: p };
}

/** Today's workout, started (or resumed) at a gym, as the phone does. */
async function startToday(account: Account, anchor: string, gymName: string) {
  const db = getTestPrisma();
  const gym = await db.gym.findFirstOrThrow({
    where: { userId: account.userId, name: gymName },
  });
  const session = await db.session.findFirstOrThrow({
    where: {
      userId: account.userId,
      mesocycle: { status: "active" },
      dayOfWeek: isoWeekday(anchor),
    },
  });
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: session.id,
    scheduledFor: anchor,
    gymId: gym.id,
  });
  return (await getWorkout(account, loggedSessionId))!;
}

async function cardCall(
  account: Account,
  workout: NonNullable<Awaited<ReturnType<typeof getWorkout>>>,
  ex: FixtureExercise,
) {
  const db = getTestPrisma();
  const exercise = await db.exercise.findUniqueOrThrow({
    where: { sourceId: LIBRARY[ex] },
  });
  const card = workout.exercises.find(
    (e) => e.performedExerciseId === exercise.id,
  );
  if (!card) throw new Error(`${ex} is not in today's workout`);
  return (await getOccurrenceProgression(account, card.loggedExerciseId))!;
}

const WITH_EXPECTATIONS = PROFILE_NAMES.filter(
  (n) => profileOf(n).expect.length > 0,
);

describe("every 21g profile's calls come from the real engine", () => {
  it.each(WITH_EXPECTATIONS)("%s", async (name) => {
    const { account, anchor, profile } = await seedProfile(name);
    const workout = await startToday(account, anchor, "Northside Strength");
    if (profile.deloadWeek !== null) {
      expect(workout.scheduledDeloadWeek).toBe(profile.deloadWeek);
    }
    const problems: string[] = [];
    for (const want of profile.expect) {
      const got = await cardCall(account, workout, want.ex);
      const diff = compareCall(want, got);
      if (diff) problems.push(`${want.ex}: ${diff}`);
      if (want.call === "insufficient") {
        expect(got.insufficientNote).toMatch(
          /^Not enough history yet: 1 of 2 complete sessions\.$/,
        );
      }
      if (want.call === "locked") {
        // Nothing Pro in what a Free account receives.
        expect([got.tag, got.recommendation, got.suggestion]).toEqual([
          null,
          null,
          null,
        ]);
      }
    }
    expect(problems).toEqual([]);
  });

  it("Today's planned list (the command's check) agrees with the card for the standard story", async () => {
    const { account } = await seedProfile("progress");
    const view = await getTodayView(account);
    const bench = await getTestPrisma().exercise.findUniqueOrThrow({
      where: { sourceId: LIBRARY.BENCH },
    });
    const planned = view.plannedProgression.find(
      (p) => p.exerciseId === bench.id,
    )!.progression;
    expect(planned.recommendation?.action).toBe("Try 185 lb today (+5 lb)");
  });
});

describe("profiles that change when the lifter acts", () => {
  it("edit: correcting set 3's reps, then its RIR, moves the call (hold → at the limit → progress)", async () => {
    const { account, anchor } = await seedProfile("edit");
    const workout = await startToday(account, anchor, "Northside Strength");
    const db = getTestPrisma();
    const benchId = (
      await db.exercise.findUniqueOrThrow({
        where: { sourceId: LIBRARY.BENCH },
      })
    ).id;
    // The last finished Upper A's Bench set 3 (180 × 7 at 0 RIR).
    const last = await db.loggedSet.findFirstOrThrow({
      where: {
        userId: account.userId,
        setNumber: 3,
        reps: 7,
        rir: 0,
        loggedExercise: { exerciseId: benchId },
      },
    });
    const { editLoggedSet } = await import("@/lib/logging/logged-sets");
    await editLoggedSet(account, {
      loggedSetId: last.id,
      weightLbs: 180,
      reps: 8,
      rir: 0,
    });
    const atLimit = await cardCall(account, workout, "BENCH");
    expect(atLimit.rirEffect).toBe("held_at_limit");
    expect(atLimit.recommendation?.action).toBe("Stay at 180 lb today");
    await editLoggedSet(account, {
      loggedSetId: last.id,
      weightLbs: 180,
      reps: 8,
      rir: 1,
    });
    const released = await cardCall(account, workout, "BENCH");
    expect(released.tag).toBe("progress");
    expect(released.recommendation?.action).toBe("Try 185 lb today (+5 lb)");
  });

  it("recovery: today's workout is open with Bench sets 1–2 saved, and resuming changes nothing", async () => {
    const { account, anchor } = await seedProfile("recovery");
    const workout = await startToday(account, anchor, "Northside Strength");
    expect(workout.status).toBe("in_progress");
    const bench = workout.exercises[0];
    expect(bench.sets.filter((s) => s.saved).map((s) => s.weightLbs)).toEqual([
      180, 180,
    ]);
    const again = await startToday(account, anchor, "Northside Strength");
    expect(again.loggedSessionId).toBe(workout.loggedSessionId);
  });

  it("gym: the machine's call follows the workout's gym (Northside, Riverside, Harbor)", async () => {
    const { account, anchor } = await seedProfile("gym");
    const workout = await startToday(account, anchor, "Northside Strength");
    const northside = await cardCall(account, workout, "CHEST_PRESS");
    expect(northside.recommendation).not.toBeNull();
    expect(northside.recommendation?.evidence).toContain("Northside Strength");

    const db = getTestPrisma();
    for (const [gymName, line] of [
      [
        "Riverside Fitness",
        "Not enough history yet at Riverside Fitness: 1 of 2 complete sessions.",
      ],
      [
        "Harbor Barbell",
        "Not enough history yet at Harbor Barbell: 0 of 2 complete sessions.",
      ],
    ] as const) {
      const gym = await db.gym.findFirstOrThrow({
        where: { userId: account.userId, name: gymName },
      });
      await changeGym(account, {
        loggedSessionId: workout.loggedSessionId,
        gymId: gym.id,
      });
      const there = await cardCall(account, workout, "CHEST_PRESS");
      expect(there.recommendation).toBeNull();
      expect(there.insufficientNote).toBe(line);
    }
  });
});

describe("--access: the dev-only Pro ↔ Free switch (RD-16)", () => {
  it("free ends the comp (nothing deleted); pro grants a new one; the card follows", async () => {
    const { executeAccess, planAccess } =
      await import("../../scripts/dev-test-account/access");
    const db = getTestPrisma();
    const { account, anchor } = await seedProfile("entitlement");
    const workout = await startToday(account, anchor, "Northside Strength");
    expect((await cardCall(account, workout, "BENCH")).tag).toBe("progress");

    const toFree = await planAccess(db, account.userId, "free");
    expect([toFree.action, toFree.refusal]).toEqual(["revoke-comp", null]);
    await executeAccess(db, account.userId, toFree);
    const free = await cardCall(account, workout, "BENCH");
    expect(free.locked).toBe("progression_insights");
    expect(free.recommendation).toBeNull();
    // The comp row is ended, never deleted.
    expect(
      await db.entitlement.count({
        where: { userId: account.userId, revokedAt: { not: null } },
      }),
    ).toBe(1);
    expect((await planAccess(db, account.userId, "free")).action).toBe(
      "nothing",
    );

    const toPro = await planAccess(db, account.userId, "pro");
    expect(toPro.action).toBe("grant-comp");
    await executeAccess(db, account.userId, toPro);
    expect((await cardCall(account, workout, "BENCH")).tag).toBe("progress");
  });

  it("refuses an account whose plan doesn't come from comp alone (a trial)", async () => {
    const { planAccess } =
      await import("../../scripts/dev-test-account/access");
    const db = getTestPrisma();
    const account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await db.entitlement.create({
      data: {
        userId: account.userId,
        source: "trial",
        plan: "pro",
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    const plan = await planAccess(db, account.userId, "free");
    expect(plan.refusal).toMatch(/active trial/);
  });
});
