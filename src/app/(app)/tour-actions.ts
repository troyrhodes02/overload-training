"use server";

import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  markTourOffered,
  recordTourOutcome,
  type TourOutcomeValue,
} from "@/lib/tour/progress";

/*
 * Onboarding tour server actions (Onboarding Tour, spec §11). The acting
 * account comes from the auth session only; neither action accepts an account
 * id. No refresh(): the client already knows the tour has closed, and the next
 * server render reads the stored state.
 */

/** The automatically started tour has appeared: spend the offer (R8). */
export async function markTourOfferedAction(): Promise<
  ActionResult<{ spent: boolean }>
> {
  const account = await requireAccount();
  return toActionResult(
    () => markTourOffered(account),
    "Couldn't save your tour progress.",
  );
}

/** A run was finished ("completed") or skipped ("skipped") (R7). */
export async function recordTourOutcomeAction(
  outcome: unknown,
): Promise<ActionResult<{ outcome: TourOutcomeValue }>> {
  const account = await requireAccount();
  return toActionResult(
    async () => ({ outcome: await recordTourOutcome(account, outcome) }),
    "Couldn't save your tour progress.",
  );
}
