import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, requireUser } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/actions/result";
import {
  asUsernameConflict,
  UsernameTakenError,
} from "@/lib/accounts/username-taken";
import { isValidTimeZone, todayIso } from "@/lib/plan/calendar";
import { initialReleaseSeen } from "@/lib/release-notes/seen";
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

/** Whether an account may use Overload (Admin Center & Feedback). */
export type AccountStatus = "active" | "suspended";

type ResolvedAccount = {
  account: Account;
  status: AccountStatus;
  /** "YYYY-MM-DD", or null before the account's first tracked request. */
  lastActiveOn: string | null;
};

const PROFILE_STATE = {
  timeZone: true,
  status: true,
  lastActiveOn: true,
} as const;

/** A `@db.Date` value as "YYYY-MM-DD" (Prisma maps it to UTC midnight). */
function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Builds the Account for an authenticated user id, creating the profile if
 * it does not exist yet, plus the access state requireAccount() enforces.
 * Only requireAccount() calls this with a session id; a static guard keeps it
 * out of application code.
 */
export async function resolveAccountState(
  userId: string,
): Promise<ResolvedAccount> {
  const db = createAccountClient(userId);
  let profile = await db.profile.findUnique({
    where: { userId },
    select: PROFILE_STATE,
  });
  if (!profile) {
    try {
      profile = await db.profile.create({
        data: { userId, timeZone: DEFAULT_PROFILE_TIME_ZONE },
        select: PROFILE_STATE,
      });
    } catch (error) {
      // Two first requests raced; the other one created it.
      if (!isUniqueViolation(error)) throw error;
      profile = await db.profile.findUniqueOrThrow({
        where: { userId },
        select: PROFILE_STATE,
      });
    }
  }
  return {
    account: {
      userId,
      timeZone: isValidTimeZone(profile.timeZone)
        ? profile.timeZone
        : DEFAULT_PROFILE_TIME_ZONE,
      db,
    },
    status: profile.status,
    lastActiveOn: isoDate(profile.lastActiveOn),
  };
}

/** The Account alone (operator-style callers that enforce nothing else). */
export async function resolveAccount(userId: string): Promise<Account> {
  return (await resolveAccountState(userId)).account;
}

/**
 * Records today as the account's last-active date (Admin Center & Feedback,
 * spec section 7; R4): a calendar date in the account's own timezone, written
 * at most once a day. The condition makes the write a no-op once today is
 * stored, so concurrent first requests of a day cannot move it twice. Best
 * effort: a failure is logged by error name only and never blocks the
 * request — it costs a metric, not the lifter's access.
 */
export async function touchLastActive(
  account: Account,
  lastActiveOn: string | null,
): Promise<void> {
  const today = accountToday(account);
  if (lastActiveOn !== null && lastActiveOn >= today) return;
  const day = new Date(`${today}T00:00:00.000Z`);
  try {
    await account.db.profile.updateMany({
      where: {
        userId: account.userId,
        OR: [{ lastActiveOn: null }, { lastActiveOn: { lt: day } }],
      },
      data: { lastActiveOn: day },
    });
  } catch (error) {
    console.error(
      "last-active: could not record today",
      error instanceof Error ? error.name : "unknown",
    );
  }
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
 *
 * Then it starts caught up on the release notes: the newest existing entry is
 * already seen, so there is no backlog (What's New spec R10). Best effort and
 * never thrown for the same reason; the account floor still keeps older
 * entries from showing if this write fails (R12).
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
  try {
    // Caught up: the newest existing entry is already seen. skipDuplicates
    // keeps it idempotent; no entries yet means no row.
    const start = initialReleaseSeen();
    if (start) {
      await db.releaseSeen.createMany({
        data: [{ userId: user.id, ...start }],
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error(
      "signup: could not start the new account's release notes",
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
  const { account, status, lastActiveOn } = await resolveAccountState(user.id);
  // Suspension (Admin Center & Feedback, spec section 7): checked on EVERY
  // authenticated request — every page renders under a layout that calls
  // this and every server action calls it first — so a session that signed
  // in before the suspension is refused on its very next request. Nothing is
  // recorded for a suspended request.
  if (status === "suspended") redirect("/suspended");
  await touchLastActive(account, lastActiveOn);
  return account;
});

/**
 * Where the signed-in visitor stands (the /suspended page): signed out, an
 * account that may use Overload, or a suspended one. From the auth session
 * only; never creates a profile.
 */
export async function getAccessState(): Promise<"signed_out" | AccountStatus> {
  const user = await getAuthUser();
  if (!user) return "signed_out";
  const profile = await createAccountClient(user.id).profile.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });
  return profile?.status ?? "active";
}

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
