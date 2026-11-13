import "server-only";
import { cache } from "react";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";

/**
 * The acting account's onboarding tour progress (Onboarding Tour, spec §11).
 * One TourProgress row per account, created DUE when a new account's profile
 * is established at signup (src/lib/data/account.ts). The tour opens by itself
 * only while that row is due — never offered, no outcome — so it does so once,
 * ever (R5, R8). Accounts that predate the tour have no row and are never
 * toured automatically (R6). Reached only through the account-scoped client,
 * so one account can never read, change, or detect another's.
 */

export type TourOutcomeValue = "completed" | "skipped";

const OUTCOMES: readonly TourOutcomeValue[] = ["completed", "skipped"];

export function isTourOutcome(value: unknown): value is TourOutcomeValue {
  return (OUTCOMES as readonly unknown[]).includes(value);
}

/**
 * True iff the acting account is due its first tour. Memoized per request
 * (React cache): the (app) layout reads it once per render.
 */
export const getTourAutoStart = cache(async function getTourAutoStart(
  account: Account,
): Promise<boolean> {
  const row = await account.db.tourProgress.findUnique({
    where: { userId: account.userId },
    select: { offeredAt: true, outcome: true },
  });
  return row !== null && row.offeredAt === null && row.outcome === null;
});

/**
 * The automatically started tour has appeared: spend the offer. Only a due
 * row changes; a second call, a replay, or an account with no row is a no-op.
 */
export async function markTourOffered(
  account: Account,
  tx?: AccountTx,
): Promise<{ spent: boolean }> {
  const { count } = await (tx ?? account.db).tourProgress.updateMany({
    where: { userId: account.userId, offeredAt: null },
    data: { offeredAt: new Date() },
  });
  return { spent: count === 1 };
}

/**
 * Records the latest finished-or-skipped outcome for the acting account
 * (first run or replay, R7). A replay by an account with no row creates one.
 * An outcome always ends auto-start, so a replay can never re-arm it.
 */
export async function recordTourOutcome(
  account: Account,
  raw: unknown,
  tx?: AccountTx,
): Promise<TourOutcomeValue> {
  if (!isTourOutcome(raw)) {
    throw new DomainError("validation_error", "Unknown tour outcome.");
  }
  const outcomeAt = new Date();
  await (tx ?? account.db).tourProgress.upsert({
    where: { userId: account.userId },
    create: {
      userId: account.userId,
      offeredAt: outcomeAt,
      outcome: raw,
      outcomeAt,
    },
    update: { outcome: raw, outcomeAt },
  });
  return raw;
}
