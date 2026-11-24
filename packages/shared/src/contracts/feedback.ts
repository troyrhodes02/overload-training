/**
 * Feedback contracts (Pitch 21j E6). `POST /feedback` is multipart form data
 * with an `Idempotency-Key`: the fields below, plus zero or more image files
 * under `screenshots`. The account is the token's; nothing else about the
 * device, route, or training is sent.
 */

/** The multipart field names, shared by the app and the server. */
export const FEEDBACK_FORM_FIELDS = {
  category: "category",
  message: "message",
  screenshots: "screenshots",
} as const;

/** `POST /feedback` → 201. */
export type FeedbackResponseDto = { sent: true };
