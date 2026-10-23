import type { Account } from "@/lib/data/account";
import {
  accountInventory,
  ACCOUNT_DELETION_ORDER,
  deleteAccount,
} from "@/lib/accounts/deletion";
import { activateMesocycle } from "@/lib/plan/mesocycles";
import { addSessionExercise } from "@/lib/plan/sessions";
import { archiveGym, createGym } from "@/lib/gyms/gyms";
import { setExerciseFavorite } from "@/lib/exercises/exercises";
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
import { ownedRowCount, snapshotAccount } from "./support";
import { RELEASE_NOTES_FIXTURE } from "../support/release-notes";

/**
 * Cross-account isolation — ACCOUNT DELETION (Accounts spec §14.1–14.2).
 * The one sanctioned destroyer of logged history must remove every row the
 * acting account owns, and nothing else: another account's rows and the
 * shared library stay byte-identical. It is all-or-nothing, and a failed
 * identity removal is finished by a retry.
 */

/** Every owned table populated, through the app's own write modules. */
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
  const old = await createGym(account, { name: `${label} Old Gym` });
  await archiveGym(account, { gymId: old.id });
  await setExerciseFavorite(account, {
    exerciseId: lib.bench.id,
    isFavorite: true,
  });
  await setExerciseFavorite(account, {
    exerciseId: plan.custom.id,
    isFavorite: true,
  });
  await createGoal(account, {
    exerciseId: lib.bench.id,
    targetWeightLbs: 315,
    targetReps: 1,
  });
  await createGoal(account, {
    exerciseId: plan.custom.id,
    targetWeightLbs: 95,
    targetReps: 10,
  });
  const { loggedSessionId, les } = await startToday(account, plan);
  // Every planned set, so the machine lift establishes a gym baseline.
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
  // Admin Center & Feedback: a message to the owner (scoped create stamps
  // the owner).
  await account.db.feedback.create({
    data: {
      userId: account.userId,
      category: "bug",
      message: `${label} found a bug`,
    },
  });
  return plan;
}

async function librarySnapshot() {
  return getTestPrisma().$queryRawUnsafe(
    `SELECT to_jsonb(e) AS row FROM "exercises" e WHERE e.user_id IS NULL
      ORDER BY to_jsonb(e)::text`,
  );
}

const OWNED_TABLES = [
  "profiles",
  "mesocycles",
  "sessions",
  "session_exercises",
  "exercises",
  "exercise_favorites",
  "gyms",
  "gym_exercise_baselines",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "missed_day_resolutions",
  "goals",
  "planned_cardio",
  "cardio_logs",
  "tour_progress",
  "release_seen",
  "feedback",
];

let a: Account;
let b: Account;

beforeEach(async () => {
  const lib = await library();
  a = await createTestAccount();
  b = await createTestAccount();
  await populate(a, lib, "A");
  await populate(b, lib, "B");
});

it("the fixture really fills every owned table for both accounts", async () => {
  for (const account of [a, b]) {
    const snap = await snapshotAccount(account.userId);
    for (const table of OWNED_TABLES.filter((t) => t !== "profiles")) {
      expect([table, snap[table].length > 0]).toEqual([table, true]);
    }
  }
});

