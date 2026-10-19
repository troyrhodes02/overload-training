import { randomUUID } from "node:crypto";
import { accountFor } from "@/lib/data/operator";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./db";

/**
 * Multi-User Foundation test accounts. Creates a Profile (the ownership root)
 * directly in the throwaway database and returns the Account the application
 * would act as — its `db` is the real account-scoped client.
 */
export async function createTestAccount(
  timeZone = "UTC",
  userId: string = randomUUID(),
): Promise<Account> {
  await getTestPrisma().profile.create({ data: { userId, timeZone } });
  return accountFor(userId);
}

/**
 * The account most existing suites act as (they were written for the single
 * lifter). Created lazily — the first call in a test inserts its profile — so
 * tests that never act as anyone still start from empty tables.
 */
export const DEFAULT_USER_ID = "a0000000-0000-4000-8000-000000000001";

export async function defaultAccount(): Promise<Account> {
  await getTestPrisma().profile.upsert({
    where: { userId: DEFAULT_USER_ID },
    create: { userId: DEFAULT_USER_ID, timeZone: "UTC" },
    update: {},
  });
  return accountFor(DEFAULT_USER_ID);
}

/** A UUID that names nothing — the "nonexistent object" control. */
export function unknownId(): string {
  return randomUUID();
}
