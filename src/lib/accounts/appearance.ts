import "server-only";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountDb, AccountTx } from "@/lib/data/account-db";
import {
  DEFAULT_APPEARANCE,
  isAppearance,
  type Appearance,
} from "@/lib/appearance/appearance";

/**
 * The acting account's appearance preference (Personalization & Navigation
 * Polish, spec §11): Light, Dark, or System (the default). Stored on the
 * account's own Profile and reached only through the account-scoped client,
 * so one account can never read or change another's.
 */

export async function getAccountAppearance(
  account: Account,
  db: AccountDb = account.db,
): Promise<Appearance> {
  const profile = await db.profile.findUnique({
    where: { userId: account.userId },
    select: { appearance: true },
  });
  // requireAccount() always creates the profile; this is only defensive.
  return profile?.appearance ?? DEFAULT_APPEARANCE;
}

/** Saves the appearance for the acting account only. */
export async function updateAppearance(
  account: Account,
  raw: unknown,
  tx?: AccountTx,
): Promise<Appearance> {
  if (!isAppearance(raw)) {
    throw new DomainError("validation_error", "Choose Light, Dark, or System.");
  }
  const { count } = await (tx ?? account.db).profile.updateMany({
    where: { userId: account.userId },
    data: { appearance: raw },
  });
  if (count !== 1) throw new DomainError("not_found", "Profile not found.");
  return raw;
}
