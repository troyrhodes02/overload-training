/**
 * The QA fixture's pure rules (OVE-173): which accounts it may act on, what a
 * reset deletes, and what it keeps. No database access, so the unit tests and
 * the CLI's argument checks can load it.
 */
import type { AccountDeletionModel } from "@/lib/accounts/deletion";

export class QaFixtureRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaFixtureRefused";
  }
}

/**
 * Reserved, non-routable test domains (RFC 2606 / RFC 6761): no real person's
 * address is on one, so requiring one makes a real account an impossible
 * target. The development tester the provisioner creates is
 * overload-staging-tester@example.com.
 */
const TEST_EMAIL =
  /@([a-z0-9-]+\.)*(example\.(com|net|org)|[a-z0-9-]+\.(test|example|invalid|localhost))$/i;

export function isQaTestEmail(email: string): boolean {
  return TEST_EMAIL.test(email.trim());
}

export function assertQaTestEmail(email: string): void {
  if (!isQaTestEmail(email)) {
    throw new QaFixtureRefused(
      "Refusing: the target account's email is not on a reserved test domain (example.com/.net/.org, or *.test, *.example, *.invalid, *.localhost). The QA fixture only ever acts on a dedicated test account.",
    );
  }
}

/** The training models a reset deletes, in the deletion module's own order. */
export const QA_RESET_MODELS = [
  "LoggedSet",
  "LoggedExercise",
  "GymExerciseBaseline",
  "Goal",
  "CardioLog",
  "MissedDayResolution",
  "LoggedSession",
  "PlannedCardio",
  "SessionExercise",
  "Session",
  "Mesocycle",
  "ExerciseFavorite",
  "Exercise",
  "Gym",
] as const satisfies readonly AccountDeletionModel[];

/** What a reset keeps, by design (documented in docs/technical/qa-fixture-account.md). */
export const QA_PRESERVED_MODELS = [
  "Profile (row kept; names, time zone, and appearance rewritten)",
  "TourProgress and ReleaseSeen (rewritten to finished and caught up)",
  "Entitlement (trial and revoked rows kept; an active comp is kept, an expired one is revoked and replaced so the account stays Pro)",
  "BillingAccount and PromoRedemption (the Stripe mirror; never written)",
  "Feedback and FeedbackAttachment",
  "ImportSession, ImportSourcePart, ImportUsageDay (plan import)",
  "The Supabase Auth user, the shared exercise library, and every other account",
] as const;
