import "server-only";
import { DomainError, isUniqueViolation } from "@/lib/actions/result";
import { usernameTaken, type Account } from "@/lib/data/account";
import type { AccountDb, AccountTx } from "@/lib/data/account-db";
import { parseProfileInput, type ProfileInput } from "./validation";

/**
 * The acting account's profile (Accounts spec §11; OVE-50): first name, last
 * name, username, and the IANA timezone that is the only authority for
 * "today". Reached only through the account-scoped client, so another
 * account's profile cannot be read or written from here. Email and password
 * live in Supabase Auth.
 */

export type SettingsProfile = {
  firstName: string;
  lastName: string;
  /** "" for an account made before usernames: it picks one in Settings. */
  username: string;
  timeZone: string;
};

export async function getSettingsProfile(
  account: Account,
  db: AccountDb = account.db,
): Promise<SettingsProfile> {
  const profile = await db.profile.findUnique({
    where: { userId: account.userId },
    select: { firstName: true, lastName: true, username: true },
  });
  return {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    username: profile?.username ?? "",
    // The validated zone requireAccount() resolved (falls back to UTC).
    timeZone: account.timeZone,
  };
}

/**
 * Saves names, username, and timezone for the acting account only. A username
 * another account holds is refused by the unique index and reported as
 * "taken" — which says that the name is in use and nothing else.
 */
export async function updateProfile(
  account: Account,
  raw: {
    firstName: unknown;
    lastName: unknown;
    username: unknown;
    timeZone: unknown;
  },
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
  let count: number;
  try {
    ({ count } = await (tx ?? account.db).profile.updateMany({
      where: { userId: account.userId },
      data: parsed.value,
    }));
  } catch (error) {
    throw isUniqueViolation(error) ? usernameTaken() : error;
  }
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
