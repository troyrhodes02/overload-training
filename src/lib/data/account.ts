import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { isValidTimeZone, todayIso } from "@/lib/plan/calendar";
import {
  createAccountClient,
  type AccountClient,
  type AccountTx,
} from "./account-db";

/**
 * The acting account (Multi-User Foundation, spec §11). Feature code reaches
 * owned data ONLY through `account.db`, and gets an Account ONLY from
 * requireAccount(), which derives it from the authenticated auth session on
 * the server — never from a request parameter, form field, or URL segment.
 */
export type Account = {
  readonly userId: string;
  /** The account's stored IANA timezone: the only authority for "today". */
  readonly timeZone: string;
  readonly db: AccountClient;
};

/**
 * The zone a profile gets when an authenticated account is first used without
 * one (a hand-provisioned verification account; Accounts captures the browser
 * zone at signup). The production account's profile is created by the
 * ownership backfill with its real zone (spec R17).
 */
export const DEFAULT_PROFILE_TIME_ZONE = "UTC";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Builds the Account for an authenticated user id, creating the profile if
 * it does not exist yet. Only requireAccount() calls this with a session id;
 * a static guard keeps it out of application code.
 */
export async function resolveAccount(userId: string): Promise<Account> {
  const db = createAccountClient(userId);
  let profile = await db.profile.findUnique({ where: { userId } });
  if (!profile) {
    try {
      profile = await db.profile.create({
        data: { userId, timeZone: DEFAULT_PROFILE_TIME_ZONE },
      });
    } catch (error) {
      // Two first requests raced; the other one created it.
      if (!isUniqueViolation(error)) throw error;
      profile = await db.profile.findUniqueOrThrow({ where: { userId } });
    }
  }
  return {
    userId,
    timeZone: isValidTimeZone(profile.timeZone)
      ? profile.timeZone
      : DEFAULT_PROFILE_TIME_ZONE,
    db,
  };
}

/**
 * The acting account for this request, or a redirect to /login. Memoized per
 * request (React cache), so a page and its children share one resolution.
 */
export const requireAccount = cache(async (): Promise<Account> => {
  const user = await requireUser();
  return resolveAccount(user.id);
});

/** Run in the caller's (scoped) transaction, or open one on the account. */
export function inAccountTx<T>(
  account: Account,
  tx: AccountTx | undefined,
  run: (t: AccountTx) => Promise<T>,
): Promise<T> {
  return tx ? run(tx) : account.db.$transaction(run);
}

/** Today's calendar date ("YYYY-MM-DD") in the account's stored timezone. */
export function accountToday(account: Account): string {
  return todayIso(account.timeZone);
}
