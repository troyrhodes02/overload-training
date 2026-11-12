"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/data/admin/identity";
import {
  setFeedbackCategory,
  setFeedbackHandled,
  type FeedbackChange,
} from "@/lib/data/admin/feedback";
import { toActionResult, type ActionResult } from "@/lib/actions/result";

/**
 * The feedback item's controls (Admin Center & Feedback, spec §11; R5, R6).
 * The admin check runs first — a non-admin calling these directly gets the
 * not-found response before any argument is read. Each change is audited in
 * its own transaction; a repeat changes nothing.
 */
export async function setFeedbackHandledAction(
  feedbackId: string,
  handled: boolean,
): Promise<ActionResult<FeedbackChange>> {
  const actor = await requireAdmin();
  const result = await toActionResult(
    () => setFeedbackHandled(actor, feedbackId, handled),
    "Couldn't save. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function setFeedbackCategoryAction(
  feedbackId: string,
  category: string,
): Promise<ActionResult<FeedbackChange>> {
  const actor = await requireAdmin();
  const result = await toActionResult(
    () => setFeedbackCategory(actor, feedbackId, category),
    "Couldn't save. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}
