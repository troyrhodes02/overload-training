import type { BillingAccount, Entitlement } from "@prisma/client";
import { MS_PER_DAY } from "@/lib/billing/config";
import { computeEntitlement } from "@/lib/entitlements/resolve";
import { addDays, isoDateInZone } from "@/lib/plan/calendar";

/**
 * Trial notices (OVE-112) — which one-time notice, if any, an account is due.
 * PURE: no database, no clock, so every boundary is unit-testable.
 *
 *   "ending" — the account's original 14-day trial is its only source of Pro
 *              (no subscription, no comp) and the trial's end falls tomorrow
 *              or today on the account's own calendar (its stored timezone).
 *              `endsToday` picks the heading for a first visit on the last day.
 *   "ended"  — the trial has actually ended (authoritative `endsAt` <= now),
 *              the account resolves to Free, it has never had a Stripe
 *              subscription, and the trial ended within the last
 *              TRIAL_ENDED_NOTICE_WINDOW_DAYS (so an account whose trial ended
 *              long ago, or that later lost a subscription, isn't told its
 *              trial "has ended").
 *
 * Never for an account that has, or ever had, complimentary access: comp is
 * Overload's own grant and is never solicited for payment. Each phase shows
 * once per account: a non-null shown-at timestamp suppresses it for good.
 * Nothing here changes an entitlement — the resolver never reads this.
 */

export const TRIAL_ENDED_NOTICE_WINDOW_DAYS = 30;

export type TrialNoticePhase =
  { phase: "ending"; endsToday: boolean } | { phase: "ended" };

export type TrialNoticeInput = {
  entitlements: Entitlement[];
  billing: BillingAccount | null;
  shown: { ending: Date | null; ended: Date | null };
  timeZone: string;
  now: Date;
};

export function trialNoticePhase({
  entitlements,
  billing,
  shown,
  timeZone,
  now,
}: TrialNoticeInput): TrialNoticePhase | null {
  if (entitlements.some((e) => e.source === "comp")) return null;
  // The original trial: one per account (partial unique index), never revoked.
  const trial = entitlements.find(
    (e) => e.source === "trial" && e.revokedAt === null && e.endsAt !== null,
  );
  if (!trial || !trial.endsAt) return null;
  const endsAt = trial.endsAt;

  const resolved = computeEntitlement(entitlements, billing, now);

  if (now.getTime() < endsAt.getTime()) {
    if (shown.ending !== null || resolved.displayState !== "trial") return null;
    const today = isoDateInZone(now, timeZone);
    const endDay = isoDateInZone(endsAt, timeZone);
    if (today === endDay) return { phase: "ending", endsToday: true };
    if (addDays(today, 1) === endDay) {
      return { phase: "ending", endsToday: false };
    }
    return null;
  }

  if (shown.ended !== null) return null;
  if (resolved.plan !== "free") return null;
  if (billing?.subscriptionId != null || billing?.status != null) return null;
  if (
    now.getTime() - endsAt.getTime() >
    TRIAL_ENDED_NOTICE_WINDOW_DAYS * MS_PER_DAY
  ) {
    return null;
  }
  return { phase: "ended" };
}
