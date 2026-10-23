import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/actions/result";
import { requireAccount } from "@/lib/data/account";

/**
 * ADMIN IDENTITY (Admin Center & Feedback, spec section 6.1; R1). An admin is
 * an authenticated account whose auth user id is on the server-only allowlist
 * OVERLOAD_ADMIN_USER_IDS. It is not stored in the database, nothing in the
 * app can grant it, and it is read fresh on every call, so changing the
 * variable (and redeploying) is the only way to change who is an admin.
 *
 * Format: auth user UUIDs separated by commas and/or whitespace. Case does
 * not matter. Anything that is not a UUID is ignored, and an unset or empty
 * variable means nobody is an admin (fail closed).
 */
const ADMIN_ENV = "OVERLOAD_ADMIN_USER_IDS";

export function adminUserIds(
  env: Record<string, string | undefined> = process.env,
): ReadonlySet<string> {
  const raw = env[ADMIN_ENV] ?? "";
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter((id) => isUuid(id)),
  );
}

export function isAdminUserId(
  userId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    typeof userId === "string" &&
    adminUserIds(env).has(userId.trim().toLowerCase())
  );
}

/**
 * The acting admin. Only adminActorFor() makes one, and it refuses an id that
 * is not on the allowlist; every admin data function re-checks it with
 * assertAdmin() before touching the database.
 */
export type AdminActor = {
  readonly userId: string;
  /** The admin's own stored timezone: "today" for the Overview (R13). */
  readonly timeZone: string;
};

export class NotAdminError extends Error {
  constructor() {
    super("Not an admin.");
    this.name = "NotAdminError";
  }
}

/** An actor for an allowlisted id (requireAdmin, and tests that name one). */
export function adminActorFor(userId: string, timeZone: string): AdminActor {
  if (!isAdminUserId(userId)) throw new NotAdminError();
  return Object.freeze({ userId, timeZone });
}

/** The fresh server-side re-check every admin data function runs first. */
export function assertAdmin(actor: AdminActor): void {
  if (!actor || !isAdminUserId(actor.userId)) throw new NotAdminError();
}

/**
 * The admin for this request, or not-found. requireAccount() runs first, so
 * a signed-out visitor goes to /login and a suspended one to /suspended
 * exactly as on every other page; an authenticated non-admin gets the
 * ordinary not-found page, indistinguishable from a URL that does not exist
 * (R23). Called by the admin layout, every admin page and its metadata, and
 * as the first statement of every admin server action. Memoized per request.
 */
export const requireAdmin = cache(async (): Promise<AdminActor> => {
  const account = await requireAccount();
  if (!isAdminUserId(account.userId)) notFound();
  return adminActorFor(account.userId, account.timeZone);
});

/**
 * Whether the signed-in account is an admin, for rendering the shell's Admin
 * menu item only. Hiding the item is courtesy; requireAdmin() is the check.
 */
export async function isCurrentAccountAdmin(): Promise<boolean> {
  const account = await requireAccount();
  return isAdminUserId(account.userId);
}
