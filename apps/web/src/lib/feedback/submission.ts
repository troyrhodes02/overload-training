import "server-only";
import { randomUUID } from "node:crypto";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { assertFeedbackAllowed, submitFeedback } from "./feedback";
import {
  removeFeedbackScreenshots,
  uploadFeedbackScreenshots,
  type UploadedScreenshot,
} from "./screenshots";
import {
  SCREENSHOT_MISMATCH_ERROR,
  sniffImageType,
  validateScreenshots,
} from "@overload/shared/feedback/attachment-validation";

/**
 * ONE feedback submission for both clients (Pitch 21j RD-11; Admin Center &
 * Feedback spec §11). The web's Send feedback action and the iPhone app's
 * `POST /feedback` both come here, so the rules can't drift:
 *
 *   1. the screenshots, as a set: count, declared type, size (the web's
 *      limits), and each file's BYTES must be the type it claims (audit F-A15)
 *      — a mismatch is refused, never stored;
 *   2. the message and category, and the daily limit, BEFORE anything is
 *      uploaded (OVE-126), so a refused submission puts nothing in Storage;
 *   3. upload under the acting account's own prefix `<userId>/<uuid>/…`
 *      (the prefix comes from the session or token, never the request);
 *   4. write the message and its attachment rows (`write`, by default
 *      `submitFeedback` in its own serializable transaction);
 *   5. on any failure after the upload, or a write that didn't commit THIS
 *      submission (a replayed or conflicting retry key), remove the uploaded
 *      objects so nothing lingers.
 *
 * Problems are DomainErrors: `validation_error` with field details
 * (`category`, `message`, `screenshots`) and `conflict` "limit". Callers map
 * them to their own result shape.
 */

export type ScreenshotFile = {
  bytes: Uint8Array;
  /** The content type the client declared. */
  contentType: string;
  sizeBytes: number;
  name?: string;
};

export type FeedbackSubmissionDeps = {
  upload?: typeof uploadFeedbackScreenshots;
  remove?: typeof removeFeedbackScreenshots;
  now?: Date;
};

export type FeedbackWrite<T> = (
  attachments: UploadedScreenshot[],
) => Promise<{ committed: boolean; result: T }>;

/** Step 1: the screenshot set, by declared type and size and then by bytes. */
export function checkScreenshotFiles(files: ScreenshotFile[]): void {
  const meta = validateScreenshots(
    files.map((f) => ({
      name: f.name ?? "",
      type: f.contentType,
      size: f.sizeBytes,
    })),
  );
  if (!meta.ok) {
    throw new DomainError("validation_error", meta.error, {
      screenshots: meta.error,
    });
  }
  for (const f of files) {
    if (
      f.bytes.byteLength !== f.sizeBytes ||
      sniffImageType(f.bytes) !== f.contentType
    ) {
      throw new DomainError("validation_error", SCREENSHOT_MISMATCH_ERROR, {
        screenshots: SCREENSHOT_MISMATCH_ERROR,
      });
    }
  }
}

export async function submitFeedbackWithScreenshots<T = { id: string }>(
  account: Account,
  input: { category: unknown; message: unknown; files: ScreenshotFile[] },
  opts: { write?: FeedbackWrite<T>; deps?: FeedbackSubmissionDeps } = {},
): Promise<T> {
  const upload = opts.deps?.upload ?? uploadFeedbackScreenshots;
  const remove = opts.deps?.remove ?? removeFeedbackScreenshots;
  const now = opts.deps?.now ?? new Date();
  const fields = { category: input.category, message: input.message };

  checkScreenshotFiles(input.files);
  await assertFeedbackAllowed(account, fields, now);

  const write: FeedbackWrite<T> =
    opts.write ??
    (async (attachments) => ({
      committed: true,
      result: (await submitFeedback(
        account,
        { ...fields, attachments },
        now,
      )) as T,
    }));

  let uploaded: UploadedScreenshot[] = [];
  try {
    if (input.files.length > 0) {
      uploaded = await upload(
        `${account.userId}/${randomUUID()}`,
        input.files.map((f) => ({
          bytes: f.bytes,
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
        })),
      );
    }
    const { committed, result } = await write(uploaded);
    if (!committed) await removeUnreferenced(account, uploaded, remove);
    return result;
  } catch (error) {
    // The message didn't save (the insert failed or lost the limit race), so
    // its uploaded screenshots must not linger.
    await removeUnreferenced(account, uploaded, remove);
    throw error;
  }
}

/**
 * Remove this submission's uploads, but never one a saved attachment row
 * points at (Pitch 21j review #3): a commit whose acknowledgement was lost
 * looks like a failure or a replay to the caller, yet its rows exist. If the
 * check itself fails, keep the objects — an orphan is a cleanup concern, a
 * broken attachment is a lost screenshot.
 */
async function removeUnreferenced(
  account: Account,
  uploaded: UploadedScreenshot[],
  remove: typeof removeFeedbackScreenshots,
): Promise<void> {
  if (uploaded.length === 0) return;
  const paths = uploaded.map((u) => u.objectPath);
  let referenced: number;
  try {
    referenced = await account.db.feedbackAttachment.count({
      where: { objectPath: { in: paths } },
    });
  } catch {
    return;
  }
  if (referenced === 0) await remove(paths);
}
