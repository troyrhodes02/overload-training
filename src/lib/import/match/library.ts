import "server-only";
import type { Account } from "@/lib/data/account";
import {
  matchExercise,
  type LibraryCandidate,
  type MatchOutcome,
} from "./matcher";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — load the account's matchable
 * exercise library and run the deterministic matcher over it.
 *
 * Account isolation: candidates come only through `account.db`, so the shared
 * library plus THIS account's own custom exercises are matched — never another
 * account's customs. Archived exercises (`deletedAt != null`) are excluded: a
 * confirm creates a brand-new plan, and you cannot plan onto an archived
 * exercise (matching, like the pickers, filters `deletedAt: null`). Importing
 * never resurrects an archived exercise or creates one with a model-chosen id.
 */

/** Load the account's active (non-archived) library rows as match candidates. */
export async function loadLibraryCandidates(
  account: Account,
): Promise<LibraryCandidate[]> {
  const rows = await account.db.exercise.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Match every raw name against the account's library in one pass. */
export async function matchExercises(
  account: Account,
  rawNames: string[],
): Promise<MatchOutcome[]> {
  const candidates = await loadLibraryCandidates(account);
  return rawNames.map((raw) => matchExercise(raw, candidates));
}
