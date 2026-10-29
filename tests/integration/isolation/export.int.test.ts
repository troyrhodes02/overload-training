import type { Account } from "@/lib/data/account";
import { buildAccountExport } from "@/lib/accounts/export";
import { activateMesocycle } from "@/lib/plan/mesocycles";
import { addSessionExercise } from "@/lib/plan/sessions";
import { archiveGym, createGym } from "@/lib/gyms/gyms";
import {
  archiveExercise,
  createCustomExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout } from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { logCardio } from "@/lib/cardio/cardio-logs";
import { createGoal } from "@/lib/goals/goals";
import { markTourOffered, recordTourOutcome } from "@/lib/tour/progress";
import { markReleaseNotesSeen } from "@/lib/release-notes/seen";
import { addDays } from "@/lib/plan/calendar";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { activePlan, library, startToday, today, type Lib } from "./fixtures";
import { RELEASE_NOTES_FIXTURE } from "../support/release-notes";

/**
 * Cross-account isolation — DATA EXPORT (Public Accounts spec §9, R7; CLAUDE.md
 * first invariant). The export reads only through account.db, so it is
 * isolation-safe by construction. This proves it adversarially: with two fully
 * populated accounts, A's export contains exactly A's rows for every owned
 * model and NONE of B's; it keeps archived/soft-deleted rows; it carries no
 * credential or token; and it changes nothing.
 */

/** Every owned table populated, plus a soft-deleted gym AND exercise. */
async function populate(account: Account, lib: Lib, label: string) {
  const plan = await activePlan(account, lib, label, { activate: false });
  await addSessionExercise(account, {
    sessionId: plan.session.id,
    exerciseId: plan.custom.id,
    plannedSets: "2",
    targetRepMin: "10",
    targetRepMax: "12",
  });
  await activateMesocycle(account, {
    mesocycleId: plan.meso.id,
    expectedActiveId: null,
  });
  // A soft-deleted gym and a soft-deleted custom exercise — these must still
  // appear in the export (history is never filtered by deletedAt).
  const oldGym = await createGym(account, { name: `${label} Old Gym` });
  await archiveGym(account, { gymId: oldGym.id });
  const oldExercise = await createCustomExercise(account, {
    name: `${label} Retired Lift`,
    primaryMuscle: "chest",
    equipmentType: "dumbbell",
    secondaryMuscles: [],
  });
  await archiveExercise(account, { exerciseId: oldExercise.id });
  await setExerciseFavorite(account, {
    exerciseId: lib.bench.id,
    isFavorite: true,
  });
  await createGoal(account, {
    exerciseId: lib.bench.id,
    targetWeightLbs: 315,
    targetReps: 1,
  });
  const { loggedSessionId, les } = await startToday(account, plan);
  for (const le of les) {
    for (let n = 1; n <= le.plannedSets; n++) {
      await logSet(account, {
        loggedExerciseId: le.id,
        setNumber: n,
        weightLbs: 120,
        reps: 8,
      });
    }
  }
  await completeWorkout(account, { loggedSessionId });
  await resolveMissedDay(account, {
    mesocycleId: plan.meso.id,
    missedOn: addDays(today(), -7),
    outcome: "skipped",
  });
  await logCardio(account, {
    mesocycleId: plan.meso.id,
    scheduledFor: today(),
    type: "Incline walk",
    durationMin: "25",
  });
  await markTourOffered(account);
  await recordTourOutcome(account, "completed");
  await markReleaseNotesSeen(account, RELEASE_NOTES_FIXTURE[0].id, {
    catalog: RELEASE_NOTES_FIXTURE,
  });
  await account.db.feedback.create({
    data: {
      userId: account.userId,
      category: "bug",
      message: `${label} found a bug`,
    },
  });
  return { plan, oldGym, oldExercise };
}

