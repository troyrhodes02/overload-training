import "server-only";
import { isUuid } from "@/lib/actions/result";
import {
  personName,
  type AuditKind,
  type AuditLineDto,
  type AuditPageDto,
  type FeedbackCategoryValue,
} from "@/lib/admin/types";
import { adminDb, type AdminDb } from "./db";
import { readEmails, type EmailSource } from "./emails";
import { assertAdmin, type AdminActor } from "./identity";

/**
 * Reading the audit log (Admin Center & Feedback, spec §6.3; design doc
 * Screen 9). Entries hold ids only; names are joined from current account
 * metadata at read time, so an account that no longer exists reads
 * "Deleted account" (label null), and an account without a name falls back
 * to its email.
 */

export const AUDIT_PAGE_SIZE = 50;

const ENTRY_FIELDS = {
  id: true,
  actorUserId: true,
  kind: true,
  targetUserId: true,
  feedbackId: true,
  detail: true,
  createdAt: true,
} as const;

/**
 * Labels for account ids: the name, else the email, else null (deleted).
 * Emails are fetched only when a named label is missing.
 */
async function labelsFor(
  db: AdminDb,
  ids: string[],
  emailSource?: EmailSource,
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const profiles = await db.profile.findMany({
    where: { userId: { in: unique } },
    select: { userId: true, firstName: true, lastName: true },
  });
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  const out = new Map<string, string | null>();
  let emails: Map<string, string> | null | undefined;
  for (const id of unique) {
    const p = byId.get(id);
    if (!p) {
      out.set(id, null);
      continue;
    }
    const name = personName({
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
    });
    if (name) {
      out.set(id, name);
      continue;
    }
    if (emails === undefined) emails = await readEmails(emailSource);
    out.set(id, emails?.get(id) ?? "No name");
  }
  return out;
}

/** Audit lines, newest first, for a target account or a feedback item. */
export async function auditLines(
  db: AdminDb,
  filter: {
    targetUserId?: string;
    feedbackId?: string;
    take: number;
    skip?: number;
  },
  emailSource?: EmailSource,
): Promise<AuditLineDto[]> {
  const where = {
    ...(filter.targetUserId ? { targetUserId: filter.targetUserId } : {}),
    ...(filter.feedbackId ? { feedbackId: filter.feedbackId } : {}),
  };
  const rows = await db.adminAuditEntry.findMany({
    select: ENTRY_FIELDS,
    ...(Object.keys(where).length ? { where } : {}),
    orderBy: [{ createdAt: "desc" }],
    take: filter.take,
    skip: filter.skip ?? 0,
  });
  const labels = await labelsFor(
    db,
    rows.flatMap((r) => [r.actorUserId, r.targetUserId]),
    emailSource,
  );
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actorName: labels.get(r.actorUserId) ?? "A former admin",
    kind: r.kind as AuditKind,
    detail:
      (r.detail as {
        from: FeedbackCategoryValue;
        to: FeedbackCategoryValue;
      } | null) ?? null,
    target: { id: r.targetUserId, label: labels.get(r.targetUserId) ?? null },
    feedbackId: r.feedbackId,
  }));
}

/** The audit log page: every action, or one account's, newest first. */
export async function listAudit(
  actor: AdminActor,
  query: { account?: unknown; page?: unknown },
  emailSource?: EmailSource,
): Promise<AuditPageDto> {
  assertAdmin(actor);
  const account = isUuid(query.account) ? query.account : undefined;
  const n = typeof query.page === "string" ? Number(query.page) : NaN;
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  const db = adminDb();
  const lines = await auditLines(
    db,
    {
      targetUserId: account,
      take: AUDIT_PAGE_SIZE + 1,
      skip: (page - 1) * AUDIT_PAGE_SIZE,
    },
    emailSource,
  );
  const label = account
    ? ((await labelsFor(db, [account], emailSource)).get(account) ?? null)
    : null;
  return {
    lines: lines.slice(0, AUDIT_PAGE_SIZE),
    page,
    hasOlder: lines.length > AUDIT_PAGE_SIZE,
    account: account ? { id: account, label } : null,
  };
}
