"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/data/admin/identity";
import {
  reactivateAccount,
  suspendAccount,
  type AccessChange,
} from "@/lib/data/admin/accounts";
import {
  sendAccountResetEmail,
  type SendResetEmailResult,
} from "@/lib/data/admin/reset-email";
import { grantComp, revokeComp } from "@/lib/data/admin/billing";
import { parseCompEndsAt } from "@/lib/admin/comp-ends-at";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import type { CompReason } from "@prisma/client";

/**
 * Suspend and reactivate (Admin Center & Feedback, spec §11; R3, R6). The
 * admin check runs first — a non-admin calling this directly gets the
 * not-found response before any argument is read. The target id names the
 * account acted ON; the acting admin always comes from the auth session.
 */
export async function suspendAccountAction(
  targetId: string,
): Promise<ActionResult<AccessChange>> {
  const actor = await requireAdmin();
  const result = await toActionResult(
    () => suspendAccount(actor, targetId),
    "Couldn't change the account. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function reactivateAccountAction(
  targetId: string,
): Promise<ActionResult<AccessChange>> {
  const actor = await requireAdmin();
  const result = await toActionResult(
    () => reactivateAccount(actor, targetId),
    "Couldn't change the account. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

/**
 * Send the target account the standard password-recovery email (Public
 * Accounts, spec §9, R8). requireAdmin() runs first — a non-admin calling this
 * directly gets not-found before any argument is read. The acting admin always
 * comes from the session; the target is named, never trusted for identity. It
 * reveals/changes no password and does not bypass suspension; it is audited in
 * the same transaction as the send. On success the page refreshes so the new
 * audit line appears in "Admin actions".
 */
export async function sendResetEmailAction(
  targetId: string,
): Promise<ActionResult<SendResetEmailResult>> {
  const actor = await requireAdmin();
  const result = await toActionResult(
    () => sendAccountResetEmail(actor, targetId),
    "Couldn't send the reset email. Nothing was sent. Try again.",
  );
  if (result.ok) refresh();
  return result;
}

/**
 * Grant / revoke complimentary Pro (Plans, Billing & Promo Codes, spec §9;
 * AC-3). requireAdmin() runs first — a non-admin gets not-found before any
 * argument is read. The acting admin comes from the session; the target is
 * named. Each is audited in the same transaction and never touches Stripe.
 */
export async function grantCompAction(input: {
  targetId: string;
  reason: CompReason;
  note?: string;
  endsAt?: unknown;
}): Promise<ActionResult<{ granted: true }>> {
  const actor = await requireAdmin();
  // Validate the end date before it becomes a Date (OVE-127 / audit F-A16): a
  // malformed or past value is a validation_error, never an internal_error.
  const endsAt = parseCompEndsAt(input.endsAt);
  if (endsAt === "invalid") {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Enter a valid end date.",
      },
    };
  }
  if (endsAt && endsAt.getTime() <= Date.now()) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Pick a future end date or leave it open.",
      },
    };
  }
  const result = await toActionResult(
    () =>
      grantComp(actor, {
        targetUserId: input.targetId,
        reason: input.reason,
        note: input.note ?? null,
        endsAt,
      }),
    "Couldn't grant complimentary access. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function revokeCompAction(
  targetId: string,
): Promise<ActionResult<{ changed: boolean }>> {
  const actor = await requireAdmin();
  const result = await toActionResult(
    () => revokeComp(actor, targetId),
    "Couldn't revoke complimentary access. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}
