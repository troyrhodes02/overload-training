import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { AccountScopeError } from "@/lib/data/scope";
import { submitFeedback } from "@/lib/feedback/feedback";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { expectForeignLikeMissing } from "./support";

/**
 * Cross-account isolation — Feedback (Admin Center & Feedback, spec §8,
 * §14.2). A lifter's messages to the owner are theirs: another account can't
 * read, count, change, delete, or detect them through the account-scoped
 * client, and the admin-only audit log is unreachable through it entirely.
 */

let a: Account;
let b: Account;
let aFeedbackId: string;

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  // Through the app's own write module (Send feedback).
  const row = await submitFeedback(a, {
    category: "bug",
    message: "A's set entry jumps on the second set",
  });
  aFeedbackId = row.id;
  await b.db.feedback.create({
    data: {
      userId: b.userId,
      category: "idea",
      message: "B would like a dark summary",
    },
  });
});

it("a scoped create is stamped with the acting account", async () => {
  const row = await getTestPrisma().feedback.findUniqueOrThrow({
    where: { id: aFeedbackId },
  });
  expect(row.userId).toBe(a.userId);
});

it("B can't create feedback as A", async () => {
  await expect(
    b.db.feedback.create({
      data: { userId: a.userId, category: "other", message: "spoof" },
    }),
  ).rejects.toBeInstanceOf(AccountScopeError);
});

it("B can't read, list, or count A's feedback", async () => {
  expect(
    await b.db.feedback.findUnique({ where: { id: aFeedbackId } }),
  ).toBeNull();
  expect((await b.db.feedback.findMany()).map((f) => f.userId)).toEqual([
    b.userId,
  ]);
  expect(await b.db.feedback.count()).toBe(1);
  expect(await b.db.feedback.count({ where: { userId: a.userId } })).toBe(0);
});

it("naming A's feedback id looks exactly like naming a missing one", async () => {
  await expectForeignLikeMissing(aFeedbackId, (id) =>
    b.db.feedback.findUniqueOrThrow({ where: { id } }),
  );
});

it("B's daily cap counts only B's messages", async () => {
  for (let i = 0; i < 9; i++) {
    await submitFeedback(a, { category: "other", message: `A ${i}` });
  }
  // A has sent 10 today; B has sent 1 and can still send.
  await expect(
    submitFeedback(b, { category: "idea", message: "B again" }),
  ).resolves.toEqual({ id: expect.any(String) });
});

it("B can't change or delete A's feedback", async () => {
  const before = await getTestPrisma().feedback.findUniqueOrThrow({
    where: { id: aFeedbackId },
  });
  expect(
    await b.db.feedback.updateMany({
      where: { id: aFeedbackId },
      data: { handledAt: new Date() },
    }),
  ).toEqual({ count: 0 });
  expect(
    await b.db.feedback.deleteMany({ where: { id: aFeedbackId } }),
  ).toEqual({ count: 0 });
  expect(
    await getTestPrisma().feedback.findUniqueOrThrow({
      where: { id: aFeedbackId },
    }),
  ).toEqual(before);
});

it("ownership of a feedback row never changes (database trigger)", async () => {
  await expect(
    getTestPrisma().feedback.update({
      where: { id: aFeedbackId },
      data: { userId: b.userId },
    }),
  ).rejects.toThrow();
});

describe("FeedbackAttachment", () => {
  let aAttachmentId: string;
  beforeEach(async () => {
    const att = await a.db.feedbackAttachment.create({
      data: {
        userId: a.userId,
        feedbackId: aFeedbackId,
        objectPath: `${a.userId}/g/0.png`,
        contentType: "image/png",
        sizeBytes: 100,
        position: 0,
      },
    });
    aAttachmentId = att.id;
  });

  it("a scoped create is stamped with the acting account", async () => {
    const row = await getTestPrisma().feedbackAttachment.findUniqueOrThrow({
      where: { id: aAttachmentId },
    });
    expect(row.userId).toBe(a.userId);
  });

  it("B can't read, list, or count A's attachments", async () => {
    expect(
      await b.db.feedbackAttachment.findUnique({
        where: { id: aAttachmentId },
      }),
    ).toBeNull();
    expect(await b.db.feedbackAttachment.findMany()).toEqual([]);
    expect(await b.db.feedbackAttachment.count()).toBe(0);
  });

  it("naming A's attachment id looks exactly like naming a missing one", async () => {
    await expectForeignLikeMissing(aAttachmentId, (id) =>
      b.db.feedbackAttachment.findUniqueOrThrow({ where: { id } }),
    );
  });

  it("B can't attach to A's feedback, even stamped as B (same-owner trigger)", async () => {
    await expect(
      b.db.feedbackAttachment.create({
        data: {
          userId: b.userId,
          feedbackId: aFeedbackId,
          objectPath: `${b.userId}/g/0.png`,
          contentType: "image/png",
          sizeBytes: 100,
          position: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it("B can't change or delete A's attachment", async () => {
    expect(
      await b.db.feedbackAttachment.updateMany({
        where: { id: aAttachmentId },
        data: { position: 3 },
      }),
    ).toEqual({ count: 0 });
    expect(
      await b.db.feedbackAttachment.deleteMany({
        where: { id: aAttachmentId },
      }),
    ).toEqual({ count: 0 });
    expect(
      (
        await getTestPrisma().feedbackAttachment.findUniqueOrThrow({
          where: { id: aAttachmentId },
        })
      ).position,
    ).toBe(0);
  });
});

it("the admin-only audit log is unreachable through any account's client", async () => {
  await getTestPrisma().adminAuditEntry.create({
    data: {
      actorUserId: randomUUID(),
      kind: "account_suspend",
      targetUserId: a.userId,
    },
  });
  const auditDelegate = (a.db as unknown as Record<string, unknown>)
    .adminAuditEntry as { findMany: () => Promise<unknown> };
  await expect(auditDelegate.findMany()).rejects.toBeInstanceOf(
    AccountScopeError,
  );
});
