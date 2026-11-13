import "server-only";
import { cache } from "react";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { isCheckoutEnabled } from "@/lib/billing/config";
import { proHighlights } from "@/lib/billing/pro-highlights";
import { trialNoticePhase } from "@/lib/billing/trial-notice-phase";
import type { TrialNoticeData } from "@overload/shared/contracts/account";
export type { TrialNoticeData } from "@overload/shared/contracts/account";

/**
 * The notice this account is due on this load, or null. Memoized per request.
 * A failed read means "no notice": a notice must never take a page down.
 */
export const getTrialNotice = cache(async function getTrialNotice(
  account: Account,
  opts: { inAppShell: boolean; now?: Date },
): Promise<TrialNoticeData | null> {
  try {
    const [entitlements, billing, profile] = await Promise.all([
      account.db.entitlement.findMany(),
      account.db.billingAccount.findUnique({
        where: { userId: account.userId },
      }),
      account.db.profile.findUnique({
        where: { userId: account.userId },
        select: { trialEndingNoticeAt: true, trialEndedNoticeAt: true },
      }),
    ]);
    if (!profile) return null;
    const phase = trialNoticePhase({
      entitlements,
      billing,
      shown: {
        ending: profile.trialEndingNoticeAt,
        ended: profile.trialEndedNoticeAt,
      },
      timeZone: account.timeZone,
      now: opts.now ?? new Date(),
    });
    if (!phase) return null;
    return {
      ...phase,
      highlights: proHighlights(),
      purchasable: isCheckoutEnabled() && !opts.inAppShell,
    };
  } catch (error) {
    console.error(
      "trial notice: could not read state",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
});

/**
 * Record that a phase's notice was shown to the acting account. Idempotent and
 * first-write-wins (an already-set timestamp is kept). `phase` is content, not
 * identity, and is validated; the account comes only from the auth session.
 */
export async function markTrialNoticeShown(
  account: Account,
  phase: unknown,
  now: Date = new Date(),
): Promise<{ moved: boolean }> {
  if (phase !== "ending" && phase !== "ended") {
    throw new DomainError("validation_error", "Unknown notice.");
  }
  const column =
    phase === "ending" ? "trialEndingNoticeAt" : "trialEndedNoticeAt";
  const result = await account.db.profile.updateMany({
    where: { userId: account.userId, [column]: null },
    data: { [column]: now },
  });
  return { moved: result.count > 0 };
}
