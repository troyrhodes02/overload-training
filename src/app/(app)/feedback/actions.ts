"use server";

import { requireAccount } from "@/lib/data/account";
import { DomainError } from "@/lib/actions/result";
import { submitFeedback } from "@/lib/feedback/feedback";
import type { FeedbackFieldErrors } from "@/lib/feedback/validation";

export type SubmitFeedbackState =
  | { status: "idle" }
  | { status: "sent" }
  | {
      status: "error";
      fieldErrors: FeedbackFieldErrors;
      formError: "failed" | "limit" | null;
      draft: { category: string; message: string };
    };

/**
 * Sends the signed-in lifter's feedback (Admin Center & Feedback, spec §11).
 * The account comes from the auth session; the form carries only the
 * category and the message. On any failure the draft comes back so nothing
 * typed is lost.
 */
export async function submitFeedbackAction(
  _prev: SubmitFeedbackState,
  formData: FormData,
): Promise<SubmitFeedbackState> {
  const account = await requireAccount();
  const category = formData.get("category");
  const message = formData.get("message");
  const draft = {
    category: typeof category === "string" ? category : "",
    message: typeof message === "string" ? message : "",
  };
  try {
    await submitFeedback(account, { category, message });
    return { status: "sent" };
  } catch (error) {
    if (error instanceof DomainError && error.code === "validation_error") {
      return {
        status: "error",
        fieldErrors: (error.details ?? {}) as FeedbackFieldErrors,
        formError: null,
        draft,
      };
    }
    if (error instanceof DomainError && error.code === "conflict") {
      return { status: "error", fieldErrors: {}, formError: "limit", draft };
    }
    console.error(
      "feedback: send failed",
      error instanceof Error ? error.name : "unknown",
    );
    return { status: "error", fieldErrors: {}, formError: "failed", draft };
  }
}
