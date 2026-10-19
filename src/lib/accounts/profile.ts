import "server-only";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountDb, AccountTx } from "@/lib/data/account-db";
import { parseProfileInput, type ProfileInput } from "./validation";

/**
 * The acting account's profile (Accounts spec §11): first name, last name, and
 * the IANA timezone that is the only authority for "today". Reached only
 * through the account-scoped client, so another account's profile cannot be
 * read or written from here. Email and password live in Supabase Auth.
 */

export type SettingsProfile = {
  firstName: string;
  lastName: string;
  timeZone: string;
};

export async function getSettingsProfile(
  account: Account,
  db: AccountDb = account.db,
): Promise<SettingsProfile> {
  const profile = await db.profile.findUnique({
    where: { userId: account.userId },
    select: { firstName: true, lastName: true },
  });
  return {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    // The validated zone requireAccount() resolved (falls back to UTC).
    timeZone: account.timeZone,
  };
}

/** Saves names and timezone for the acting account only. */
export async function updateProfile(
  account: Account,
  raw: { firstName: unknown; lastName: unknown; timeZone: unknown },
  tx?: AccountTx,
): Promise<ProfileInput> {
  const parsed = parseProfileInput(raw);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.details,
    );
  }
  const { count } = await (tx ?? account.db).profile.updateMany({
    where: { userId: account.userId },
    data: parsed.value,
  });
  if (count !== 1) throw new DomainError("not_found", "Profile not found.");
  return parsed.value;
}

/**
 * The zones offered in Settings: what this runtime knows, plus UTC and the
 * stored zone (so a valid zone the list lacks still shows as selected).
 */
export function timeZoneOptions(stored: string): string[] {
  const zones = new Set<string>(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  zones.add(stored);
  return [...zones].sort((a, b) => a.localeCompare(b));
}
