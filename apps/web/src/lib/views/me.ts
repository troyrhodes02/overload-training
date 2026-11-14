import "server-only";
import type { Account } from "@/lib/data/account";
import { getSettingsProfile } from "@/lib/accounts/profile";
import { getEmailVerification } from "@/lib/accounts/verification";
import { getAccountAppearance } from "@/lib/accounts/appearance";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { getTourAutoStart } from "@/lib/tour/progress";
import { getWhatsNewDialog } from "@/lib/release-notes/seen";
import { getTrialNotice } from "@/lib/billing/trial-notice";
import type { ResolvedEntitlement } from "@overload/shared/entitlements/types";
import type { EntitlementDto, MeDto } from "@overload/shared/contracts/account";

/**
 * The `me` view (Pitch 21c spec §9.1): everything the app needs on launch,
 * about the acting account only. The same reads the web's (app) layout makes,
 * with the same one-dialog precedence (tour, then the trial notice, then
 * What's New), so both clients agree on what is due.
 *
 * The entitlement is DISPLAYED, never used by a client to unlock anything:
 * every Pro result is gated on the server. The trial notice is read as an
 * in-app request, so it never offers a purchase (no purchase flow in the app).
 * No Stripe call: the plan comes from the mirror the verified webhooks keep.
 *
 * `email` is the address Supabase Auth returned for the verified token — never
 * a value from the request.
 */

/** The server's resolved entitlement on the wire (capabilities as an array). */
export function toEntitlementDto(
  resolved: ResolvedEntitlement,
): EntitlementDto {
  return {
    plan: resolved.plan,
    capabilities: [...resolved.capabilities].sort(),
    sources: [...resolved.sources],
    displayState: resolved.displayState,
    trialDaysLeft: resolved.trialDaysLeft,
  };
}

export async function getMeView(
  account: Account,
  email: string,
  opts: { now?: Date } = {},
): Promise<MeDto> {
  const now = opts.now ?? new Date();
  const [
    profile,
    verification,
    appearance,
    entitlement,
    tourAutoStart,
    unseen,
    notice,
  ] = await Promise.all([
    getSettingsProfile(account),
    getEmailVerification(account, email),
    getAccountAppearance(account),
    resolveEntitlement(account, now),
    getTourAutoStart(account),
    getWhatsNewDialog(account),
    getTrialNotice(account, { inAppShell: true, now }),
  ]);
  // One dialog per launch, in the web layout's order.
  const trialNotice = tourAutoStart ? null : notice;
  const whatsNew = tourAutoStart || trialNotice ? null : unseen;
  return {
    profile,
    email: verification.email,
    emailVerified: verification.verified,
    appearance,
    entitlement: toEntitlementDto(entitlement),
    tour: { autoStart: tourAutoStart },
    whatsNew,
    trialNotice: trialNotice ? { ...trialNotice, purchasable: false } : null,
  };
}
