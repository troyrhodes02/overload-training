import "server-only";
import { createHash } from "node:crypto";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { submitFeedback } from "@/lib/feedback/feedback";
import {
  submitFeedbackWithScreenshots,
  type FeedbackSubmissionDeps,
  type ScreenshotFile,
} from "@/lib/feedback/submission";
import {
  FEEDBACK_FORM_FIELDS,
  type FeedbackResponseDto,
} from "@overload/shared/contracts/feedback";
import { FEEDBACK_SCREENSHOT_MAX_COUNT } from "@overload/shared/feedback/attachment-validation";
import { ApiFailure } from "./errors";
import {
  findReplay,
  IDEMPOTENCY_HEADER,
  parseIdempotencyKey,
  REPLAYED_HEADER,
  withIdempotency,
} from "./idempotency";

/**
 * `POST /feedback` from the iPhone app (Pitch 21j E6; RD-10, RD-11).
 *
 * Multipart form data: `category`, `message`, and zero or more image files
 * under `screenshots`, with an `Idempotency-Key`. The submission is the web's
 * own (`submitFeedbackWithScreenshots`); this adds only the retry key:
 *
 *   1. read the body, at most BODY_LIMIT bytes (the hosting request limit);
 *   2. the key, and the request's fingerprint (category, message, and each
 *      screenshot's SHA-256);
 *   3. a committed answer for the key is returned now, BEFORE any upload, so
 *      a retry never stores a second copy;
 *   4. otherwise the shared submission, whose write is the idempotency claim
 *      plus `submitFeedback` in ONE serializable transaction (the daily-limit
 *      race stays guarded); an answer that isn't this request's own fresh
 *      201 removes what this request uploaded.
 */

const SCOPE = "POST feedback";

/** Vercel's request body limit; the screenshot rules cap the files below it. */
export const FEEDBACK_BODY_LIMIT = 4_500_000;

const BODY_ERROR = "Send the feedback as multipart form data.";

async function readMultipart(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(type)) {
    throw new ApiFailure("validation_error", BODY_ERROR);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > FEEDBACK_BODY_LIMIT) {
    throw tooLarge();
  }
  // A running byte count, so an understated or chunked body is cut off at the
  // cap instead of being buffered whole.
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > FEEDBACK_BODY_LIMIT) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return await new Response(bytes, {
      headers: { "content-type": type },
    }).formData();
  } catch {
    throw new ApiFailure("validation_error", BODY_ERROR);
  }
}

function tooLarge(): ApiFailure {
  const message = "Keep the screenshots under 4 MB in total.";
  return new ApiFailure("validation_error", message, { screenshots: message });
}

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export async function submitFeedbackFromRequest(
  account: Account,
  request: Request,
  deps: FeedbackSubmissionDeps = {},
): Promise<Response> {
  const key = parseIdempotencyKey(request.headers.get(IDEMPOTENCY_HEADER));
  if (key instanceof ApiFailure) throw key;

  const form = await readMultipart(request);
  const category = form.get(FEEDBACK_FORM_FIELDS.category);
  const message = form.get(FEEDBACK_FORM_FIELDS.message);
  const parts = form
    .getAll(FEEDBACK_FORM_FIELDS.screenshots)
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (parts.length > FEEDBACK_SCREENSHOT_MAX_COUNT) {
    // Refused before any file is read into memory twice.
    const text = `Attach at most ${FEEDBACK_SCREENSHOT_MAX_COUNT} screenshots.`;
    throw new ApiFailure("validation_error", text, { screenshots: text });
  }
  const files: ScreenshotFile[] = await Promise.all(
    parts.map(async (f) => ({
      bytes: new Uint8Array(await f.arrayBuffer()),
      contentType: f.type,
      sizeBytes: f.size,
      name: f.name,
    })),
  );

  const fields = {
    category: typeof category === "string" ? category : null,
    message: typeof message === "string" ? message : null,
  };
  const fingerprint = {
    ...fields,
    screenshots: files.map((f) => sha256(f.bytes)),
  };
  const args = { key, scope: SCOPE, body: fingerprint };

  const replay = await findReplay(account, args);
  if (replay) return replay;

  try {
    return await submitFeedbackWithScreenshots<Response>(
      account,
      { ...fields, files },
      {
        deps,
        write: async (attachments) => {
          const response = await withIdempotency<FeedbackResponseDto>(
            account,
            args,
            async (tx) => {
              await submitFeedback(
                account,
                { ...fields, attachments },
                deps.now ?? new Date(),
                tx,
              );
              return { status: 201, body: { sent: true } };
            },
            { isolationLevel: "Serializable" },
          );
          const committed =
            response.status === 201 &&
            response.headers.get(REPLAYED_HEADER) === null;
          return { committed, result: response };
        },
      },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "conflict") {
      throw new ApiFailure(
        "conflict",
        "You've sent a lot of feedback today. Try again tomorrow.",
        { reason: "daily_limit" },
      );
    }
    throw error;
  }
}
