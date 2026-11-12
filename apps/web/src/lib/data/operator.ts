import "server-only";
import type { PrismaClient } from "@prisma/client";
import { isValidTimeZone } from "@/lib/plan/calendar";
import { createAccountClient } from "./account-db";
import type { Account } from "./account";

/**
 * An Account for an EXPLICITLY NAMED account (Multi-User Foundation, spec
 * R9/R19): operator tasks (which always resolve and confirm the target by
 * email first) and tests. Never imported by application code — a static guard
 * enforces it; the app's only source of an Account is requireAccount().
 *
 * Requires the account's profile to exist: an operator task never creates an
 * account implicitly.
 */
export async function accountFor(
  userId: string,
  base?: PrismaClient,
): Promise<Account> {
  const db = createAccountClient(userId, base);
  const profile = await db.profile.findUnique({ where: { userId } });
  if (!profile) {
    throw new Error("That account has no profile; refusing to act on it.");
  }
  if (!isValidTimeZone(profile.timeZone)) {
    throw new Error("That account's stored timezone is not a valid IANA zone.");
  }
  return { userId, timeZone: profile.timeZone, db };
}
