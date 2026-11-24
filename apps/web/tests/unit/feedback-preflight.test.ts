jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("@/lib/feedback/screenshots", () => ({
  uploadFeedbackScreenshots: jest.fn(async () => [
    {
      objectPath: "acting-user/x/0.png",
      contentType: "image/png",
      sizeBytes: 9,
    },
  ]),
  removeFeedbackScreenshots: jest.fn(async () => {}),
}));

import { requireAccount } from "@/lib/data/account";
import {
  removeFeedbackScreenshots,
  uploadFeedbackScreenshots,
} from "@/lib/feedback/screenshots";
import { submitFeedbackAction } from "@/app/(app)/feedback/actions";
import { FEEDBACK_DAILY_LIMIT } from "@overload/shared/feedback/validation";

/**
 * OVE-126 (mobile audit F-A8): validation and the daily limit are checked
 * BEFORE any screenshot upload, so a refused submission uploads nothing; and
 * when the row insert fails, what was uploaded is removed.
 */

const count = jest.fn();
const create = jest.fn();
const createMany = jest.fn();
const attachmentCount = jest.fn(async () => 0);
const db: Record<string, unknown> = {
  feedback: { count, create },
  feedbackAttachment: { createMany, count: attachmentCount },
};
db.$transaction = (run: (tx: unknown) => unknown) => run(db);

beforeEach(() => {
  jest.clearAllMocks();
  (requireAccount as jest.Mock).mockResolvedValue({
    userId: "acting-user",
    timeZone: "UTC",
    db,
  });
  count.mockResolvedValue(0);
  create.mockResolvedValue({ id: "f1" });
  createMany.mockResolvedValue({ count: 1 });
});

function withScreenshot(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.append(
    "screenshots",
    // Real PNG magic bytes: the server checks the bytes, not just the claim
    // (Pitch 21j RD-11).
    new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])],
      "shot.png",
      { type: "image/png" },
    ),
  );
  return fd;
}

it("at the daily limit, nothing is uploaded", async () => {
  count.mockResolvedValue(FEEDBACK_DAILY_LIMIT);
  const state = await submitFeedbackAction(
    { status: "idle" },
    withScreenshot({ category: "bug", message: "It broke." }),
  );
  expect(state).toMatchObject({ status: "error", formError: "limit" });
  expect(uploadFeedbackScreenshots).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("invalid input uploads nothing", async () => {
  const state = await submitFeedbackAction(
    { status: "idle" },
    withScreenshot({ category: "bug", message: "   " }),
  );
  expect(state).toMatchObject({ status: "error" });
  expect(uploadFeedbackScreenshots).not.toHaveBeenCalled();
});

it("a failed row insert removes the uploaded screenshots", async () => {
  create.mockRejectedValue(new Error("db down"));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const state = await submitFeedbackAction(
    { status: "idle" },
    withScreenshot({ category: "bug", message: "It broke." }),
  );
  expect(state).toMatchObject({ status: "error", formError: "failed" });
  expect(uploadFeedbackScreenshots).toHaveBeenCalledTimes(1);
  expect(removeFeedbackScreenshots).toHaveBeenCalledWith([
    "acting-user/x/0.png",
  ]);
  log.mockRestore();
});

it("a valid submission under the limit uploads and saves", async () => {
  const state = await submitFeedbackAction(
    { status: "idle" },
    withScreenshot({ category: "bug", message: "It broke." }),
  );
  expect(state).toEqual({ status: "sent" });
  expect(uploadFeedbackScreenshots).toHaveBeenCalledTimes(1);
  expect(createMany).toHaveBeenCalled();
  expect(removeFeedbackScreenshots).not.toHaveBeenCalled();
});

it("a file whose bytes aren't the image type it claims is refused, and nothing is uploaded", async () => {
  const fd = new FormData();
  fd.set("category", "bug");
  fd.set("message", "It broke.");
  fd.append(
    "screenshots",
    new File([new TextEncoder().encode("<html>not an image</html>")], "x.png", {
      type: "image/png",
    }),
  );
  const state = await submitFeedbackAction({ status: "idle" }, fd);
  expect(state).toMatchObject({
    status: "error",
    fieldErrors: {
      screenshots:
        "That file isn't the PNG, JPEG, or WebP image it says it is. Save the screenshot again and attach that.",
    },
  });
  expect(uploadFeedbackScreenshots).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("uploads a saved attachment row points at are never removed (Pitch 21j review #3)", async () => {
  const { submitFeedbackWithScreenshots } = jest.requireActual<
    typeof import("@/lib/feedback/submission")
  >("@/lib/feedback/submission");
  attachmentCount.mockResolvedValueOnce(1);
  const account = { userId: "acting-user", timeZone: "UTC", db };
  await submitFeedbackWithScreenshots(
    account as never,
    {
      category: "bug",
      message: "It broke.",
      files: [
        {
          bytes: new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
          ]),
          contentType: "image/png",
          sizeBytes: 9,
        },
      ],
    },
    // A commit whose acknowledgement was lost reads as "not committed".
    { write: async () => ({ committed: false, result: null }) },
  );
  expect(removeFeedbackScreenshots).not.toHaveBeenCalled();
});
