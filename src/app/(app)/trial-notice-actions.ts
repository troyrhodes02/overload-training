"use server";

import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { markTrialNoticeShown } from "@/lib/billing/trial-notice";

/*
 * Trial notices (OVE-112). The acting account comes from the auth session
 * only; the one input is the notice phase, which is content, not identity,
 * and is validated. Recording a notice as shown is presentation state and
 * never changes an entitlement.
 */

/** The notice has been shown: it won't appear again for this account. */
export async function markTrialNoticeShownAction(
  phase: unknown,
): Promise<ActionResult<{ moved: boolean }>> {
  const account = await requireAccount();
  return toActionResult(
    () => markTrialNoticeShown(account, phase),
    "Couldn't save that you've seen this notice.",
  );
}
