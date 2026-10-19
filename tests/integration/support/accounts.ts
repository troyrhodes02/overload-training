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

/** A UUID that names nothing — the "nonexistent object" control. */
export function unknownId(): string {
  return randomUUID();
}
