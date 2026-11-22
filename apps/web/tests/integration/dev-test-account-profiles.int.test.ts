/**
 * Pitch 21g (OVE-227; spec §11, RD-15): every test-account profile is proven
 * through the REAL engine, not by its name. Each profile's fixture is seeded
 * into a fresh account on a throwaway Postgres through the application's own
 * write modules, today's workout is started exactly as the phone starts it,
 * and every expectation is checked against the GATED card reader the mobile
 * API serves (getOccurrenceProgression) — the same call the phone shows.
 */
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
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

// Profiles anchored before today (an unfinished workout behind today's) are
// proven by their own tests below: "today's workout" isn't the anchor's.
const WITH_EXPECTATIONS = PROFILE_NAMES.filter(
  (n) => profileOf(n).expect.length > 0 && profileOf(n).anchorOffsetDays === 0,
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

describe("Pitch 21g final-correction profiles (OVE-231)", () => {
  it("every one passes the command's own engine check", async () => {
    const { engineReport } =
      await import("../../scripts/dev-test-account/engine-report");
    for (const name of [
      "unfinished",
      "multiple-unfinished",
      "weight-clarity",
      "deload-clarity",
      "parity-free",
      "parity-summary",
    ] as const) {
      const { account, profile } = await seedProfile(name);
      const report = await engineReport(account, profile);
      expect([name, report.problems]).toEqual([name, []]);
    }
  });

  it("unfinished: yesterday's Upper A (Bench 180 × 8, 8) is listed; today's Lower A is ready", async () => {
    const { account, anchor } = await seedProfile("unfinished");
    const view = await getTodayView(account);
    expect(view.dashboard.kind).toBe("pending");
    if (view.dashboard.kind !== "pending") throw new Error("pending");
    expect(view.dashboard.sessionName).toBe("Lower A");
    expect(view.unfinishedWorkouts).toMatchObject([
      { sessionName: "Upper A", scheduledFor: anchor, setsLogged: 2 },
    ]);
  });

  it("multiple-unfinished: two earlier workouts, newest first, on a rest day", async () => {
    const { account, anchor } = await seedProfile("multiple-unfinished");
    const view = await getTodayView(account);
    expect(view.dashboard.kind).toBe("rest");
    expect(
      view.unfinishedWorkouts?.map((w) => [
        w.sessionName,
        w.scheduledFor,
        w.setsLogged,
      ]),
    ).toEqual([
      ["Lower A", addDays(anchor, 1), 1],
      ["Upper A", anchor, 2],
    ]);
  });

  it("parity-free: Free, the reminder still shows, and today's calls are withheld", async () => {
    const { account } = await seedProfile("parity-free");
    const view = await getTodayView(account);
    expect(view.unfinishedWorkouts).toHaveLength(1);
    expect(
      view.plannedProgression.every(
        (p) =>
          p.progression.locked === "progression_insights" &&
          p.progression.recommendation === null,
      ),
    ).toBe(true);
  });

  it("weight-clarity: the box shows last time's weight, captioned not adjusted; Use offers only the server's number", async () => {
    const { offerFor } = await import("@overload/shared/logging/set-entry");
    const { weightGuidance, NOT_ADJUSTED_CAPTION } =
      await import("@overload/shared/logging/weight-guidance");
    const { account, anchor } = await seedProfile("weight-clarity");
    const workout = await startToday(account, anchor, "Northside Strength");
    const db = getTestPrisma();
    const guidanceFor = async (ex: FixtureExercise) => {
      const id = (
        await db.exercise.findUniqueOrThrow({
          where: { sourceId: LIBRARY[ex] },
        })
      ).id;
      const card = workout.exercises.find((e) => e.performedExerciseId === id)!;
      const call = (await getOccurrenceProgression(
        account,
        card.loggedExerciseId,
      ))!;
      const offer = offerFor({
        requiresExternalWeight: card.requiresExternalWeight,
        sets: card.sets,
        workingWeightLbs:
          card.weightContext === "trusted" ? card.suggestedWeightLbs : null,
      });
      return {
        offer: offer?.weightLbs ?? null,
        ...weightGuidance({
          offer,
          typed: null,
          callKind: call.recommendation?.kind ?? null,
          suggestedLbs: call.suggestion?.lbs ?? null,
          externalLoad: card.requiresExternalWeight,
          anySaved: false,
        }),
      };
    };
    expect(await guidanceFor("BENCH")).toEqual({
      offer: 180,
      caption: NOT_ADJUSTED_CAPTION,
      use: { lbs: 185, label: "Use 185 lb" },
    });
    expect(await guidanceFor("OHP")).toEqual({
      offer: 115,
      caption: NOT_ADJUSTED_CAPTION,
      use: null,
    });
    expect(await guidanceFor("INCLINE_DB")).toMatchObject({
      offer: 60,
      caption: "last time",
      use: null,
    });
  });

  it("deload-clarity: the box is empty (no earlier deload-week weight) and Use offers the 90% load", async () => {
    const { account, anchor } = await seedProfile("deload-clarity");
    const workout = await startToday(account, anchor, "Northside Strength");
    const db = getTestPrisma();
    const id = (
      await db.exercise.findUniqueOrThrow({
        where: { sourceId: LIBRARY.BENCH },
      })
    ).id;
    const card = workout.exercises.find((e) => e.performedExerciseId === id)!;
    expect(card.weightContext).not.toBe("trusted");
    const call = (await getOccurrenceProgression(
      account,
      card.loggedExerciseId,
    ))!;
    expect(call.suggestion).toEqual({ lbs: 160, kind: "scheduled_deload" });
  });
});

describe("Pitch 21h profiles: resources through the write modules, read back by the app", () => {
  async function seed21h(name: ProfileName) {
    const p = profileOf(name);
    await seedLibrary();
    const account = await createTestAccount("UTC", undefined, {
      entitlement: p.access === "free" ? "none" : "pro",
    });
    const anchor = anchorFor(name, TODAY);
    if (p.seed) await executeDemoSeed(account, anchor, p.variant);
    const { applyResources, resourceReport } =
      await import("../../scripts/dev-test-account/resources");
    if (p.resources) await applyResources(account, p.resources);
    const report = await resourceReport(account, p.resources);
    return { account, anchor, report };
  }

  it.each([
    "no-plan",
    "session-detail",
    "library",
    "custom-exercises",
    "gyms",
    "isolation-resources-a",
    "isolation-resources-b",
  ] as const)("%s passes its resource check", async (name) => {
    const { report } = await seed21h(name);
    expect(report.problems).toEqual([]);
  });

  it("no-plan has no plan, no gyms, and no exercises of its own", async () => {
    const { account, report } = await seed21h("no-plan");
    expect(report.lines[0]).toContain("no active plan");
    const { getPlanOverview } = await import("@/lib/views/plan");
    expect((await getPlanOverview(account)).block).toBeNull();
    expect(
      await getTestPrisma().gym.count({ where: { userId: account.userId } }),
    ).toBe(0);
  });

  it("session-detail: today's Upper A has bodyweight and fixed targets, and planned cardio", async () => {
    const { account } = await seed21h("session-detail");
    const { getPlanOverview, getPlanSession } =
      await import("@/lib/views/plan");
    const overview = await getPlanOverview(account);
    const upperA = overview.block!.template.find((s) => s?.name === "Upper A")!;
    const session = (await getPlanSession(
      account,
      overview.block!.summary.id,
      upperA.id,
    ))!;
    expect(
      session.exercises.map((e) => [
        e.exerciseName,
        e.plannedSets,
        e.targetRepMin,
        e.targetRepMax,
        e.requiresExternalWeight,
      ]),
    ).toEqual([
      [expect.stringContaining("Bench"), 3, 6, 8, true],
      ["Pullups", 3, 8, 10, false],
      [expect.stringContaining("Incline"), 3, 10, 10, true],
      ["Crunches", 3, 15, 15, false],
    ]);
    expect(session.cardio).not.toBeNull();
  });

  it("custom-exercises: yesterday's finished workout performed the custom exercise; one is archived", async () => {
    const { account, anchor, report } = await seed21h("custom-exercises");
    const db = getTestPrisma();
    const custom = await db.exercise.findFirstOrThrow({
      where: { userId: account.userId, name: "Landmine Press" },
    });
    const le = await db.loggedExercise.findFirstOrThrow({
      where: { exerciseId: custom.id },
      include: { loggedSession: true, sets: true },
    });
    expect(le.loggedSession.status).toBe("complete");
    expect(le.loggedSession.scheduledFor.toISOString().slice(0, 10)).toBe(
      anchor,
    );
    expect(le.sets.map((s) => [Number(s.weightLbs), s.reps])).toEqual([
      [95, 10],
      [95, 9],
      [95, 8],
    ]);
    const archived = await db.exercise.findFirstOrThrow({
      where: { userId: account.userId, name: "Cable Y Raise" },
    });
    expect(archived.deletedAt).not.toBeNull();
    expect(report.lines.join("\n")).toContain("Cable Y Raise (archived)");
    // Nothing is left unfinished on Today.
    const today = await getTodayView(account);
    expect(today.unfinishedWorkouts ?? []).toEqual([]);
  });

  it("gyms: Riverside is archived with its history and machine weights kept", async () => {
    const { account, report } = await seed21h("gyms");
    const db = getTestPrisma();
    const riverside = await db.gym.findFirstOrThrow({
      where: { userId: account.userId, name: "Riverside Fitness" },
    });
    expect(riverside.deletedAt).not.toBeNull();
    expect(
      await db.loggedExercise.count({ where: { gymId: riverside.id } }),
    ).toBeGreaterThan(0);
    expect(
      await db.gymExerciseBaseline.count({ where: { gymId: riverside.id } }),
    ).toBeGreaterThan(0);
    expect(report.lines.join("\n")).toContain(
      "Downtown Annex (410 Main St, 2nd floor)",
    );
    expect(report.lines.join("\n")).not.toContain("Riverside");
  });

  it("the two isolation accounts hold different own exercises, favorites, and gyms", async () => {
    const a = await seed21h("isolation-resources-a");
    const b = await seed21h("isolation-resources-b");
    const own = (x: typeof a) => x.report.lines.find((l) => l.includes("Own:"));
    expect(own(a)).toContain("Alpha Landmine Press");
    expect(own(a)).not.toContain("Bravo");
    expect(own(b)).toContain("Bravo Sled Push");
    expect(own(b)).not.toContain("Alpha");
  });
});
