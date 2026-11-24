import { submitFeedbackFromRequest } from "@/lib/api/mobile/feedback";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * POST /api/mobile/v1/feedback: send the owner feedback, optionally with
 * screenshots (Pitch 21j E6; RD-10, RD-11). Multipart, with an
 * Idempotency-Key: a retry is answered from the stored record before anything
 * is uploaded again. The same submission the web's Send feedback uses; it
 * reaches the existing admin inbox.
 */
export const POST = mobileRoute(async ({ account, request }) =>
  submitFeedbackFromRequest(account, request),
);