/** Every array/singleton section of an export, with its model name. */
const LIST_SECTIONS = [
  "mesocycles",
  "sessions",
  "sessionExercises",
  "plannedCardio",
  "customExercises",
  "exerciseFavorites",
  "gyms",
  "gymExerciseBaselines",
  "loggedSessions",
  "loggedExercises",
  "loggedSets",
  "missedDayResolutions",
  "goals",
  "cardioLogs",
  "feedback",
] as const;

/** Collect every `userId` present anywhere in an export document. */
function userIdsIn(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) userIdsIn(v, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === "userId" || k === "user_id") && typeof v === "string") {
        acc.add(v);
      } else {
        userIdsIn(v, acc);
      }
    }
  }
  return acc;
}

let a: Account;
let b: Account;

beforeEach(async () => {
  const lib = await library();
  a = await createTestAccount();
  b = await createTestAccount();
  await populate(a, lib, "A");
  await populate(b, lib, "B");
});

it("A's export contains rows for every owned model, and only A's", async () => {
  const exportA = await buildAccountExport(a);

  // The profile and the per-account singletons are A's.
  expect((exportA.profile as { userId: string }).userId).toBe(a.userId);
  expect((exportA.tourProgress as { userId: string }).userId).toBe(a.userId);
  expect((exportA.releaseSeen as { userId: string }).userId).toBe(a.userId);

  // Every list section is non-empty and owned entirely by A.
  for (const section of LIST_SECTIONS) {
    const rows = exportA[section] as Array<{ userId?: string }>;
    expect([section, rows.length > 0]).toEqual([section, true]);
    for (const row of rows) {
      expect([section, row.userId]).toEqual([section, a.userId]);
    }
  }

  // Nowhere in the whole document is any id but A's.
  const ids = userIdsIn(exportA);
  expect([...ids]).toEqual([a.userId]);
  expect(ids.has(b.userId)).toBe(false);
});

it("includes archived / soft-deleted rows (export must not filter deletedAt)", async () => {
  const exportA = await buildAccountExport(a);
  const gyms = exportA.gyms as Array<{ name: string; deletedAt: unknown }>;
  const archivedGym = gyms.find((g) => g.name === "A Old Gym");
  expect(archivedGym).toBeDefined();
  expect(archivedGym?.deletedAt).not.toBeNull();

  const customs = exportA.customExercises as Array<{
    name: string;
    deletedAt: unknown;
  }>;
  const archivedExercise = customs.find((e) => e.name === "A Retired Lift");
  expect(archivedExercise).toBeDefined();
  expect(archivedExercise?.deletedAt).not.toBeNull();
});

it("custom exercises are A's own only — never the shared library", async () => {
  const exportA = await buildAccountExport(a);
  const customs = exportA.customExercises as Array<{
    userId: string | null;
    isCustom: boolean;
  }>;
  expect(customs.length).toBeGreaterThan(0);
  for (const row of customs) {
    expect(row.isCustom).toBe(true);
    expect(row.userId).toBe(a.userId);
  }
});

it("carries no credential, secret, or token", async () => {
  const exportA = await buildAccountExport(a);
  const serialized = JSON.stringify(exportA).toLowerCase();
  for (const banned of [
    "password",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "service_role",
    "anon_key",
  ]) {
    expect([banned, serialized.includes(banned)]).toEqual([banned, false]);
  }
});

it("is read-only: building an export changes nothing", async () => {
  const before = await getTestPrisma().$queryRawUnsafe(
    `SELECT
       (SELECT count(*) FROM "logged_sets")        AS logged_sets,
       (SELECT count(*) FROM "mesocycles")          AS mesocycles,
       (SELECT count(*) FROM "goals")               AS goals,
       (SELECT count(*) FROM "profiles")            AS profiles`,
  );
  await buildAccountExport(a);
  await buildAccountExport(b);
  const after = await getTestPrisma().$queryRawUnsafe(
    `SELECT
       (SELECT count(*) FROM "logged_sets")        AS logged_sets,
       (SELECT count(*) FROM "mesocycles")          AS mesocycles,
       (SELECT count(*) FROM "goals")               AS goals,
       (SELECT count(*) FROM "profiles")            AS profiles`,
  );
  expect(after).toEqual(before);
});
