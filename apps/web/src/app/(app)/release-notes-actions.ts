"use server";

import { requireAccount } from "@/lib/data/account";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { markReleaseNotesSeen } from "@/lib/release-notes/seen";

/*
 * What's New server action (What's New spec §11). The acting account comes
 * from the auth session only; the one input is a release-note entry id, which
 * is content, not identity, and is validated against the catalog. No
 * refresh(): the dialog is already open or closing, and the next full load
 * reads the stored state.
 */

/** The dialog has been shown: everything through `throughId` is seen (R13). */
export async function markReleaseNotesSeenAction(
  throughId: unknown,
): Promise<ActionResult<{ moved: boolean }>> {
  const account = await requireAccount();
  return toActionResult(
    () => markReleaseNotesSeen(account, throughId),
    "Couldn't save that you've seen this update.",
  );
}
