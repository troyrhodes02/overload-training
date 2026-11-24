import "server-only";
import type { Account } from "@/lib/data/account";
import {
  accountInventory,
  deleteAccount,
  type AccountDeletionDeps,
} from "@/lib/accounts/deletion";
import { verifyCurrentPassword } from "@/lib/accounts/password";
import { SubscriptionCancellationError } from "@/lib/billing/cancel-on-deletion";
import type {
  AccountInventoryDto,
  DeleteAccountResponseDto,
} from "@overload/shared/contracts/account";
import { readJsonObject } from "./body";
import { ApiFailure, shapeError } from "./errors";

/**
 * Account deletion from the iPhone app (Pitch 21j spec §5, §6 E8–E9; RD-14,
 * RD-16, RD-17, RD-19).
 *
 * This adds NO deletion logic. It is the web's delete-account action in API
 * form: the same password re-check (`verifyCurrentPassword`, with the email
 * Supabase Auth returned for the verified token, never a body field), then the
 * one sanctioned module, `deleteAccount`, which cancels every live Stripe
 * subscription BEFORE anything is deleted (OVE-122) and throws, having deleted
 * nothing, if it can't. Its outcomes map onto the API's error codes:
 *
 *   wrong password            → 400 validation_error {password}
 *   too many attempts         → 429 rate_limited
 *   check unavailable         → 500 internal_error ("Nothing was deleted.")
 *   billing not canceled      → 409 conflict {reason: "billing_not_canceled"}
 *   any other throw           → 500 internal_error ("Nothing was deleted.")
 *   data deleted, identity not → 200 { outcome: "identity_pending" }
 *   deleted                   → 200 { outcome: "deleted" }
 *
 * After "deleted" the auth identity is gone, so the token stops verifying
 * (`getUser`) on the very next request and every device falls to signed-out.
 * Nothing here logs the password or the email.
 */

/** A password field, generously bounded; the body holds nothing else we read. */
const PASSWORD_MAX = 1024;
const BODY_LIMIT = 4 * 1024;

const NOTHING_DELETED =
  "Couldn't delete your account. Nothing was deleted. Try again.";

export type AppDeletionDeps = {
  verifyPassword?: typeof verifyCurrentPassword;
  /** Passed to `deleteAccount` (tests inject the auth and Stripe fakes). */
  deletion?: AccountDeletionDeps;
};

/** E8 `GET /me/deletion-inventory`: what deletion would destroy, counted on read. */
export function readDeletionInventory(
  account: Account,
): Promise<AccountInventoryDto> {
  return accountInventory(account);
}

/** E9 `POST /me/delete` `{ password }`. */
export async function deleteAccountFromApp(
  account: Account,
  email: string,
  request: Request,
  deps: AppDeletionDeps = {},
): Promise<DeleteAccountResponseDto> {
  const body = await readJsonObject(request, BODY_LIMIT);
  const password = body.password;
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > PASSWORD_MAX
  ) {
    throw shapeError("password", "Enter your password to confirm.");
  }

  const verify = deps.verifyPassword ?? verifyCurrentPassword;
  const check = await verify(email, password);
  if (check === "wrong") {
    throw shapeError("password", "That password isn't right.");
  }
  if (check === "rate_limited") {
    throw new ApiFailure(
      "rate_limited",
      "Too many attempts. Wait a minute and try again.",
    );
  }
  if (check !== "ok") throw new ApiFailure("internal_error", NOTHING_DELETED);

  let identityRemoved: boolean;
  try {
    ({ identityRemoved } = await (deps.deletion
      ? deleteAccount(account, deps.deletion)
      : deleteAccount(account)));
  } catch (error) {
    if (error instanceof SubscriptionCancellationError) {
      throw new ApiFailure(
        "conflict",
        "We couldn't cancel your subscription, so nothing was deleted. Try again, or contact support.",
        { reason: "billing_not_canceled" },
      );
    }
    console.error(
      "mobile account deletion failed; nothing was deleted",
      error instanceof Error ? error.name : "unknown",
    );
    throw new ApiFailure("internal_error", NOTHING_DELETED);
  }
  return { outcome: identityRemoved ? "deleted" : "identity_pending" };
}
