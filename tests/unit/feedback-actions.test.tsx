jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import { requireAccount } from "@/lib/data/account";
import { submitFeedbackAction } from "@/app/(app)/feedback/actions";
import { SendFeedback } from "@/components/send-feedback/send-feedback-form";

/**
 * Send feedback (Admin Center & Feedback, spec §11; design doc Screen 10).
 * The account comes from the auth session; only category and message are
 * read from the form; failures return the draft; the daily cap is enforced.
 */

const count = jest.fn();
const create = jest.fn();
const transaction = jest.fn();
const db: Record<string, unknown> = { feedback: { count, create } };
db.$transaction = transaction;
const account = { userId: "acting-user", timeZone: "UTC", db };

beforeEach(() => {
  jest.clearAllMocks();
  (requireAccount as jest.Mock).mockResolvedValue(account);
  count.mockResolvedValue(0);
  create.mockResolvedValue({ id: "f1" });
  // The count and the insert share one serializable transaction.
  transaction.mockImplementation((run: (tx: unknown) => unknown) => run(db));
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

it("sends the acting account's trimmed message and nothing else", async () => {
  const state = await submitFeedbackAction(
    { status: "idle" },
    form({
      category: "bug",
      message: "  The set entry jumps.  ",
      userId: "someone-else",
      route: "/exercises/abc",
    }),
  );
  expect(state).toEqual({ status: "sent" });
  expect(requireAccount).toHaveBeenCalledTimes(1);
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "Serializable",
  });
  expect(create).toHaveBeenCalledWith({
    data: {
      userId: "acting-user",
      category: "bug",
      message: "The set entry jumps.",
    },
    select: { id: true },
  });
});

it("returns field errors and the draft for invalid input, writing nothing", async () => {
  const state = await submitFeedbackAction(
    { status: "idle" },
    form({ category: "praise", message: "   " }),
  );
  expect(state).toEqual({
    status: "error",
    fieldErrors: {
      category: "Choose what it's about.",
      message: "Write a message.",
    },
    formError: null,
    draft: { category: "praise", message: "   " },
  });
  expect(create).not.toHaveBeenCalled();
});

it("refuses the eleventh message in 24 hours and keeps the draft", async () => {
  count.mockResolvedValue(10);
  const state = await submitFeedbackAction(
    { status: "idle" },
    form({ category: "idea", message: "one more" }),
  );
  expect(state).toEqual({
    status: "error",
    fieldErrors: {},
    formError: "limit",
    draft: { category: "idea", message: "one more" },
  });
  expect(count).toHaveBeenCalledWith({
    where: { createdAt: { gte: expect.any(Date) } },
  });
  expect(create).not.toHaveBeenCalled();
});

it("a failed write says so plainly and keeps the draft", async () => {
  create.mockRejectedValue(new Error("db down"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const state = await submitFeedbackAction(
    { status: "idle" },
    form({ category: "question", message: "How?" }),
  );
  expect(state).toMatchObject({ status: "error", formError: "failed" });
  expect(spy).toHaveBeenCalledWith("feedback: send failed", "Error");
  spy.mockRestore();
});

it("the form shows the four categories, the message field, and Send, and promises no reply", () => {
  const html = renderToStaticMarkup(<SendFeedback />);
  for (const label of ["Bug", "Idea", "Question", "Other", "Message", "Send"]) {
    expect(html).toContain(label);
  }
  expect(html).toContain("Replies aren&#x27;t sent in the app.");
  expect(html).toContain("0 / 2000");
  expect(html).not.toMatch(/admin|upgrade|Pro\b/i);
});
