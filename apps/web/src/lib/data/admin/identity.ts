import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/data/account";
import { isAdminUserId } from "@/lib/admin/allowlist";

/**
 * ADMIN IDENTITY (Admin Center & Feedback, spec section 6.1; R1): the
 * allowlist rule (src/lib/admin/allowlist.ts) applied to the authenticated
 * account on the server, fresh on every request. The proxy applies the same
 * rule optimistically for an early 404; this is the authoritative check.
 */
export { adminUserIds, isAdminUserId } from "@/lib/admin/allowlist";

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
