import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/actions/result";
import {
  asUsernameConflict,
  UsernameTakenError,
} from "@/lib/accounts/username-taken";
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
 * Writes a brand-new account's profile at signup (Accounts spec R9): names,
 * username, and the browser's timezone. `user` is the user the auth service
 * itself returned from signing in, in the same server request — never client
 * input. If a lazy profile raced in (a concurrent first request), it is
 * completed, not duplicated. Only the signup module calls this (guard tests).
 *
 * Throws UsernameTakenError when the username was taken in the meantime (the
 * unique index decides; see isUsernameAvailable).
 *
 * Last, a brand-new account is made due its onboarding tour (Onboarding Tour
 * spec R6). Best effort and never thrown: a failure only means the tour won't
 * open by itself (Settings still replays it), and signup must not undo a
 * complete account over it.
 */
export async function establishProfile(
  user: { id: string },
  input: {
    firstName: string;
    lastName: string;
    username: string;
    timeZone: string;
  },
): Promise<void> {
  const db = createAccountClient(user.id);
  const timeZone = isValidTimeZone(input.timeZone)
    ? input.timeZone
    : DEFAULT_PROFILE_TIME_ZONE;
  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    timeZone,
  };
  let created = false;
  try {
    await db.profile.create({ data: { userId: user.id, ...data } });
    created = true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Either this account's profile already exists (a lazy profile raced in)
    // or another account holds the username. Only the first is completable.
    const own = await db.profile.findUnique({ where: { userId: user.id } });
    if (!own) throw new UsernameTakenError();
  }
  if (!created) {
    try {
      await db.profile.updateMany({ where: { userId: user.id }, data });
    } catch (error) {
      throw asUsernameConflict(error);
    }
  }
  try {
    // Due: never offered, no outcome. skipDuplicates keeps it idempotent.
    await db.tourProgress.createMany({
      data: [{ userId: user.id }],
      skipDuplicates: true,
    });
  } catch (error) {
    console.error(
      "signup: could not make the new account due its tour",
      error instanceof Error ? error.name : "unknown",
    );
  }
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
