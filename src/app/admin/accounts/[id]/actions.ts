"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/data/admin/identity";
import {
  reactivateAccount,
  suspendAccount,
  type AccessChange,
} from "@/lib/data/admin/accounts";
import { toActionResult, type ActionResult } from "@/lib/actions/result";

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
