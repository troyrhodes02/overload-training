import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import { isoDateInZone } from "@/lib/plan/calendar";
import {
  personName,
  type AdminAccountDto,
  type AdminAccountListDto,
  type AdminAccountRowDto,
  type TourState,
} from "@/lib/admin/types";
import { adminDb, inAdminTx, type AdminDb } from "./db";
import { recordAudit } from "./audit";
import { auditLines } from "./audit-read";
import { readEmails, type EmailSource } from "./emails";
import { assertAdmin, isAdminUserId, type AdminActor } from "./identity";

/**
 * The owner's account directory and account page, and the two access
 * changes (Admin Center & Feedback, spec §6.3, §11; R2, R3, R6, R16, R18,
 * R21). Everything here reads account metadata only, through the gated admin
 * client; nothing reads or returns training content, and there is no
 * impersonation. Emails come from the sign-in system, read-only.
 */

export const DIRECTORY_PAGE_SIZE = 50;
const QUERY_MAX = 100;

const PROFILE_FIELDS = {
  userId: true,
  firstName: true,
  lastName: true,
  username: true,
  timeZone: true,
  status: true,
  lastActiveOn: true,
  createdAt: true,
} as const;

type ProfileMeta = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  timeZone: string;
  status: "active" | "suspended";
  lastActiveOn: Date | null;
  createdAt: Date;
};

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function signupOn(p: ProfileMeta): string {
  try {
    return isoDateInZone(p.createdAt, p.timeZone);
  } catch {
    return isoDateInZone(p.createdAt, "UTC");
  }
}

function toRow(
  p: ProfileMeta,
  tour: Map<string, string>,
  emails: Map<string, string> | null,
): AdminAccountRowDto {
  const outcome = tour.get(p.userId);
  const tourState: TourState =
    outcome === "completed"
      ? "finished"
      : outcome === "skipped"
        ? "skipped"
        : "not_yet";
  return {
    id: p.userId,
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    username: p.username,
    email: emails?.get(p.userId) ?? null,
    status: p.status,
    isAdmin: isAdminUserId(p.userId),
    signupOn: signupOn(p),
    lastActiveOn: isoDate(p.lastActiveOn),
    tour: tourState,
  };
}

async function tourOutcomes(
  db: AdminDb,
  userIds?: string[],
): Promise<Map<string, string>> {
  const rows = await db.tourProgress.findMany({
    select: { userId: true, outcome: true },
    ...(userIds ? { where: { userId: { in: userIds } } } : {}),
  });
  return new Map(
    rows.filter((r) => r.outcome).map((r) => [r.userId, String(r.outcome)]),
  );
}

export type DirectoryQuery = {
  q?: string;
  status?: "all" | "active" | "suspended";
  page?: number;
};

/** Normalizes raw search params; anything unknown falls back to a default. */
export function parseDirectoryQuery(raw: {
  q?: unknown;
  status?: unknown;
  page?: unknown;
}): Required<DirectoryQuery> {
  const q =
    typeof raw.q === "string" && raw.q.trim().length <= QUERY_MAX
      ? raw.q.trim()
      : "";
  const status =
    raw.status === "active" || raw.status === "suspended" ? raw.status : "all";
  const n = typeof raw.page === "string" ? Number(raw.page) : NaN;
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  return { q, status, page };
}

/**
 * The directory: every account, newest signup first, filtered by status and
 * a case-insensitive "contains" on name, username, or email. The account
 * base is small, so the match runs over the metadata in memory (email lives
 * in the sign-in system, not the database).
 */
export async function listAccounts(
  actor: AdminActor,
  query: DirectoryQuery = {},
  emailSource?: EmailSource,
): Promise<AdminAccountListDto> {
  assertAdmin(actor);
  const { q, status, page } = parseDirectoryQuery({
    q: query.q,
    status: query.status,
    page: query.page ? String(query.page) : undefined,
  });
  const db = adminDb();
  const [profiles, tour, emails] = await Promise.all([
    db.profile.findMany({
      select: PROFILE_FIELDS,
      ...(status === "all" ? {} : { where: { status } }),
      orderBy: [{ createdAt: "desc" }],
    }),
    tourOutcomes(db),
    readEmails(emailSource),
  ]);
  let rows = profiles.map((p) => toRow(p as ProfileMeta, tour, emails));
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      [personName(r) ?? "", r.username ?? "", r.email ?? ""].some((v) =>
        v.toLowerCase().includes(needle),
      ),
    );
  }
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return {
    rows: rows.slice(
      (current - 1) * DIRECTORY_PAGE_SIZE,
      current * DIRECTORY_PAGE_SIZE,
    ),
    total,
    page: current,
    pageCount,
    emailsAvailable: emails !== null,
  };
}

/** One account's page, or null for an unknown or malformed id. */
export async function getAdminAccount(
  actor: AdminActor,
  id: string,
  emailSource?: EmailSource,
): Promise<AdminAccountDto | null> {
  assertAdmin(actor);
  if (!isUuid(id)) return null;
  const db = adminDb();
  const profile = await db.profile.findUnique({
    where: { userId: id },
    select: PROFILE_FIELDS,
  });
  if (!profile) return null;
  const [tour, emails, feedbackCount, audit] = await Promise.all([
    tourOutcomes(db, [id]),
    readEmails(emailSource),
    db.feedback.count({ where: { userId: id } }),
    auditLines(db, { targetUserId: id, take: 10 }, emailSource),
  ]);
  const row = toRow(profile as ProfileMeta, tour, emails);
  const lastSuspend =
    row.status === "suspended"
      ? audit.find((l) => l.kind === "account_suspend")
      : undefined;
  return {
    ...row,
    timeZone: profile.timeZone,
    suspendedSince: lastSuspend
      ? isoDateInZone(new Date(lastSuspend.at), actor.timeZone)
      : null,
    feedbackCount,
    audit,
  };
}

export type AccessChange = { changed: boolean };

async function changeStatus(
  actor: AdminActor,
  targetId: string,
  to: "active" | "suspended",
): Promise<AccessChange> {
  assertAdmin(actor);
  if (!isUuid(targetId))
    throw new DomainError("not_found", "Account not found.");
  if (to === "suspended" && isAdminUserId(targetId)) {
    throw new DomainError(
      "invalid_state_transition",
      "Admin accounts can't be suspended here.",
    );
  }
  const from = to === "suspended" ? "active" : "suspended";
  return inAdminTx(async (tx) => {
    const exists = await tx.profile.findUnique({
      where: { userId: targetId },
      select: { userId: true },
    });
    if (!exists) throw new DomainError("not_found", "Account not found.");
    // Conditional: a repeat (another tab did it first) changes nothing and
    // records nothing.
    const { count } = await tx.profile.updateMany({
      where: { userId: targetId, status: from },
      data: { status: to },
    });
    if (count !== 1) return { changed: false };
    await recordAudit(tx, actor, {
      action: to === "suspended" ? "account_suspend" : "account_reactivate",
      targetUserId: targetId,
    });
    return { changed: true };
  });
}

/**
 * Suspends an account (R3): its next authenticated request is refused by
 * requireAccount(). Nothing else about the account changes. Audited in the
 * same transaction (R6).
 */
export function suspendAccount(
  actor: AdminActor,
  targetId: string,
): Promise<AccessChange> {
  return changeStatus(actor, targetId, "suspended");
}

/** Reactivates a suspended account (R3). Audited in the same transaction. */
export function reactivateAccount(
  actor: AdminActor,
  targetId: string,
): Promise<AccessChange> {
  return changeStatus(actor, targetId, "active");
}
