import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import {
  personName,
  type FeedbackCategoryValue,
  type FeedbackItemDto,
  type FeedbackListDto,
  type FeedbackRowDto,
  type FeedbackView,
} from "@/lib/admin/types";
import { isFeedbackCategory } from "@/lib/feedback/validation";
import { adminDb, inAdminTx, type AdminDb } from "./db";
import { recordAudit } from "./audit";
import { auditLines } from "./audit-read";
import { readEmails, type EmailSource } from "./emails";
import { assertAdmin, type AdminActor } from "./identity";

/**
 * The owner's feedback inbox (Admin Center & Feedback, spec §6.3, §11; R5,
 * R6, R20). It reads the messages lifters chose to send plus the sender's
 * account metadata — never anything about the sender's training. Marking
 * handled, reopening, and recategorizing are each audited in the same
 * transaction; a repeat changes nothing and records nothing. Reading is not
 * handling, and nothing is ever sent back to the lifter.
 */

export const INBOX_PAGE_SIZE = 50;

const FIELDS = {
  id: true,
  userId: true,
  category: true,
  message: true,
  createdAt: true,
  handledAt: true,
} as const;

type FeedbackRow = {
  id: string;
  userId: string;
  category: FeedbackCategoryValue;
  message: string;
  createdAt: Date;
  handledAt: Date | null;
};

export type InboxQuery = {
  view: FeedbackView;
  category: FeedbackCategoryValue | null;
  account: string | null;
  page: number;
};

export function parseInboxQuery(raw: {
  view?: unknown;
  category?: unknown;
  account?: unknown;
  page?: unknown;
}): InboxQuery {
  const view = raw.view === "handled" || raw.view === "all" ? raw.view : "open";
  const category = isFeedbackCategory(raw.category) ? raw.category : null;
  const account = isUuid(raw.account) ? raw.account : null;
  const n = typeof raw.page === "string" ? Number(raw.page) : NaN;
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  return { view, category, account, page };
}

async function senders(
  db: AdminDb,
  ids: string[],
  emailSource?: EmailSource,
): Promise<Map<string, FeedbackRowDto["sender"]>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [profiles, emails] = await Promise.all([
    db.profile.findMany({
      where: { userId: { in: unique } },
      select: { userId: true, firstName: true, lastName: true, username: true },
    }),
    readEmails(emailSource),
  ]);
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  return new Map(
    unique.map((id) => {
      const p = byId.get(id);
      return [
        id,
        {
          id,
          name: p
            ? personName({
                firstName: p.firstName ?? "",
                lastName: p.lastName ?? "",
              })
            : null,
          username: p?.username ?? null,
          email: p ? (emails?.get(id) ?? null) : null,
          exists: Boolean(p),
        },
      ];
    }),
  );
}

function toRow(
  r: FeedbackRow,
  who: Map<string, FeedbackRowDto["sender"]>,
): FeedbackRowDto {
  return {
    id: r.id,
    category: r.category,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    handledAt: r.handledAt ? r.handledAt.toISOString() : null,
    sender: who.get(r.userId) ?? {
      id: r.userId,
      name: null,
      username: null,
      email: null,
      exists: false,
    },
  };
}

/** The inbox: Open (default), Handled, or All, newest first. */
export async function listFeedback(
  actor: AdminActor,
  query: InboxQuery,
  emailSource?: EmailSource,
): Promise<FeedbackListDto> {
  assertAdmin(actor);
  const db = adminDb();
  const where = {
    ...(query.view === "open" ? { handledAt: null } : {}),
    ...(query.view === "handled" ? { handledAt: { not: null } } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.account ? { userId: query.account } : {}),
  };
  const [rows, openCount] = await Promise.all([
    db.feedback.findMany({
      select: FIELDS,
      ...(Object.keys(where).length ? { where } : {}),
      orderBy: [{ createdAt: "desc" }],
      take: INBOX_PAGE_SIZE + 1,
      skip: (query.page - 1) * INBOX_PAGE_SIZE,
    }),
    db.feedback.count({ where: { handledAt: null } }),
  ]);
  const page = (rows as FeedbackRow[]).slice(0, INBOX_PAGE_SIZE);
  const who = await senders(
    db,
    [...page.map((r) => r.userId), ...(query.account ? [query.account] : [])],
    emailSource,
  );
  const filtered = query.account ? who.get(query.account) : undefined;
  return {
    rows: page.map((r) => toRow(r, who)),
    openCount,
    page: query.page,
    hasMore: rows.length > INBOX_PAGE_SIZE,
    view: query.view,
    category: query.category,
    account: query.account
      ? {
          id: query.account,
          label: filtered?.name ?? filtered?.email ?? null,
        }
      : null,
  };
}

