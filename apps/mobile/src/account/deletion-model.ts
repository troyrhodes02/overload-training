import type { AccountInventoryDto } from "@overload/shared/contracts/account";
import { ApiError } from "../api/errors";

/**
 * A9's outcomes (Pitch 21j spec §5; RD-17, RD-19), with the web's own words
 * (DeleteAccountForm FORM_ERRORS). Nothing on the phone ever says the account
 * is gone until the server has said so, or until the account's token no
 * longer verifies.
 */

export const DELETE_MESSAGES = {
  wrongPassword: "That password isn't right.",
  missingPassword: "Enter your password to confirm.",
  rateLimited: "Too many attempts. Wait a minute and try again.",
  billing:
    "We couldn't cancel your subscription, so nothing was deleted. Try again, or contact support.",
  identityPending:
    "Your training data was deleted, but closing your account didn't finish. Try again to finish.",
  nothingDeleted:
    "Couldn't delete your account. Nothing was deleted. Try again.",
  unconfirmed: "We couldn't confirm whether your account was deleted.",
  stillHere: "Your account is still here. Nothing was deleted.",
  checkFailed:
    "Still couldn't reach Overload. Check your connection, then check again.",
} as const;

export const BILLING_NOTE =
  "If you have a Pro subscription, it's canceled immediately and you won't be charged again. For questions about a refund, contact support.";

export type DeletionView =
  | { kind: "form"; fieldError: string | null; formError: string | null }
  | { kind: "deleting" }
  | { kind: "unconfirmed"; message: string }
  | { kind: "checking" }
  | { kind: "deleted" };

/** A failed delete request, read (spec §5). */
export function deletionFailure(error: unknown): DeletionView {
  if (error instanceof ApiError) {
    if (
      error.code === "network" ||
      error.code === "unavailable" ||
      error.code === "signed_out" ||
      error.code === "unauthorized"
    ) {
      // No answer, or the token stopped working: it may have happened.
      return { kind: "unconfirmed", message: DELETE_MESSAGES.unconfirmed };
    }
    if (error.code === "validation_error" && error.details.password) {
      return {
        kind: "form",
        fieldError: error.details.password,
        formError: null,
      };
    }
    if (error.code === "rate_limited") {
      return {
        kind: "form",
        fieldError: null,
        formError: DELETE_MESSAGES.rateLimited,
      };
    }
    if (
      error.code === "conflict" &&
      error.details.reason === "billing_not_canceled"
    ) {
      return {
        kind: "form",
        fieldError: null,
        formError: DELETE_MESSAGES.billing,
      };
    }
  }
  return {
    kind: "form",
    fieldError: null,
    formError: DELETE_MESSAGES.nothingDeleted,
  };
}

/** Whether an inventory is empty (after identity_pending, it is). */
export function isEmptyInventory(inv: AccountInventoryDto): boolean {
  return Object.values(inv).every((n) => n === 0);
}

/** "Check again": the account's own reads decide what happened. */
export function checkAgainView(
  result:
    | { kind: "gone" }
    | { kind: "present"; inventory: AccountInventoryDto }
    | { kind: "unreachable" },
): DeletionView {
  if (result.kind === "gone") return { kind: "deleted" };
  if (result.kind === "unreachable") {
    return { kind: "unconfirmed", message: DELETE_MESSAGES.checkFailed };
  }
  return {
    kind: "form",
    fieldError: null,
    formError: isEmptyInventory(result.inventory)
      ? DELETE_MESSAGES.identityPending
      : DELETE_MESSAGES.stillHere,
  };
}

/** The inventory rows the web shows, non-zero only, in its order. */
export const INVENTORY_ROWS: {
  key: keyof AccountInventoryDto;
  label: string;
}[] = [
  { key: "mesocycles", label: "Plans (mesocycles)" },
  { key: "loggedSessions", label: "Logged workouts" },
  { key: "loggedSets", label: "Logged sets" },
  { key: "goals", label: "Goals" },
  { key: "gyms", label: "Gyms" },
  { key: "customExercises", label: "Custom exercises" },
  { key: "cardioLogs", label: "Cardio logs" },
];
