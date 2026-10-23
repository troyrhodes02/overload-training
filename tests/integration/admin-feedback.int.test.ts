import { randomUUID } from "node:crypto";
import {
  getFeedbackItem,
  listFeedback,
  parseInboxQuery,
  setFeedbackCategory,
  setFeedbackHandled,
} from "@/lib/data/admin/feedback";
import { adminActorFor } from "@/lib/data/admin/identity";
import { submitFeedback } from "@/lib/feedback/feedback";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * The owner's feedback inbox against a real database (Admin Center &
 * Feedback, spec §6.3, §11; R5, R6): views and filters, sender metadata only,
 * and handled / reopened / recategorized each audited exactly once.
 */

const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad04";
const saved = process.env.OVERLOAD_ADMIN_USER_IDS;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = saved;
});

const raw = () => getTestPrisma();
const actor = () => adminActorFor(ADMIN_ID, "UTC");
const q = (over: Record<string, string> = {}) => parseInboxQuery(over);

let maya: Account;
let sam: Account;
let bug: string;
let idea: string;
const emails = async () =>
  new Map([
    [maya.userId, "maya@example.test"],
    [sam.userId, "sam@example.test"],
  ]);

beforeEach(async () => {
  await createTestAccount("UTC", ADMIN_ID);
  maya = await createTestAccount();
  sam = await createTestAccount();
  await raw().profile.update({
    where: { userId: maya.userId },
    data: { firstName: "Maya", lastName: "Chen", username: "mayac" },
  });
  bug = (
    await submitFeedback(maya, {
      category: "bug",
      message: "The set entry jumps.",
    })
  ).id;
  idea = (
    await submitFeedback(sam, { category: "idea", message: "Dark summary?" })
  ).id;
});

it("the Open view lists every open message newest first with the sender's metadata", async () => {
  const list = await listFeedback(actor(), q(), emails);
  expect(list.openCount).toBe(2);
  expect(list.rows.map((r) => r.id)).toEqual([idea, bug]);
  expect(list.rows[1]).toEqual({
    id: bug,
    category: "bug",
    message: "The set entry jumps.",
    createdAt: expect.any(String),
    handledAt: null,
    sender: {
      id: maya.userId,
      name: "Maya Chen",
      username: "mayac",
      email: "maya@example.test",
      exists: true,
    },
  });
  // No name: the email identifies the sender.
  expect(list.rows[0].sender).toMatchObject({
    name: null,
    email: "sam@example.test",
  });
});

it("filters by category and by account, and parses unknown params to defaults", async () => {
  expect(
    (await listFeedback(actor(), q({ category: "bug" }), emails)).rows.map(
      (r) => r.id,
    ),
  ).toEqual([bug]);
  const fromSam = await listFeedback(
    actor(),
    q({ account: sam.userId }),
    emails,
  );
  expect(fromSam.rows.map((r) => r.id)).toEqual([idea]);
  expect(fromSam.account).toEqual({
    id: sam.userId,
    label: "sam@example.test",
  });
  expect(
    parseInboxQuery({ view: "nope", category: "praise", page: "-1" }),
  ).toEqual({ view: "open", category: null, account: null, page: 1 });
});

it("mark handled and reopen: each writes one audit row naming the sender; repeats write none", async () => {
  expect(await setFeedbackHandled(actor(), bug, true)).toEqual({
    changed: true,
  });
  expect(await setFeedbackHandled(actor(), bug, true)).toEqual({
    changed: false,
  });
  const handled = await listFeedback(actor(), q({ view: "handled" }), emails);
  expect(handled.rows.map((r) => r.id)).toEqual([bug]);
  expect(handled.openCount).toBe(1);

  expect(await setFeedbackHandled(actor(), bug, false)).toEqual({
    changed: true,
  });
  expect(await setFeedbackHandled(actor(), bug, false)).toEqual({
    changed: false,
  });
  const audit = await raw().adminAuditEntry.findMany({
    orderBy: { createdAt: "asc" },
  });
  expect(audit.map((a) => [a.kind, a.targetUserId, a.feedbackId])).toEqual([
    ["feedback_handled", maya.userId, bug],
    ["feedback_reopened", maya.userId, bug],
  ]);
  // The message itself never changed.
  expect(
    (await raw().feedback.findUniqueOrThrow({ where: { id: bug } })).message,
  ).toBe("The set entry jumps.");
});

it("recategorize records from → to; the same category or a bad one records nothing", async () => {
  expect(await setFeedbackCategory(actor(), bug, "idea")).toEqual({
    changed: true,
  });
  expect(await setFeedbackCategory(actor(), bug, "idea")).toEqual({
    changed: false,
  });
  await expect(setFeedbackCategory(actor(), bug, "praise")).rejects.toEqual(
    new DomainError("validation_error", "Choose a category."),
  );
  const item = await getFeedbackItem(actor(), bug, emails);
  expect(item?.category).toBe("idea");
  expect(item?.history.map((l) => [l.kind, l.detail])).toEqual([
    ["feedback_recategorized", { from: "bug", to: "idea" }],
  ]);
  expect(await raw().adminAuditEntry.count()).toBe(1);
});

it("unknown or malformed ids are not-found and record nothing", async () => {
  expect(await getFeedbackItem(actor(), randomUUID(), emails)).toBeNull();
  expect(await getFeedbackItem(actor(), "x", emails)).toBeNull();
  await expect(
    setFeedbackHandled(actor(), randomUUID(), true),
  ).rejects.toMatchObject({ code: "not_found" });
  await expect(setFeedbackCategory(actor(), "x", "bug")).rejects.toMatchObject({
    code: "not_found",
  });
  expect(await raw().adminAuditEntry.count()).toBe(0);
});

it("an actor no longer on the allowlist can neither read nor change feedback", async () => {
  const stale = actor();
  process.env.OVERLOAD_ADMIN_USER_IDS = "";
  try {
    await expect(listFeedback(stale, q(), emails)).rejects.toThrow(
      "Not an admin.",
    );
    await expect(setFeedbackHandled(stale, bug, true)).rejects.toThrow(
      "Not an admin.",
    );
  } finally {
    process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
  }
  expect(
    (await raw().feedback.findUniqueOrThrow({ where: { id: bug } })).handledAt,
  ).toBeNull();
});
