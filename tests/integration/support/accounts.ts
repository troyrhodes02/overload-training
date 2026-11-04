import { randomUUID } from "node:crypto";
import { accountFor } from "@/lib/data/operator";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./db";

/**
 * Multi-User Foundation test accounts. Creates a Profile (the ownership root)
 * directly in the throwaway database and returns the Account the application
 * would act as — its `db` is the real account-scoped client.
 *
 * Plans, Billing & Promo Codes: by default the account is granted Pro via an
 * open-ended complimentary entitlement, mirroring the pre-billing world (and
 * signup's 14-day trial) in which every lifter had the full product. This keeps
 * the existing feature suites — which read real progression tags, e1RM trends,
 * and exercise-history calls — green after capability gating shipped. Pass
 * `{ entitlement: "none" }` for a Free account (the billing/gating suites set
 * entitlements explicitly).
 */
export async function createTestAccount(
  timeZone = "UTC",
  userId: string = randomUUID(),
  opts: { entitlement?: "pro" | "none" } = {},
): Promise<Account> {
  await getTestPrisma().profile.create({ data: { userId, timeZone } });
  if (opts.entitlement !== "none") await grantTestPro(userId);
  return accountFor(userId);
}

/** Grant an account open-ended complimentary Pro (idempotent). Test-only. */
export async function grantTestPro(userId: string): Promise<void> {
  await getTestPrisma().entitlement.createMany({
    data: [
      {
        userId,
        source: "comp",
        plan: "pro",
        startedAt: new Date(),
        compReason: "tester",
        grantedByUserId: userId,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * The account most existing suites act as (they were written for the single
 * lifter). Created lazily — the first call in a test inserts its profile — so
 * tests that never act as anyone still start from empty tables. Granted Pro
 * (comp) like createTestAccount, so the feature suites keep seeing Pro results.
 */
export const DEFAULT_USER_ID = "a0000000-0000-4000-8000-000000000001";

export async function defaultAccount(): Promise<Account> {
  await getTestPrisma().profile.upsert({
    where: { userId: DEFAULT_USER_ID },
    create: { userId: DEFAULT_USER_ID, timeZone: "UTC" },
    update: {},
  });
  await grantTestPro(DEFAULT_USER_ID);
  return accountFor(DEFAULT_USER_ID);
}

/** A UUID that names nothing — the "nonexistent object" control. */
export function unknownId(): string {
  return randomUUID();
}