/** One message with its sender and its admin history, or null. */
export async function getFeedbackItem(
  actor: AdminActor,
  id: string,
  emailSource?: EmailSource,
): Promise<FeedbackItemDto | null> {
  assertAdmin(actor);
  if (!isUuid(id)) return null;
  const db = adminDb();
  const row = (await db.feedback.findUnique({
    where: { id },
    select: FIELDS,
  })) as FeedbackRow | null;
  if (!row) return null;
  // Attachments are read as their own scalar query (the admin boundary refuses
  // relation selects); they carry object paths and metadata only, no image.
  const [who, history, attachments] = await Promise.all([
    senders(db, [row.userId], emailSource),
    auditLines(db, { feedbackId: id, take: 50 }, emailSource),
    db.feedbackAttachment.findMany({
      where: { feedbackId: id },
      select: { objectPath: true, position: true },
      orderBy: { position: "asc" },
    }),
  ]);
  return {
    ...toRow(row, who),
    history,
    attachments: attachments.map((a) => ({
      objectPath: a.objectPath,
      position: a.position,
    })),
  };
}

export type FeedbackChange = { changed: boolean };

/** Marks a message handled (true) or reopens it (false). Audited. */
export async function setFeedbackHandled(
  actor: AdminActor,
  id: string,
  handled: boolean,
): Promise<FeedbackChange> {
  assertAdmin(actor);
  if (!isUuid(id)) throw new DomainError("not_found", "Feedback not found.");
  if (typeof handled !== "boolean") {
    throw new DomainError("validation_error", "Choose handled or open.");
  }
  return inAdminTx(async (tx) => {
    const row = await tx.feedback.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!row) throw new DomainError("not_found", "Feedback not found.");
    const { count } = await tx.feedback.updateMany({
      where: { id, handledAt: handled ? null : { not: null } },
      data: { handledAt: handled ? new Date() : null },
    });
    if (count !== 1) return { changed: false };
    await recordAudit(tx, actor, {
      action: handled ? "feedback_handled" : "feedback_reopened",
      targetUserId: row.userId,
      feedbackId: id,
    });
    return { changed: true };
  });
}

/** Re-files a message under another category. Audited with from → to. */
export async function setFeedbackCategory(
  actor: AdminActor,
  id: string,
  category: unknown,
): Promise<FeedbackChange> {
  assertAdmin(actor);
  if (!isUuid(id)) throw new DomainError("not_found", "Feedback not found.");
  if (!isFeedbackCategory(category)) {
    throw new DomainError("validation_error", "Choose a category.");
  }
  return inAdminTx(async (tx) => {
    const row = await tx.feedback.findUnique({
      where: { id },
      select: { id: true, userId: true, category: true },
    });
    if (!row) throw new DomainError("not_found", "Feedback not found.");
    if (row.category === category) return { changed: false };
    const { count } = await tx.feedback.updateMany({
      where: { id, category: row.category },
      data: { category },
    });
    if (count !== 1) return { changed: false };
    await recordAudit(tx, actor, {
      action: "feedback_recategorized",
      targetUserId: row.userId,
      feedbackId: id,
      detail: { from: row.category, to: category },
    });
    return { changed: true };
  });
}
