import "server-only";
import type { Account } from "@/lib/data/account";
import { todayIso } from "@/lib/plan/calendar";

/**
 * DATA EXPORT (Public Accounts spec §9, R7; design doc Screen 8, D4).
 *
 * "Take your data with you." A complete, private, Free export of everything
 * the acting account owns, as one versioned JSON document.
 *
 * Isolation is STRUCTURAL, not hopeful (CLAUDE.md first invariant): every row
 * is read through `account.db`, the account-scoped client, which intersects
 * each query with `userId = acting`. This module never touches the raw client,
 * never names another account's id, and never passes a `userId` of its own —
 * so by construction it can only ever see the acting account's rows (plus the
 * shared library, which it deliberately excludes below).
 *
 * It is READ-ONLY: it opens no transaction, performs no write, and changes
 * nothing. The GET /settings/export route handler streams the result as a
 * download.
 *
 * It must carry the WHOLE account, so:
 *  - It does NOT filter `deletedAt`: archived/soft-deleted exercises and gyms,
 *    and legacy rows, are part of the lifter's history and belong in the file.
 *  - It covers the same owned set as ACCOUNT_DELETION_ORDER (deletion.ts) — if
 *    a later pitch adds an owned model, the isolation coverage meta-test forces
 *    it into the suite, which should include its export line here.
 *
 * It must carry NO secrets: emails and passwords live in Supabase Auth, not in
 * our database, so no owned row holds a credential or token. `emailVerifiedAt`
 * is an app-level fact about the account and is safe to include. The shared
 * exercise library (owner null) and its image bytes are never part of the
 * export — only the account's own custom exercises are.
 */

/** The version of the export document shape. Bump when the shape changes. */
export const EXPORT_FORMAT_VERSION = 1 as const;

/**
 * The export document. Each field is the account's own rows for one owned
 * model (or the single row, for the per-account singletons). Row shapes are
 * exactly the Prisma models, minus nothing — none of these tables holds a
 * secret, so the whole row is the lifter's to take.
 */
export type AccountExport = {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  /** ISO calendar date the export was produced, in the account's timezone. */
  exportedOn: string;
  profile: unknown | null;
  mesocycles: unknown[];
  sessions: unknown[];
  sessionExercises: unknown[];
  plannedCardio: unknown[];
  customExercises: unknown[];
  exerciseFavorites: unknown[];
  gyms: unknown[];
  gymExerciseBaselines: unknown[];
  loggedSessions: unknown[];
  loggedExercises: unknown[];
  loggedSets: unknown[];
  missedDayResolutions: unknown[];
  goals: unknown[];
  cardioLogs: unknown[];
  tourProgress: unknown | null;
  releaseSeen: unknown | null;
  feedback: unknown[];
};

/**
 * Assembles the acting account's complete export. Every read is through
 * `account.db` with no `where` clause of this module's own — the scoped client
 * supplies `userId`, so a cross-account row is unreachable here. The one
 * exception is `customExercises`, which filters `isCustom: true` so the shared
 * library (which scoped reads also return) is excluded; a custom exercise is
 * always owned (DB CHECK), so this never narrows to another account.
 */
export async function buildAccountExport(
  account: Account,
): Promise<AccountExport> {
  const db = account.db;
  const [
    profile,
    mesocycles,
    sessions,
    sessionExercises,
    plannedCardio,
    customExercises,
    exerciseFavorites,
    gyms,
    gymExerciseBaselines,
    loggedSessions,
    loggedExercises,
    loggedSets,
    missedDayResolutions,
    goals,
    cardioLogs,
    tourProgress,
    releaseSeen,
    feedback,
  ] = await Promise.all([
    db.profile.findUnique({ where: { userId: account.userId } }),
    db.mesocycle.findMany(),
    db.session.findMany(),
    db.sessionExercise.findMany(),
    db.plannedCardio.findMany(),
    // Scoped reads see library ∪ own; custom rows are always owned (DB CHECK),
    // so this excludes the shared library without narrowing to another account.
    db.exercise.findMany({ where: { isCustom: true } }),
    db.exerciseFavorite.findMany(),
    db.gym.findMany(),
    db.gymExerciseBaseline.findMany(),
    db.loggedSession.findMany(),
    db.loggedExercise.findMany(),
    db.loggedSet.findMany(),
    db.missedDayResolution.findMany(),
    db.goal.findMany(),
    db.cardioLog.findMany(),
    db.tourProgress.findUnique({ where: { userId: account.userId } }),
    db.releaseSeen.findUnique({ where: { userId: account.userId } }),
    db.feedback.findMany(),
  ]);

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    // The export date in the account's own timezone (the only authority for
    // "today"), computed here to avoid importing the db-bound account module.
    exportedOn: todayIso(account.timeZone),
    profile,
    mesocycles,
    sessions,
    sessionExercises,
    plannedCardio,
    customExercises,
    exerciseFavorites,
    gyms,
    gymExerciseBaselines,
    loggedSessions,
    loggedExercises,
    loggedSets,
    missedDayResolutions,
    goals,
    cardioLogs,
    tourProgress,
    releaseSeen,
    feedback,
  };
}

/** The download filename for an export produced on `exportedOn` (YYYY-MM-DD). */
export function exportFilename(exportedOn: string): string {
  return `overload-export-${exportedOn}.json`;
}
