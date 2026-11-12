jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("@/lib/feedback/screenshots", () => ({
  uploadFeedbackScreenshots: jest.fn(async () => [
    {
      objectPath: "acting-user/x/0.png",
      contentType: "image/png",
      sizeBytes: 3,
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
import { FEEDBACK_DAILY_LIMIT } from "@/lib/feedback/validation";

/**
 * OVE-126 (mobile audit F-A8): validation and the daily limit are checked
 * BEFORE any screenshot upload, so a refused submission uploads nothing; and
 * when the row insert fails, what was uploaded is removed.
 */

const count = jest.fn();
const create = jest.fn();
const createMany = jest.fn();
const db: Record<string, unknown> = {
  feedback: { count, create },
  feedbackAttachment: { createMany },
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
    new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" }),
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
