import { useSyncExternalStore } from "react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX,
  parseFeedbackInput,
  type FeedbackCategoryValue,
  type FeedbackFieldErrors,
} from "@overload/shared/feedback/validation";
import { newIdempotencyKey } from "../api/idempotency";
import type { FeedbackScreenshot } from "../api/account";
import { ApiError } from "../api/errors";
import { deleteLocalImage } from "./screenshot-files";

/**
 * A6 Send feedback's draft and rules (Pitch 21j design §6 A6; RD-10, RD-11).
 * The draft lives in memory for the app's run, so closing the modal by
 * accident loses nothing; it is cleared on a confirmed send, a discard, and
 * sign-out. One send intent is one retry key: a retry after a timeout resends
 * the same key and the server answers once.
 */

export const CATEGORY_OPTIONS = FEEDBACK_CATEGORIES.map((value) => ({
  value,
  label: FEEDBACK_CATEGORY_LABELS[value],
}));

export type FeedbackDraft = {
  category: FeedbackCategoryValue | null;
  message: string;
  screenshot: FeedbackScreenshot | null;
  /** A picked image is still being prepared; Send waits for it (OVE-252). */
  preparing: boolean;
  key: string;
};

const fresh = (): FeedbackDraft => ({
  category: null,
  message: "",
  screenshot: null,
  preparing: false,
  key: newIdempotencyKey(),
});

let draft: FeedbackDraft = fresh();
/** Bumped on every reset, so a pick that finishes afterwards is dropped. */
let generation = 0;
export const feedbackDraftGeneration = () => generation;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useFeedbackDraft(): FeedbackDraft {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
  );
}

/** Change the draft. Changing what is sent starts a new intent (a new key). */
export function updateFeedbackDraft(patch: Partial<FeedbackDraft>): void {
  const changes =
    (patch.category !== undefined && patch.category !== draft.category) ||
    (patch.message !== undefined && patch.message !== draft.message) ||
    (patch.screenshot !== undefined && patch.screenshot !== draft.screenshot);
  // A replaced or removed screenshot's local file goes at once (review #4).
  if (
    patch.screenshot !== undefined &&
    draft.screenshot &&
    patch.screenshot?.uri !== draft.screenshot.uri
  ) {
    deleteLocalImage(draft.screenshot.uri);
  }
  draft = {
    ...draft,
    ...patch,
    key: changes ? newIdempotencyKey() : draft.key,
  };
  emit();
}

/** A confirmed send, a discard, or sign-out. */
export function resetFeedbackDraft(): void {
  // Sent, discarded, signed out, or deleted: the screenshot file goes too.
  deleteLocalImage(draft.screenshot?.uri);
  generation += 1;
  draft = fresh();
  emit();
}

/** Whether the draft holds anything the lifter typed or chose. */
export function hasDraft(d: FeedbackDraft): boolean {
  return (
    d.category !== null || d.message.trim() !== "" || d.screenshot !== null
  );
}

export function canSend(d: FeedbackDraft): boolean {
  return d.category !== null && d.message.trim() !== "";
}

/** The shared rules, for early feedback; the server decides. */
export function checkFeedback(d: FeedbackDraft): FeedbackFieldErrors {
  const parsed = parseFeedbackInput({
    category: d.category,
    message: d.message,
  });
  return parsed.ok ? {} : parsed.errors;
}

export const messageCounter = (message: string) =>
  `${message.trim().length.toLocaleString("en-US")} / ${FEEDBACK_MESSAGE_MAX.toLocaleString("en-US")}`;

/** What a failed send says (design A6). Field details stay on their fields. */
export function sendFailure(error: unknown): {
  fields: FeedbackFieldErrors;
  banner: string | null;
} {
  if (error instanceof ApiError) {
    const d = error.details ?? {};
    const fields: FeedbackFieldErrors = {
      category: d.category,
      message: d.message,
      screenshots: d.screenshots,
    };
    if (fields.category || fields.message || fields.screenshots) {
      return { fields, banner: null };
    }
    if (error.code === "conflict" && d.reason === "daily_limit") {
      return {
        fields: {},
        banner: "You've sent a lot of feedback today. Try again tomorrow.",
      };
    }
  }
  return { fields: {}, banner: "Couldn't send. Your message is still here." };
}
