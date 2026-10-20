import "server-only";
import type { Account } from "@/lib/data/account";
import { isoDateInZone, isValidTimeZone, todayIso } from "@/lib/plan/calendar";

/**
 * What the Today greeting needs beyond the dashboard (Personalization &
 * Navigation Polish, spec §11), read through the account-scoped client — only
 * the acting account's own profile and history.
 */
export type GreetingFacts = {
  /** Trimmed first name; null when none is saved (the original account). */
  firstName: string | null;
  /**
   * Whether the STORED zone is usable. requireAccount() already falls back to
   * UTC for an invalid one; the greeting instead drops the clock (R18).
   */
  timeZoneValid: boolean;
  /**
   * The account's first local day with no workouts logged yet (R17): derived
   * from existing data, never stored.
   */
  firstVisit: boolean;
};

export async function getGreetingFacts(
  account: Account,
  now: Date = new Date(),
): Promise<GreetingFacts> {
  const [profile, loggedSessions] = await Promise.all([
    account.db.profile.findUnique({
      where: { userId: account.userId },
      select: { firstName: true, timeZone: true, createdAt: true },
    }),
    account.db.loggedSession.count(),
  ]);
  const timeZoneValid = isValidTimeZone(profile?.timeZone);
  const zone = timeZoneValid ? (profile?.timeZone ?? "UTC") : "UTC";
  return {
    firstName: profile?.firstName?.trim() || null,
    timeZoneValid,
    firstVisit:
      profile !== null &&
      loggedSessions === 0 &&
      isoDateInZone(profile.createdAt, zone) === todayIso(zone, now),
  };
}
