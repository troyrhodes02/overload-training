import "server-only";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { deleteAuthUser } from "@/lib/supabase/admin";
import { removeFeedbackScreenshots } from "@/lib/feedback/screenshots";

/**
 * THE ACCOUNT-DELETION MODULE (CLAUDE.md first invariant; Accounts spec R12).
 *
 * The single sanctioned path that destroys logged history. It removes ONLY
 * the acting account's rows: every delete runs through the account-scoped
 * client (`account.db`), which intersects each `deleteMany` with
 * `userId = acting` — so another account's rows and the shared exercise
 * library (owner null) are unreachable here even with a bug.
 *
 *  1. One transaction deletes every owned model in ACCOUNT_DELETION_ORDER
 *     (children before parents; every owned relation is onDelete: Restrict).
 *     Any failure rolls back: nothing is deleted.
 *  2. Then the auth identity (and with it its auth sessions). If that fails,
 *     the data stays deleted and the lifter is told to retry; a retry is a
 *     no-op on data and finishes the identity. Data first, so the worst case
 *     is an empty account its owner can still remove — never personal data
 *     without an owner able to remove it.
 *  3. Then a best-effort profile sweep, for a profile a concurrent request
 *     may have lazily recreated between 1 and 2. Only step 1 can make this
 *     function throw, so a throw always means "nothing was deleted".
 *
 * Guard tests keep every LoggedSet / Exercise / Gym / Profile delete in the
 * application inside this file.
 */

export const ACCOUNT_DELETION_ORDER = [
  "LoggedSet",
  "LoggedExercise",
  "GymExerciseBaseline",
  "Goal",
  "CardioLog",
  "MissedDayResolution",
  "LoggedSession",
  "PlannedCardio",
  "SessionExercise",
  "Session",
  "Mesocycle",
  "ExerciseFavorite",
  "Exercise", // custom exercises only: the scoped write filter excludes the library
  "Gym",
  "TourProgress", // Onboarding Tour: references only the profile
  "ReleaseSeen", // What's New: references only the profile
  "FeedbackAttachment", // Admin Center & Feedback: before its Feedback parent (onDelete: Restrict)
  "Feedback", // Admin Center & Feedback: the lifter's messages; references only the profile
  "Profile",
] as const;

export type AccountDeletionModel = (typeof ACCOUNT_DELETION_ORDER)[number];

const DELETE: Record<
  AccountDeletionModel,
  (tx: AccountTx) => Promise<{ count: number }>
> = {
  LoggedSet: (tx) => tx.loggedSet.deleteMany({}),
  LoggedExercise: (tx) => tx.loggedExercise.deleteMany({}),
  GymExerciseBaseline: (tx) => tx.gymExerciseBaseline.deleteMany({}),
  Goal: (tx) => tx.goal.deleteMany({}),
  CardioLog: (tx) => tx.cardioLog.deleteMany({}),
  MissedDayResolution: (tx) => tx.missedDayResolution.deleteMany({}),
  LoggedSession: (tx) => tx.loggedSession.deleteMany({}),
  PlannedCardio: (tx) => tx.plannedCardio.deleteMany({}),
  SessionExercise: (tx) => tx.sessionExercise.deleteMany({}),
  Session: (tx) => tx.session.deleteMany({}),
  Mesocycle: (tx) => tx.mesocycle.deleteMany({}),
  ExerciseFavorite: (tx) => tx.exerciseFavorite.deleteMany({}),
  Exercise: (tx) => tx.exercise.deleteMany({ where: { isCustom: true } }),
  Gym: (tx) => tx.gym.deleteMany({}),
  TourProgress: (tx) => tx.tourProgress.deleteMany({}),
  ReleaseSeen: (tx) => tx.releaseSeen.deleteMany({}),
  FeedbackAttachment: (tx) => tx.feedbackAttachment.deleteMany({}),
  Feedback: (tx) => tx.feedback.deleteMany({}),
  Profile: (tx) => tx.profile.deleteMany({}),
};

export type AccountDeletionResult = {
  deleted: Record<AccountDeletionModel, number>;
  identityRemoved: boolean;
};

export type AccountDeletionDeps = {
  deleteAuthUser: (id: string) => Promise<"deleted" | "not_found">;
};

/** Generous: one person's history is small, but this must not time out. */
const TRANSACTION_TIMEOUT_MS = 30_000;

export async function deleteAccount(
  account: Account,
  deps: AccountDeletionDeps = { deleteAuthUser },
): Promise<AccountDeletionResult> {
  // Capture the feedback-screenshot object paths before the rows are deleted;
  // the image bytes live in Storage and are swept best-effort once the rows go.
  const screenshotPaths = (
    await account.db.feedbackAttachment.findMany({
      select: { objectPath: true },
    })
  ).map((a) => a.objectPath);

  const deleted = await account.db.$transaction(
    async (tx) => {
      const counts = {} as Record<AccountDeletionModel, number>;
      for (const model of ACCOUNT_DELETION_ORDER) {
        counts[model] = (await DELETE[model](tx)).count;
      }
      return counts;
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS },
  );

  // The attachment rows are gone; remove their Storage objects so none of the
  // account's personal data is left behind. Best-effort (never throws).
  await removeFeedbackScreenshots(screenshotPaths);

  let identityRemoved = false;
  try {
    await deps.deleteAuthUser(account.userId);
    identityRemoved = true;
  } catch (error) {
    console.error(
      "account deletion: identity removal failed after data deletion",
      error instanceof Error ? error.message : "unknown",
    );
  }

  if (identityRemoved) {
    // Best effort: by now the data and the identity are gone, so a failure
    // here must not be reported as "nothing was deleted". A leftover profile
    // owns no rows; docs/runs/09-sql/orphans.sql finds it.
    try {
      await account.db.profile.deleteMany({});
    } catch (error) {
      console.error(
        "account deletion: profile sweep failed after the identity was removed",
        error instanceof Error ? error.name : "unknown",
      );
    }
  }
  return { deleted, identityRemoved };
}

export type AccountInventoryDto = {
  mesocycles: number;
  loggedSessions: number;
  loggedSets: number;
  goals: number;
  gyms: number;
  customExercises: number;
  cardioLogs: number;
};

/** What deletion would destroy, counted on read (the delete page). */
export async function accountInventory(
  account: Account,
): Promise<AccountInventoryDto> {
  const db = account.db;
  const [
    mesocycles,
    loggedSessions,
    loggedSets,
    goals,
    gyms,
    customExercises,
    cardioLogs,
  ] = await Promise.all([
    db.mesocycle.count(),
    db.loggedSession.count(),
    db.loggedSet.count(),
    db.goal.count(),
    db.gym.count(),
    // Scoped reads see library ∪ own; custom rows are always owned (DB CHECK).
    db.exercise.count({ where: { isCustom: true } }),
    db.cardioLog.count(),
  ]);
  return {
    mesocycles,
    loggedSessions,
    loggedSets,
    goals,
    gyms,
    customExercises,
    cardioLogs,
  };
}
