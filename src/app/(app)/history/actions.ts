"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { editLoggedSet } from "@/lib/logging/logged-sets";

/*
 * History server actions. Past-log correction edits weight/reps only (Resolved
 * Decision 51). No deletion exists. Editing never replays gym baselines
 * (Decisions 53/54); the write module enforces that.
 */
export async function editLoggedSetAction(input: {
  loggedSetId: string;
  weightLbs: number;
  reps: number;
}): Promise<ActionResult<{ ok: true }>> {
  await requireUser();
  const result = await toActionResult(async () => {
    await editLoggedSet(input);
    return { ok: true as const };
  }, "Couldn't update the set.");
  if (result.ok) refresh();
  return result;
}
