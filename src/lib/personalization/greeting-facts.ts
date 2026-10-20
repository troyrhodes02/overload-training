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
   * The account's first local day with nothing logged yet — no workout and no
   * cardio (R17): derived from existing data, never stored.
   */
  firstVisit: boolean;
};

export async function getGreetingFacts(
  account: Account,
  now: Date = new Date(),
): Promise<GreetingFacts> {
  const [profile, loggedSession, cardioLog] = await Promise.all([
    account.db.profile.findUnique({
      where: { userId: account.userId },
      select: { firstName: true, timeZone: true, createdAt: true },
    }),
    // Existence only: any one row ends the first visit.
    account.db.loggedSession.findFirst({ select: { id: true } }),
    account.db.cardioLog.findFirst({ select: { id: true } }),
  ]);
  const timeZoneValid = isValidTimeZone(profile?.timeZone);
  const zone = timeZoneValid ? (profile?.timeZone ?? "UTC") : "UTC";
  return {
    firstName: profile?.firstName?.trim() || null,
    timeZoneValid,
    firstVisit:
      profile !== null &&
      loggedSession === null &&
      cardioLog === null &&
      isoDateInZone(profile.createdAt, zone) === todayIso(zone, now),
  };
}