it("deleting A removes every row A owns and nothing of B's or the library's", async () => {
  const bBefore = await snapshotAccount(b.userId);
  const libBefore = await librarySnapshot();
  const aRowsBefore = await ownedRowCount(a.userId);
  const removed: string[] = [];

  const result = await deleteAccount(a, {
    deleteAuthUser: async (id) => {
      removed.push(id);
      return "deleted";
    },
  });

  expect(await ownedRowCount(a.userId)).toBe(0);
  expect(
    await getTestPrisma().profile.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
  expect(await snapshotAccount(b.userId)).toEqual(bBefore);
  expect(await librarySnapshot()).toEqual(libBefore);
  expect(removed).toEqual([a.userId]);
  expect(result.identityRemoved).toBe(true);
  // The counts account for every row A had (the profile is the 1 extra).
  const total = Object.values(result.deleted).reduce((n, c) => n + c, 0);
  expect(total).toBe(aRowsBefore);
  expect(Object.keys(result.deleted)).toEqual([...ACCOUNT_DELETION_ORDER]);
});

it("audit entries about A neither block A's deletion nor disappear with it (spec R11)", async () => {
  const audit = await getTestPrisma().adminAuditEntry.create({
    data: {
      actorUserId: b.userId,
      kind: "account_suspend",
      targetUserId: a.userId,
    },
  });
  await deleteAccount(a, { deleteAuthUser: async () => "deleted" });
  expect(await ownedRowCount(a.userId)).toBe(0);
  expect(
    await getTestPrisma().adminAuditEntry.findUnique({
      where: { id: audit.id },
    }),
  ).toEqual(audit);
});

it("is symmetric: deleting B leaves A untouched", async () => {
  const aBefore = await snapshotAccount(a.userId);
  await deleteAccount(b, { deleteAuthUser: async () => "deleted" });
  expect(await ownedRowCount(b.userId)).toBe(0);
  expect(await snapshotAccount(a.userId)).toEqual(aBefore);
});

it("a failure inside the transaction deletes nothing at all", async () => {
  const aBefore = await snapshotAccount(a.userId);
  const bBefore = await snapshotAccount(b.userId);
  // The real scoped client, except the Mesocycle step fails — after the
  // logged history, goals, cardio, and plan children were already deleted
  // inside the transaction.
  const failing: Account = {
    ...a,
    db: new Proxy(a.db, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return (fn: (tx: unknown) => Promise<unknown>, opts?: object) =>
          target.$transaction(
            (tx) =>
              fn(
                new Proxy(tx, {
                  get(t, p, r) {
                    if (p === "mesocycle") {
                      return {
                        deleteMany: async () => {
                          throw new Error("injected failure");
                        },
                      };
                    }
                    return Reflect.get(t, p, r);
                  },
                }),
              ),
            opts,
          );
      },
    }) as Account["db"],
  };
  const deleteAuthUser = jest.fn(async () => "deleted" as const);
  await expect(deleteAccount(failing, { deleteAuthUser })).rejects.toThrow(
    "injected failure",
  );
  expect(await snapshotAccount(a.userId)).toEqual(aBefore);
  expect(await snapshotAccount(b.userId)).toEqual(bBefore);
  expect(deleteAuthUser).not.toHaveBeenCalled();
});

it("if the identity can't be removed, the data stays deleted and a retry finishes", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const first = await deleteAccount(a, {
    deleteAuthUser: async () => {
      throw new Error("auth down");
    },
  });
  expect(first.identityRemoved).toBe(false);
  // Everything but the profile is gone (the profile is swept only once the
  // identity is gone, so a retry can still resolve the account).
  expect(await ownedRowCount(a.userId)).toBe(0);

  const retry = await deleteAccount(a, {
    deleteAuthUser: async () => "not_found",
  });
  expect(retry.identityRemoved).toBe(true);
  expect(Object.values(retry.deleted).every((n) => n === 0)).toBe(true);
  expect(await ownedRowCount(a.userId)).toBe(0);
  log.mockRestore();
});

it("sweeps a profile that was lazily recreated before the identity went", async () => {
  await deleteAccount(a, {
    deleteAuthUser: async () => {
      // A concurrent first request recreated the profile in between.
      await getTestPrisma().profile.create({
        data: { userId: a.userId, timeZone: "UTC" },
      });
      return "deleted";
    },
  });
  expect(
    await getTestPrisma().profile.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
});

it("the inventory counts only the acting account's rows", async () => {
  expect(await accountInventory(a)).toEqual({
    mesocycles: 1,
    loggedSessions: 1,
    loggedSets: 8, // 3 chest press + 3 bench + 2 custom
    goals: 2,
    gyms: 2,
    customExercises: 1,
    cardioLogs: 1,
  });
  await deleteAccount(b, { deleteAuthUser: async () => "deleted" });
  expect((await accountInventory(a)).loggedSets).toBe(8);
});

it("an account with no data deletes cleanly", async () => {
  const empty = await createTestAccount();
  const result = await deleteAccount(empty, {
    deleteAuthUser: async () => "deleted",
  });
  expect(result.deleted.Profile).toBe(1);
  expect(await ownedRowCount(empty.userId)).toBe(0);
});

it("a failed final sweep never turns a completed deletion into an error", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  // Only the post-identity sweep (outside the transaction) fails.
  const flaky: Account = {
    ...a,
    db: new Proxy(a.db, {
      get(target, prop, receiver) {
        if (prop === "profile") {
          return {
            deleteMany: async () => {
              throw new Error("pooler hiccup");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Account["db"],
  };
  const result = await deleteAccount(flaky, {
    deleteAuthUser: async () => "deleted",
  });
  expect(result.identityRemoved).toBe(true);
  // The transaction already removed everything, the profile included.
  expect(await ownedRowCount(a.userId)).toBe(0);
  expect(
    await getTestPrisma().profile.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
  log.mockRestore();
});
