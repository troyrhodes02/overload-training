/**
 * The admin area's data contracts (Admin Center & Feedback, spec §13). Pure
 * types and labels, safe for client components. Exhaustive by design: no
 * field here can hold training content, and nothing is added without
 * amending the spec (the privacy sentinel test serializes every one).
 */

export type AccountStatusValue = "active" | "suspended";
export type TourState = "finished" | "skipped" | "not_yet";
export type FeedbackCategoryValue = "bug" | "idea" | "question" | "other";
export type AuditKind =
  | "account_suspend"
  | "account_reactivate"
  | "feedback_handled"
  | "feedback_reopened"
  | "feedback_recategorized";

export type AdminOverviewDto = {
  /** The admin's own timezone: "today" and "this month" (R13). */
  timeZone: string;
  registered: number;
  suspended: number;
  active7: number;
  active30: number;
  newThisMonth: number;
  withPlan: number;
  loggedWorkout: number;
  pct: {
    active7: number | null;
    active30: number | null;
    withPlan: number | null;
    loggedWorkout: number | null;
  };
  /** "YYYY-MM-DD": the first day of the admin's current month. */
  monthStart: string;
  /** Six signup months, newest first. */
  cohorts: CohortRowDto[];
};

export type CohortRowDto = {
  /** "YYYY-MM". */
  month: string;
  signedUp: number;
  cameBack: number | null;
  cameBackPct: number | null;
  active30: number | null;
  active30Pct: number | null;
};

export type AdminAccountRowDto = {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  /** From the sign-in system; null when it could not be read. */
  email: string | null;
  status: AccountStatusValue;
  isAdmin: boolean;
  /** "YYYY-MM-DD" in the account's own timezone. */
  signupOn: string;
  /** "YYYY-MM-DD", or null before its first tracked request. */
  lastActiveOn: string | null;
  tour: TourState;
};

export type AdminAccountListDto = {
  rows: AdminAccountRowDto[];
  total: number;
  page: number;
  pageCount: number;
  emailsAvailable: boolean;
};

export type AuditLineDto = {
  id: string;
  /** ISO instant. */
  at: string;
  actorName: string;
  kind: AuditKind;
  detail: { from: FeedbackCategoryValue; to: FeedbackCategoryValue } | null;
  /** label null: the account no longer exists. */
  target: { id: string; label: string | null };
  feedbackId: string | null;
};

export type AdminAccountDto = AdminAccountRowDto & {
  timeZone: string;
  /** "YYYY-MM-DD" of the latest suspension, while suspended. */
  suspendedSince: string | null;
  feedbackCount: number;
  /** The 10 most recent admin actions on this account. */
  audit: AuditLineDto[];
};

export type AuditPageDto = {
  lines: AuditLineDto[];
  page: number;
  hasOlder: boolean;
  /** The account filter's label, when filtered. */
  account: { id: string; label: string | null } | null;
};

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategoryValue, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};

/** The audit log's wording (design doc Screen 9). */
export function auditActionText(line: Pick<AuditLineDto, "kind" | "detail">) {
  switch (line.kind) {
    case "account_suspend":
      return "suspended the account";
    case "account_reactivate":
      return "reactivated the account";
    case "feedback_handled":
      return "marked feedback handled";
    case "feedback_reopened":
      return "reopened feedback";
    case "feedback_recategorized":
      return line.detail
        ? `changed a feedback category from ${FEEDBACK_CATEGORY_LABEL[line.detail.from]} to ${FEEDBACK_CATEGORY_LABEL[line.detail.to]}`
        : "changed a feedback category";
  }
}

/** "Maya Chen", or null when the account has no name. */
export function personName(p: {
  firstName: string;
  lastName: string;
}): string | null {
  const name = `${p.firstName} ${p.lastName}`.trim();
  return name.length > 0 ? name : null;
}
