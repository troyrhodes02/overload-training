"use server";

import { randomUUID } from "node:crypto";
import { requireAccount } from "@/lib/data/account";
import { DomainError } from "@/lib/actions/result";
import { submitFeedback } from "@/lib/feedback/feedback";
import type { FeedbackFieldErrors } from "@/lib/feedback/validation";
import { validateScreenshots } from "@/lib/feedback/attachment-validation";
import {
  removeFeedbackScreenshots,
  uploadFeedbackScreenshots,
} from "@/lib/feedback/screenshots";

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

  // Screenshots are optional; keep only non-empty files the browser attached.
  const files = formData
    .getAll("screenshots")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const screenshotCheck = validateScreenshots(
    files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  );
  if (!screenshotCheck.ok) {
    return {
      status: "error",
      fieldErrors: { screenshots: screenshotCheck.error },
      formError: null,
      draft,
    };
  }

  let uploadedPaths: string[] = [];
  try {
    if (files.length > 0) {
      const bytes = await Promise.all(
        files.map(async (f) => ({
          bytes: new Uint8Array(await f.arrayBuffer()),
          contentType: f.type,
          sizeBytes: f.size,
        })),
      );
      const uploaded = await uploadFeedbackScreenshots(
        `${account.userId}/${randomUUID()}`,
        bytes,
      );
      uploadedPaths = uploaded.map((u) => u.objectPath);
      await submitFeedback(account, {
        category,
        message,
        attachments: uploaded,
      });
    } else {
      await submitFeedback(account, { category, message });
    }
    return { status: "sent" };
  } catch (error) {
    // The message never saved, so its uploaded screenshots must not linger.
    if (uploadedPaths.length > 0)
      await removeFeedbackScreenshots(uploadedPaths);
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
